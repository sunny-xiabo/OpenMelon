from fastapi import APIRouter, Depends, HTTPException, Query
from app.api.errors import InternalError, InvalidRequestError, NotFoundError, UnauthorizedError
from fastapi import Request
import logging
import os

logger = logging.getLogger(__name__)

from app.api.deps import require_production_auth
from app.api.logging_service import safe_log_event
from app.engine.rag.cache import bump_rag_cache_version
from app.api.schemas import (
    FileListResponse,
    FileRecord,
    DeleteResponse,
    ReindexResponse,
)

router = APIRouter(prefix="/manage", tags=["manage"])


def _log_manage_event(level: str, event_type: str, title: str, message: str = "", **kwargs):
    return safe_log_event(level, "management", event_type, title, message, **kwargs)


@router.get("/files", response_model=FileListResponse)
async def list_files(req: Request):
    try:
        tracker = req.app.state.file_tracker
        records = tracker.get_all_records()
        return FileListResponse(
            files=[FileRecord(**r) for r in records],
            total=len(records),
        )
    except Exception as e:
        raise InternalError(details=str(e))


@router.delete(
    "/files/{record_id}",
    response_model=DeleteResponse,
    dependencies=[Depends(require_production_auth)],
)
async def delete_file(record_id: str, req: Request):
    try:
        tracker = req.app.state.file_tracker
        record = tracker.get_record(record_id)
        if not record:
            _log_manage_event(
                "warning",
                "managed_file_delete_rejected",
                "文件删除未执行",
                f"记录不存在: {record_id}",
                source_id=record_id,
                refs=[record_id],
                data={"record_id": record_id},
            )
            return DeleteResponse(
                success=False,
                deleted_count=0,
                message=f"Record not found: {record_id}",
            )

        filename = record.get("filename")
        file_path = record.get("file_path")

        deleted = tracker.delete_record(record_id)
        if deleted:
            # 删除物理文件
            if file_path and os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except Exception as e:
                    logger.warning("Failed to delete physical file %s: %s", file_path, e)
            
            # 删除相关的向量数据
            if filename:
                try:
                    await req.app.state.vector_ops.delete_chunks_by_file(filename)
                except Exception as e:
                    logger.warning("Failed to delete vector chunks for %s: %s", filename, e)
            bump_rag_cache_version("file_deleted")

            _log_manage_event(
                "info",
                "managed_file_deleted",
                "文件索引已删除",
                f"已删除 {record_id} 及相关向量数据",
                source_id=record_id,
                refs=[record_id, filename],
                data={"record_id": record_id, "filename": filename or "", "file_path": file_path or ""},
            )
            return DeleteResponse(
                success=True,
                deleted_count=1,
                message=f"Deleted index record, physical file, and vector chunks for {record_id}",
            )
        return DeleteResponse(
            success=False,
            deleted_count=0,
            message=f"Failed to delete record: {record_id}",
        )
    except Exception as e:
        _log_manage_event(
            "error",
            "managed_file_delete_failed",
            "文件删除失败",
            str(e),
            source_id=record_id,
            refs=[record_id],
            data={"record_id": record_id, "error": str(e)},
        )
        raise InternalError(details=str(e))


@router.delete(
    "/files",
    response_model=DeleteResponse,
    dependencies=[Depends(require_production_auth)],
)
async def delete_file_by_name(
    req: Request, filename: str = Query(..., description="Filename to delete")
):
    try:
        tracker = req.app.state.file_tracker
        records = [r for r in tracker.get_all_records() if r.get("filename") == filename]
        
        count = tracker.delete_by_filename(filename)
        if count > 0:
            # 删除物理文件
            for record in records:
                file_path = record.get("file_path")
                if file_path and os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                    except Exception as e:
                        logger.warning("Failed to delete physical file %s: %s", file_path, e)
            
            # 删除相关的向量数据
            try:
                await req.app.state.vector_ops.delete_chunks_by_file(filename)
            except Exception as e:
                logger.warning("Failed to delete vector chunks for %s: %s", filename, e)
            bump_rag_cache_version("file_deleted_by_name")

        _log_manage_event(
            "info" if count > 0 else "warning",
            "managed_file_deleted_by_name",
            "按文件名删除索引完成",
            f"删除 {count} 条记录: {filename}",
            source_id=filename,
            refs=[filename],
            data={"filename": filename, "deleted_count": count},
        )
        return DeleteResponse(
            success=count > 0,
            deleted_count=count,
            message=f"Deleted {count} record(s), physical files, and vector chunks for {filename}",
        )
    except Exception as e:
        _log_manage_event(
            "error",
            "managed_file_delete_failed",
            "按文件名删除索引失败",
            str(e),
            source_id=filename,
            refs=[filename],
            data={"filename": filename, "error": str(e)},
        )
        raise InternalError(details=str(e))


@router.post(
    "/files/{record_id}/reindex",
    response_model=ReindexResponse,
    dependencies=[Depends(require_production_auth)],
)
async def reindex_file(record_id: str, req: Request):
    try:
        tracker = req.app.state.file_tracker
        record = tracker.get_record(record_id)
        if not record:
            _log_manage_event(
                "warning",
                "managed_file_reindex_rejected",
                "文件重建索引未执行",
                f"记录不存在: {record_id}",
                source_id=record_id,
                refs=[record_id],
                data={"record_id": record_id},
            )
            return ReindexResponse(
                success=False,
                message=f"Record not found: {record_id}",
            )

        file_path = record.get("file_path")
        if not file_path or not os.path.isfile(file_path):
            _log_manage_event(
                "warning",
                "managed_file_reindex_rejected",
                "文件重建索引未执行",
                f"原文件不存在: {record['filename']}",
                source_id=record_id,
                refs=[record_id, record.get("filename")],
                data={"record_id": record_id, "filename": record.get("filename", ""), "file_path": file_path or ""},
            )
            return ReindexResponse(
                success=False,
                message=f"Original file not found for {record['filename']}",
            )

        tracker.update_record(record_id, status="reindexing")

        from app.services.file_parser import parse_file

        class _TempFile:
            def __init__(self, content, name):
                self.file = content
                self.filename = name

            async def read(self):
                return self.file

        with open(file_path, "rb") as f:
            content_bytes = f.read()

        text_content, filename = await parse_file(
            _TempFile(content_bytes, record["filename"])
        )

        if not text_content.strip():
            tracker.update_record(record_id, status="failed")
            return ReindexResponse(
                success=False,
                message="No text content extracted from file",
            )

        indexer = req.app.state.indexer
        chunks = await indexer.index_file(
            file_content=text_content,
            doc_type=record["doc_type"],
            module=record["module"],
            filename=record["filename"],
            file_path=file_path,
            update_tracker=False, # 关键点：告诉索引器“别自作主张去新增文件记录”，防止产生重复的幽灵数据
        )

        # 重新索引跑完后，精确地把当前这条记录的状态改成"已索引"，并更新最新切出来的区块数
        tracker.update_record(record_id, status="indexed", chunk_count=chunks)
        if chunks > 0:
            bump_rag_cache_version("file_reindexed")
        _log_manage_event(
            "info",
            "managed_file_reindexed",
            "文件重建索引完成",
            f"{record['filename']} 重建 {chunks} 个 chunk",
            source_id=record_id,
            refs=[record_id, record.get("filename"), record.get("module")],
            data={
                "record_id": record_id,
                "filename": record.get("filename", ""),
                "doc_type": record.get("doc_type", ""),
                "module": record.get("module", ""),
                "chunks": chunks,
            },
        )
        return ReindexResponse(
            success=True,
            message=f"Re-indexed {record['filename']}, {chunks} chunks",
        )
    except Exception as e:
        import traceback

        tracker.update_record(record_id, status="failed")
        _log_manage_event(
            "error",
            "managed_file_reindex_failed",
            "文件重建索引失败",
            str(e),
            source_id=record_id,
            refs=[record_id],
            data={"record_id": record_id, "error": str(e)},
        )
        raise InternalError(details=str(e) + "\n" + traceback.format_exc())
