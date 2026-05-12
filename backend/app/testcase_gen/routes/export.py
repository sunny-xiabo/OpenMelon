from fastapi import APIRouter

from app.testcase_gen.router_support import *

router = APIRouter()

class ExportMarkdownRequest(BaseModel):
    markdown: str


@router.post("/export-markdown")
async def export_markdown(request: ExportMarkdownRequest):
    """
    将AI生成的Markdown测试用例导出为Excel

    参数:
        request: 包含markdown字段的请求体

    返回:
        Excel文件
    """
    try:
        test_cases = _parse_markdown_test_cases(request.markdown)
        if not test_cases:
            raise InvalidRequestError(message=str("未能从Markdown中解析出测试用例，请检查内容格式"))
        excel_path = excel_service.generate_excel(test_cases)
        return FileResponse(
            path=excel_path,
            filename=os.path.basename(excel_path),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"导出Markdown用例失败: {str(e)}", exc_info=True)
        raise InternalError(details=f"导出失败: {str(e)}")


@router.post("/export-xmind")
async def export_xmind_from_markdown(request: ExportMarkdownRequest):
    """
    将AI生成的Markdown测试用例导出为XMind文件(.xmind格式)
    """
    try:
        test_cases = _parse_markdown_test_cases(request.markdown)
        if not test_cases:
            raise InvalidRequestError(message=str("未能从Markdown中解析出测试用例，请检查内容格式"))

        zip_buffer = _generate_xmind_zip(test_cases)
        
        return StreamingResponse(
            zip_buffer,
            media_type="application/vnd.xmind.workbook",
            headers={
                "Content-Disposition": f"attachment; filename=test-cases-{int(time.time())}.xmind"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"导出XMind失败: {str(e)}", exc_info=True)
        raise InternalError(details=f"导出失败: {str(e)}")

@router.post("/export-xmind-json")
async def export_xmind_from_json(test_cases: List[Dict[str, Any]]):
    """
    将JSON格式的测试用例列表直接导出为XMind文件(.xmind格式)
    """
    try:
        zip_buffer = _generate_xmind_zip(test_cases)
        return StreamingResponse(
            zip_buffer,
            media_type="application/vnd.xmind.workbook",
            headers={
                "Content-Disposition": f"attachment; filename=test-cases-{int(time.time())}.xmind"
            }
        )
    except Exception as e:
        logger.error(f"导出XMind失败: {str(e)}", exc_info=True)
        raise InternalError(details=f"导出失败: {str(e)}")


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
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    except Exception as e:
        raise InternalError(details=f"Error exporting test cases: {str(e)}")


@router.get("/download/{filename}")
async def download_excel(filename: str):
    """
    下载生成的Excel文件

    参数:
        filename: 要下载的Excel文件名

    返回:
        供下载的Excel文件
    """
    from app.runtime_paths import RESULTS_DIR
    resolved_path = os.path.abspath(os.path.join(RESULTS_DIR, filename))
    if not resolved_path.startswith(str(RESULTS_DIR.resolve())):
        raise UnauthorizedError(message="Access denied")

    if not os.path.exists(resolved_path):
        raise NotFoundError(message="File not found")

    return FileResponse(
        path=resolved_path,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )




__all__ = [name for name in globals() if not name.startswith("__")]
