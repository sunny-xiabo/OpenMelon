"""
文件处理工具（已废弃）
请使用 file_handler.py 代替
此文件仅为向后兼容保留
"""

import warnings
warnings.warn(
    "file_utils.py 已废弃，请使用 file_handler.py",
    DeprecationWarning,
    stacklevel=2
)

import os
from typing import List
import uuid
import aiofiles
import time


def save_uploaded_file(file_content: bytes, directory: str, filename: str = None) -> str:
    os.makedirs(directory, exist_ok=True)

    if filename is None:
        filename = f"{uuid.uuid4()}"

    file_path = os.path.join(directory, filename)
    with open(file_path, "wb") as f:
        f.write(file_content)

    return file_path


async def save_uploaded_file_async(file_content: bytes, directory: str, filename: str = None) -> str:
    os.makedirs(directory, exist_ok=True)

    if filename is None:
        filename = f"{uuid.uuid4()}"

    file_path = os.path.join(directory, filename)
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(file_content)

    return file_path


def clean_old_files(directory: str, max_age_days: int = 7) -> List[str]:
    now = time.time()
    removed_files = []

    if not os.path.exists(directory):
        return removed_files

    for filename in os.listdir(directory):
        file_path = os.path.join(directory, filename)

        if os.path.isfile(file_path):
            file_mod_time = os.path.getmtime(file_path)
            age_days = (now - file_mod_time) / (24 * 3600)

            if age_days > max_age_days:
                os.remove(file_path)
                removed_files.append(file_path)

    return removed_files
