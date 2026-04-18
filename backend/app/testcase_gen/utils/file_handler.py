"""
文件处理工具（统一版本）
整合了 file_utils 和 file_security 的功能
推荐使用此模块

提供：
- 文件上传和保存
- 文件名安全处理
- 路径安全验证
- 文件清理
"""

import os
import re
import uuid
import time
import hashlib
import aiofiles
from typing import List, Tuple, Optional
from pathlib import Path
from urllib.parse import unquote

from app.testcase_gen.utils.logger import logger


# ==================== 文件名安全处理 ====================

# 允许的文件名字符（字母、数字、下划线、连字符、点）
SAFE_FILENAME_PATTERN = re.compile(r"[^\w\-_\.]")


def sanitize_filename(filename: str, max_length: int = 255) -> str:
    """
    清理文件名，移除危险字符

    参数:
        filename: 原始文件名
        max_length: 最大文件名长度

    返回:
        清理后的安全文件名
    """
    if not filename:
        return f"unnamed_{uuid.uuid4().hex[:8]}"

    # 获取文件扩展名
    name, ext = os.path.splitext(filename)

    # 清理文件名主体
    name = name.replace("/", "_").replace("\\", "_")
    name = SAFE_FILENAME_PATTERN.sub("_", name)
    name = re.sub(r"_+", "_", name)
    name = name.strip("_.")

    if not name:
        name = uuid.uuid4().hex[:16]

    # 限制长度
    max_name_length = max_length - len(ext) - 1
    if len(name) > max_name_length:
        name = name[:max_name_length]

    # 清理扩展名
    ext = re.sub(r"[^a-zA-Z0-9\.]", "", ext).lower()

    return f"{name}{ext}"


def generate_safe_filename(original_filename: str, prefix: str = "") -> str:
    """
    生成安全的唯一文件名

    参数:
        original_filename: 原始文件名（用于保留扩展名）
        prefix: 文件名前缀

    返回:
        安全的唯一文件名
    """
    _, ext = os.path.splitext(original_filename)
    unique_id = uuid.uuid4().hex
    timestamp = hashlib.md5(str(time.time()).encode()).hexdigest()[:8]

    if prefix:
        safe_prefix = sanitize_filename(prefix, max_length=50)
        filename = f"{safe_prefix}_{timestamp}_{unique_id[:16]}{ext}"
    else:
        filename = f"{timestamp}_{unique_id[:16]}{ext}"

    return filename.lower()


# ==================== 路径安全验证 ====================

# 危险的路径遍历模式
PATH_TRAVERSAL_PATTERNS = [
    r"\.\./",
    r"\.\.\\",
    r"%2e%2e",
    r"%252e",
]


def check_path_traversal(file_path: str) -> Tuple[bool, str]:
    """
    检查路径是否存在遍历攻击

    参数:
        file_path: 文件路径

    返回:
        (是否安全, 原因)
    """
    if not file_path:
        return False, "路径为空"

    decoded_path = unquote(file_path).lower()

    for pattern in PATH_TRAVERSAL_PATTERNS:
        if re.search(pattern, decoded_path, re.IGNORECASE):
            logger.warning(f"检测到路径遍历尝试: {file_path}")
            return False, f"检测到危险路径模式: {pattern}"

    if os.path.isabs(file_path):
        return False, "不允许使用绝对路径"

    try:
        Path(file_path).resolve()
    except Exception:
        return False, "路径解析失败"

    return True, "安全"


def validate_file_path(base_dir: str, file_path: str) -> Tuple[bool, str]:
    """
    验证文件路径是否安全

    参数:
        base_dir: 基准目录
        file_path: 要验证的文件路径

    返回:
        (是否安全, 完整路径或错误信息)
    """
    safe, reason = check_path_traversal(file_path)
    if not safe:
        return False, reason

    full_path = os.path.normpath(os.path.join(base_dir, file_path))
    base_real = os.path.realpath(base_dir)
    full_real = os.path.realpath(full_path)

    if not full_real.startswith(base_real):
        logger.warning(f"路径越权访问尝试: {file_path} (基准: {base_dir})")
        return False, "路径超出允许范围"

    return True, full_path


# ==================== 文件上传和保存 ====================

def save_uploaded_file(
    file_content: bytes,
    directory: str,
    filename: str = None,
    use_safe_name: bool = True
) -> str:
    """
    保存上传的文件（同步版本）

    参数:
        file_content: 文件内容
        directory: 保存目录
        filename: 文件名（可选）
        use_safe_name: 是否使用安全文件名

    返回:
        保存的文件路径
    """
    os.makedirs(directory, exist_ok=True)

    if filename and use_safe_name:
        filename = sanitize_filename(filename)
    elif not filename:
        filename = generate_safe_filename("uploaded_file")

    file_path = os.path.join(directory, filename)

    with open(file_path, "wb") as f:
        f.write(file_content)

    logger.info(f"文件已保存: {file_path}")
    return file_path


async def save_uploaded_file_async(
    file_content: bytes,
    directory: str,
    filename: str = None,
    use_safe_name: bool = True
) -> str:
    """
    保存上传的文件（异步版本）

    参数:
        file_content: 文件内容
        directory: 保存目录
        filename: 文件名（可选）
        use_safe_name: 是否使用安全文件名

    返回:
        保存的文件路径
    """
    os.makedirs(directory, exist_ok=True)

    if filename and use_safe_name:
        filename = sanitize_filename(filename)
    elif not filename:
        filename = generate_safe_filename("uploaded_file")

    file_path = os.path.join(directory, filename)

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(file_content)

    logger.info(f"文件已保存: {file_path}")
    return file_path


def get_safe_upload_path(
    upload_dir: str,
    original_filename: str,
    use_uuid: bool = True
) -> Tuple[str, str]:
    """
    获取安全的上传文件路径

    参数:
        upload_dir: 上传目录
        original_filename: 原始文件名
        use_uuid: 是否使用UUID重命名

    返回:
        (安全文件名, 完整路径)
    """
    os.makedirs(upload_dir, exist_ok=True)

    if use_uuid:
        safe_filename = generate_safe_filename(original_filename)
    else:
        safe_filename = sanitize_filename(original_filename)

    full_path = os.path.join(upload_dir, safe_filename)

    # 如果文件已存在，添加序号
    counter = 1
    base_name, ext = os.path.splitext(safe_filename)
    while os.path.exists(full_path):
        safe_filename = f"{base_name}_{counter}{ext}"
        full_path = os.path.join(upload_dir, safe_filename)
        counter += 1

    return safe_filename, full_path


# ==================== 文件清理 ====================

def clean_old_files(directory: str, max_age_days: int = 7) -> List[str]:
    """
    清理旧文件

    参数:
        directory: 目录路径
        max_age_days: 最大文件年龄（天）

    返回:
        清理的文件列表
    """
    return cleanup_old_files(directory, max_age_days * 24)


def cleanup_old_files(directory: str, max_age_hours: int = 24) -> int:
    """
    清理旧文件

    参数:
        directory: 目录路径
        max_age_hours: 最大文件年龄（小时）

    返回:
        清理的文件数量
    """
    if not os.path.exists(directory):
        return 0

    count = 0
    current_time = time.time()
    max_age_seconds = max_age_hours * 3600

    for filename in os.listdir(directory):
        filepath = os.path.join(directory, filename)

        if os.path.isdir(filepath):
            continue

        file_age = current_time - os.path.getmtime(filepath)
        if file_age > max_age_seconds:
            try:
                os.remove(filepath)
                count += 1
                logger.info(f"清理旧文件: {filepath}")
            except Exception as e:
                logger.error(f"清理文件失败: {filepath}, 错误: {str(e)}")

    return count


# ==================== MIME类型处理 ====================

def get_content_type(filename: str) -> str:
    """
    根据文件扩展名获取MIME类型

    参数:
        filename: 文件名

    返回:
        MIME类型字符串
    """
    ext = os.path.splitext(filename)[1].lower()

    mime_types = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".bmp": "image/bmp",
        ".webp": "image/webp",
        ".pdf": "application/pdf",
        ".json": "application/json",
        ".yaml": "application/x-yaml",
        ".yml": "application/x-yaml",
        ".txt": "text/plain",
        ".md": "text/markdown",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".xls": "application/vnd.ms-excel",
    }

    return mime_types.get(ext, "application/octet-stream")


# 导出
__all__ = [
    # 文件名处理
    "sanitize_filename",
    "generate_safe_filename",
    # 路径验证
    "check_path_traversal",
    "validate_file_path",
    # 文件保存
    "save_uploaded_file",
    "save_uploaded_file_async",
    "get_safe_upload_path",
    # 文件清理
    "clean_old_files",
    "cleanup_old_files",
    # MIME类型
    "get_content_type",
]
