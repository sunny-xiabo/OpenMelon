"""
测试用例解析器
从 Markdown 格式的测试用例中提取结构化数据
"""

import re
import json
from typing import Dict, List, Optional, Tuple
from app.testcase_gen.utils.logger import logger


class TestCaseParser:
    """测试用例解析器 - 从 Markdown 提取结构化数据"""

    @staticmethod
    def parse_from_markdown(markdown_content: str) -> Dict:
        """
        从 Markdown 内容解析测试用例

        参数:
            markdown_content: Markdown 格式的测试用例内容

        返回:
            包含 test_cases 列表和 markdown 内容的字典
        """
        result = {
            'test_cases': [],
            'markdown': markdown_content,
            'parse_status': 'success',
            'parse_errors': []
        }

        try:
            # 提取最终测试用例部分（如果有）
            final_cases_marker = '**===最终测试用例===**'
            if final_cases_marker in markdown_content:
                # 分离评审报告和最终测试用例
                parts = markdown_content.split(final_cases_marker)
                markdown_content = parts[1] if len(parts) > 1 else markdown_content

            # 统一检测所有标题 (支持 ##, ###, ####)
            heading_pattern = r"^\s*(#{2,4})\s+(.+)$"
            matches = list(re.finditer(heading_pattern, markdown_content, re.MULTILINE))

            if not matches:
                result['parse_status'] = 'failed'
                result['parse_errors'].append('未能检测到任何标题行')
                return result

            for idx, match in enumerate(matches):
                title_line = match.group(2).strip()

                # 过滤非用例标题
                skip_keywords = ["功能概述", "功能需求", "非功能性需求", "用户交互需求", "数据需求", "异常场景", "需求分析", "评审报告", "覆盖情况", "覆盖度", "改进建议", "问题识别", "优点", "知识图谱", "文档概述", "API概述", "业务规则", "测试建议", "测试重点"]
                if any(keyword in title_line for keyword in skip_keywords):
                    continue

                # 确定当前小节的范围
                start_pos = match.end()
                end_pos = matches[idx + 1].start() if idx + 1 < len(matches) else len(markdown_content)
                section_content = markdown_content[start_pos:end_pos].strip()

                # 提取标题中的 ID
                id_match = re.match(r"^(TC[-_]?\d+)[\s:：]+", title_line, re.IGNORECASE)
                if id_match:
                    case_id = id_match.group(1).upper()
                    title = re.sub(r"^(TC[-_]?\d+)[\s:：]+", "", title_line, flags=re.IGNORECASE).strip()
                else:
                    case_id = f"TC-{len(result['test_cases']) + 1:03d}"
                    title = title_line

                test_case = TestCaseParser._parse_single_test_case(case_id, title, section_content)
                if test_case:
                    result['test_cases'].append(test_case)

            if not result['test_cases']:
                result['parse_status'] = 'failed'
                result['parse_errors'].append('未能从标题中解析出有效的测试用例')

        except Exception as e:
            logger.error(f"解析测试用例失败: {str(e)}", exc_info=True)
            result['parse_status'] = 'error'
            result['parse_errors'].append(str(e))

        return result

    @staticmethod
    def _parse_single_test_case(case_id: str, title: str, content: str) -> Optional[Dict]:
        """
        解析单个测试用例

        参数:
            case_id: 测试用例ID
            title: 标题
            content: 测试用例内容
        """
        try:
            # 提取优先级
            priority_match = re.search(r'\*\*(?:优先级|Priority)[:：]\*\*\s*(\S+)', content, re.IGNORECASE)
            priority = priority_match.group(1) if priority_match else 'Medium'
            priority_map = {'高': 'High', '中': 'Medium', '低': 'Low', 'high': 'High', 'medium': 'Medium', 'low': 'Low'}
            priority = priority_map.get(priority.lower(), 'Medium')

            # 提取描述
            desc_match = re.search(r'\*\*(?:描述|Description)[:：]\*\*\s*(.+?)(?=\n\*\*|\n###|\Z)', content, re.DOTALL | re.IGNORECASE)
            description = desc_match.group(1).strip() if desc_match else title

            # 提取前置条件
            precond_match = re.search(r'\*\*(?:前置条件|Precondition)[:：]\*\*\s*(.+?)(?=\n\*\*|\n###|\Z)', content, re.DOTALL | re.IGNORECASE)
            preconditions = precond_match.group(1).strip() if precond_match else None

            # 提取测试步骤
            steps = TestCaseParser._parse_test_steps(content)

            # 如果没有步骤，就把 body 填充一下
            if not steps:
                steps = [{
                    'step_number': 1,
                    'description': content[:200] if content else "详见描述",
                    'expected_result': "验证描述中的逻辑"
                }]

            return {
                'id': case_id,
                'title': title,
                'description': description,
                'preconditions': preconditions,
                'priority': priority,
                'steps': steps
            }

        except Exception as e:
            logger.error(f"解析测试用例 {case_id} 失败: {str(e)}")
            return None

    @staticmethod
    def _parse_test_steps(content: str) -> List[Dict]:
        """解析测试步骤表格"""
        steps = []
        # 查找表格 (更灵活的模式)
        lines = content.split('\n')
        in_table = False
        
        for line in lines:
            line = line.strip()
            if not line: continue
            
            # 分隔行
            if re.match(r'^\|[\s\-:|]+\|$', line):
                in_table = True
                continue
                
            if "|" in line:
                cells = [c.strip() for c in line.split('|')]
                cells = [c for c in cells if c] # 移除空串
                
                if len(cells) >= 2:
                    # 跳过表头
                    header_check = "".join(cells).lower()
                    if any(kw in header_check for kw in ["步骤", "预期", "expected", "result", "#"]):
                        continue
                        
                    step_num = len(steps) + 1
                    try:
                        step_num = int(re.sub(r'[^\d]', '', cells[0]))
                    except: pass
                    
                    steps.append({
                        'step_number': step_num,
                        'description': cells[1] if len(cells) > 1 else "",
                        'expected_result': cells[2] if len(cells) > 2 else "操作成功"
                    })
            elif in_table:
                # 遇到非表格行通常意味着表格结束
                pass

        return [s for s in steps if s['description']]

    @staticmethod
    def to_json(test_cases: List[Dict], indent: int = 2) -> str:
        """将测试用例列表转换为 JSON 字符串"""
        return json.dumps(test_cases, ensure_ascii=False, indent=indent)


# 创建全局实例
test_case_parser = TestCaseParser()
