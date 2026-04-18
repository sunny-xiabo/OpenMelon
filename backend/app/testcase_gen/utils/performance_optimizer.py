"""
性能优化工具
提供缓存、连接池、优化算法等功能
"""

import os
import hashlib
from typing import Any, Optional, Dict, Callable
from functools import wraps, lru_cache
from datetime import datetime, timedelta
import threading
import time


class SimpleCache:
    """
    简单的内存缓存实现

    用于缓存AI响应、提示词模板等
    """

    def __init__(self, max_size: int = 100, default_ttl: int = 3600):
        """
        初始化缓存

        参数:
            max_size: 最大缓存数量
            default_ttl: 默认过期时间（秒）
        """
        self.max_size = max_size
        self.default_ttl = default_ttl
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        """
        获取缓存值

        参数:
            key: 缓存键

        返回:
            缓存值，不存在或过期返回None
        """
        with self._lock:
            if key not in self._cache:
                return None

            item = self._cache[key]

            # 检查是否过期
            if item["expires_at"] and datetime.now() > item["expires_at"]:
                del self._cache[key]
                return None

            return item["value"]

    def set(self, key: str, value: Any, ttl: Optional[int] = None):
        """
        设置缓存值

        参数:
            key: 缓存键
            value: 缓存值
            ttl: 过期时间（秒），None表示使用默认值
        """
        with self._lock:
            # 如果缓存已满，删除最旧的项
            if len(self._cache) >= self.max_size:
                self._evict_oldest()

            expires_at = None
            if ttl is not None or self.default_ttl is not None:
                ttl_value = ttl if ttl is not None else self.default_ttl
                expires_at = datetime.now() + timedelta(seconds=ttl_value)

            self._cache[key] = {
                "value": value,
                "expires_at": expires_at,
                "created_at": datetime.now()
            }

    def delete(self, key: str):
        """删除缓存项"""
        with self._lock:
            if key in self._cache:
                del self._cache[key]

    def clear(self):
        """清空缓存"""
        with self._lock:
            self._cache.clear()

    def _evict_oldest(self):
        """删除最旧的缓存项"""
        if not self._cache:
            return

        oldest_key = min(
            self._cache.keys(),
            key=lambda k: self._cache[k]["created_at"]
        )
        del self._cache[oldest_key]

    def get_stats(self) -> Dict[str, Any]:
        """获取缓存统计信息"""
        with self._lock:
            return {
                "size": len(self._cache),
                "max_size": self.max_size,
                "default_ttl": self.default_ttl
            }


# 全局缓存实例
prompt_cache = SimpleCache(max_size=50, default_ttl=1800)  # 30分钟
response_cache = SimpleCache(max_size=100, default_ttl=600)  # 10分钟


def cache_result(cache: SimpleCache, key_func: Callable):
    """
    缓存装饰器

    参数:
        cache: 缓存实例
        key_func: 生成缓存键的函数

    用法:
        @cache_result(prompt_cache, lambda x: f"key_{x}")
        def expensive_function(x):
            return x * 2
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            # 生成缓存键
            cache_key = key_func(*args, **kwargs)

            # 尝试从缓存获取
            cached_value = cache.get(cache_key)
            if cached_value is not None:
                return cached_value

            # 计算结果
            result = func(*args, **kwargs)

            # 存入缓存
            cache.set(cache_key, result)

            return result
        return wrapper
    return decorator


class FileProcessingOptimizer:
    """
    文件处理优化器

    提供文件处理的优化方法
    """

    @staticmethod
    def read_file_in_chunks(file_path: str, chunk_size: int = 8192):
        """
        分块读取大文件

        参数:
            file_path: 文件路径
            chunk_size: 块大小（字节）

        产出:
            文件内容块
        """
        with open(file_path, 'r', encoding='utf-8') as f:
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                yield chunk

    @staticmethod
    def calculate_file_hash(file_path: str, algorithm: str = 'md5') -> str:
        """
        计算文件哈希值（用于缓存键）

        参数:
            file_path: 文件路径
            algorithm: 哈希算法（md5, sha1, sha256）

        返回:
            哈希值字符串
        """
        hash_func = hashlib.new(algorithm)

        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b''):
                hash_func.update(chunk)

        return hash_func.hexdigest()

    @staticmethod
    def get_file_size(file_path: str) -> int:
        """
        获取文件大小（优化版本）

        参数:
            file_path: 文件路径

        返回:
            文件大小（字节）
        """
        try:
            return os.path.getsize(file_path)
        except OSError:
            return 0


class PerformanceOptimizer:
    """
    性能优化工具类
    """

    @staticmethod
    @lru_cache(maxsize=128)
    def compute_hash(text: str) -> str:
        """
        计算文本哈希（使用LRU缓存）

        参数:
            text: 文本内容

        返回:
            哈希值
        """
        return hashlib.md5(text.encode()).hexdigest()

    @staticmethod
    def batch_process(items: list, batch_size: int = 10) -> list:
        """
        批量处理列表

        参数:
            items: 待处理列表
            batch_size: 批次大小

        产出:
            批次列表
        """
        for i in range(0, len(items), batch_size):
            yield items[i:i + batch_size]


class Timer:
    """
    计时器工具

    用于性能分析和调试
    """

    def __init__(self, name: str = "Timer"):
        self.name = name
        self.start_time = None
        self.end_time = None

    def __enter__(self):
        self.start_time = time.time()
        return self

    def __exit__(self, *args):
        self.end_time = time.time()
        elapsed = self.end_time - self.start_time
        import logging
        logging.getLogger("testcase_gen.timer").debug(f"{self.name}: {elapsed:.4f}秒")

    @property
    def elapsed(self) -> float:
        """获取已用时间"""
        if self.start_time is None:
            return 0.0
        end = self.end_time if self.end_time else time.time()
        return end - self.start_time


# 导出
__all__ = [
    "SimpleCache",
    "prompt_cache",
    "response_cache",
    "cache_result",
    "FileProcessingOptimizer",
    "PerformanceOptimizer",
    "Timer",
]
