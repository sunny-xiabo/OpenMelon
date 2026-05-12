from types import ModuleType
import sys

from fastapi import APIRouter

from app.api_execution import router_support as _support
from app.api_execution.router_support import *
from app.api_execution.routes import ai, dashboard, exports, knowledge, projects, runs, specs, tasks, templates

_ROUTE_MODULES = (
    projects,
    dashboard,
    templates,
    tasks,
    knowledge,
    specs,
    ai,
    runs,
    exports,
)

router = APIRouter(prefix="/api-execution", tags=["api-execution"])
for _module in _ROUTE_MODULES:
    router.include_router(_module.router)

for _module in _ROUTE_MODULES:
    for _name in getattr(_module, "__all__", ()): 
        if _name != "router":
            globals()[_name] = getattr(_module, _name)


def _propagate(name: str, value):
    if hasattr(_support, name):
        setattr(_support, name, value)
    for module in getattr(_support, "SERVICE_MODULES", ()):
        if hasattr(module, name):
            setattr(module, name, value)
    for module in _ROUTE_MODULES:
        if hasattr(module, name):
            setattr(module, name, value)


class _RouterModule(ModuleType):
    def __setattr__(self, name, value):
        super().__setattr__(name, value)
        _propagate(name, value)


sys.modules[__name__].__class__ = _RouterModule

__all__ = [name for name in globals() if not name.startswith("__")]
