"""
文件安全工具（已废弃）
请使用 file_handler.py 代替
此文件仅为向后兼容保留
"""

import warnings
warnings.warn(
    "file_security.py 已废弃，请使用 file_handler.py",
    DeprecationWarning,
    stacklevel=2
)

import os
import re
import uuid
import hashlib
from typing import Optional, Tuple
from pathlib import Path
from urllib.parse import quote, unquote

from app.testcase_gen.utils.logger import logger


# 允许的文件名字符（字母、数字、下划线、连字符、点）
SAFE_FILENAME_PATTERN = re.compile(r"[^\w\-_\.]")

# 危险的路径遍历模式
PATH_TRAVERSAL_PATTERNS = [
    r"\.\./",  # ../
    r"\.\.\\",  # ..\
    r"%2e%2e",  # URL编码的..
    r"%252e",  # 双重编码的.
]


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
    # 1. 移除路径分隔符
    name = name.replace("/", "_").replace("\\", "_")

    # 2. 替换危险字符为下划线
    name = SAFE_FILENAME_PATTERN.sub("_", name)

    # 3. 移除连续的下划线
    name = re.sub(r"_+", "_", name)

    # 4. 移除开头和结尾的下划线和点
    name = name.strip("_.")

    # 5. 如果文件名为空，使用UUID
    if not name:
        name = uuid.uuid4().hex[:16]

    # 6. 限制长度
    max_name_length = max_length - len(ext) - 1  # 留一位给点
    if len(name) > max_name_length:
        name = name[:max_name_length]

    # 7. 清理扩展名（只保留字母和数字）
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
    # 获取扩展名
    _, ext = os.path.splitext(original_filename)

    # 生成UUID作为文件名
    unique_id = uuid.uuid4().hex

    # 添加时间戳
    import time
    timestamp = hashlib.md5(str(time.time()).encode()).hexdigest()[:8]

    # 组合文件名
    if prefix:
        safe_prefix = sanitize_filename(prefix, max_length=50)
        filename = f"{safe_prefix}_{timestamp}_{unique_id[:16]}{ext}"
    else:
        filename = f"{timestamp}_{unique_id[:16]}{ext}"

    return filename.lower()


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

    # URL解码
    decoded_path = unquote(file_path).lower()

    # 检查危险模式
    for pattern in PATH_TRAVERSAL_PATTERNS:
        if re.search(pattern, decoded_path, re.IGNORECASE):
            logger.warning(f"检测到路径遍历尝试: {file_path}")
            return False, f"检测到危险路径模式: {pattern}"

    # 检查绝对路径
    if os.path.isabs(file_path):
        return False, "不允许使用绝对路径"

    # 解析路径并检查是否超出基准目录
    try:
        resolved = Path(file_path).resolve()
        # 这里需要与基准目录比较，暂时只检查基本模式
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
    # 检查路径遍历
    safe, reason = check_path_traversal(file_path)
    if not safe:
        return False, reason

    # 构建完整路径
    full_path = os.path.normpath(os.path.join(base_dir, file_path))

    # 确保路径在基准目录内
    base_real = os.path.realpath(base_dir)
    full_real = os.path.realpath(full_path)

    if not full_real.startswith(base_real):
        logger.warning(f"路径越权访问尝试: {file_path} (基准: {base_dir})")
        return False, "路径超出允许范围"

    return True, full_path


def get_safe_upload_path(
    upload_dir: str, original_filename: str, use_uuid: bool = True
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
    # 确保上传目录存在
    os.makedirs(upload_dir, exist_ok=True)

    # 生成安全文件名
    if use_uuid:
        safe_filename = generate_safe_filename(original_filename)
    else:
        safe_filename = sanitize_filename(original_filename)

    # 构建完整路径
    full_path = os.path.join(upload_dir, safe_filename)

    # 如果文件已存在，添加序号
    counter = 1
    base_name, ext = os.path.splitext(safe_filename)
    while os.path.exists(full_path):
        safe_filename = f"{base_name}_{counter}{ext}"
        full_path = os.path.join(upload_dir, safe_filename)
        counter += 1

    return safe_filename, full_path


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

    import time

    count = 0
    current_time = time.time()
    max_age_seconds = max_age_hours * 3600

    for filename in os.listdir(directory):
        filepath = os.path.join(directory, filename)

        # 跳过目录
        if os.path.isdir(filepath):
            continue

        # 检查文件年龄
        file_age = current_time - os.path.getmtime(filepath)
        if file_age > max_age_seconds:
            try:
                os.remove(filepath)
                count += 1
                logger.info(f"清理旧文件: {filepath}")
            except Exception as e:
                logger.error(f"清理文件失败: {filepath}, 错误: {str(e)}")

    return count


# 导出
__all__ = [
    "sanitize_filename",
    "generate_safe_filename",
    "check_path_traversal",
    "validate_file_path",
    "get_safe_upload_path",
    "get_content_type",
    "cleanup_old_files",
]
