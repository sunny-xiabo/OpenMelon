"""Built-in workflow templates seeded on first startup."""
from __future__ import annotations

from typing import Any

BUILTIN_TEMPLATES: list[dict[str, Any]] = [
    {
        "template_id": "builtin_rag_qa",
        "name": "RAG 智能问答",
        "description": "基于知识库检索的问答流程：用户提问 -> 知识检索 -> LLM 生成回答",
        "category": "builtin",
        "tags": ["rag", "qa", "knowledge"],
        "data": {
            "name": "RAG 智能问答",
            "description": "基于知识库检索的问答流程",
            "nodes": [
                {
                    "id": "start_1",
                    "type": "start",
                    "title": "开始",
                    "config": {"variables": [{"name": "query", "type": "string", "required": True}]},
                    "position": {"x": 100, "y": 200},
                },
                {
                    "id": "knowledge_1",
                    "type": "knowledge_retrieval",
                    "title": "知识检索",
                    "config": {
                        "retrieval_mode": "hybrid",
                        "query_variable": ["start_1", "query"],
                        "top_k": 5,
                    },
                    "position": {"x": 400, "y": 200},
                },
                {
                    "id": "llm_1",
                    "type": "llm",
                    "title": "生成回答",
                    "config": {
                        "model": "",
                        "system_prompt": "你是一个专业的知识助手，请根据检索到的内容回答用户问题。如果检索内容不足以回答，请明确说明。",
                        "prompt_template": "用户问题：{{start_1.query}}\n\n检索到的相关内容：\n{{knowledge_1.result}}\n\n请根据以上内容回答用户问题。",
                        "temperature": 0.7,
                        "max_tokens": 2048,
                    },
                    "position": {"x": 700, "y": 200},
                },
                {
                    "id": "end_1",
                    "type": "end",
                    "title": "结束",
                    "config": {},
                    "position": {"x": 1000, "y": 200},
                },
            ],
            "edges": [
                {"id": "e1", "source": "start_1", "target": "knowledge_1", "source_handle": "source", "target_handle": "target"},
                {"id": "e2", "source": "knowledge_1", "target": "llm_1", "source_handle": "source", "target_handle": "target"},
                {"id": "e3", "source": "llm_1", "target": "end_1", "source_handle": "source", "target_handle": "target"},
            ],
            "variables": [],
        },
    },
    {
        "template_id": "builtin_doc_summary",
        "name": "文档摘要生成",
        "description": "输入长文本，通过 LLM 生成结构化摘要",
        "category": "builtin",
        "tags": ["summary", "llm", "document"],
        "data": {
            "name": "文档摘要生成",
            "description": "输入长文本，通过 LLM 生成结构化摘要",
            "nodes": [
                {
                    "id": "start_1",
                    "type": "start",
                    "title": "开始",
                    "config": {"variables": [
                        {"name": "document", "type": "string", "required": True},
                        {"name": "language", "type": "string", "default": "中文"},
                    ]},
                    "position": {"x": 100, "y": 200},
                },
                {
                    "id": "llm_1",
                    "type": "llm",
                    "title": "生成摘要",
                    "config": {
                        "model": "",
                        "system_prompt": "你是一个专业的文档分析助手。",
                        "prompt_template": "请对以下文档生成一份结构化摘要，使用 {{start_1.language}} 输出。\n\n要求：\n1. 一句话总结\n2. 核心要点（3-5条）\n3. 关键结论\n\n文档内容：\n{{start_1.document}}",
                        "temperature": 0.3,
                        "max_tokens": 1024,
                    },
                    "position": {"x": 400, "y": 200},
                },
                {
                    "id": "end_1",
                    "type": "end",
                    "title": "结束",
                    "config": {},
                    "position": {"x": 700, "y": 200},
                },
            ],
            "edges": [
                {"id": "e1", "source": "start_1", "target": "llm_1", "source_handle": "source", "target_handle": "target"},
                {"id": "e2", "source": "llm_1", "target": "end_1", "source_handle": "source", "target_handle": "target"},
            ],
            "variables": [],
        },
    },
    {
        "template_id": "builtin_conditional_route",
        "name": "条件路由示例",
        "description": "根据输入内容走不同分支处理",
        "category": "builtin",
        "tags": ["condition", "routing", "example"],
        "data": {
            "name": "条件路由示例",
            "description": "根据输入内容走不同分支处理",
            "nodes": [
                {
                    "id": "start_1",
                    "type": "start",
                    "title": "开始",
                    "config": {"variables": [{"name": "query", "type": "string", "required": True}]},
                    "position": {"x": 100, "y": 200},
                },
                {
                    "id": "condition_1",
                    "type": "if_else",
                    "title": "判断意图",
                    "config": {
                        "conditions": [
                            {"variable_selector": ["start_1", "query"], "operator": "contains", "value": "测试"}
                        ],
                        "logical_operator": "and",
                    },
                    "position": {"x": 400, "y": 200},
                },
                {
                    "id": "llm_true",
                    "type": "llm",
                    "title": "测试相关回答",
                    "config": {
                        "model": "",
                        "prompt_template": "用户提到了测试相关内容：{{start_1.query}}\n\n请给出测试相关的专业建议。",
                        "temperature": 0.7,
                    },
                    "position": {"x": 700, "y": 100},
                },
                {
                    "id": "llm_false",
                    "type": "llm",
                    "title": "通用回答",
                    "config": {
                        "model": "",
                        "prompt_template": "用户提问：{{start_1.query}}\n\n请给出通用回答。",
                        "temperature": 0.7,
                    },
                    "position": {"x": 700, "y": 300},
                },
                {
                    "id": "end_1",
                    "type": "end",
                    "title": "结束",
                    "config": {},
                    "position": {"x": 1000, "y": 200},
                },
            ],
            "edges": [
                {"id": "e1", "source": "start_1", "target": "condition_1", "source_handle": "source", "target_handle": "target"},
                {"id": "e2", "source": "condition_1", "target": "llm_true", "source_handle": "true", "target_handle": "target"},
                {"id": "e3", "source": "condition_1", "target": "llm_false", "source_handle": "false", "target_handle": "target"},
                {"id": "e4", "source": "llm_true", "target": "end_1", "source_handle": "source", "target_handle": "target"},
                {"id": "e5", "source": "llm_false", "target": "end_1", "source_handle": "source", "target_handle": "target"},
            ],
            "variables": [],
        },
    },
    {
        "template_id": "builtin_http_api_call",
        "name": "HTTP API 调用链",
        "description": "串联多个 HTTP API 调用，支持变量传递",
        "category": "builtin",
        "tags": ["http", "api", "chain"],
        "data": {
            "name": "HTTP API 调用链",
            "description": "串联多个 HTTP API 调用，支持变量传递",
            "nodes": [
                {
                    "id": "start_1",
                    "type": "start",
                    "title": "开始",
                    "config": {"variables": [
                        {"name": "api_base", "type": "string", "required": True},
                        {"name": "auth_token", "type": "string", "required": True},
                    ]},
                    "position": {"x": 100, "y": 200},
                },
                {
                    "id": "http_1",
                    "type": "http_request",
                    "title": "获取列表",
                    "config": {
                        "method": "GET",
                        "url": "{{start_1.api_base}}/items",
                        "headers": {"Authorization": "Bearer {{start_1.auth_token}}"},
                        "timeout": 30,
                    },
                    "position": {"x": 400, "y": 200},
                },
                {
                    "id": "llm_1",
                    "type": "llm",
                    "title": "分析结果",
                    "config": {
                        "model": "",
                        "prompt_template": "API 返回的数据：\n{{http_1.body}}\n\n请分析这些数据并给出总结。",
                        "temperature": 0.5,
                    },
                    "position": {"x": 700, "y": 200},
                },
                {
                    "id": "end_1",
                    "type": "end",
                    "title": "结束",
                    "config": {},
                    "position": {"x": 1000, "y": 200},
                },
            ],
            "edges": [
                {"id": "e1", "source": "start_1", "target": "http_1", "source_handle": "source", "target_handle": "target"},
                {"id": "e2", "source": "http_1", "target": "llm_1", "source_handle": "source", "target_handle": "target"},
                {"id": "e3", "source": "llm_1", "target": "end_1", "source_handle": "source", "target_handle": "target"},
            ],
            "variables": [],
        },
    },
]
