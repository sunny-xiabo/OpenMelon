from fastapi import APIRouter

from app.testcase_gen.router_support import *

router = APIRouter()

@router.post("/generate")
async def generate_test_cases(
    req: Request,
    file: UploadFile = File(...),
    context: str = Form(...),
    requirements: str = Form(...),
    module: str = Form(default=None),
    use_vector: str = Form(default="false"),
    style_id: str = Form(default=None),
    skill_ids: str = Form(default=None),
):
    """
    从上传的文件、上下文和需求生成测试用例

    参数:
        file: 上传的文件（图像、PDF或OpenAPI文档）
        context: 测试用例生成的上下文信息
        requirements: 测试用例生成的需求
        module: 所属模块（可选）

    返回:
        包含生成的测试用例的流式响应
    """
    trace_id = _trace_id("tc_gen")
    try:
        try:
            parsed_skill_ids = parse_skill_ids(skill_ids)
        except ValueError as exc:
            raise InvalidRequestError(message=str(f"skill_ids 参数非法: {exc}"))from exc

        prompt_config = build_prompt_config_context(style_id, parsed_skill_ids)
        _log_testcase_event(
            "info",
            "testcase_generation_started",
            "测试用例生成开始",
            f"上传文件 {file.filename or ''}",
            trace_id=trace_id,
            refs=[module, file.filename],
            data={
                "module": module or "",
                "filename": file.filename or "",
                "source": "upload",
                "use_vector": use_vector.lower() == "true",
                "style_id": prompt_config["style_id"],
                "skill_ids": prompt_config["skill_ids"],
            },
        )

        # 读取文件内容
        file_content = await file.read()

        # 1. 验证文件大小
        if len(file_content) > MAX_FILE_SIZE:
            logger.warning(
                f"文件过大: {file.filename}, 大小: {len(file_content)} bytes"
            )
            raise InvalidRequestError(message=str(f"文件过大，最大允许 {MAX_FILE_SIZE_MB}MB"))

        # 2. 验证文件类型（魔数验证）
        if not validate_file_type(file_content, file.filename):
            logger.warning(f"文件类型验证失败: {file.filename}")
            raise InvalidRequestError(message=str(f"文件类型不匹配或不受支持。支持的类型: {', '.join(ALLOWED_EXTENSIONS)}",))

        # 保存上传的文件
        from app.runtime_paths import UPLOAD_TEMP_DIR
        file_id = str(uuid.uuid4())
        file_extension = os.path.splitext(file.filename)[1].lower()
        file_path = os.path.join(UPLOAD_TEMP_DIR, f"{file_id}{file_extension}")

        # 3. 使用异步文件操作保存文件
        async with aiofiles.open(file_path, "wb") as uploaded_file:
            await uploaded_file.write(file_content)

        logger.info(
            f"文件上传成功: {file.filename} -> {file_path}, 大小: {len(file_content)} bytes"
        )

        # Vector DB retrieval logic
        use_vector_bool = use_vector.lower() == "true"
        vector_context = ""
        if use_vector_bool:
            vector_ops = getattr(req.app.state, "vector_ops", None)
            llm_client = getattr(req.app.state, "llm_client", None)
            if vector_ops and llm_client:
                try:
                    from app.config import settings
                    model_name = settings.EMBEDDING_MODEL
                    kwargs = {
                        "model": model_name,
                        "input": [f"{requirements}\n{context}"],
                    }
                    if settings.EMBEDDING_DIM and model_name and "text-embedding-3" in model_name:
                        kwargs["dimensions"] = settings.EMBEDDING_DIM
                    emb_resp = await llm_client.embeddings.create(**kwargs)
                    query_embedding = emb_resp.data[0].embedding
                    similar_chunks = await vector_ops.similarity_search(query_embedding, top_k=3)
                    similar_tcs = await vector_ops.search_similar_test_cases(query_embedding, top_k=3)
                    
                    if similar_chunks:
                        vector_context += "【相关参考文档片段】\n" + "\n\n".join([f"[{c.get('filename','')}]\n{c.get('content', '')}" for c in similar_chunks]) + "\n\n"
                    if similar_tcs:
                        vector_context += "【相似历史用例参考】\n" + "\n\n".join([f"[{tc.get('test_case_name', '')}]\n{tc.get('description', '')[:200]}..." for tc in similar_tcs]) + "\n\n"
                except Exception as e:
                    logger.warning(f"Vector search failed during generation: {e}")
                    _log_testcase_event(
                        "warning",
                        "testcase_vector_context_failed",
                        "测试用例向量上下文检索失败",
                        str(e),
                        trace_id=trace_id,
                        refs=[module],
                        data={"module": module or "", "error": str(e)},
                    )

        if file_extension in [
            ".png",
            ".jpg",
            ".jpeg",
            ".gif",
            ".bmp",
            ".webp",
            ".pdf",
            ".json",
            ".yaml",
            ".yml",
        ]:
            logger.info(
                "测试用例生成配置 - style_id=%s, skill_ids=%s",
                prompt_config["style_id"],
                ",".join(prompt_config["skill_ids"]) or "<none>",
            )
            return StreamingResponse(
                _stream_with_generation_log(
                    ai_service.generate_test_cases_stream(
                        file_path,
                        context,
                        requirements,
                        module=module,
                        vector_context=vector_context,
                        use_vector=use_vector_bool,
                        prompt_config=prompt_config,
                    ),
                    trace_id=trace_id,
                    module=module,
                    data={
                        "source": "upload",
                        "filename": file.filename or "",
                        "use_vector": use_vector_bool,
                        "vector_context_chars": len(vector_context),
                    },
                ),
                media_type="text/markdown",
            )
        else:
            raise InvalidRequestError(message=str(f"不支持的文件类型: {file_extension}. 支持的类型: 图像文件(.png, .jpg, .jpeg, .gif, .bmp, .webp), PDF文件(.pdf), OpenAPI文档(.json, .yaml, .yml)",))

    except HTTPException as exc:
        _log_testcase_event(
            "warning" if exc.status_code < 500 else "error",
            "testcase_generation_rejected",
            "测试用例生成请求未通过",
            str(exc.detail),
            trace_id=trace_id,
            refs=[module, file.filename],
            data={
                "status_code": exc.status_code,
                "module": module or "",
                "filename": file.filename or "",
            },
        )
        raise
    except Exception as e:
        logger.error(f"处理上传文件时发生错误: {str(e)}", exc_info=True)
        _log_testcase_event(
            "error",
            "testcase_generation_failed",
            "测试用例生成失败",
            str(e),
            trace_id=trace_id,
            refs=[module, file.filename],
            data={"module": module or "", "filename": file.filename or "", "error": str(e)},
        )
        raise InternalError(details=f"处理文件时发生错误: {str(e)}")


@router.post("/generate-from-context")
async def generate_from_context(
    req: Request,
    context: str = Form(...),
    requirements: str = Form(...),
    module: str = Form(default=None),
    use_vector: str = Form(default="false"),
    style_id: str = Form(default=None),
    skill_ids: str = Form(default=None),
):
    trace_id = _trace_id("tc_ctx")
    try:
        try:
            parsed_skill_ids = parse_skill_ids(skill_ids)
        except ValueError as exc:
            raise InvalidRequestError(message=str(f"skill_ids 参数非法: {exc}"))from exc

        prompt_config = build_prompt_config_context(style_id, parsed_skill_ids)
        virtual_path = "virtual/context.txt"
        _log_testcase_event(
            "info",
            "testcase_generation_started",
            "测试用例文本生成开始",
            f"模块 {module or '未指定'}",
            trace_id=trace_id,
            refs=[module],
            data={
                "module": module or "",
                "source": "context",
                "use_vector": use_vector.lower() == "true",
                "style_id": prompt_config["style_id"],
                "skill_ids": prompt_config["skill_ids"],
            },
        )

        use_vector_bool = use_vector.lower() == "true"
        vector_context = ""
        if use_vector_bool:
            vector_ops = getattr(req.app.state, "vector_ops", None)
            llm_client = getattr(req.app.state, "llm_client", None)
            if vector_ops and llm_client:
                try:
                    from app.config import settings
                    model_name = settings.EMBEDDING_MODEL
                    kwargs = {
                        "model": model_name,
                        "input": [f"{requirements}\n{context}"],
                    }
                    if settings.EMBEDDING_DIM and model_name and "text-embedding-3" in model_name:
                        kwargs["dimensions"] = settings.EMBEDDING_DIM
                    emb_resp = await llm_client.embeddings.create(**kwargs)
                    query_embedding = emb_resp.data[0].embedding
                    similar_chunks = await vector_ops.similarity_search(query_embedding, top_k=3)
                    similar_tcs = await vector_ops.search_similar_test_cases(query_embedding, top_k=3)
                    
                    if similar_chunks:
                        vector_context += "【相关参考文档片段】\n" + "\n\n".join([f"[{c.get('filename','')}]\n{c.get('content', '')}" for c in similar_chunks]) + "\n\n"
                    if similar_tcs:
                        vector_context += "【相似历史用例参考】\n" + "\n\n".join([f"[{tc.get('test_case_name', '')}]\n{tc.get('description', '')[:200]}..." for tc in similar_tcs]) + "\n\n"
                except Exception as e:
                    logger.warning(f"Vector search failed during generation: {e}")
                    _log_testcase_event(
                        "warning",
                        "testcase_vector_context_failed",
                        "测试用例向量上下文检索失败",
                        str(e),
                        trace_id=trace_id,
                        refs=[module],
                        data={"module": module or "", "error": str(e)},
                    )

        logger.info(
            "文本生成配置 - style_id=%s, skill_ids=%s",
            prompt_config["style_id"],
            ",".join(prompt_config["skill_ids"]) or "<none>",
        )
        return StreamingResponse(
            _stream_with_generation_log(
                ai_service.generate_test_cases_stream(
                    virtual_path,
                    context,
                    requirements,
                    module=module,
                    vector_context=vector_context,
                    use_vector=use_vector_bool,
                    prompt_config=prompt_config,
                ),
                trace_id=trace_id,
                module=module,
                data={
                    "source": "context",
                    "use_vector": use_vector_bool,
                    "vector_context_chars": len(vector_context),
                },
            ),
            media_type="text/markdown",
        )

    except Exception as e:
        logger.error(f"生成用例失败: {str(e)}", exc_info=True)
        _log_testcase_event(
            "error",
            "testcase_generation_failed",
            "测试用例文本生成失败",
            str(e),
            trace_id=trace_id,
            refs=[module],
            data={"module": module or "", "source": "context", "error": str(e)},
        )
        raise InternalError(details=str(e))


class MindMapRequest(BaseModel):
    test_cases: List[Dict[str, Any]]


@router.post("/generate-mindmap")
async def generate_mindmap_from_test_cases(request: MindMapRequest):
    """
    从测试用例生成思维导图数据

    参数:
        request: 包含测试用例列表的请求体

    返回:
        思维导图的JSON数据
    """
    try:
        mindmap_data = ai_service.generate_mindmap_from_test_cases(request.test_cases)
        return {"mindmap": mindmap_data}
    except Exception as e:
        raise InternalError(details=f"生成思维导图失败: {str(e)}")



__all__ = [name for name in globals() if not name.startswith("__")]
