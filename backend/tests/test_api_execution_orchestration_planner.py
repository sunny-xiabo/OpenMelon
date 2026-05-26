from app.api_execution.orchestration_planner import plan_api_orchestration


def test_planner_links_login_and_parallelizes_independent_reads():
    result = plan_api_orchestration(
        [
            {"id": "s1", "name": "Login", "method": "POST", "path": "/auth/login", "operation_id": "login"},
            {"id": "s2", "name": "List users", "method": "GET", "path": "/users", "operation_id": "listUsers"},
            {"id": "s3", "name": "Health", "method": "GET", "path": "/health", "operation_id": "health"},
        ]
    )

    steps = result["steps"]

    assert steps[0]["extractions"][0]["name"] == "access_token"
    assert steps[1]["depends_on"] == ["s1"]
    assert steps[2]["depends_on"] == ["s1"]
    assert steps[1]["headers"]["Authorization"] == "Bearer {{access_token}}"
    assert steps[1]["parallel_group"] == "parallel_read_1"
    assert steps[2]["parallel_group"] == "parallel_read_1"
    assert any(edge["type"] == "auth" for edge in result["dependency_graph"])


def test_planner_links_resource_consumers_and_keeps_writes_serial():
    result = plan_api_orchestration(
        [
            {"id": "s1", "name": "Create order", "method": "POST", "path": "/orders", "operation_id": "createOrder"},
            {
                "id": "s2",
                "name": "Get order",
                "method": "GET",
                "path": "/orders/{id}",
                "operation_id": "getOrder",
                "path_params": {"id": "example_id"},
            },
            {
                "id": "s3",
                "name": "Update order",
                "method": "PUT",
                "path": "/orders/{id}",
                "operation_id": "updateOrder",
                "path_params": {"id": "example_id"},
            },
            {
                "id": "s4",
                "name": "Delete order",
                "method": "DELETE",
                "path": "/orders/{id}",
                "operation_id": "deleteOrder",
                "path_params": {"id": "example_id"},
            },
        ]
    )

    steps = result["steps"]

    assert steps[0]["extractions"][0]["name"] == "order_id"
    assert steps[1]["path_params"]["id"] == "{{order_id}}"
    assert steps[1]["depends_on"] == ["s1"]
    assert steps[2]["depends_on"] == ["s1"]
    assert steps[3]["depends_on"] == ["s1", "s3"]
    assert not any(step.get("parallel_group") for step in steps)
    assert any(edge["type"] == "serial_write" for edge in result["dependency_graph"])


def test_planner_parallelizes_multiple_independent_reads():
    result = plan_api_orchestration(
        [
            {"id": "s1", "name": "List users", "method": "GET", "path": "/users", "operation_id": "listUsers"},
            {"id": "s2", "name": "List orders", "method": "GET", "path": "/orders", "operation_id": "listOrders"},
            {"id": "s3", "name": "Search catalog", "method": "GET", "path": "/catalog/search", "operation_id": "searchCatalog"},
        ],
        project_context={"auth_config": {"type": "none"}},
    )

    assert [step["parallel_group"] for step in result["steps"]] == [
        "parallel_read_1",
        "parallel_read_1",
        "parallel_read_1",
    ]


def test_planner_does_not_group_steps_with_same_extraction_variable():
    result = plan_api_orchestration(
        [
            {
                "id": "s1",
                "name": "Read primary",
                "method": "GET",
                "path": "/primary",
                "operation_id": "readPrimary",
                "extractions": [{"name": "item_id", "source": "body", "path": "data.id"}],
            },
            {
                "id": "s2",
                "name": "Read secondary",
                "method": "GET",
                "path": "/secondary",
                "operation_id": "readSecondary",
                "extractions": [{"name": "item_id", "source": "body", "path": "data.id"}],
            },
        ],
        project_context={"auth_config": {"type": "none"}},
    )

    assert not any(step.get("parallel_group") for step in result["steps"])
    assert any(item["type"] == "parallel_group" and item["severity"] == "warning" for item in result["recommendations"])


def test_planner_preserves_existing_depends_on():
    result = plan_api_orchestration(
        [
            {"id": "s1", "name": "List users", "method": "GET", "path": "/users", "operation_id": "listUsers"},
            {
                "id": "s2",
                "name": "List orders",
                "method": "GET",
                "path": "/orders",
                "operation_id": "listOrders",
                "depends_on": ["manual_setup"],
            },
        ],
        project_context={"setup_steps": [{"id": "manual_setup"}]},
    )

    assert result["steps"][1]["depends_on"] == ["manual_setup"]
