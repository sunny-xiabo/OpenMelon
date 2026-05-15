import logging
from typing import Any, Optional
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings

logger = logging.getLogger(__name__)

class AppError(Exception):
    """Base class for all application-specific exceptions."""
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: Optional[Any] = None,
    ):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details
        super().__init__(self.message)

class InternalError(AppError):
    def __init__(self, message: str = "服务器内部错误，请稍后重试", details: Optional[Any] = None):
        super().__init__(
            code="INTERNAL_ERROR",
            message=message,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            details=details,
        )

class InvalidRequestError(AppError):
    def __init__(self, message: str = "无效的请求", details: Optional[Any] = None):
        super().__init__(
            code="INVALID_REQUEST",
            message=message,
            status_code=status.HTTP_400_BAD_REQUEST,
            details=details,
        )

class NotFoundError(AppError):
    def __init__(self, message: str = "资源不存在", details: Optional[Any] = None):
        super().__init__(
            code="NOT_FOUND",
            message=message,
            status_code=status.HTTP_404_NOT_FOUND,
            details=details,
        )

class UnauthorizedError(AppError):
    def __init__(self, message: str = "未授权的访问", details: Optional[Any] = None):
        super().__init__(
            code="UNAUTHORIZED",
            message=message,
            status_code=status.HTTP_401_UNAUTHORIZED,
            details=details,
        )

def setup_exception_handlers(app):
    def include_error_details() -> bool:
        return settings.DEBUG or not settings.is_production

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):
        if exc.status_code >= 500:
            logger.error(f"AppError [{exc.code}]: {exc.message} - Details: {exc.details}", exc_info=exc)
        else:
            logger.warning(f"AppError [{exc.code}]: {exc.message} - Details: {exc.details}")
            
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "details": exc.details if include_error_details() else None,
                }
            }
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        # Fallback for standard HTTPExceptions thrown by FastAPI or dependencies
        code = "HTTP_ERROR"
        message = str(exc.detail)
        
        if exc.status_code == 404:
            code = "NOT_FOUND"
            message = "请求的资源或路径不存在"
        elif exc.status_code == 401:
            code = "UNAUTHORIZED"
        elif exc.status_code == 403:
            code = "FORBIDDEN"
            
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "error": {
                    "code": code,
                    "message": message,
                    "details": exc.detail if include_error_details() else None,
                }
            }
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "success": False,
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "请求参数校验失败",
                    "details": exc.errors(),
                }
            }
        )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.error(f"Unhandled Exception: {str(exc)}", exc_info=exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "success": False,
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "服务器发生了意外错误，请稍后再试",
                    "details": str(exc) if include_error_details() else None,
                }
            }
        )
