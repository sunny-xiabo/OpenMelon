import json
from app.api.errors import InternalError, InvalidRequestError, NotFoundError, UnauthorizedError
from fastapi import APIRouter, HTTPException, Depends, Request, Response
from app.api.logging_service import safe_log_event
from app.api.deps import get_enterprise_integration, get_intent_router, get_generator

router = APIRouter(prefix="/webhook", tags=["webhooks"])


def _log_webhook_event(level: str, event_type: str, title: str, message: str = "", **kwargs):
    return safe_log_event(level, "webhook", event_type, title, message, **kwargs)

@router.post("/{platform}")
async def webhook_platform(
    platform: str, 
    req: Request, 
    enterprise_integration = Depends(get_enterprise_integration)
):
    try:
        data = await req.json()
        answer = data.get("answer", "")
        question = data.get("question", "")
        configured = enterprise_integration.is_platform_configured(platform)
        if not configured:
            _log_webhook_event(
                "warning",
                "webhook_send_rejected",
                "Webhook 发送未执行",
                f"平台未配置: {platform}",
                source_id=platform,
                refs=[platform],
                data={"platform": platform},
            )
            raise InvalidRequestError(message=str(f"Platform '{platform}' not configured"))
        ok = await enterprise_integration.send_answer(platform, answer, question)
        _log_webhook_event(
            "info" if ok else "warning",
            "webhook_send_completed",
            "Webhook 发送完成",
            f"{platform} sent={ok}",
            source_id=platform,
            refs=[platform],
            data={"platform": platform, "sent": ok, "question_chars": len(question), "answer_chars": len(answer)},
        )
        return {"platform": platform, "sent": ok}
    except HTTPException:
        raise
    except Exception as e:
        _log_webhook_event(
            "error",
            "webhook_send_failed",
            "Webhook 发送失败",
            str(e),
            source_id=platform,
            refs=[platform],
            data={"platform": platform, "error": str(e)},
        )
        raise InternalError(details=str(e))


@router.get("/wecom")
async def wecom_verify_get(
    req: Request,
    enterprise_integration = Depends(get_enterprise_integration)
):
    if not enterprise_integration.is_wecom_callback_configured():
        _log_webhook_event("warning", "webhook_callback_rejected", "企业微信回调未配置", "Wecom callback not configured", source_id="wecom", refs=["wecom"])
        raise InvalidRequestError(message="Wecom callback not configured")

    params = req.query_params
    msg_signature = params.get("msg_signature", "")
    timestamp = params.get("timestamp", "")
    nonce = params.get("nonce", "")
    echostr = params.get("echostr", "")

    callback = enterprise_integration.wecom_callback
    decrypted = callback.verify_url(msg_signature, timestamp, nonce, echostr)

    if not decrypted:
        _log_webhook_event("warning", "webhook_verify_failed", "企业微信回调验证失败", "Verify failed", source_id="wecom", refs=["wecom"])
        raise UnauthorizedError(message="Verify failed")

    return Response(content=decrypted, media_type="text/plain")


@router.post("/wecom")
async def wecom_callback(
    req: Request,
    enterprise_integration = Depends(get_enterprise_integration),
    intent_router = Depends(get_intent_router),
    generator = Depends(get_generator)
):
    if not enterprise_integration.is_wecom_callback_configured():
        _log_webhook_event("warning", "webhook_callback_rejected", "企业微信回调未配置", "Wecom callback not configured", source_id="wecom", refs=["wecom"])
        raise InvalidRequestError(message="Wecom callback not configured")

    params = req.query_params
    msg_signature = params.get("msg_signature", "")
    timestamp = params.get("timestamp", "")
    nonce = params.get("nonce", "")

    post_data = await req.body()
    callback = enterprise_integration.wecom_callback
    message = callback.decrypt_message(
        msg_signature, timestamp, nonce, post_data.decode("utf-8")
    )

    if not message or message.get("msg_type") != "text":
        return "success"

    user_question = message.get("content", "").strip()
    user_id = message.get("user_id", "")
    agent_id = message.get("agent_id", "")

    if not user_question:
        return "success"

    try:
        intent_result = await intent_router.process(user_question)
        # Assuming the retriever relies on the result correctly. 
        # (Using the pre-instantiated router & retriever from deps to fix the previous bug)
        retriever = req.app.state.retriever
        retrieval_result = await retriever.retrieve(intent_result["intent"], intent_result["entities"], user_question)
        context_chunks = retrieval_result.get("chunks", [])
        
        context_text = "\\n\\n".join(
            [
                f"[{c.get('filename', 'unknown')}]\\n{c.get('content', '')}"
                for c in context_chunks[:5]
            ]
        )

        answer_result = await generator.generate_answer(user_question, context_text, intent_result["intent"], [])
        answer = answer_result["answer"]

        await enterprise_integration.send_wecom_reply(user_id, answer, agent_id)
        _log_webhook_event(
            "info",
            "webhook_callback_answered",
            "企业微信回调已回复",
            "企业微信问题处理完成",
            source_id=user_id,
            refs=["wecom", user_id, agent_id],
            data={"platform": "wecom", "user_id": user_id, "agent_id": agent_id, "intent": intent_result.get("intent", "")},
        )

    except Exception as e:
        await enterprise_integration.send_wecom_reply(
            user_id, f"处理出错: {str(e)}", agent_id
        )
        _log_webhook_event(
            "error",
            "webhook_callback_failed",
            "企业微信回调处理失败",
            str(e),
            source_id=user_id,
            refs=["wecom", user_id, agent_id],
            data={"platform": "wecom", "user_id": user_id, "agent_id": agent_id, "error": str(e)},
        )

    return "success"


@router.get("/dingtalk")
async def dingtalk_verify_get(
    req: Request,
    enterprise_integration = Depends(get_enterprise_integration)
):
    if not enterprise_integration.is_dingtalk_callback_configured():
        _log_webhook_event("warning", "webhook_callback_rejected", "钉钉回调未配置", "DingTalk callback not configured", source_id="dingtalk", refs=["dingtalk"])
        raise InvalidRequestError(message="DingTalk callback not configured")

    params = req.query_params
    signature = params.get("signature", "")
    timestamp = params.get("timestamp", "")
    nonce = params.get("nonce", "")
    echostr = params.get("echostr", "")

    callback = enterprise_integration.dingtalk_callback
    if callback.verify_url(signature, timestamp, nonce, echostr):
        return Response(content=echostr, media_type="text/plain")
    _log_webhook_event("warning", "webhook_verify_failed", "钉钉回调验证失败", "Verify failed", source_id="dingtalk", refs=["dingtalk"])
    raise UnauthorizedError(message="Verify failed")


@router.post("/dingtalk")
async def dingtalk_callback(
    req: Request,
    enterprise_integration = Depends(get_enterprise_integration),
    intent_router = Depends(get_intent_router),
    generator = Depends(get_generator)
):
    if not enterprise_integration.is_dingtalk_callback_configured():
        _log_webhook_event("warning", "webhook_callback_rejected", "钉钉回调未配置", "DingTalk callback not configured", source_id="dingtalk", refs=["dingtalk"])
        raise InvalidRequestError(message="DingTalk callback not configured")

    params = req.query_params
    signature = params.get("signature", "")
    timestamp = params.get("timestamp", "")
    nonce = params.get("nonce", "")

    post_data = await req.body()
    post_str = post_data.decode("utf-8")

    callback = enterprise_integration.dingtalk_callback
    if not callback.verify_callback(signature, timestamp, nonce, post_str):
        _log_webhook_event("warning", "webhook_verify_failed", "钉钉回调验证失败", "Verify failed", source_id="dingtalk", refs=["dingtalk"])
        raise UnauthorizedError(message="Verify failed")

    message = callback.parse_message(post_str)
    if not message or message.get("msgtype") != "text":
        return "success"

    user_question = message.get("content", {}).get("text", "").strip()
    user_id = message.get("fromUserId", "")

    if not user_question:
        return "success"

    try:
        intent_result = await intent_router.process(user_question)
        retriever = req.app.state.retriever
        retrieval_result = await retriever.retrieve(intent_result["intent"], intent_result["entities"], user_question)
        context_chunks = retrieval_result.get("chunks", [])

        context_text = "\\n\\n".join(
            [
                f"[{c.get('filename', 'unknown')}]\\n{c.get('content', '')}"
                for c in context_chunks[:5]
            ]
        )

        answer_result = await generator.generate_answer(user_question, context_text, intent_result["intent"], [])
        answer = answer_result["answer"]

        await enterprise_integration.send_dingtalk_reply(user_id, answer)
        _log_webhook_event(
            "info",
            "webhook_callback_answered",
            "钉钉回调已回复",
            "钉钉问题处理完成",
            source_id=user_id,
            refs=["dingtalk", user_id],
            data={"platform": "dingtalk", "user_id": user_id, "intent": intent_result.get("intent", "")},
        )

    except Exception as e:
        await enterprise_integration.send_dingtalk_reply(user_id, f"处理出错: {str(e)}")
        _log_webhook_event(
            "error",
            "webhook_callback_failed",
            "钉钉回调处理失败",
            str(e),
            source_id=user_id,
            refs=["dingtalk", user_id],
            data={"platform": "dingtalk", "user_id": user_id, "error": str(e)},
        )

    return "success"


@router.get("/feishu")
async def feishu_verify_get(
    req: Request,
    enterprise_integration = Depends(get_enterprise_integration)
):
    if not enterprise_integration.is_feishu_callback_configured():
        _log_webhook_event("warning", "webhook_callback_rejected", "飞书回调未配置", "Feishu callback not configured", source_id="feishu", refs=["feishu"])
        raise InvalidRequestError(message="Feishu callback not configured")

    params = req.query_params
    verification_token = params.get("verification_token", "")

    callback = enterprise_integration.feishu_callback
    if callback.verify_url(verification_token):
        challenge = params.get("challenge", "")
        return Response(content=challenge, media_type="text/plain")
    _log_webhook_event("warning", "webhook_verify_failed", "飞书回调验证失败", "Verify failed", source_id="feishu", refs=["feishu"])
    raise UnauthorizedError(message="Verify failed")


@router.post("/feishu")
async def feishu_callback(
    req: Request,
    enterprise_integration = Depends(get_enterprise_integration),
    intent_router = Depends(get_intent_router),
    generator = Depends(get_generator)
):
    if not enterprise_integration.is_feishu_callback_configured():
        _log_webhook_event("warning", "webhook_callback_rejected", "飞书回调未配置", "Feishu callback not configured", source_id="feishu", refs=["feishu"])
        raise InvalidRequestError(message="Feishu callback not configured")

    data = await req.json()
    callback = enterprise_integration.feishu_callback
    message = callback.parse_message(json.dumps(data))

    if not message or message.get("msg_type") != "text":
        return {"msg_type": "success"}

    user_question = message.get("content", "").strip()
    user_id = message.get("user_id", "")

    if not user_question:
        return {"msg_type": "success"}

    try:
        intent_result = await intent_router.process(user_question)
        retriever = req.app.state.retriever
        retrieval_result = await retriever.retrieve(intent_result["intent"], intent_result["entities"], user_question)
        context_chunks = retrieval_result.get("chunks", [])

        context_text = "\\n\\n".join(
            [
                f"[{c.get('filename', 'unknown')}]\\n{c.get('content', '')}"
                for c in context_chunks[:5]
            ]
        )

        answer_result = await generator.generate_answer(user_question, context_text, intent_result["intent"], [])
        answer = answer_result["answer"]

        await enterprise_integration.send_feishu_reply(user_id, answer)
        _log_webhook_event(
            "info",
            "webhook_callback_answered",
            "飞书回调已回复",
            "飞书问题处理完成",
            source_id=user_id,
            refs=["feishu", user_id],
            data={"platform": "feishu", "user_id": user_id, "intent": intent_result.get("intent", "")},
        )

    except Exception as e:
        await enterprise_integration.send_feishu_reply(user_id, f"处理出错: {str(e)}")
        _log_webhook_event(
            "error",
            "webhook_callback_failed",
            "飞书回调处理失败",
            str(e),
            source_id=user_id,
            refs=["feishu", user_id],
            data={"platform": "feishu", "user_id": user_id, "error": str(e)},
        )

    return {"msg_type": "success"}
