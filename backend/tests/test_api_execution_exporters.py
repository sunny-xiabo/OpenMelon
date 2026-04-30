from app.api_execution.exporters.postman_exporter import generate_postman_collection
from app.api_execution.exporters.pytest_exporter import generate_pytest_script
from app.api_execution.schemas import APITestCaseDsl


def test_generate_pytest_script_contains_steps_and_assertions():
    script = _sample_script()

    content = generate_pytest_script(script)

    assert "def test_api_script" in content
    assert "httpx.Client" in content
    assert "json_path_exists" in content
    assert "access_token" in content
    assert "{{user_id}}" in content


def test_generate_postman_collection_contains_items_and_tests():
    script = _sample_script()

    collection = generate_postman_collection(script)

    assert collection["info"]["schema"].endswith("collection/v2.1.0/collection.json")
    assert collection["variable"][0] == {"key": "baseUrl", "value": "http://example.test"}
    assert len(collection["item"]) == 2
    assert collection["item"][0]["request"]["method"] == "POST"
    assert collection["item"][1]["request"]["header"][0]["value"] == "Bearer {{access_token}}"
    test_lines = "\n".join(collection["item"][0]["event"][0]["script"]["exec"])
    assert "json path exists" in test_lines
    assert "pm.collectionVariables.set('access_token'" in test_lines


def _sample_script():
    script = APITestCaseDsl(
        case_id="case_export",
        name="导出 smoke",
        base_url="http://example.test",
        steps=[
            {
                "id": "s1",
                "name": "登录",
                "method": "POST",
                "path": "/login",
                "operation_id": "login",
                "assertions": [{"type": "json_path_exists", "path": "$.data.token"}],
                "extractions": [{"name": "access_token", "source": "body", "path": "data.token"}],
            },
            {
                "id": "s2",
                "name": "读取用户",
                "method": "GET",
                "path": "/users/{{user_id}}",
                "operation_id": "get_user",
                "headers": {"Authorization": "Bearer {{access_token}}"},
            },
        ],
        variables={"user_id": "u-1"},
    )
    return script
