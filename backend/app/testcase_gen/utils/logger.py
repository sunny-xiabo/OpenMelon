import logging
import os
import sys
from app.utils.logger import setup_logger as _main_setup


class _OpenTelemetryFilter(logging.Filter):
    """过滤 OpenTelemetry 的 'Failed to detach context' 噪声日志。"""

    def filter(self, record):
        msg = record.getMessage()
        if "Failed to detach context" in msg:
            return False
        if "different Context" in msg:
            return False
        return True


# 在 opentelemetry 相关 logger 上也挂过滤器
for otel_name in ("opentelemetry", "opentelemetry.context", "opentelemetry.trace"):
    otel_logger = logging.getLogger(otel_name)
    otel_logger.addFilter(_OpenTelemetryFilter())


logger = logging.getLogger("testcase_generator")

if not logger.handlers:
    _main_setup("testcase_generator")
    logger.addFilter(_OpenTelemetryFilter())
