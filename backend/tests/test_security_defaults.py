from datetime import timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.errors import setup_exception_handlers
from app.config import Settings, settings
from app.testcase_gen.utils.auth import create_jwt_token, verify_jwt_token


def test_cors_defaults_are_environment_aware():
    assert Settings(_env_file=None, APP_ENV="development").cors_allow_origins == ["*"]
    assert Settings(_env_file=None, APP_ENV="production").cors_allow_origins == []
    assert Settings(
        _env_file=None,
        APP_ENV="production",
        CORS_ALLOW_ORIGINS="https://openmelon.example.com, http://localhost:3000",
    ).cors_allow_origins == [
        "https://openmelon.example.com",
        "http://localhost:3000",
    ]


def test_global_exception_details_are_hidden_in_production(monkeypatch):
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "DEBUG", False)

    app = FastAPI()
    setup_exception_handlers(app)

    @app.get("/boom")
    async def boom():
        raise RuntimeError("secret diagnostic detail")

    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/boom")

    assert response.status_code == 500
    assert response.json()["error"]["details"] is None


def test_testcase_auth_jwt_uses_declared_dependencies_only():
    token = create_jwt_token({"sub": "alice"})

    assert verify_jwt_token(token)["sub"] == "alice"
    assert verify_jwt_token("not-a-token") is None
    assert verify_jwt_token(
        create_jwt_token({"sub": "expired"}, expires_delta=timedelta(seconds=-1))
    ) is None
