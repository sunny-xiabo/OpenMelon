import json
from typing import List, Dict, Any, AsyncGenerator

from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.base import TaskResult
from autogen_agentchat.messages import ModelClientStreamingChunkEvent, MultiModalMessage as AGMultiModalMessage, StructuredMessage
from autogen_core import Image as AGImage
from PIL import Image as PILImage

from models.test_case import TestCase
from utils.llms import model_client, deepseek_model_client, QWEN_MODEL_NAME, DEEPSEEK_MODEL_NAME
# 移除结构化输出模型导入以避免兼容性问题
# from models.test_case import TestCase, TestCaseResponse
from services.pdf_service import pdf_service
from services.openapi_service import openapi_service


class AIService:
    def __init__(self):
        # 在这里初始化 AI 模型
        # 在真实实现中，你需要加载模型
        self.image_analysis_model = None
        self.test_case_generator_model = None

    def _get_model_client_for_file_type(self, file_path: str):
        """
        根据文件类型选择合适的模型客户端

        参数:
            file_path: 文件路径

        返回:
            合适的模型客户端
        """
        file_extension = file_path.lower().split('.')[-1] if '.' in file_path else ''

        # 图像文件使用支持视觉的模型客户端
        if file_extension in ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp']:
            return model_client  # 支持视觉的模型

        # 非图像文件使用DeepSeek模型客户端（更适合文本处理）
        # 如果DeepSeek API密钥无效，可以在环境变量中配置有效的密钥
        # 或者修改此处使用 model_client 作为备选方案
        else:
            return deepseek_model_client

    async def generate_test_cases_stream(
        self,
        file_path: str,
        context: str,
        requirements: str
    ) -> AsyncGenerator[str, None]:
        """
        基于文件分析、上下文和需求生成测试用例（智能选择模型客户端）

        参数:
            file_path: 文件路径（图像或其他类型）
            context: 用户提供的上下文
            requirements: 用户提供的需求

        产出:
            Markdown 格式的生成的测试用例块
        """
        # 根据文件类型选择合适的模型客户端
        selected_model_client = self._get_model_client_for_file_type(file_path)
        file_extension = file_path.lower().split('.')[-1] if '.' in file_path else ''

        # 检查是否为图像文件
        if file_extension in ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp']:
            # 处理图像文件
            pil_image = PILImage.open(file_path)
            img = AGImage(pil_image)

            # 构建图像分析提示词 - 强化格式要求
            prompt = f"""请基于上传的图像生成全面的测试用例。

上下文信息: {context}

需求: {requirements}

**重要格式要求**：
请严格按照以下格式生成测试用例，这对于系统解析非常重要：

1. 每个测试用例必须以二级标题开始：## TC-001: 测试标题
2. 每个测试用例必须包含以下字段（使用加粗格式）：
   - **优先级:** 高/中/低
   - **描述:** 测试用例的详细描述
   - **前置条件:** 执行测试前的条件（如果有）

3. 测试步骤必须使用标准Markdown表格格式：

### 测试步骤

| # | 步骤描述 | 预期结果 |
| --- | --- | --- |
| 1 | 具体的操作步骤 | 期望看到的结果 |
| 2 | 下一个操作步骤 | 对应的期望结果 |

**示例格式**：
## TC-001: 用户登录功能测试

**优先级:** 高

**描述:** 验证用户能够使用正确的用户名和密码成功登录系统

**前置条件:** 用户账户已存在且处于激活状态

### 测试步骤

| # | 步骤描述 | 预期结果 |
| --- | --- | --- |
| 1 | 打开登录页面 | 显示登录表单 |
| 2 | 输入有效用户名和密码 | 输入框显示内容 |
| 3 | 点击登录按钮 | 成功登录并跳转到主页 |

请严格遵循此格式，确保每个测试用例都包含完整的信息和正确的表格格式。
请确保测试用例覆盖全面，包含正向和负向测试场景。"""

            # 创建多模态消息（图像+文本）
            multi_modal_message = AGMultiModalMessage(content=[prompt, img], source="user")
            system_message = """你是一个专业的测试用例生成器，擅长基于图像生成全面的测试用例。

**关键要求**：
1. 必须严格按照指定的Markdown格式生成测试用例
2. 每个测试用例必须以 ## TC-XXX: 标题 格式开始
3. 必须包含 **优先级:**、**描述:**、**前置条件:** 等加粗字段
4. 测试步骤必须使用标准的Markdown表格格式，包含表头和分隔行
5. 表格必须有三列：#、步骤描述、预期结果
6. 确保格式完全符合要求，以便系统能够正确解析

请严格遵循格式要求，这对于系统解析测试用例非常重要。"""
            task_message = multi_modal_message

        elif file_extension == 'pdf':
            # 处理PDF文件 - 直接在主方法中处理
            try:
                # 提取PDF内容（不进行结构化分析）
                pdf_content = pdf_service.extract_text_from_pdf(file_path)

                # 构建PDF分析提示词
                prompt = f"""请基于上传的PDF文档生成全面的测试用例。

PDF文档信息:
- 标题: {pdf_content['metadata'].get('title', '未知')}
- 页数: {pdf_content['metadata'].get('pages', '未知')}

文档内容:
{pdf_content['text'][:8000]}{'...(内容过长，已截断)' if len(pdf_content['text']) > 8000 else ''}

上下文信息: {context}

需求: {requirements}

请先以 Markdown 格式生成测试用例，包含以下内容：
1. 测试用例 ID 和标题（使用二级标题格式，如 ## TC-001: 测试标题）
2. 优先级（加粗显示，如 **优先级:** 高）
3. 描述（加粗显示，如 **描述:** 测试描述）
4. 前置条件（如果有，加粗显示，如 **前置条件:** 条件描述）
5. 测试步骤和预期结果（使用标准 Markdown 表格格式）

对于测试步骤表格，请使用以下格式：

```
### 测试步骤

| # | 步骤描述 | 预期结果 |
| --- | --- | --- |
| 1 | 第一步描述 | 第一步预期结果 |
| 2 | 第二步描述 | 第二步预期结果 |
```

请确保表格格式正确，包含表头和分隔行。

然后，在生成完 Markdown 格式的测试用例后，请生成结构化的测试用例数据，包含相同的内容，但使用 JSON 格式，以便于导出到 Excel。

请确保测试用例覆盖全面，包含正向和负向测试场景。"""

                # 创建文本消息
                task_message = prompt
                system_message = "你是一个专业的测试用例生成器，擅长基于文档内容生成全面的测试用例。请先以标准 Markdown 格式生成测试用例，包含正确的表格格式，然后再生成结构化的 JSON 数据，以便于导出到 Excel。"

            except Exception as e:
                yield f"\n\n**错误**: PDF处理失败 - {str(e)}\n"
                return

        elif file_extension in ['json', 'yaml', 'yml']:
            # 处理OpenAPI文件 - 直接在主方法中处理
            try:
                # 解析OpenAPI文档
                api_data = openapi_service.parse_openapi_file(file_path)
                api_info = api_data['api_info']
                test_scenarios = openapi_service.generate_test_scenarios(api_info)

                # 构建API分析提示词
                prompt = f"""请基于上传的OpenAPI/Swagger文档生成API测试用例。

API文档信息:
- 标题: {api_info['info'].get('title', '未知')}
- 版本: {api_info['info'].get('version', '未知')}
- 描述: {api_info['info'].get('description', '无描述')}
- API路径数量: {len(api_info['paths'])}

API端点概览:
{self._format_api_endpoints_for_prompt(api_info)}

上下文信息: {context}

需求: {requirements}

请先以 Markdown 格式生成测试用例，包含以下内容：
1. 测试用例 ID 和标题（使用二级标题格式，如 ## TC-001: 测试标题）
2. 优先级（加粗显示，如 **优先级:** 高）
3. 描述（加粗显示，如 **描述:** 测试描述）
4. 前置条件（如果有，加粗显示，如 **前置条件:** 条件描述）
5. 测试步骤和预期结果（使用标准 Markdown 表格格式）

对于测试步骤表格，请使用以下格式：

```
### 测试步骤

| # | 步骤描述 | 预期结果 |
| --- | --- | --- |
| 1 | 第一步描述 | 第一步预期结果 |
| 2 | 第二步描述 | 第二步预期结果 |
```

请确保表格格式正确，包含表头和分隔行。

然后，在生成完 Markdown 格式的测试用例后，请生成结构化的测试用例数据，包含相同的内容，但使用 JSON 格式，以便于导出到 Excel。

请确保测试用例覆盖全面，特别关注：
- 所有API端点的测试
- 正向测试（正常请求和响应）
- 负向测试（错误参数、认证失败等）
- 边界值测试
- 不同HTTP状态码的验证
- 请求和响应数据格式验证"""

                # 创建文本消息
                task_message = prompt
                system_message = "你是一个专业的API测试用例生成器，擅长基于OpenAPI/Swagger文档生成全面的API测试用例。请先以标准 Markdown 格式生成测试用例，包含正确的表格格式，然后再生成结构化的 JSON 数据，以便于导出到 Excel。"

            except Exception as e:
                yield f"\n\n**错误**: OpenAPI文档处理失败 - {str(e)}\n"
                return

        else:
            # 处理其他文本文件
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    file_content = f.read()
            except UnicodeDecodeError:
                try:
                    with open(file_path, 'r', encoding='gbk') as f:
                        file_content = f.read()
                except:
                    yield f"\n\n**错误**: 无法读取文件内容，不支持的编码格式\n"
                    return

            prompt = f"""请基于上传的文件内容生成全面的测试用例。

文件内容:
{file_content[:5000]}{'...(内容过长，已截断)' if len(file_content) > 5000 else ''}

上下文信息: {context}

需求: {requirements}

请先以 Markdown 格式生成测试用例，包含以下内容：
1. 测试用例 ID 和标题（使用二级标题格式，如 ## TC-001: 测试标题）
2. 优先级（加粗显示，如 **优先级:** 高）
3. 描述（加粗显示，如 **描述:** 测试描述）
4. 前置条件（如果有，加粗显示，如 **前置条件:** 条件描述）
5. 测试步骤和预期结果（使用标准 Markdown 表格格式）

请确保测试用例覆盖全面，包含正向和负向测试场景。"""

            # 创建文本消息
            task_message = prompt
            system_message = "你是一个专业的测试用例生成器，擅长基于文档内容生成全面的测试用例。请先以标准 Markdown 格式生成测试用例，包含正确的表格格式，然后再生成结构化的 JSON 数据。"

        # 创建AI代理（移除结构化输出格式以避免兼容性问题）
        agent = AssistantAgent(
            name=f"test_case_agent",
            model_client=selected_model_client,
            system_message=system_message,
            model_client_stream=True,
        )

        # 首先输出标题 - 使用不会被误解析为测试用例的格式
        yield "# 正在生成测试用例...\n\n"
        yield f"**文件信息**\n"
        yield f"- 文件类型: {file_extension.upper() if file_extension else '未知'}\n"
        yield f"- 使用模型: {DEEPSEEK_MODEL_NAME if selected_model_client == deepseek_model_client else QWEN_MODEL_NAME}\n\n"
        yield "---\n\n"  # 添加分隔线，明确区分文件信息和测试用例内容

        # 流式输出生成的测试用例
        async for event in agent.run_stream(task=task_message):
            if isinstance(event, ModelClientStreamingChunkEvent):
                # 返回生成的文本片段
                yield event.content
            elif isinstance(event, TaskResult):
                # 任务完成，不再重复输出内容，避免重复
                break

    def _format_api_endpoints_for_prompt(self, api_info: Dict[str, Any]) -> str:
        """
        格式化API端点信息用于提示词
        """
        formatted = ""

        for path_info in api_info['paths'][:10]:  # 限制显示的端点数量
            formatted += f"### {path_info['path']}\n"
            for op in path_info['operations']:
                formatted += f"- **{op['method']}**: {op['summary'] or op['description']}\n"
                if op['parameters']:
                    formatted += f"  - 参数: {len(op['parameters'])} 个\n"
                if op['responses']:
                    formatted += f"  - 响应: {', '.join(op['responses'].keys())}\n"
            formatted += "\n"

        return formatted

    def _format_test_scenarios_for_prompt(self, test_scenarios: List[Dict[str, Any]]) -> str:
        """
        格式化测试场景信息用于提示词
        """
        formatted = ""
        scenario_types = {}

        for scenario in test_scenarios:
            scenario_type = scenario['scenario_type']
            if scenario_type not in scenario_types:
                scenario_types[scenario_type] = []
            scenario_types[scenario_type].append(scenario)

        for scenario_type, scenarios in scenario_types.items():
            formatted += f"### {scenario_type.title()} 测试场景 ({len(scenarios)} 个):\n"
            for scenario in scenarios[:3]:  # 限制显示数量
                formatted += f"- {scenario['test_case_title']}\n"
            formatted += "\n"

        return formatted

    def _generate_optimized_prompt(self, file_type: str, content: str, context: str, requirements: str) -> str:
        """
        根据文件类型生成优化的提示词

        参数:
            file_type: 文件类型
            content: 文件内容或分析结果
            context: 用户上下文
            requirements: 用户需求

        返回:
            优化的提示词
        """
        base_format = """
请先以 Markdown 格式生成测试用例，包含以下内容：
1. 测试用例 ID 和标题（使用二级标题格式，如 ## TC-001: 测试标题）
2. 优先级（加粗显示，如 **优先级:** 高）
3. 描述（加粗显示，如 **描述:** 测试描述）
4. 前置条件（如果有，加粗显示，如 **前置条件:** 条件描述）
5. 测试步骤和预期结果（使用标准 Markdown 表格格式）

对于测试步骤表格，请使用以下格式：

```
### 测试步骤

| # | 步骤描述 | 预期结果 |
| --- | --- | --- |
| 1 | 第一步描述 | 第一步预期结果 |
| 2 | 第二步描述 | 第二步预期结果 |
```

请确保表格格式正确，包含表头和分隔行。
"""

        if file_type in ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp']:
            return f"""请基于上传的图像生成全面的测试用例。

上下文信息: {context}

需求: {requirements}

{base_format}

请确保测试用例覆盖全面，包含正向和负向测试场景，特别关注：
- UI界面的交互测试
- 用户体验测试
- 界面元素的功能测试
- 异常情况处理"""

        elif file_type == 'pdf':
            return f"""请基于文档内容生成全面的测试用例。

{content}

用户上下文: {context}

用户需求: {requirements}

{base_format}

请确保测试用例覆盖全面，包含正向和负向测试场景。"""

        elif file_type in ['json', 'yaml', 'yml']:
            return f"""请基于API文档生成全面的API测试用例。

{content}

用户上下文: {context}

用户需求: {requirements}

{base_format}

请确保测试用例覆盖全面，特别关注：
- 所有API端点的测试
- 正向测试（正常请求和响应）
- 负向测试（错误参数、认证失败等）
- 边界值测试（参数边界、数据长度等）
- 不同HTTP状态码的验证
- 请求和响应数据格式验证
- API安全性测试"""

        else:
            return f"""请基于文档内容生成全面的测试用例。

文档内容:
{content}

上下文信息: {context}

需求: {requirements}

{base_format}

请确保测试用例覆盖全面，包含正向和负向测试场景。"""

    def generate_mindmap_from_test_cases(self, test_cases: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        从测试用例生成思维导图数据

        参数:
            test_cases: 测试用例列表

        返回:
            思维导图的JSON数据结构
        """
        if not test_cases:
            return {"name": "测试用例", "children": []}

        # 创建根节点
        mindmap = {
            "name": "测试用例总览",
            "children": []
        }

        # 按优先级分组
        priority_groups = {}
        for tc in test_cases:
            priority = tc.get('priority', 'Medium')
            if priority not in priority_groups:
                priority_groups[priority] = []
            priority_groups[priority].append(tc)

        # 为每个优先级创建分支
        for priority, cases in priority_groups.items():
            priority_node = {
                "name": f"{priority} 优先级 ({len(cases)}个)",
                "children": []
            }

            for tc in cases:
                test_case_node = {
                    "name": tc.get('title', tc.get('id', '未知测试用例')),
                    "children": []
                }

                # 添加描述节点
                if tc.get('description'):
                    test_case_node["children"].append({
                        "name": f"描述: {tc['description'][:50]}{'...' if len(tc['description']) > 50 else ''}",
                        "children": []
                    })

                # 添加前置条件节点
                if tc.get('preconditions'):
                    test_case_node["children"].append({
                        "name": f"前置条件: {tc['preconditions'][:50]}{'...' if len(tc['preconditions']) > 50 else ''}",
                        "children": []
                    })

                # 添加测试步骤节点
                if tc.get('steps'):
                    steps_node = {
                        "name": f"测试步骤 ({len(tc['steps'])}步)",
                        "children": []
                    }

                    for step in tc['steps'][:5]:  # 限制显示的步骤数量
                        step_node = {
                            "name": f"步骤{step.get('step_number', '?')}: {step.get('description', '')[:30]}{'...' if len(step.get('description', '')) > 30 else ''}",
                            "children": [{
                                "name": f"预期: {step.get('expected_result', '')[:40]}{'...' if len(step.get('expected_result', '')) > 40 else ''}",
                                "children": []
                            }]
                        }
                        steps_node["children"].append(step_node)

                    test_case_node["children"].append(steps_node)

                priority_node["children"].append(test_case_node)

            mindmap["children"].append(priority_node)

        # 添加统计信息节点
        stats_node = {
            "name": "统计信息",
            "children": [
                {"name": f"总测试用例: {len(test_cases)}", "children": []},
                {"name": f"优先级分布: {len(priority_groups)}种", "children": []},
                {"name": f"平均步骤数: {self._calculate_average_steps(test_cases):.1f}", "children": []}
            ]
        }
        mindmap["children"].append(stats_node)

        return mindmap

    def _calculate_average_steps(self, test_cases: List[Dict[str, Any]]) -> float:
        """
        计算测试用例的平均步骤数
        """
        total_steps = 0
        valid_cases = 0

        for tc in test_cases:
            if tc.get('steps'):
                total_steps += len(tc['steps'])
                valid_cases += 1

        return total_steps / valid_cases if valid_cases > 0 else 0


ai_service = AIService()
