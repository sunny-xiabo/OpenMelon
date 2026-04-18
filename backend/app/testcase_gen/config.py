import os
from typing import Set
from app.config import settings

# 文件上传配置
# 读取自 OpenMelon 的全局设置（优先使用统一配置，若未设置则回落默认值）
MAX_FILE_SIZE_MB = int(
    getattr(settings, "MAX_FILE_SIZE_MB", 10)
)  # 默认10MB，直接以MB为单位
MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024  # 转换为字节，用于内部验证

# 允许的文件扩展名
ALLOWED_EXTENSIONS: Set[str] = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".bmp",
    ".webp",  # 图像文件
    ".pdf",  # PDF文件
    ".json",
    ".yaml",
    ".yml",  # OpenAPI文档
    ".txt",
    ".md",  # 文本文件
}

# 文件类型魔数（文件头）验证
FILE_SIGNATURES = {
    b"\x89PNG\r\n\x1a\n": "png",
    b"\xff\xd8\xff": "jpg",
    b"GIF87a": "gif",
    b"GIF89a": "gif",
    b"BM": "bmp",
    b"%PDF": "pdf",
}

# 允许的MIME类型
ALLOWED_MIME_TYPES = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/gif",
    "image/bmp",
    "image/webp",
    "application/pdf",
    "application/json",
    "application/x-yaml",
    "text/yaml",
    "text/plain",
    "text/markdown",
}
