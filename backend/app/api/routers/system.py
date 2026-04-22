import os
from fastapi import APIRouter, HTTPException, Depends, Request, Query
from app.api.deps import get_metrics_collector, get_session_manager

router = APIRouter(tags=["system"])

@router.get("/ping")
async def ping():
    return {"status": "success", "message": "pong"}

@router.get("/metrics")
async def get_metrics(collector = Depends(get_metrics_collector)):
    try:
        if collector:
            return collector.get_all_metrics()
        return {"metrics": "not_configured"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/metrics/reset")
async def reset_metrics(collector = Depends(get_metrics_collector)):
    try:
        if collector:
            collector.reset()
            return {"reset": True}
        return {"reset": False, "reason": "not_configured"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sessions")
async def list_sessions(session_manager = Depends(get_session_manager)):
    sessions = session_manager.list_sessions_with_meta()
    return {"sessions": sessions}

@router.patch("/sessions/{session_id}/rename")
async def rename_session(session_id: str, req: Request, session_manager = Depends(get_session_manager)):
    body = await req.json()
    title = body.get("title", "")
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    ok = session_manager.rename_session(session_id, title)
    if not ok:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"session_id": session_id, "title": title}

@router.get("/history/{session_id}")
async def history(session_id: str, session_manager = Depends(get_session_manager)):
    try:
        history = session_manager.get_history(session_id)
        return {"session_id": session_id, "history": history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/history/{session_id}")
async def delete_session_history(session_id: str, session_manager = Depends(get_session_manager)):
    try:
        deleted = session_manager.delete_session(session_id)
        return {"session_id": session_id, "deleted": deleted}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

LOG_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "logs"
)

LOG_FILES = {
    "openmelon.log": LOG_DIR,
    "openmelon_error.log": LOG_DIR,
}

@router.get("/logs")
async def get_logs(
    filename: str = Query(default="openmelon.log"),
    lines: int = Query(default=200, ge=1, le=5000),
):
    if filename not in LOG_FILES:
        raise HTTPException(status_code=400, detail=f"Unknown log file: {filename}")
    log_path = os.path.join(LOG_FILES[filename], filename)
    if not os.path.isfile(log_path):
        return {"filename": filename, "lines": [], "total_lines": 0}
    try:
        with open(log_path, "r", encoding="utf-8") as f:
            all_lines = f.readlines()
        tail = all_lines[-lines:] if len(all_lines) > lines else all_lines
        return {
            "filename": filename,
            "lines": [l.rstrip("\\n") for l in tail],
            "total_lines": len(all_lines),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/logs/list")
async def list_logs():
    result = []
    for name, dir_path in LOG_FILES.items():
        full_path = os.path.join(dir_path, name)
        size = os.path.getsize(full_path) if os.path.isfile(full_path) else 0
        result.append(
            {"filename": name, "size_bytes": size, "exists": os.path.isfile(full_path)}
        )
    return {"logs": result}
