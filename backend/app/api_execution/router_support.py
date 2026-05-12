from app.api_execution.router_deps import *
from app.api_execution.services import (
    automation_service,
    dashboard_service,
    export_service,
    knowledge_service,
    run_service,
    spec_service,
)
from app.api_execution.services.automation_service import *
from app.api_execution.services.dashboard_service import *
from app.api_execution.services.export_service import *
from app.api_execution.services.knowledge_service import *
from app.api_execution.services.run_service import *
from app.api_execution.services.spec_service import *

SERVICE_MODULES = (
    automation_service,
    dashboard_service,
    export_service,
    knowledge_service,
    run_service,
    spec_service,
)

__all__ = [name for name in globals() if not name.startswith("__")]
