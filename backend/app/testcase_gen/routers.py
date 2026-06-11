from types import ModuleType
import sys

from fastapi import APIRouter

from app.testcase_gen import router_support as _support
from app.testcase_gen.routes import export, generate, performance, vector
from app.testcase_gen import model_presets_api

_ROUTE_MODULES = (
    generate,
    export,
    performance,
    vector,
    model_presets_api,
)

router = APIRouter(
    prefix="/api/test-cases",
    tags=["test-cases"],
    responses={404: {"description": "Not found"}},
)
for _module in _ROUTE_MODULES:
    router.include_router(_module.router)

for _module in _ROUTE_MODULES:
    for _name in getattr(_module, "__all__", ()): 
        if _name != "router":
            globals()[_name] = getattr(_module, _name)


def _propagate(name: str, value):
    if hasattr(_support, name):
        setattr(_support, name, value)
    for module in _ROUTE_MODULES:
        if hasattr(module, name):
            setattr(module, name, value)


class _RouterModule(ModuleType):
    def __setattr__(self, name, value):
        super().__setattr__(name, value)
        _propagate(name, value)


sys.modules[__name__].__class__ = _RouterModule

__all__ = [name for name in globals() if not name.startswith("__")]
