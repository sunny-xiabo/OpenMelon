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
        deleted = tracker.delete_record(record_id)
        if deleted:
            return DeleteResponse(
                success=True,
                deleted_count=1,
                message=f"Deleted index record {record_id}",
            )
        return DeleteResponse(
            success=False,
            deleted_count=0,
            message=f"Record not found: {record_id}",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/files", response_model=DeleteResponse)
async def delete_file_by_name(
    req: Request, filename: str = Query(..., description="Filename to delete")
):
    try:
        tracker = req.app.state.file_tracker
        count = tracker.delete_by_filename(filename)
        return DeleteResponse(
            success=count > 0,
            deleted_count=count,
            message=f"Deleted {count} record(s) for {filename}",
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
        )

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
