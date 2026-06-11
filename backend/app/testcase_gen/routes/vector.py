from fastapi import APIRouter, Depends

from app.api.deps import require_production_auth
from app.testcase_gen.router_support import (
    Any,
    BaseModel,
    Dict,
    InternalError,
    List,
    Request,
    _log_testcase_event,
    _trace_id,
    logger,
)

router = APIRouter()

@router.get("/vector/status")
async def check_vector_status(req: Request):
    """
    检查向量库状态

    返回:
        向量库状态信息
    """
    try:
        vector_ops = req.app.state.vector_ops
        if not vector_ops:
            return {"available": False, "message": "向量库未初始化"}

        status = await vector_ops.check_vector_status()
        return status
    except Exception as e:
        logger.error(f"检查向量库状态失败: {str(e)}", exc_info=True)
        return {"available": False, "message": f"检查失败: {str(e)}"}


class StoreVectorRequest(BaseModel):
    test_cases: List[Dict[str, Any]]
    module: str = None


@router.post("/store-vector", dependencies=[Depends(require_production_auth)])
async def store_test_cases_to_vector(req: Request, body: StoreVectorRequest):
    """
    将 JSON 格式的测试用例列表存入向量库

    参数:
        test_cases: JSON格式的对象列表
        module: 所属模块

    返回:
        存储结果
    """
    trace_id = _trace_id("tc_vector")
    try:
        test_cases = body.test_cases
        if not test_cases:
            _log_testcase_event(
                "warning",
                "testcase_vector_store_rejected",
                "测试用例向量入库未执行",
                "未解析到测试用例",
                trace_id=trace_id,
                refs=[body.module],
                data={"module": body.module or "", "test_case_count": 0},
            )
            return {
                "success": False,
                "message": "未解析到测试用例",
                "stored": 0,
                "skipped": 0,
            }

        neo4j_writer = getattr(req.app.state, "_neo4j_writer", None)
        if not neo4j_writer:
            _log_testcase_event(
                "error",
                "testcase_vector_store_failed",
                "测试用例向量入库失败",
                "写入器未初始化",
                trace_id=trace_id,
                refs=[body.module],
                data={"module": body.module or "", "test_case_count": len(test_cases)},
            )
            return {
                "success": False,
                "message": "写入器未初始化",
                "stored": 0,
                "skipped": 0,
            }

        result = await neo4j_writer.write_test_cases(
            test_cases,
            module=body.module,
            store_vector=True,
        )

        level = "warning" if result.get("vector_errors") else "info"
        _log_testcase_event(
            level,
            "testcase_vector_store_completed",
            "测试用例向量入库完成",
            f"新增 {result['vector_written']}，跳过 {result['vector_skipped']}",
            trace_id=trace_id,
            refs=[body.module],
            data={
                "module": body.module or "",
                "test_case_count": len(test_cases),
                "vector_written": result["vector_written"],
                "vector_skipped": result["vector_skipped"],
                "vector_errors": result.get("vector_errors", []),
            },
        )
        return {
            "success": True,
            "message": f"完成: 新增 {result['vector_written']}, 跳过 {result['vector_skipped']}",
            "stored": result["vector_written"],
            "skipped": result["vector_skipped"],
            "errors": result.get("vector_errors", []),
        }
    except Exception as e:
        logger.error(f"存入向量库失败: {str(e)}", exc_info=True)
        _log_testcase_event(
            "error",
            "testcase_vector_store_failed",
            "测试用例向量入库失败",
            str(e),
            trace_id=trace_id,
            refs=[body.module],
            data={"module": body.module or "", "error": str(e)},
        )
        raise InternalError(details=f"存入向量库失败: {str(e)}")


__all__ = [name for name in globals() if not name.startswith("__")]
