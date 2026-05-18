from fastapi import APIRouter

from app.api_execution.router_support import *

router = APIRouter()


@router.post("/openapi/parse-file", response_model=OpenAPIParseResponse)
async def parse_openapi_file(file: UploadFile = File(...)):
    return await parse_openapi_file_service(file)


@router.post("/openapi/parse-url", response_model=OpenAPIParseResponse)
async def parse_openapi_url(request: ParseUrlRequest):
    return await parse_openapi_url_service(request)


@router.get("/demo/openapi", response_model=OpenAPIParseResponse)
async def load_demo_openapi():
    return load_demo_openapi_service()


@router.post("/demo/bootstrap", response_model=DemoBootstrapResponse)
async def bootstrap_demo_project():
    return await bootstrap_demo_project_service()


@router.get("/specs/{spec_id}/operations", response_model=OperationsResponse)
async def get_spec_operations(spec_id: str):
    return get_spec_operations_service(spec_id)


@router.get("/specs/{spec_id}", response_model=OpenAPIParseResponse)
async def get_spec(spec_id: str):
    return get_spec_service(spec_id)


@router.post("/dsl/generate", response_model=APITestCaseDsl)
async def generate_dsl(request: GenerateDslRequest):
    return generate_dsl_service(request)


@router.post("/dsl/validate")
async def validate_dsl(request: ValidateDslRequest):
    return validate_dsl_service(request)


__all__ = [name for name in globals() if not name.startswith("__")]
