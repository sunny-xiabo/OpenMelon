import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.api import management_routes
from app.api.deps import require_production_auth
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


def test_admin_api_keys_are_parsed_from_comma_separated_config():
    assert Settings(
        _env_file=None,
        ADMIN_API_KEYS=" first-key, second-key ,, ",
    ).admin_api_keys == ["first-key", "second-key"]


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


def _protected_admin_client() -> TestClient:
    app = FastAPI()
    setup_exception_handlers(app)

    @app.post("/protected", dependencies=[Depends(require_production_auth)])
    async def protected_endpoint():
        return {"ok": True}

    return TestClient(app)


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _create_admin_jwt(secret: str, payload: dict) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    header_part = _base64url_encode(
        json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    payload_part = _base64url_encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    signature_part = _base64url_encode(
        hmac.new(
            secret.encode("utf-8"),
            f"{header_part}.{payload_part}".encode("ascii"),
            hashlib.sha256,
        ).digest()
    )
    return f"{header_part}.{payload_part}.{signature_part}"


def test_admin_api_protection_is_disabled_by_default(monkeypatch):
    monkeypatch.setattr(settings, "PROTECT_ADMIN_API", False)
    monkeypatch.setattr(settings, "ADMIN_API_KEYS", "")
    monkeypatch.setattr(settings, "ADMIN_JWT_SECRET", "")

    response = _protected_admin_client().post("/protected")

    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_admin_api_protection_blocks_missing_or_invalid_credentials(monkeypatch):
    monkeypatch.setattr(settings, "PROTECT_ADMIN_API", True)
    monkeypatch.setattr(settings, "ADMIN_API_KEYS", "valid-key")
    monkeypatch.setattr(settings, "ADMIN_JWT_SECRET", "")

    client = _protected_admin_client()

    missing_response = client.post("/protected")
    invalid_response = client.post("/protected", headers={"X-API-Key": "wrong-key"})

    assert missing_response.status_code == 401
    assert missing_response.json()["error"]["code"] == "UNAUTHORIZED"
    assert invalid_response.status_code == 401


def test_admin_api_protection_accepts_configured_api_key(monkeypatch):
    monkeypatch.setattr(settings, "PROTECT_ADMIN_API", True)
    monkeypatch.setattr(settings, "ADMIN_API_KEYS", "valid-key, second-key")
    monkeypatch.setattr(settings, "ADMIN_JWT_SECRET", "")

    response = _protected_admin_client().post(
        "/protected",
        headers={"X-API-Key": "second-key"},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_admin_api_protection_accepts_valid_bearer_jwt(monkeypatch):
    secret = "test-admin-jwt-secret"
    token = _create_admin_jwt(
        secret,
        {
            "sub": "admin",
            "exp": int((datetime.now(timezone.utc) + timedelta(minutes=5)).timestamp()),
        },
    )
    monkeypatch.setattr(settings, "PROTECT_ADMIN_API", True)
    monkeypatch.setattr(settings, "ADMIN_API_KEYS", "")
    monkeypatch.setattr(settings, "ADMIN_JWT_SECRET", secret)

    response = _protected_admin_client().post(
        "/protected",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_admin_api_protection_is_attached_to_management_mutations(monkeypatch):
    monkeypatch.setattr(settings, "PROTECT_ADMIN_API", True)
    monkeypatch.setattr(settings, "ADMIN_API_KEYS", "valid-key")
    monkeypatch.setattr(settings, "ADMIN_JWT_SECRET", "")

    app = FastAPI()
    setup_exception_handlers(app)
    app.include_router(management_routes.router)
    client = TestClient(app, raise_server_exceptions=False)

    response = client.delete("/manage/files/demo-record")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"
