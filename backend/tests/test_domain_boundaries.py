import importlib
from pathlib import Path

from app.domain_boundaries import DOMAIN_BOUNDARIES, get_domain_boundary


REPO_ROOT = Path(__file__).resolve().parents[2]


def test_domain_boundary_registry_has_expected_domains():
    keys = {boundary.key for boundary in DOMAIN_BOUNDARIES}

    assert keys == {
        "api_automation",
        "testcase_generation",
        "knowledge_rag",
        "governance_center",
        "log_center",
    }


def test_backend_boundary_packages_are_importable():
    for boundary in DOMAIN_BOUNDARIES:
        for package in boundary.backend_packages:
            if "." in package and package.rsplit(".", 1)[-1] in {"indexer"}:
                module_name = package
            else:
                module_name = package
            importlib.import_module(module_name)


def test_frontend_boundary_features_exist():
    for boundary in DOMAIN_BOUNDARIES:
        for feature in boundary.frontend_features:
            assert (REPO_ROOT / "frontend" / "src" / feature).exists(), feature


def test_log_center_boundary_uses_facade_router():
    boundary = get_domain_boundary("log_center")

    assert boundary is not None
    assert "app.log_center" in boundary.backend_packages


def test_governance_center_boundary_uses_facade_services():
    boundary = get_domain_boundary("governance_center")
    services = importlib.import_module("app.governance_center.services")

    assert boundary is not None
    assert boundary.backend_packages == ("app.governance_center",)
    assert callable(services.list_task_queue)
    assert callable(services.list_knowledge_items)
    assert callable(services.list_templates)


def test_knowledge_rag_boundary_uses_facade_components():
    boundary = get_domain_boundary("knowledge_rag")
    facade = importlib.import_module("app.knowledge_rag")

    assert boundary is not None
    assert boundary.backend_packages == ("app.knowledge_rag",)
    assert callable(facade.build_knowledge_rag_components)
    assert facade.DocumentIndexer.__name__ == "DocumentIndexer"
    assert facade.RAGGenerator.__name__ == "RAGGenerator"


def test_legacy_log_router_reexports_domain_router():
    legacy = importlib.import_module("app.api.routers.logs")
    domain = importlib.import_module("app.log_center.router")

    assert legacy.router is domain.router
    assert legacy.list_event_logs is domain.list_event_logs
