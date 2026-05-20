from app.api_execution.ai.flow_draft import build_flow_draft
from app.api_execution.storage import APIExecutionStore


def test_flow_draft_generates_script_from_business_goal(monkeypatch, tmp_path):
    store = APIExecutionStore(tmp_path)
    store.save_spec(_spec())

    response = build_flow_draft(
        store.get_spec("spec-1"),
        "登录后创建订单并查询订单详情",
        project_name="订单系统",
        environment_name="测试环境",
        base_url="http://example.test",
    )

    script = response["draft_script"].model_dump()
    assert script["name"] == "登录后创建订单并查询订单详情"
    assert script["target_project"] == "订单系统"
    assert script["environment"] == "测试环境"
    assert script["base_url"] == "http://example.test"
    assert [step["operation_id"] for step in script["steps"]] == ["login", "createOrder", "getOrder"]
    assert script["steps"][1]["depends_on"] == ["s1"]
    assert script["steps"][2]["depends_on"] == ["s2"]
    assert script["steps"][0]["extractions"][0]["name"] == "access_token"
    assert script["steps"][1]["headers"]["Authorization"] == "Bearer {{access_token}}"
    assert script["steps"][2]["headers"]["Authorization"] == "Bearer {{access_token}}"
    assert script["steps"][2]["path_params"]["id"] == "{{order_id}}"
    assert any(ref["name"] == "order_id" for ref in response["step_summaries"][2]["variable_references"])
    assert any(item["type"] == "json_path_exists" and item["path"] == "$.data.id" for item in script["steps"][2]["assertions"])
    assert any(item["type"] == "response_time_lt" for item in script["steps"][2]["assertions"])
    assert response["quality_score"]["score"] > 0
    assert response["quality_score"]["level"] in {"good", "medium", "low"}
    assert response["requires_approval"] is True
    assert response["uncertainties"]


def test_flow_draft_respects_selected_operation_scope():
    response = build_flow_draft(_spec(), "查询订单", operation_ids=["op-get-order"])

    script = response["draft_script"].model_dump()

    assert response["selected_operation_ids"] == ["op-get-order"]
    assert len(script["steps"]) == 1
    assert script["steps"][0]["operation_id"] == "getOrder"


def test_flow_draft_links_multiple_resource_ids_and_body_fields():
    response = build_flow_draft(
        _spec_with_cart_and_order(),
        "登录后创建购物车，创建订单并查询订单",
    )

    script = response["draft_script"].model_dump()
    steps = {step["operation_id"]: step for step in script["steps"]}

    assert steps["createCart"]["extractions"][0]["name"] == "cart_id"
    assert steps["createOrder"]["body"]["cart_id"] == "{{cart_id}}"
    assert steps["getOrder"]["path_params"]["order_id"] == "{{order_id}}"
    assert any(ref["name"] == "cart_id" for ref in response["step_summaries"][2]["variable_references"])
    assert any(ref["name"] == "order_id" for ref in response["step_summaries"][3]["variable_references"])


def test_flow_draft_recommends_matching_templates():
    response = build_flow_draft(
        _spec(),
        "登录后创建订单并查询订单详情",
        flow_templates=[
            {
                "template_id": "template-order",
                "name": "订单 smoke 流程",
                "description": "登录、创建订单、查询订单",
                "tags": ["订单", "smoke"],
                "script": {"steps": [{"id": "s1"}, {"id": "s2"}, {"id": "s3"}]},
            },
            {
                "template_id": "template-user",
                "name": "用户资料流程",
                "description": "查询用户资料",
                "tags": ["用户"],
                "script": {"steps": [{"id": "s1"}]},
            },
        ],
    )

    assert response["template_recommendations"][0]["template_id"] == "template-order"


def test_flow_draft_template_recommendation_includes_performance():
    response = build_flow_draft(
        _spec(),
        "登录后创建订单并查询订单详情",
        flow_templates=[
            {
                "template_id": "template-order",
                "name": "订单 smoke 流程",
                "description": "登录、创建订单、查询订单",
                "tags": ["订单", "smoke"],
                "performance": {
                    "run_count": 6,
                    "pass_rate": 0.83,
                    "failure_rate": 0.17,
                    "last_run_at": "2026-05-12T00:00:00Z",
                },
                "script": {"steps": [{"id": "s1"}, {"id": "s2"}, {"id": "s3"}]},
            },
        ],
    )

    recommendation = response["template_recommendations"][0]
    assert recommendation["performance"]["run_count"] == 6
    assert "通过率 83%" in recommendation["recommendation_reason"]


def _spec():
    return {
        "spec_id": "spec-1",
        "info": {"title": "订单系统"},
        "servers": [{"url": "http://local.test"}],
        "operation_count": 3,
        "operations": [
            {
                "id": "op-login",
                "method": "POST",
                "path": "/auth/login",
                "operation_id": "login",
                "summary": "登录获取 token",
                "parameters": [],
                "request_body": {
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "username": {"type": "string"},
                                    "password": {"type": "string"},
                                },
                            }
                        }
                    }
                },
                "responses": {
                    "200": {
                        "description": "ok",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "data": {
                                            "type": "object",
                                            "properties": {
                                                "token": {"type": "string"},
                                            },
                                        }
                                    },
                                }
                            }
                        },
                    }
                },
            },
            {
                "id": "op-create-order",
                "method": "POST",
                "path": "/orders",
                "operation_id": "createOrder",
                "summary": "创建订单",
                "parameters": [],
                "request_body": {
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "sku": {"type": "string"},
                                    "quantity": {"type": "integer"},
                                },
                            }
                        }
                    }
                },
                "responses": {
                    "201": {
                        "description": "created",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "data": {
                                            "type": "object",
                                            "properties": {
                                                "id": {"type": "string"},
                                            },
                                        }
                                    },
                                }
                            }
                        },
                    }
                },
            },
            {
                "id": "op-get-order",
                "method": "GET",
                "path": "/orders/{id}",
                "operation_id": "getOrder",
                "summary": "查询订单详情",
                "parameters": [{"name": "id", "in": "path", "schema": {"type": "string"}}],
                "responses": {
                    "200": {
                        "description": "ok",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "data": {
                                            "type": "object",
                                            "properties": {
                                                "id": {"type": "string"},
                                                "status": {"type": "string"},
                                            },
                                        }
                                    },
                                }
                            }
                        },
                    }
                },
            },
        ],
    }


def _spec_with_cart_and_order():
    spec = _spec()
    spec["operations"] = [
        spec["operations"][0],
        {
            "id": "op-create-cart",
            "method": "POST",
            "path": "/carts",
            "operation_id": "createCart",
            "summary": "创建购物车",
            "parameters": [],
            "request_body": {
                "content": {
                    "application/json": {
                        "schema": {
                            "type": "object",
                            "properties": {
                                "user_id": {"type": "string"},
                            },
                        }
                    }
                }
            },
            "responses": {"201": {"description": "created"}},
        },
        {
            "id": "op-create-order",
            "method": "POST",
            "path": "/orders",
            "operation_id": "createOrder",
            "summary": "创建订单",
            "parameters": [],
            "request_body": {
                "content": {
                    "application/json": {
                        "schema": {
                            "type": "object",
                            "properties": {
                                "cart_id": {"type": "string"},
                                "sku": {"type": "string"},
                            },
                        }
                    }
                }
            },
            "responses": {"201": {"description": "created"}},
        },
        {
            "id": "op-get-order",
            "method": "GET",
            "path": "/orders/{order_id}",
            "operation_id": "getOrder",
            "summary": "查询订单详情",
            "parameters": [{"name": "order_id", "in": "path", "schema": {"type": "string"}}],
            "responses": {"200": {"description": "ok"}},
        },
    ]
    spec["operation_count"] = len(spec["operations"])
    return spec
