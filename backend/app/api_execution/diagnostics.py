from typing import Any

from app.api_execution.schemas import APITestCaseDsl


def enrich_run_report(report: dict[str, Any], script: APITestCaseDsl) -> dict[str, Any]:
    diagnostics = build_failure_diagnostics(report, script)
    enriched_results = []
    diagnostics_by_step: dict[str, list[dict[str, Any]]] = {}
    for item in diagnostics:
        diagnostics_by_step.setdefault(item["step_id"], []).append(item)

    for result in report.get("results", []) or []:
        enriched_results.append(
            {
                **result,
                "diagnostics": diagnostics_by_step.get(result.get("step_id", ""), []),
            }
        )

    repair_suggestions = _dedupe_suggestions(diagnostics)
    failure_reason = report.get("failure_reason")
    if not failure_reason and diagnostics:
        failure_reason = diagnostics[0]["explanation"]

    return {
        **report,
        "case_id": script.case_id,
        "target_project": script.target_project,
        "results": enriched_results,
        "failure_reason": failure_reason,
        "failure_diagnostics": diagnostics,
        "repair_suggestions": repair_suggestions,
    }


def build_failure_diagnostics(report: dict[str, Any], script: APITestCaseDsl) -> list[dict[str, Any]]:
    steps_by_id = {step.id: step for step in script.steps or []}
    diagnostics: list[dict[str, Any]] = []
    for result in report.get("results", []) or []:
        if result.get("status") == "passed":
            continue
        step_id = str(result.get("step_id", ""))
        step = steps_by_id.get(step_id)
        diagnostics.extend(_diagnose_result(result, step_id, result.get("name") or getattr(step, "name", "")))
    return diagnostics


def _diagnose_result(result: dict[str, Any], step_id: str, step_name: str) -> list[dict[str, Any]]:
    if result.get("error"):
        error_text = str(result.get("error") or "")
        if "{{" in error_text or "变量" in error_text or "variable" in error_text.lower():
            return [
                _diagnostic(
                    step_id,
                    step_name,
                    "variable_reference_missing",
                    "high",
                    f"变量引用或变量替换失败：{error_text}",
                    [
                        "检查前置步骤是否配置了对应 extraction，并确认 depends_on 顺序正确。",
                        "在流程图中查看变量传递边，确认引用变量来自已执行步骤。",
                        "如果变量来自创建接口返回值，确认提取路径是否匹配真实响应。",
                    ],
                )
            ]
        return [
            _diagnostic(
                step_id,
                step_name,
                "request_error",
                "high",
                f"请求未成功完成：{result.get('error')}",
                [
                    "检查 Base URL、网络连通性和服务是否启动。",
                    "确认接口路径、代理、证书和超时配置是否正确。",
                    "如果目标服务响应较慢，可改用后台执行并适当增加单步超时。",
                ],
            )
        ]

    status_code = result.get("status_code")
    diagnostics = []
    for assertion in result.get("assertions", []) or []:
        if assertion.get("passed"):
            continue
        diagnostics.append(_diagnose_assertion(step_id, step_name, status_code, assertion))

    if not diagnostics:
        diagnostics.append(_diagnose_status(step_id, step_name, status_code))
    return diagnostics


def _diagnose_assertion(step_id: str, step_name: str, status_code: int | None, assertion: dict[str, Any]) -> dict[str, Any]:
    assertion_type = assertion.get("type", "")
    expected = assertion.get("expected")
    actual = assertion.get("actual")
    message = assertion.get("message") or "断言未通过"

    if assertion_type in {"status_code", "status_code_in"}:
        suggestions = _status_suggestions(status_code)
        return _diagnostic(
            step_id,
            step_name,
            "status_code_mismatch",
            "high",
            f"状态码断言失败：期望 {expected}，实际 {actual}。{message}",
            suggestions,
            assertion_type,
        )
    if assertion_type == "json_path_exists":
        return _diagnostic(
            step_id,
            step_name,
            "response_schema_mismatch",
            "medium",
            f"JSON 路径不存在：{assertion.get('path') or '未填写路径'}。",
            [
                "检查响应结构是否和 OpenAPI 文档一致。",
                "如果接口返回数组，确认路径中是否需要加入下标，例如 data.0.id。",
                "如果状态码不是 2xx，先修复请求参数或鉴权，再验证响应字段。",
            ],
            assertion_type,
        )
    if assertion_type == "json_path_equals":
        return _diagnostic(
            step_id,
            step_name,
            "test_data_mismatch",
            "medium",
            f"JSON 路径值不匹配：期望 {expected}，实际 {actual}。",
            [
                "确认测试数据是否稳定，必要时把期望值改成变量提取结果。",
                "检查 JSON 路径是否指向了正确字段。",
                "如果字段由服务端动态生成，建议改用存在性断言或类型断言。",
            ],
            assertion_type,
        )
    if assertion_type == "body_contains":
        return _diagnostic(
            step_id,
            step_name,
            "body_content_mismatch",
            "medium",
            f"响应体未包含期望文本：{expected}。",
            [
                "检查接口是否返回了错误页或错误消息。",
                "如果文案会变化，建议改用 JSON 路径断言。",
                "确认测试环境语言、数据状态和查询条件是否一致。",
            ],
            assertion_type,
        )
    if assertion_type == "header_equals":
        return _diagnostic(
            step_id,
            step_name,
            "header_mismatch",
            "low",
            f"响应头不匹配：期望 {expected}，实际 {actual}。",
            [
                "确认响应头名称大小写和网关转发规则。",
                "如果该 Header 由网关或中间件生成，检查目标环境配置。",
            ],
            assertion_type,
        )
    if assertion_type == "response_time_lt":
        return _diagnostic(
            step_id,
            step_name,
            "performance_or_flaky",
            "medium",
            f"响应时间超出阈值：期望小于 {expected} ms，实际 {actual} ms。",
            [
                "重跑该步骤确认是否为偶发波动。",
                "检查目标服务、数据库或依赖服务是否存在慢查询和冷启动。",
                "如果当前阈值过严，可按接口 SLA 调整响应时间断言。",
            ],
            assertion_type,
        )
    return _diagnostic(
        step_id,
        step_name,
        "assertion_failed",
        "medium",
        f"断言 {assertion_type} 未通过：{message}",
        ["检查断言配置、请求参数和响应内容是否一致。"],
        assertion_type,
    )


def _diagnose_status(step_id: str, step_name: str, status_code: int | None) -> dict[str, Any]:
    return _diagnostic(
        step_id,
        step_name,
        "status_code_mismatch",
        "high",
        f"接口返回异常状态码：{status_code or '无状态码'}。",
        _status_suggestions(status_code),
    )


def _status_suggestions(status_code: int | None) -> list[str]:
    if status_code in {401, 403}:
        return [
            "检查 Bearer Token、Cookie 或其他鉴权 Header 是否配置正确。",
            "确认当前账号是否具备访问该接口的权限。",
            "如果登录接口在前置步骤中生成 token，确认变量提取路径是否正确。",
        ]
    if status_code == 404:
        return [
            "检查 Base URL 是否包含了多余或缺失的前缀。",
            "确认接口 path 是否和目标环境部署版本一致。",
            "如果 path 中有参数，检查路径参数是否已正确填充。",
        ]
    if status_code == 422:
        return [
            "检查 query、path 参数和 body 是否满足 OpenAPI schema。",
            "优先查看响应体中的 validation error，按字段修正测试数据。",
            "如果字段来自变量提取，确认前置步骤确实提取到了有效值。",
            "如果是流程草稿生成的脚本，优先检查 body/path/query 中的 {{变量}} 是否已被前置步骤提取。",
        ]
    if status_code and 400 <= status_code < 500:
        return [
            "检查请求参数、鉴权信息和测试数据是否符合接口要求。",
            "查看响应体错误信息，优先修正缺失字段、非法枚举值或业务状态。",
        ]
    if status_code and status_code >= 500:
        return [
            "重跑确认是否为服务端偶发错误。",
            "检查目标服务日志、依赖服务和测试数据是否触发异常分支。",
            "如果频繁出现，建议把该接口标记为不稳定并单独追踪。",
        ]
    return [
        "确认目标服务是否可访问。",
        "检查 Base URL、接口路径、代理和超时配置。",
    ]


def _diagnostic(
    step_id: str,
    step_name: str,
    category: str,
    severity: str,
    explanation: str,
    suggestions: list[str],
    assertion_type: str | None = None,
) -> dict[str, Any]:
    return {
        "step_id": step_id,
        "step_name": step_name,
        "category": category,
        "severity": severity,
        "assertion_type": assertion_type,
        "explanation": explanation,
        "suggestions": suggestions,
    }


def _dedupe_suggestions(diagnostics: list[dict[str, Any]]) -> list[str]:
    suggestions = []
    seen = set()
    for diagnostic in diagnostics:
        for suggestion in diagnostic.get("suggestions", []):
            if suggestion not in seen:
                seen.add(suggestion)
                suggestions.append(suggestion)
    return suggestions[:8]
