from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse, FileResponse
from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel
import os
import json
import uuid
from datetime import datetime
import asyncio

from models.test_case import TestCase, TestCaseRequest, TestCaseResponse
from services.ai_service import ai_service
from services.excel_service import excel_service

router = APIRouter(
    prefix="/api/test-cases",
    tags=["test-cases"],
    responses={404: {"description": "Not found"}},
)

# 如果上传目录不存在，则创建
os.makedirs("uploads", exist_ok=True)

@router.post("/generate")
async def generate_test_cases(
    file: UploadFile = File(...),
    context: str = Form(...),
    requirements: str = Form(...)
):
    """
    从上传的文件、上下文和需求生成测试用例

    参数:
        file: 上传的文件（图像、PDF或OpenAPI文档）
        context: 测试用例生成的上下文信息
        requirements: 测试用例生成的需求

    返回:
        包含生成的测试用例的流式响应
    """
    # 保存上传的文件
    file_id = str(uuid.uuid4())
    file_extension = os.path.splitext(file.filename)[1].lower()
    file_path = f"uploads/{file_id}{file_extension}"

    with open(file_path, "wb") as uploaded_file:
        uploaded_file.write(await file.read())

    # 使用统一的处理方式（智能选择模型客户端）
    if file_extension in ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.pdf', '.json', '.yaml', '.yml']:
        # 所有支持的文件类型都使用统一的处理逻辑
        return StreamingResponse(
            ai_service.generate_test_cases_stream(file_path, context, requirements),
            media_type="text/markdown"
        )
    else:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型: {file_extension}. 支持的类型: 图像文件(.png, .jpg, .jpeg, .gif, .bmp, .webp), PDF文件(.pdf), OpenAPI文档(.json, .yaml, .yml)"
        )

class MindMapRequest(BaseModel):
    test_cases: List[Dict[str, Any]]

@router.post("/generate-mindmap")
async def generate_mindmap_from_test_cases(
    request: MindMapRequest
):
    """
    从测试用例生成思维导图数据

    参数:
        request: 包含测试用例列表的请求体

    返回:
        思维导图的JSON数据
    """
    try:
        mindmap_data = ai_service.generate_mindmap_from_test_cases(request.test_cases)
        return {"mindmap": mindmap_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成思维导图失败: {str(e)}")

@router.post("/export")
async def export_test_cases(test_cases: List[Union[TestCase, Dict[str, Any]]]):
    """
    将测试用例导出到Excel

    参数:
        test_cases: 要导出的测试用例列表

    返回:
        下载生成的Excel文件的URL
    """
    try:
        # 生成Excel文件
        excel_path = excel_service.generate_excel(test_cases)

        # 返回文件供下载
        return FileResponse(
            path=excel_path,
            filename=os.path.basename(excel_path),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error exporting test cases: {str(e)}")

@router.get("/download/{filename}")
async def download_excel(filename: str):
    """
    下载生成的Excel文件

    参数:
        filename: 要下载的Excel文件名

    返回:
        供下载的Excel文件
    """
    file_path = f"results/{filename}"

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=file_path,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
