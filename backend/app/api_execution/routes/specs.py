from fastapi import APIRouter

from app.api_execution.router_support import *

router = APIRouter()

@router.post("/openapi/parse-file", response_model=OpenAPIParseResponse)
async def parse_openapi_file(file: UploadFile = File(...)):
    filename = file.filename or ""
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise InvalidRequestError(message=str("仅支持 OpenAPI / Postman / HAR / Markdown / Word / Excel / HTML / TXT / CSV 文件"))

    content = await file.read()
    if not content:
        raise InvalidRequestError(message=str("API 文档文件不能为空"))
    if len(content) > MAX_UPLOAD_SIZE:
        raise InvalidRequestError(message=str("文件大小不能超过 10MB"))

    content_hash = _content_hash(content)
    cached_spec = api_execution_store.get_spec_by_content_hash(content_hash)
    if cached_spec:
        return cached_spec

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        return await run_in_threadpool(_parse_and_store, tmp_path, filename=filename, content_hash=content_hash)
    except HTTPException:
        raise
    except Exception as exc:
        raise InvalidRequestError(message=str(f"API 文档解析失败: {exc}"))from exc
    finally:
        if "tmp_path" in locals() and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@router.post("/openapi/parse-url", response_model=OpenAPIParseResponse)
async def parse_openapi_url(request: ParseUrlRequest):
    url = str(request.url)
    if not request.force_refresh:
        cached_spec = api_execution_store.get_latest_spec_by_source_url(url)
        if cached_spec:
            return cached_spec

    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
            parsed_info = await parse_api_description_url(url, client=client, response=response)
    except httpx.HTTPError as exc:
        raise InvalidRequestError(message=str(f"OpenAPI URL 获取失败: {exc}"))from exc
    except ValueError as exc:
        raise InvalidRequestError(message=str(exc)) from exc

    content_hash = _content_hash(response.content)
    if not request.force_refresh:
        cached_spec = api_execution_store.get_spec_by_content_hash(content_hash)
        if cached_spec:
            return cached_spec

    try:
        return _store_parsed_info(parsed_info, source_url=url, content_hash=content_hash)
    except HTTPException:
        raise
    except Exception as exc:
        raise InvalidRequestError(message=str(f"API 文档解析失败: {exc}"))from exc


@router.get("/demo/openapi", response_model=OpenAPIParseResponse)
async def load_demo_openapi():
    demo_file = Path(__file__).resolve().parents[4] / "docs" / "samples" / "api-flow-demo-openapi.json"
    if not demo_file.exists():
        raise NotFoundError(message=str("Demo OpenAPI 资产不存在"))
    try:
        return _parse_and_store(str(demo_file), filename=demo_file.name)
    except HTTPException:
        raise
    except Exception as exc:
        raise InvalidRequestError(message=str(f"Demo OpenAPI 解析失败: {exc}"))from exc


@router.post("/demo/bootstrap", response_model=DemoBootstrapResponse)
async def bootstrap_demo_project():
    demo_file = Path(__file__).resolve().parents[4] / "docs" / "samples" / "api-flow-demo-openapi.json"
    if not demo_file.exists():
        raise NotFoundError(message=str("Demo OpenAPI 资产不存在"))
    try:
        spec = await run_in_threadpool(lambda: _parse_and_store(str(demo_file), filename=demo_file.name))
        return _seed_demo_project(spec)
    except HTTPException:
        raise
    except Exception as exc:
        raise InvalidRequestError(message=str(f"Demo 项目初始化失败: {exc}"))from exc


@router.get("/specs/{spec_id}/operations", response_model=OperationsResponse)
async def get_spec_operations(spec_id: str):
    spec = api_execution_store.get_spec(spec_id)
    if not spec:
        raise NotFoundError(message=str("OpenAPI 资产不存在"))
    return {
        "spec_id": spec_id,
        "operation_count": spec.get("operation_count", 0),
        "operations": spec.get("operations", []),
    }


@router.post("/dsl/generate", response_model=APITestCaseDsl)
async def generate_dsl(request: GenerateDslRequest):
    spec = api_execution_store.get_spec(request.spec_id)
    if not spec:
        raise NotFoundError(message=str("OpenAPI 资产不存在"))
    try:
        return generate_api_dsl(spec, request.operation_ids)
    except ValueError as exc:
        raise InvalidRequestError(message=str(exc)) from exc


_VALID_ASSERTION_TYPES = {
    "status_code", "status_code_not", "status_code_in", "status_code_not_in",
    "body_contains", "body_not_contains",
    "json_path_exists", "json_path_not_exists", "json_path_equals",
    "header_exists", "header_equals", "header_contains",
    "response_time_lt",
}


@router.post("/dsl/validate")
async def validate_dsl(request: ValidateDslRequest):
    errors: list[str] = []
    script = request.script
    steps = script.steps or []
    if not steps:
        errors.append("脚本至少需要一个步骤")

    known_vars = set(script.variables or {})
    for i, step in enumerate(steps, 1):
        prefix = f"步骤 {i} ({step.id or step.name or 'unknown'})"
        if not step.method:
            errors.append(f"{prefix}: 缺少 HTTP 方法")
        if not step.path:
            errors.append(f"{prefix}: 缺少请求路径")
        for assertion in step.assertions or []:
            if assertion.type not in _VALID_ASSERTION_TYPES:
                errors.append(f"{prefix}: 未知断言类型 '{assertion.type}'")
        for extraction in step.extractions or []:
            if extraction.name:
                known_vars.add(extraction.name)

    valid = len(errors) == 0
    return {
        "valid": valid,
        "case_id": script.case_id,
        "step_count": len(steps),
        "errors": errors,
    }



__all__ = [name for name in globals() if not name.startswith("__")]
