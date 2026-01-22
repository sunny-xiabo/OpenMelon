import os
from typing import List
import uuid

def save_uploaded_file(file_content: bytes, directory: str, filename: str = None) -> str:
    """
    将上传的文件保存到指定目录

    参数:
        file_content: 要保存的文件内容
        directory: 保存文件的目录
        filename: 给文件的名称（如果为 None，将生成 UUID）

    返回:
        保存的文件路径
    """
    # 如果目录不存在，则创建
    os.makedirs(directory, exist_ok=True)

    # 如果没有提供文件名，则生成一个
    if filename is None:
        filename = f"{uuid.uuid4()}"

    # 保存文件
    file_path = os.path.join(directory, filename)
    with open(file_path, "wb") as f:
        f.write(file_content)

    return file_path

def clean_old_files(directory: str, max_age_days: int = 7) -> List[str]:
    """
    清理目录中的旧文件

    参数:
        directory: 要清理的目录
        max_age_days: 要保留的文件的最大年龄（天）

    返回:
        删除的文件路径列表
    """
    import time

    # 获取当前时间
    now = time.time()

    # 用于存储删除的文件的列表
    removed_files = []

    # 检查目录是否存在
    if not os.path.exists(directory):
        return removed_files

    # 遍历目录中的文件
    for filename in os.listdir(directory):
        file_path = os.path.join(directory, filename)

        # 检查是否为文件（非目录）
        if os.path.isfile(file_path):
            # 获取文件修改时间
            file_mod_time = os.path.getmtime(file_path)

            # 计算天数
            age_days = (now - file_mod_time) / (24 * 3600)

            # 如果超过最大天数则删除
            if age_days > max_age_days:
                os.remove(file_path)
                removed_files.append(file_path)

    return removed_files
