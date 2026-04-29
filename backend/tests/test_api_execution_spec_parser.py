import json

import httpx

from app.api_execution.spec_parser import parse_api_description_file, parse_api_description_url


def test_parse_postman_collection(tmp_path):
    payload = {
        "info": {
            "name": "User Center",
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        "item": [
            {
                "name": "Auth",
                "item": [
                    {
                        "name": "Login",
                        "request": {
                            "method": "POST",
                            "header": [{"key": "Content-Type", "value": "application/json"}],
                            "url": {
                                "raw": "https://api.example.com/login",
                                "host": ["api", "example", "com"],
                                "path": ["login"],
                            },
                            "body": {"mode": "raw", "raw": '{"name":"demo"}'},
                        },
                    }
                ],
            }
        ],
    }
    file_path = tmp_path / "collection.json"
    file_path.write_text(json.dumps(payload), encoding="utf-8")

    parsed = parse_api_description_file(str(file_path))

    assert parsed["api_info"]["info"]["title"] == "User Center"
    operations = parsed["api_info"]["paths"][0]["operations"]
    assert operations[0]["method"] == "POST"
    assert operations[0]["path"] == "/login"
    assert operations[0]["tags"] == ["Auth"]


def test_parse_har_file(tmp_path):
    payload = {
        "log": {
            "entries": [
                {
                    "request": {
                        "method": "GET",
                        "url": "https://api.example.com/users?id=1",
                        "queryString": [{"name": "id", "value": "1"}],
                    }
                }
            ]
        }
    }
    file_path = tmp_path / "traffic.har"
    file_path.write_text(json.dumps(payload), encoding="utf-8")

    parsed = parse_api_description_file(str(file_path))

    operation = parsed["api_info"]["paths"][0]["operations"][0]
    assert operation["method"] == "GET"
    assert operation["path"] == "/users"
    assert operation["parameters"][0]["name"] == "id"


def test_parse_markdown_endpoint_list(tmp_path):
    file_path = tmp_path / "api.md"
    file_path.write_text(
        "# API\n\nGET /users 获取用户列表\nPOST /users 创建用户\nhttps://api.example.com/health\n",
        encoding="utf-8",
    )

    parsed = parse_api_description_file(str(file_path))

    operations = {
        (operation["method"], operation["path"])
        for path_item in parsed["api_info"]["paths"]
        for operation in path_item["operations"]
    }
    assert ("GET", "/users") in operations
    assert ("POST", "/users") in operations
    assert ("GET", "/health") in operations


class FakeAsyncClient:
    def __init__(self):
        self.responses = {
            "http://example.test/docs": httpx.Response(
                200,
                text='<html><body><a href="/openapi.json">openapi</a></body></html>',
                headers={"content-type": "text/html"},
                request=httpx.Request("GET", "http://example.test/docs"),
            ),
            "http://example.test/openapi.json": httpx.Response(
                200,
                json={
                    "openapi": "3.0.0",
                    "info": {"title": "Swagger Docs"},
                    "paths": {"/users": {"get": {"summary": "List users"}}},
                },
                headers={"content-type": "application/json"},
                request=httpx.Request("GET", "http://example.test/openapi.json"),
            ),
        }

    async def get(self, url):
        response = self.responses[url]
        return response


def test_parse_url_can_discover_openapi_from_swagger_html():
    client = FakeAsyncClient()
    response = client.responses["http://example.test/docs"]

    parsed = __import__("asyncio").run(parse_api_description_url("http://example.test/docs", client=client, response=response))

    assert parsed["info"]["title"] == "Swagger Docs"
    assert parsed["paths"][0]["path"] == "/users"


def test_parse_generic_json_request_tree(tmp_path):
    payload = {
        "name": "Apifox Export",
        "apis": [
            {"name": "Create order", "method": "POST", "path": "/orders"},
            {"name": "Query order", "request": {"method": "GET", "url": "https://api.example.com/orders/{id}"}},
        ],
    }
    file_path = tmp_path / "apifox.json"
    file_path.write_text(json.dumps(payload), encoding="utf-8")

    parsed = parse_api_description_file(str(file_path))

    operations = {
        (operation["method"], operation["path"])
        for path_item in parsed["api_info"]["paths"]
        for operation in path_item["operations"]
    }
    assert ("POST", "/orders") in operations
    assert ("GET", "/orders/{id}") in operations
