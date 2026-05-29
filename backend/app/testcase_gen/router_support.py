from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request
from app.api.errors import InternalError, InvalidRequestError, NotFoundError, UnauthorizedError
from fastapi.responses import StreamingResponse, FileResponse
from typing import List, Dict, Any, Union
from pydantic import BaseModel
import os
import re
import uuid
import aiofiles
import zipfile
import json
import io
import time
from app.testcase_gen.utils.logger import logger
from app.api.logging_service import safe_log_event

from app.testcase_gen.models.test_case import TestCase
from app.testcase_gen.services.ai_service import ai_service
from app.testcase_gen.services.excel_service import excel_service
from app.testcase_gen.config import (
    MAX_FILE_SIZE,
    MAX_FILE_SIZE_MB,
    ALLOWED_EXTENSIONS,
    FILE_SIGNATURES,
)
from app.testcase_gen.utils.performance_optimizer import prompt_cache, response_cache
from app.testcase_gen.middleware.performance_monitor import performance_monitor
from app.testcase_gen.services.prompt_assembler import (
    build_prompt_config_context,
    parse_skill_ids,
)
from app.testcase_gen.utils.llms import get_embedding_config


def _trace_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def _log_testcase_event(
    level: str,
    event_type: str,
    title: str,
    message: str = "",
    *,
    trace_id: str = "",
    source_id: str = "",
    refs: list[Any] | None = None,
    data: dict[str, Any] | None = None,
):
    return safe_log_event(
        level,
        "testcase_generation",
        event_type,
        title,
        message,
        trace_id=trace_id,
        source_id=source_id,
        refs=refs,
        data=data,
    )


async def _stream_with_generation_log(stream, *, trace_id: str, module: str | None, data: dict[str, Any]):
    chunk_count = 0
    char_count = 0
    started_at = time.time()
    try:
        async for chunk in stream:
            chunk_count += 1
            char_count += len(chunk) if isinstance(chunk, str | bytes) else 0
            yield chunk
        _log_testcase_event(
            "info",
            "testcase_generation_completed",
            "测试用例生成完成",
            f"模块 {module or '未指定'} 生成流完成",
            trace_id=trace_id,
            refs=[module],
            data={
                **data,
                "module": module or "",
                "chunk_count": chunk_count,
                "char_count": char_count,
                "duration_ms": round((time.time() - started_at) * 1000),
            },
        )
    except Exception as exc:
        _log_testcase_event(
            "error",
            "testcase_generation_failed",
            "测试用例生成失败",
            str(exc),
            trace_id=trace_id,
            refs=[module],
            data={**data, "module": module or "", "error": str(exc)},
        )
        raise


async def build_vector_context(llm_client, vector_ops, query_text: str) -> str:
    embedding_config = get_embedding_config()
    model_name = embedding_config["model"]
    if not model_name:
        return ""
    kwargs = {
        **embedding_config["kwargs"],
        "input": [query_text],
    }
    emb_resp = await llm_client.embeddings.create(**kwargs)
    query_embedding = emb_resp.data[0].embedding
    similar_chunks = await vector_ops.similarity_search(query_embedding, top_k=3)
    similar_tcs = await vector_ops.search_similar_test_cases(query_embedding, top_k=3)

    vector_context = ""
    if similar_chunks:
        vector_context += "【相关参考文档片段】\n" + "\n\n".join([f"[{c.get('filename','')}]\n{c.get('content', '')}" for c in similar_chunks]) + "\n\n"
    if similar_tcs:
        vector_context += "【相似历史用例参考】\n" + "\n\n".join([f"[{tc.get('test_case_name', '')}]\n{tc.get('description', '')[:200]}..." for tc in similar_tcs]) + "\n\n"
    return vector_context


def validate_file_type(file_content: bytes, filename: str) -> bool:
    """
    验证文件类型（通过文件头魔数和扩展名）

    参数:
        file_content: 文件内容的前几个字节
        filename: 文件名

    返回:
        文件类型是否有效
    """
    file_extension = os.path.splitext(filename)[1].lower()

    # 检查扩展名是否允许
    if file_extension not in ALLOWED_EXTENSIONS:
        return False

    # 对于图像和PDF文件，验证文件头
    if file_extension in [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".pdf"]:
        file_header = file_content[:8]

        # 检查文件签名
        for signature, file_type in FILE_SIGNATURES.items():
            if file_header.startswith(signature):
                expected_extensions = {
                    "png": [".png"],
                    "jpg": [".jpg", ".jpeg"],
                    "gif": [".gif"],
                    "bmp": [".bmp"],
                    "pdf": [".pdf"],
                }
                return file_extension in expected_extensions.get(file_type, [])

        # 如果没有找到匹配的签名，可能是其他格式的图像，允许通过
        # 但会在后续处理时失败
        logger.warning(f"无法识别文件签名: {filename}, 扩展名: {file_extension}")

    # 对于JSON和YAML文件，不做文件头验证
    return True



def _generate_xmind_zip(test_cases: List[Dict[str, Any]]) -> io.BytesIO:
    groups = {}
    for tc in test_cases:
        p = tc.get("priority", "Medium")
        groups.setdefault(p, []).append(tc)

    root_children = []
    for priority, cases in groups.items():
        pNode = {
            "id": str(uuid.uuid4()),
            "title": f"{priority} 优先级 ({len(cases)}个)",
            "children": {"attached": []}
        }
        for tc in cases:
            tc_title = tc.get("title", "")
            if not tc_title:
                tc_title = tc.get("id", "未知")
            tcNode = {
                "id": str(uuid.uuid4()),
                "title": tc_title,
                "children": {"attached": []}
            }
            if tc.get("description"):
                tcNode["children"]["attached"].append({
                    "id": str(uuid.uuid4()),
                    "title": f"描述: {tc.get('description')}"
                })
            if tc.get("preconditions"):
                tcNode["children"]["attached"].append({
                    "id": str(uuid.uuid4()),
                    "title": f"前置条件: {tc.get('preconditions')}"
                })
            
            steps = tc.get("steps", [])
            if steps:
                sNode = {
                    "id": str(uuid.uuid4()),
                    "title": f"测试步骤 ({len(steps)}步)",
                    "children": {"attached": []}
                }
                for step in steps:
                    step_num = step.get('step_number', '')
                    desc = step.get('description', '')
                    stepNode = {
                        "id": str(uuid.uuid4()),
                        "title": f"步骤{step_num}: {desc}",
                        "children": {"attached": []}
                    }
                    if step.get("expected_result"):
                        stepNode["children"]["attached"].append({
                            "id": str(uuid.uuid4()),
                            "title": f"预期: {step.get('expected_result')}"
                        })
                    sNode["children"]["attached"].append(stepNode)
                tcNode["children"]["attached"].append(sNode)
            pNode["children"]["attached"].append(tcNode)
        root_children.append(pNode)
    
    root_children.append({
        "id": str(uuid.uuid4()),
        "title": "统计信息",
        "children": {
            "attached": [
                {"id": str(uuid.uuid4()), "title": f"总用例: {len(test_cases)}"},
                {"id": str(uuid.uuid4()), "title": f"优先级: {len(groups)}种"}
            ]
        }
    })

    content_json = [
        {
            "id": str(uuid.uuid4()),
            "class": "sheet",
            "title": "测试用例导图",
            "rootTopic": {
                "id": str(uuid.uuid4()),
                "class": "topic",
                "title": f"测试用例总览 ({len(test_cases)}个)",
                "children": {
                    "attached": root_children
                }
            }
        }
    ]

    manifest_json = {
        "file-entries": {
            "content.json": {},
            "metadata.json": {}
        }
    }

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        zip_file.writestr("content.json", json.dumps(content_json, ensure_ascii=False))
        zip_file.writestr("manifest.json", json.dumps(manifest_json, ensure_ascii=False))
        zip_file.writestr("metadata.json", json.dumps({}, ensure_ascii=False))
        
    zip_buffer.seek(0)
    return zip_buffer


def _parse_markdown_test_cases(markdown: str) -> List[Dict[str, Any]]:
    """
    从AI生成的Markdown文本中解析出结构化测试用例。

    支持的格式:
      ### TC1: 用例标题
      **描述:** ...
      **前置条件:** ...
      **优先级:** High/Medium/Low
      | 步骤 | 操作描述 | 预期结果 |
      | 1 | xxx | yyy |
      | 2 | xxx | yyy |

    也支持简化格式:
      ### 用例标题
      - 步骤1: xxx -> 预期: yyy
    """
    # 统一转换换行符并检测所有标题 (支持 ##, ###, ####)
    # 使用 finditer 先找标题位置，再进行切割，这样比 re.split 更健壮
    test_cases = []
    heading_pattern = r"^\s*(#{2,4})\s+(.+)$"
    matches = list(re.finditer(heading_pattern, markdown, re.MULTILINE))

    if not matches:
        return []

    for idx, match in enumerate(matches):
        _heading_level = match.group(1)
        title_line = match.group(2).strip()

        # 确定当前小节的结束位置
        start_pos = match.end()
        end_pos = matches[idx + 1].start() if idx + 1 < len(matches) else len(markdown)
        section_content = markdown[start_pos:end_pos].strip()

        # 提取标题中的 ID
        # 去掉 TC 编号前缀 (例如 "TC1: " 或 "TC-001 ")
        id_match = re.match(r"^(TC[-_]?\d+)[\s:：]+", title_line, re.IGNORECASE)
        if id_match:
            case_id = id_match.group(1).upper()
            title = re.sub(r"^(TC[-_]?\d+)[\s:：]+", "", title_line, flags=re.IGNORECASE).strip()
        else:
            case_id = f"TC-{len(test_cases) + 1:03d}"
            title = title_line

        # 过滤非用例标题 (如“功能概述”、“评审报告”等)
        skip_keywords = ["功能概述", "功能需求", "非功能性需求", "用户交互需求", "数据需求", "异常场景", "需求分析", "评审报告", "覆盖情况", "覆盖度", "改进建议", "问题识别", "优点", "知识图谱", "文档概述", "API概述", "业务规则", "测试建议", "测试重点"]
        if any(keyword in title_line for keyword in skip_keywords):
            continue

        if not title:
            continue

        description = ""
        preconditions = ""
        priority = "Medium"
        steps = []

        lines = section_content.split("\n")
        i = 0
        while i < len(lines):
            line = lines[i].strip()

            # 解析 **字段:** 格式
            desc_match = re.match(
                r"\*\*(?:描述|Description)[:\s：]*\*\*\s*(.*)", line, re.IGNORECASE
            )
            if desc_match:
                description = desc_match.group(1).strip() or (
                    lines[i + 1].strip() if i + 1 < len(lines) else ""
                )
                i += 1
                continue

            pre_match = re.match(
                r"\*\*(?:前置条件|Precondition)[:\s：]*\*\*\s*(.*)", line, re.IGNORECASE
            )
            if pre_match:
                preconditions = pre_match.group(1).strip() or (
                    lines[i + 1].strip() if i + 1 < len(lines) else ""
                )
                i += 1
                continue

            prio_match = re.match(
                r"\*\*(?:优先级|Priority)[:\s：]*\*\*\s*(.*)", line, re.IGNORECASE
            )
            if prio_match:
                p = prio_match.group(1).strip().lower()
                if p in ("high", "高", "p0", "p1"):
                    priority = "High"
                elif p in ("low", "低", "p3", "p4"):
                    priority = "Low"
                else:
                    priority = "Medium"
                i += 1
                continue

            # 解析 Markdown 表格行: | 步骤 | 操作描述 | 预期结果 |
            # 跳过分隔行 (| --- | --- |) 和表头行
            if "|" in line and not re.match(r"\|[\s\-:|]+\|", line):
                # 跳过常见的表头
                header_check = re.sub(r"[\s|]", "", line).lower()
                if header_check in (
                    "步骤操作描述预期结果",
                    "步骤描述预期结果",
                    "no.descriptionexpectedresult",
                    "stepactionexpected",
                    "stepdescriptionexpectedresult",
                ):
                    i += 1
                    continue
                cells = [c.strip() for c in line.split("|")]
                cells = [c for c in cells if c]  # 去掉空串
                if len(cells) >= 2:
                    step_num = len(steps) + 1
                    # 尝试解析第一个 cell 为数字
                    try:
                        step_num = (
                            int(re.sub(r"[^\d]", "", cells[0]))
                            if cells[0]
                            else step_num
                        )
                    except ValueError:
                        pass
                    desc = cells[1] if len(cells) > 1 else ""
                    expected = cells[2] if len(cells) > 2 else ""
                    if desc:
                        steps.append(
                            {
                                "step_number": step_num,
                                "description": desc,
                                "expected_result": expected,
                            }
                        )

            # 解析简化格式: "- 步骤N: xxx -> 预期: yyy" 或 "- 步骤N: xxx"
            step_match = re.match(
                r"^[-*]\s*(?:步骤?\s*\d+\s*[:.：]\s*)?(.+?)(?:\s*[-=]>\s*(?:预期|期望|Expected)[:\s：]*(.*))?$",
                line,
                re.IGNORECASE,
            )
            if step_match and not steps:
                desc = step_match.group(1).strip()
                expected = (step_match.group(2) or "").strip()
                if desc:
                    steps.append(
                        {
                            "step_number": len(steps) + 1,
                            "description": desc,
                            "expected_result": expected or "操作成功",
                        }
                    )

            i += 1

        # 至少需要标题和一个步骤
        if title and steps:
            test_cases.append(
                {
                    "id": case_id,
                    "title": title,
                    "description": description or title,
                    "preconditions": preconditions or None,
                    "priority": priority,
                    "steps": steps,
                }
            )
        elif title:
            # 没有步骤则用整个 section 内容作为描述
            body = "\n".join(lines[1:]).strip()
            test_cases.append(
                {
                    "id": case_id,
                    "title": title,
                    "description": body or title,
                    "preconditions": None,
                    "priority": priority,
                    "steps": [
                        {
                            "step_number": 1,
                            "description": body[:200] if body else "详见描述",
                            "expected_result": "按描述验证",
                        }
                    ],
                }
            )

    return test_cases




__all__ = [name for name in globals() if not name.startswith("__")]
