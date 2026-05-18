from app.api_execution.router_deps import *
from app.api_execution.services import (
    ai_service,
    asset_service,
    automation_service,
    dashboard_service,
    export_service,
    knowledge_service,
    run_service,
    spec_service,
    template_service,
)
from app.api_execution.services.ai_service import *
from app.api_execution.services.asset_service import *
from app.api_execution.services.automation_service import *
from app.api_execution.services.dashboard_service import *
from app.api_execution.services.export_service import *
from app.api_execution.services.knowledge_service import *
from app.api_execution.services.run_service import *
from app.api_execution.services.spec_service import *
from app.api_execution.services.template_service import *

SERVICE_MODULES = (
    ai_service,
    asset_service,
    automation_service,
    dashboard_service,
    export_service,
    knowledge_service,
    run_service,
    spec_service,
    template_service,
)

__all__ = [name for name in globals() if not name.startswith("__")]
