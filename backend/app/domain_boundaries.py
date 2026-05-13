"""Domain boundary registry for OpenMelon modules."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DomainBoundary:
    key: str
    name: str
    backend_packages: tuple[str, ...]
    frontend_features: tuple[str, ...]
    owns: tuple[str, ...]
    may_depend_on: tuple[str, ...] = ()


DOMAIN_BOUNDARIES: tuple[DomainBoundary, ...] = (
    DomainBoundary(
        key="api_automation",
        name="API 自动化",
        backend_packages=("app.api_execution",),
        frontend_features=("features/APIExecution", "features/APIExecutionFlow", "features/APIExecutionDashboard"),
        owns=("OpenAPI 解析", "流程 DSL", "执行队列", "执行历史", "流程模板", "受控修复"),
        may_depend_on=("log_center", "knowledge_rag"),
    ),
    DomainBoundary(
        key="testcase_generation",
        name="测试用例生成",
        backend_packages=("app.testcase_gen",),
        frontend_features=("features/TestCase",),
        owns=("需求解析", "测试用例生成", "测试用例导出", "Prompt Hub 生成上下文"),
        may_depend_on=("knowledge_rag", "log_center"),
    ),
    DomainBoundary(
        key="knowledge_rag",
        name="知识库/RAG",
        backend_packages=("app.knowledge_rag",),
        frontend_features=("features/QA", "features/Graph", "features/Manage", "features/Coverage"),
        owns=("文档索引", "向量检索", "图谱检索", "RAG 回答", "覆盖率"),
        may_depend_on=("log_center",),
    ),
    DomainBoundary(
        key="governance_center",
        name="治理中心",
        backend_packages=("app.governance_center",),
        frontend_features=("features/GovernanceCenter",),
        owns=("待办队列", "知识治理", "模板治理", "资产健康"),
        may_depend_on=("api_automation", "knowledge_rag", "log_center"),
    ),
    DomainBoundary(
        key="log_center",
        name="日志中心",
        backend_packages=("app.log_center", "app.api.logging_service"),
        frontend_features=("features/LogCenter", "features/AIObservability"),
        owns=("审计事件", "日志查询", "日志清理", "AI/RAG 调用观测"),
    ),
)


def get_domain_boundary(key: str) -> DomainBoundary | None:
    return next((boundary for boundary in DOMAIN_BOUNDARIES if boundary.key == key), None)
