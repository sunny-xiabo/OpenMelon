from fastapi import APIRouter, HTTPException, Query
from fastapi import Request
from typing import Optional
import os

from app.api.schemas import (
    FileListResponse,
    FileRecord,
    DeleteResponse,
    ReindexResponse,
)

router = APIRouter(prefix="/manage", tags=["manage"])


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
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/files/{record_id}", response_model=DeleteResponse)
async def delete_file(record_id: str, req: Request):
    try:
        tracker = req.app.state.file_tracker
        record = tracker.get_record(record_id)
        if not record:
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
                    print(f"Warning: Failed to delete physical file {file_path}: {e}")
            
            # 删除相关的向量数据
            if filename:
                try:
                    await req.app.state.vector_ops.delete_chunks_by_file(filename)
                except Exception as e:
                    print(f"Warning: Failed to delete vector chunks for {filename}: {e}")

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
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/files", response_model=DeleteResponse)
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
                        print(f"Warning: Failed to delete physical file {file_path}: {e}")
            
            # 删除相关的向量数据
            try:
                await req.app.state.vector_ops.delete_chunks_by_file(filename)
            except Exception as e:
                print(f"Warning: Failed to delete vector chunks for {filename}: {e}")

        return DeleteResponse(
            success=count > 0,
            deleted_count=count,
            message=f"Deleted {count} record(s), physical files, and vector chunks for {filename}",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/files/{record_id}/reindex", response_model=ReindexResponse)
async def reindex_file(record_id: str, req: Request):
    try:
        tracker = req.app.state.file_tracker
        record = tracker.get_record(record_id)
        if not record:
            return ReindexResponse(
                success=False,
                message=f"Record not found: {record_id}",
            )

        file_path = record.get("file_path")
        if not file_path or not os.path.isfile(file_path):
            return ReindexResponse(
                success=False,
                message=f"Original file not found for {record['filename']}",
            )

        tracker.update_record(record_id, status="reindexing")

        from app.services.file_parser import parse_file
        import io

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
        return ReindexResponse(
            success=True,
            message=f"Re-indexed {record['filename']}, {chunks} chunks",
        )
    except Exception as e:
        import traceback

        tracker.update_record(record_id, status="failed")
        raise HTTPException(
            status_code=500, detail=str(e) + "\n" + traceback.format_exc()
        )
