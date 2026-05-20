from fastapi import APIRouter, Depends, File, UploadFile

from app.api.deps import require_production_auth
from app.api_execution.router_support import (
    OpenAPIParseResponse, ParseUrlRequest, DemoBootstrapResponse,
    OperationsResponse, APITestCaseDsl, GenerateDslRequest, ValidateDslRequest,
    parse_openapi_file_service, parse_openapi_url_service, load_demo_openapi_service,
    bootstrap_demo_project_service, get_spec_operations_service, get_spec_service,
    generate_dsl_service, validate_dsl_service,
)

router = APIRouter()


@router.post(
    "/openapi/parse-file",
    response_model=OpenAPIParseResponse,
    dependencies=[Depends(require_production_auth)],
)
async def parse_openapi_file(file: UploadFile = File(...)):
    return await parse_openapi_file_service(file)


@router.post(
    "/openapi/parse-url",
    response_model=OpenAPIParseResponse,
    dependencies=[Depends(require_production_auth)],
)
async def parse_openapi_url(request: ParseUrlRequest):
    return await parse_openapi_url_service(request)


@router.get("/demo/openapi", response_model=OpenAPIParseResponse)
async def load_demo_openapi():
    return load_demo_openapi_service()


@router.post(
    "/demo/bootstrap",
    response_model=DemoBootstrapResponse,
    dependencies=[Depends(require_production_auth)],
)
async def bootstrap_demo_project():
    return await bootstrap_demo_project_service()


@router.get("/specs/{spec_id}/operations", response_model=OperationsResponse)
async def get_spec_operations(spec_id: str):
    return get_spec_operations_service(spec_id)


@router.get("/specs/{spec_id}", response_model=OpenAPIParseResponse)
async def get_spec(spec_id: str):
    return get_spec_service(spec_id)


@router.post(
    "/dsl/generate",
    response_model=APITestCaseDsl,
    dependencies=[Depends(require_production_auth)],
)
async def generate_dsl(request: GenerateDslRequest):
    return generate_dsl_service(request)


@router.post("/dsl/validate", dependencies=[Depends(require_production_auth)])
async def validate_dsl(request: ValidateDslRequest):
    return validate_dsl_service(request)


__all__ = [name for name in globals() if not name.startswith("__")]
