import logging
import os
import sys
import glob
import time
from logging.handlers import TimedRotatingFileHandler

LOG_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "logs"
)
LOG_RETENTION_DAYS = 30


def _cleanup_old_logs(log_dir: str, retention_days: int):
    now = time.time()
    cutoff = now - (retention_days * 86400)
    for f in glob.glob(os.path.join(log_dir, "*.log*")):
        if os.path.getmtime(f) < cutoff:
            try:
                os.unlink(f)
            except OSError:
                pass


def setup_logger(
    name: str = "app",
    log_level: int = logging.INFO,
) -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(log_level)
    logger.propagate = False

    formatter = logging.Formatter(
        fmt="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    has_console_handler = any(
        isinstance(handler, logging.StreamHandler)
        and getattr(handler, "stream", None) is sys.stdout
        for handler in logger.handlers
    )
    if not has_console_handler:
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(log_level)
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)

    os.makedirs(LOG_DIR, exist_ok=True)
    _cleanup_old_logs(LOG_DIR, LOG_RETENTION_DAYS)

    log_file = os.path.join(LOG_DIR, "openmelon.log")
    has_log_file_handler = any(
        isinstance(handler, TimedRotatingFileHandler)
        and getattr(handler, "baseFilename", None) == log_file
        for handler in logger.handlers
    )
    if not has_log_file_handler:
        file_handler = TimedRotatingFileHandler(
            log_file,
            when="midnight",
            interval=1,
            backupCount=LOG_RETENTION_DAYS,
            encoding="utf-8",
        )
        file_handler.setLevel(log_level)
        file_handler.setFormatter(formatter)
        file_handler.suffix = "%Y-%m-%d"
        logger.addHandler(file_handler)

    error_file = os.path.join(LOG_DIR, "openmelon_error.log")
    has_error_file_handler = any(
        isinstance(handler, TimedRotatingFileHandler)
        and getattr(handler, "baseFilename", None) == error_file
        for handler in logger.handlers
    )
    if not has_error_file_handler:
        error_handler = TimedRotatingFileHandler(
            error_file,
            when="midnight",
            interval=1,
            backupCount=LOG_RETENTION_DAYS,
            encoding="utf-8",
        )
        error_handler.setLevel(logging.ERROR)
        error_handler.setFormatter(formatter)
        error_handler.suffix = "%Y-%m-%d"
        logger.addHandler(error_handler)

    return logger


logger = setup_logger()
