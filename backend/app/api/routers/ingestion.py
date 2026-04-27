import os
import uuid
import asyncio
import aiofiles
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File, Form, Query
from concurrent.futures import ThreadPoolExecutor

from app.api.schemas import (
    IndexFileRequest,
    IndexDirectoryRequest,
    IndexResponse,
    UploadResponse,
)
from app.services.file_parser import (
    detect_format,
    auto_detect_doc_type,
    auto_detect_module,
    SUPPORTED_FORMATS,
)
from app.api.deps import get_indexer
from app.services.upload_task_manager import upload_task_manager

router = APIRouter(tags=["ingestion"])

UPLOAD_TEMP_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads"
)
os.makedirs(UPLOAD_TEMP_DIR, exist_ok=True)

UPLOAD_STORE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data", "uploads"
)
os.makedirs(UPLOAD_STORE_DIR, exist_ok=True)

_parse_executor = ThreadPoolExecutor(max_workers=3, thread_name_prefix="parse-worker")

def _parse_file_sync(content_bytes: bytes, filename: str):
    from app.services.file_parser import parse_file

    class _TempFile:
        def __init__(self, content, name):
            self.file = content
            self.filename = name

        async def read(self):
            return self.file

    import asyncio as _asyncio
    return _asyncio.run(parse_file(_TempFile(content_bytes, filename)))

@router.post("/index/file", response_model=IndexResponse)
async def index_file(request: IndexFileRequest, indexer = Depends(get_indexer)):
    try:
        chunks_indexed = await indexer.index_file(
            file_content=request.file_content,
            doc_type=request.doc_type,
            module=request.module,
            filename=request.filename,
        )

        return IndexResponse(
            success=True,
            chunks_indexed=chunks_indexed,
            message=f"Indexed {chunks_indexed} chunks from {request.filename}",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/index/directory", response_model=IndexResponse)
async def index_directory(request: IndexDirectoryRequest, indexer = Depends(get_indexer)):
    try:
        if not os.path.isdir(request.directory_path):
            return IndexResponse(
                success=False,
                chunks_indexed=0,
                message=f"Directory not found: {request.directory_path}",
            )

        chunks_indexed = await indexer.index_directory(
            directory_path=request.directory_path,
            doc_type=request.doc_type,
            module=request.module,
        )

        return IndexResponse(
            success=True,
            chunks_indexed=chunks_indexed,
            message=f"Indexed {chunks_indexed} chunks from {request.directory_path}",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload", response_model=UploadResponse)
async def upload_files(
    files: List[UploadFile] = File(...),
    doc_type: Optional[str] = Form(None),
    module: Optional[str] = Form(None),
    indexer = Depends(get_indexer)
):
    try:
        details = []
        total_chunks = 0

        for upload_file in files:
            if not upload_file.filename:
                continue

            ext = detect_format(upload_file.filename)
            if not ext:
                details.append(
                    {
                        "filename": upload_file.filename,
                        "success": False,
                        "message": f"Unsupported format: {ext}",
                        "chunks": 0,
                    }
                )
                continue

            try:
                file_bytes = await upload_file.read()

                loop = asyncio.get_running_loop()
                text_content, filename = await loop.run_in_executor(
                    _parse_executor,
                    _parse_file_sync,
                    file_bytes,
                    upload_file.filename,
                )

                if not text_content.strip():
                    details.append(
                        {
                            "filename": filename,
                            "success": False,
                            "message": "No text content extracted",
                            "chunks": 0,
                        }
                    )
                    continue

                resolved_doc_type = doc_type or auto_detect_doc_type(
                    text_content, filename
                )
                resolved_module = module or auto_detect_module(text_content, filename)

                chunks_indexed = await indexer.index_file(
                    file_content=text_content,
                    doc_type=resolved_doc_type,
                    module=resolved_module,
                    filename=filename,
                )

                total_chunks += chunks_indexed
                details.append(
                    {
                        "filename": filename,
                        "success": True,
                        "doc_type": resolved_doc_type,
                        "module": resolved_module,
                        "chunks": chunks_indexed,
                        "message": f"Indexed {chunks_indexed} chunks",
                    }
                )

            except Exception as e:
                details.append(
                    {
                        "filename": upload_file.filename,
                        "success": False,
                        "message": str(e),
                        "chunks": 0,
                    }
                )

        files_indexed = sum(1 for d in details if d["success"])

        return UploadResponse(
            success=files_indexed > 0,
            files_indexed=files_indexed,
            total_chunks=total_chunks,
            details=details,
            message=f"Indexed {files_indexed}/{len(files)} files, {total_chunks} chunks total",
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload/directory", response_model=UploadResponse)
async def upload_directory(
    files: List[UploadFile] = File(...),
    doc_type: Optional[str] = Form(None),
    module: Optional[str] = Form(None),
    indexer = Depends(get_indexer)
):
    try:
        details = []
        total_chunks = 0

        for upload_file in files:
            if not upload_file.filename:
                continue

            ext = detect_format(upload_file.filename)
            if not ext:
                details.append(
                    {
                        "filename": upload_file.filename,
                        "success": False,
                        "message": "Unsupported format",
                        "chunks": 0,
                    }
                )
                continue

            try:
                file_bytes = await upload_file.read()

                loop = asyncio.get_running_loop()
                text_content, filename = await loop.run_in_executor(
                    _parse_executor,
                    _parse_file_sync,
                    file_bytes,
                    upload_file.filename,
                )

                if not text_content.strip():
                    details.append(
                        {
                            "filename": filename,
                            "success": False,
                            "message": "No text content extracted",
                            "chunks": 0,
                        }
                    )
                    continue

                resolved_doc_type = doc_type or auto_detect_doc_type(
                    text_content, filename
                )
                resolved_module = module or auto_detect_module(text_content, filename)

                chunks_indexed = await indexer.index_file(
                    file_content=text_content,
                    doc_type=resolved_doc_type,
                    module=resolved_module,
                    filename=filename,
                )

                total_chunks += chunks_indexed
                details.append(
                    {
                        "filename": filename,
                        "success": True,
                        "doc_type": resolved_doc_type,
                        "module": resolved_module,
                        "chunks": chunks_indexed,
                        "message": f"Indexed {chunks_indexed} chunks",
                    }
                )

            except Exception as e:
                details.append(
                    {
                        "filename": upload_file.filename,
                        "success": False,
                        "message": str(e),
                        "chunks": 0,
                    }
                )

        files_indexed = sum(1 for d in details if d["success"])

        return UploadResponse(
            success=files_indexed > 0,
            files_indexed=files_indexed,
            total_chunks=total_chunks,
            details=details,
            message=f"Directory import: {files_indexed}/{len(files)} files indexed, {total_chunks} chunks total",
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def _process_upload_task(
    task,
    saved_files: list,
    doc_type: Optional[str],
    module: Optional[str],
    indexer,
):
    import sys as _sys
    import datetime as _dt
    import traceback as _tb

    def _log(msg):
        ts = _dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        _sys.stdout.write(f"[upload-task] [{ts}] {msg}\\n")
        _sys.stdout.flush()

    task.status = "processing"
    try:
        details = []
        total_chunks = 0
        for file_path, original_name in saved_files:
            try:
                _log(f"processing file: {original_name}")
                ext = detect_format(original_name)
                if not ext:
                    details.append(
                        {
                            "filename": original_name,
                            "success": False,
                            "message": "Unsupported format",
                            "chunks": 0,
                        }
                    )
                    task.processed += 1
                    continue

                _log("reading file content")
                with open(file_path, "rb") as f:
                    content_bytes = f.read()
                _log(f"file size: {len(content_bytes)} bytes")

                _log(f"parsing file {original_name} (in thread)")
                loop = asyncio.get_running_loop()
                text_content, filename = await loop.run_in_executor(
                    _parse_executor,
                    _parse_file_sync,
                    content_bytes,
                    original_name,
                )
                _log(f"parsed, text length: {len(text_content)} chars")

                file_id = str(uuid.uuid4())
                ext = os.path.splitext(original_name)[1]
                perm_path = os.path.join(UPLOAD_STORE_DIR, f"{file_id}{ext}")
                with open(perm_path, "wb") as f:
                    f.write(content_bytes)

                if not text_content.strip():
                    details.append(
                        {
                            "filename": filename,
                            "success": False,
                            "message": "No text content extracted",
                            "chunks": 0,
                        }
                    )
                    task.processed += 1
                    continue

                _log("auto-detecting doc_type and module...")
                resolved_doc_type = doc_type or auto_detect_doc_type(
                    text_content, filename
                )
                _log(f"doc_type={resolved_doc_type}")
                resolved_module = module or auto_detect_module(text_content, filename)
                _log(f"module={resolved_module}")

                _log("calling indexer.index_file")
                chunks_indexed = await indexer.index_file(
                    file_content=text_content,
                    doc_type=resolved_doc_type,
                    module=resolved_module,
                    filename=filename,
                    file_path=perm_path,
                )
                _log(f"index_file done, chunks: {chunks_indexed}")

                total_chunks += chunks_indexed
                details.append(
                    {
                        "filename": filename,
                        "success": True,
                        "doc_type": resolved_doc_type,
                        "module": resolved_module,
                        "chunks": chunks_indexed,
                        "message": f"Indexed {chunks_indexed} chunks",
                    }
                )

                task.processed += 1
                task.details = details
                task.total_chunks = total_chunks

            except Exception as e:
                _log(f"error processing {original_name}: {e}")
                _log(_tb.format_exc())
                details.append(
                    {
                        "filename": original_name,
                        "success": False,
                        "message": str(e),
                        "chunks": 0,
                    }
                )
                task.processed += 1
                task.details = details

            finally:
                try:
                    os.unlink(file_path)
                except Exception:
                    pass

        files_indexed = sum(1 for d in details if d["success"])
        task.status = "completed"
        task.message = f"Indexed {files_indexed}/{len(saved_files)} files, {total_chunks} chunks total"
        task.details = details
        task.total_chunks = total_chunks

    except Exception as e:
        _log(f"task error: {e}")
        import traceback as _tb
        _log(_tb.format_exc())
        task.status = "failed"
        task.error = str(e)
        task.message = f"Upload failed: {str(e)}"

@router.post("/upload/async")
async def upload_files_async(
    files: List[UploadFile] = File(...),
    doc_type: Optional[str] = Form(None),
    module: Optional[str] = Form(None),
    indexer = Depends(get_indexer)
):
    saved_files = []
    try:
        os.makedirs(UPLOAD_TEMP_DIR, exist_ok=True)
        os.makedirs(UPLOAD_STORE_DIR, exist_ok=True)
        for upload_file in files:
            if not upload_file.filename:
                continue
            file_id = str(uuid.uuid4())
            ext = os.path.splitext(upload_file.filename)[1]
            save_path = os.path.join(UPLOAD_TEMP_DIR, f"{file_id}{ext}")
            content = await upload_file.read()
            async with aiofiles.open(save_path, "wb") as f:
                await f.write(content)
            saved_files.append((save_path, upload_file.filename))

        if not saved_files:
            raise HTTPException(status_code=400, detail="No valid files provided")

        task = upload_task_manager.create(
            filename=", ".join(f[1] for f in saved_files),
            total_files=len(saved_files),
        )

        asyncio.create_task(
            _process_upload_task(task, saved_files, doc_type, module, indexer)
        )

        return {
            "success": True,
            "task_id": task.task_id,
            "message": f"{len(saved_files)} file(s) saved, processing in background",
        }

    except HTTPException:
        raise
    except Exception as e:
        for file_path, _ in saved_files:
            try:
                os.unlink(file_path)
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/upload/status/{task_id}")
async def upload_status(task_id: str):
    task = upload_task_manager.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task not found: {task_id}")
    return task.to_dict()

@router.get("/upload/tasks")
async def list_upload_tasks(limit: int = Query(default=20, ge=1, le=100)):
    return {"tasks": upload_task_manager.list_tasks(limit)}

@router.get("/upload/formats")
async def supported_formats():
    return {"formats": list(SUPPORTED_FORMATS.keys())}
