from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request
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

router = APIRouter(
    prefix="/api/test-cases",
    tags=["test-cases"],
    responses={404: {"description": "Not found"}},
)


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


@router.post("/generate")
async def generate_test_cases(
    req: Request,
    file: UploadFile = File(...),
    context: str = Form(...),
    requirements: str = Form(...),
    module: str = Form(default=None),
    use_vector: str = Form(default="false"),
    style_id: str = Form(default=None),
    skill_ids: str = Form(default=None),
):
    """
    从上传的文件、上下文和需求生成测试用例

    参数:
        file: 上传的文件（图像、PDF或OpenAPI文档）
        context: 测试用例生成的上下文信息
        requirements: 测试用例生成的需求
        module: 所属模块（可选）

    返回:
        包含生成的测试用例的流式响应
    """
    try:
        try:
            parsed_skill_ids = parse_skill_ids(skill_ids)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"skill_ids 参数非法: {exc}") from exc

        prompt_config = build_prompt_config_context(style_id, parsed_skill_ids)

        # 读取文件内容
        file_content = await file.read()

        # 1. 验证文件大小
        if len(file_content) > MAX_FILE_SIZE:
            logger.warning(
                f"文件过大: {file.filename}, 大小: {len(file_content)} bytes"
            )
            raise HTTPException(
                status_code=413, detail=f"文件过大，最大允许 {MAX_FILE_SIZE_MB}MB"
            )

        # 2. 验证文件类型（魔数验证）
        if not validate_file_type(file_content, file.filename):
            logger.warning(f"文件类型验证失败: {file.filename}")
            raise HTTPException(
                status_code=400,
                detail=f"文件类型不匹配或不受支持。支持的类型: {', '.join(ALLOWED_EXTENSIONS)}",
            )

        # 保存上传的文件
        file_id = str(uuid.uuid4())
        file_extension = os.path.splitext(file.filename)[1].lower()
        upload_dir = os.path.join(
            os.path.dirname(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            ),
            "uploads",
        )
        os.makedirs(upload_dir, exist_ok=True)
        file_path = os.path.join(upload_dir, f"{file_id}{file_extension}")

        # 3. 使用异步文件操作保存文件
        async with aiofiles.open(file_path, "wb") as uploaded_file:
            await uploaded_file.write(file_content)

        logger.info(
            f"文件上传成功: {file.filename} -> {file_path}, 大小: {len(file_content)} bytes"
        )

        # Vector DB retrieval logic
        use_vector_bool = use_vector.lower() == "true"
        vector_context = ""
        if use_vector_bool:
            vector_ops = getattr(req.app.state, "vector_ops", None)
            llm_client = getattr(req.app.state, "llm_client", None)
            if vector_ops and llm_client:
                try:
                    from app.config import settings
                    model_name = settings.EMBEDDING_MODEL
                    kwargs = {
                        "model": model_name,
                        "input": [f"{requirements}\n{context}"],
                    }
                    if settings.EMBEDDING_DIM and model_name and "text-embedding-3" in model_name:
                        kwargs["dimensions"] = settings.EMBEDDING_DIM
                    emb_resp = await llm_client.embeddings.create(**kwargs)
                    query_embedding = emb_resp.data[0].embedding
                    similar_chunks = await vector_ops.similarity_search(query_embedding, top_k=3)
                    similar_tcs = await vector_ops.search_similar_test_cases(query_embedding, top_k=3)
                    
                    if similar_chunks:
                        vector_context += "【相关参考文档片段】\n" + "\n\n".join([f"[{c.get('filename','')}]\n{c.get('content', '')}" for c in similar_chunks]) + "\n\n"
                    if similar_tcs:
                        vector_context += "【相似历史用例参考】\n" + "\n\n".join([f"[{tc.get('test_case_name', '')}]\n{tc.get('description', '')[:200]}..." for tc in similar_tcs]) + "\n\n"
                except Exception as e:
                    logger.warning(f"Vector search failed during generation: {e}")

        if file_extension in [
            ".png",
            ".jpg",
            ".jpeg",
            ".gif",
            ".bmp",
            ".webp",
            ".pdf",
            ".json",
            ".yaml",
            ".yml",
        ]:
            logger.info(
                "测试用例生成配置 - style_id=%s, skill_ids=%s",
                prompt_config["style_id"],
                ",".join(prompt_config["skill_ids"]) or "<none>",
            )
            return StreamingResponse(
                ai_service.generate_test_cases_stream(
                    file_path,
                    context,
                    requirements,
                    module=module,
                    vector_context=vector_context,
                    use_vector=use_vector_bool,
                    prompt_config=prompt_config,
                ),
                media_type="text/markdown",
            )
        else:
            raise HTTPException(
                status_code=400,
                detail=f"不支持的文件类型: {file_extension}. 支持的类型: 图像文件(.png, .jpg, .jpeg, .gif, .bmp, .webp), PDF文件(.pdf), OpenAPI文档(.json, .yaml, .yml)",
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"处理上传文件时发生错误: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"处理文件时发生错误: {str(e)}")


@router.post("/generate-from-context")
async def generate_from_context(
    req: Request,
    context: str = Form(...),
    requirements: str = Form(...),
    module: str = Form(default=None),
    use_vector: str = Form(default="false"),
    style_id: str = Form(default=None),
    skill_ids: str = Form(default=None),
):
    try:
        try:
            parsed_skill_ids = parse_skill_ids(skill_ids)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"skill_ids 参数非法: {exc}") from exc

        prompt_config = build_prompt_config_context(style_id, parsed_skill_ids)
        virtual_path = "virtual/context.txt"

        use_vector_bool = use_vector.lower() == "true"
        vector_context = ""
        if use_vector_bool:
            vector_ops = getattr(req.app.state, "vector_ops", None)
            llm_client = getattr(req.app.state, "llm_client", None)
            if vector_ops and llm_client:
                try:
                    from app.config import settings
                    model_name = settings.EMBEDDING_MODEL
                    kwargs = {
                        "model": model_name,
                        "input": [f"{requirements}\n{context}"],
                    }
                    if settings.EMBEDDING_DIM and model_name and "text-embedding-3" in model_name:
                        kwargs["dimensions"] = settings.EMBEDDING_DIM
                    emb_resp = await llm_client.embeddings.create(**kwargs)
                    query_embedding = emb_resp.data[0].embedding
                    similar_chunks = await vector_ops.similarity_search(query_embedding, top_k=3)
                    similar_tcs = await vector_ops.search_similar_test_cases(query_embedding, top_k=3)
                    
                    if similar_chunks:
                        vector_context += "【相关参考文档片段】\n" + "\n\n".join([f"[{c.get('filename','')}]\n{c.get('content', '')}" for c in similar_chunks]) + "\n\n"
                    if similar_tcs:
                        vector_context += "【相似历史用例参考】\n" + "\n\n".join([f"[{tc.get('test_case_name', '')}]\n{tc.get('description', '')[:200]}..." for tc in similar_tcs]) + "\n\n"
                except Exception as e:
                    logger.warning(f"Vector search failed during generation: {e}")

        logger.info(
            "文本生成配置 - style_id=%s, skill_ids=%s",
            prompt_config["style_id"],
            ",".join(prompt_config["skill_ids"]) or "<none>",
        )
        return StreamingResponse(
            ai_service.generate_test_cases_stream(
                virtual_path,
                context,
                requirements,
                module=module,
                vector_context=vector_context,
                use_vector=use_vector_bool,
                prompt_config=prompt_config,
            ),
            media_type="text/markdown",
        )

    except Exception as e:
        logger.error(f"生成用例失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class MindMapRequest(BaseModel):
    test_cases: List[Dict[str, Any]]


@router.post("/generate-mindmap")
async def generate_mindmap_from_test_cases(request: MindMapRequest):
    """
    从测试用例生成思维导图数据

    参数:
        request: 包含测试用例列表的请求体

    返回:
        思维导图的JSON数据
    """
    try:
        mindmap_data = ai_service.generate_mindmap_from_test_cases(request.test_cases)
        return {"mindmap": mindmap_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成思维导图失败: {str(e)}")

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
        heading_level = match.group(1)
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


class ExportMarkdownRequest(BaseModel):
    markdown: str


@router.post("/export-markdown")
async def export_markdown(request: ExportMarkdownRequest):
    """
    将AI生成的Markdown测试用例导出为Excel

    参数:
        request: 包含markdown字段的请求体

    返回:
        Excel文件
    """
    try:
        test_cases = _parse_markdown_test_cases(request.markdown)
        if not test_cases:
            raise HTTPException(
                status_code=400, detail="未能从Markdown中解析出测试用例，请检查内容格式"
            )
        excel_path = excel_service.generate_excel(test_cases)
        return FileResponse(
            path=excel_path,
            filename=os.path.basename(excel_path),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"导出Markdown用例失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"导出失败: {str(e)}")


@router.post("/export-xmind")
async def export_xmind_from_markdown(request: ExportMarkdownRequest):
    """
    将AI生成的Markdown测试用例导出为XMind文件(.xmind格式)
    """
    try:
        test_cases = _parse_markdown_test_cases(request.markdown)
        if not test_cases:
            raise HTTPException(
                status_code=400, detail="未能从Markdown中解析出测试用例，请检查内容格式"
            )

        zip_buffer = _generate_xmind_zip(test_cases)
        
        return StreamingResponse(
            zip_buffer,
            media_type="application/vnd.xmind.workbook",
            headers={
                "Content-Disposition": f"attachment; filename=test-cases-{int(time.time())}.xmind"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"导出XMind失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"导出失败: {str(e)}")

@router.post("/export-xmind-json")
async def export_xmind_from_json(test_cases: List[Dict[str, Any]]):
    """
    将JSON格式的测试用例列表直接导出为XMind文件(.xmind格式)
    """
    try:
        zip_buffer = _generate_xmind_zip(test_cases)
        return StreamingResponse(
            zip_buffer,
            media_type="application/vnd.xmind.workbook",
            headers={
                "Content-Disposition": f"attachment; filename=test-cases-{int(time.time())}.xmind"
            }
        )
    except Exception as e:
        logger.error(f"导出XMind失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"导出失败: {str(e)}")


@router.post("/export")
async def export_test_cases(test_cases: List[Union[TestCase, Dict[str, Any]]]):
    """
    将测试用例导出到Excel

    参数:
        test_cases: 要导出的测试用例列表

    返回:
        下载生成的Excel文件的URL
    """
    try:
        # 生成Excel文件
        excel_path = excel_service.generate_excel(test_cases)

        # 返回文件供下载
        return FileResponse(
            path=excel_path,
            filename=os.path.basename(excel_path),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error exporting test cases: {str(e)}"
        )


@router.get("/download/{filename}")
async def download_excel(filename: str):
    """
    下载生成的Excel文件

    参数:
        filename: 要下载的Excel文件名

    返回:
        供下载的Excel文件
    """
    file_path = f"results/{filename}"

    # Prevent path traversal: ensure resolved path stays within results directory
    results_dir = os.path.abspath("results")
    resolved_path = os.path.abspath(file_path)
    if not resolved_path.startswith(results_dir):
        raise HTTPException(status_code=403, detail="Access denied")

    if not os.path.exists(resolved_path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=file_path,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@router.get("/performance/stats")
async def get_performance_stats():
    """
    获取性能监控统计信息

    返回:
        性能统计数据
    """
    try:
        stats = performance_monitor.get_stats()
        return {"status": "success", "data": stats}
    except Exception as e:
        logger.error(f"获取性能统计失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取性能统计失败: {str(e)}")


@router.get("/performance/cache")
async def get_cache_stats():
    """
    获取缓存统计信息

    返回:
        缓存统计数据
    """
    try:
        prompt_stats = prompt_cache.get_stats()
        response_stats = response_cache.get_stats()

        return {
            "status": "success",
            "data": {"prompt_cache": prompt_stats, "response_cache": response_stats},
        }
    except Exception as e:
        logger.error(f"获取缓存统计失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取缓存统计失败: {str(e)}")


@router.delete("/performance/cache")
async def clear_cache():
    """
    清空所有缓存

    返回:
        操作结果
    """
    try:
        prompt_cache.clear()
        response_cache.clear()
        logger.info("所有缓存已清空")

        return {"status": "success", "message": "缓存已清空"}
    except Exception as e:
        logger.error(f"清空缓存失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"清空缓存失败: {str(e)}")


@router.get("/vector/status")
async def check_vector_status(req: Request):
    """
    检查向量库状态

    返回:
        向量库状态信息
    """
    try:
        vector_ops = req.app.state.vector_ops
        if not vector_ops:
            return {"available": False, "message": "向量库未初始化"}

        status = await vector_ops.check_vector_status()
        return status
    except Exception as e:
        logger.error(f"检查向量库状态失败: {str(e)}", exc_info=True)
        return {"available": False, "message": f"检查失败: {str(e)}"}


class StoreVectorRequest(BaseModel):
    test_cases: List[Dict[str, Any]]
    module: str = None


@router.post("/store-vector")
async def store_test_cases_to_vector(req: Request, body: StoreVectorRequest):
    """
    将 JSON 格式的测试用例列表存入向量库

    参数:
        test_cases: JSON格式的对象列表
        module: 所属模块

    返回:
        存储结果
    """
    try:
        test_cases = body.test_cases
        if not test_cases:
            return {
                "success": False,
                "message": "未解析到测试用例",
                "stored": 0,
                "skipped": 0,
            }

        neo4j_writer = getattr(req.app.state, "_neo4j_writer", None)
        if not neo4j_writer:
            return {
                "success": False,
                "message": "写入器未初始化",
                "stored": 0,
                "skipped": 0,
            }

        result = await neo4j_writer.write_test_cases(
            test_cases,
            module=body.module,
            store_vector=True,
        )

        return {
            "success": True,
            "message": f"完成: 新增 {result['vector_written']}, 跳过 {result['vector_skipped']}",
            "stored": result["vector_written"],
            "skipped": result["vector_skipped"],
            "errors": result.get("vector_errors", []),
        }
    except Exception as e:
        logger.error(f"存入向量库失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"存入向量库失败: {str(e)}")
