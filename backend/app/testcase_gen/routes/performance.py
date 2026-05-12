from fastapi import APIRouter

from app.testcase_gen.router_support import *

router = APIRouter()

@router.get("/performance/stats")
async def get_performance_stats():
    """
    获取性能监控统计信息

    返回:
        性能统计数据
    """
    try:
        stats = performance_monitor.get_stats()
        return {"status": "success", "data": stats}
    except Exception as e:
        logger.error(f"获取性能统计失败: {str(e)}", exc_info=True)
        raise InternalError(details=f"获取性能统计失败: {str(e)}")


@router.get("/performance/cache")
async def get_cache_stats():
    """
    获取缓存统计信息

    返回:
        缓存统计数据
    """
    try:
        prompt_stats = prompt_cache.get_stats()
        response_stats = response_cache.get_stats()

        return {
            "status": "success",
            "data": {"prompt_cache": prompt_stats, "response_cache": response_stats},
        }
    except Exception as e:
        logger.error(f"获取缓存统计失败: {str(e)}", exc_info=True)
        raise InternalError(details=f"获取缓存统计失败: {str(e)}")


@router.delete("/performance/cache")
async def clear_cache():
    """
    清空所有缓存

    返回:
        操作结果
    """
    try:
        prompt_cache.clear()
        response_cache.clear()
        logger.info("所有缓存已清空")

        return {"status": "success", "message": "缓存已清空"}
    except Exception as e:
        logger.error(f"清空缓存失败: {str(e)}", exc_info=True)
        raise InternalError(details=f"清空缓存失败: {str(e)}")



__all__ = [name for name in globals() if not name.startswith("__")]
