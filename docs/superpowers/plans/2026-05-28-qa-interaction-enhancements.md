# Q&A 界面交互增强 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 OpenMelon 智能问答页面添加消息操作栏（复制/重试/反馈）、引用溯源图谱高亮、图片多模态查询三项交互能力。

**Architecture:** 后端在 query.py 新增 feedback/citations 端点，扩展流式端点支持 multipart 图片上传；前端在 MessageBubble 添加操作栏和引用标记渲染，QAPage 统一管理 feedback/重试/附件状态，GraphInsightPanel 接收高亮节点事件。

**Tech Stack:** FastAPI, PostgreSQL (psycopg), React 18, MUI 5, TanStack Query, vis-network, ReadableStream

---

## 文件结构

### 后端

| 文件 | 职责 |
|------|------|
| `backend/app/storage/qa_feedback_store.py` | **新建** -- qa_feedback 表 CRUD |
| `backend/app/api/schemas.py` | 新增 FeedbackRequest, FeedbackResponse, 扩展 Citation |
| `backend/app/api/routers/query.py` | 新增 feedback/citations 端点, multipart 支持 |
| `backend/app/engine/rag/generator.py` | prompt 增加引用格式要求 |
| `backend/app/main.py` | 初始化 qa_feedback_store |
| `backend/tests/test_qa_feedback.py` | **新建** -- feedback API 测试 |
| `backend/tests/test_qa_citations.py` | **新建** -- citations 测试 |

### 前端

| 文件 | 职责 |
|------|------|
| `frontend/src/api/chat.js` | 新增 feedback/citations/formData API |
| `frontend/src/api/client.js` | 新增 fetchFormData 辅助函数 |
| `frontend/src/features/QA/components/MessageBubble.jsx` | 操作栏、引用标记渲染 |
| `frontend/src/features/QA/components/GraphInsightPanel.jsx` | 节点高亮 prop |
| `frontend/src/pages/QAPage.jsx` | feedback/重试/附件/citation 集成 |
| `frontend/src/features/QA/hooks/useQA.js` | 新增 useFeedback hooks |

---

### Task 1: Backend -- Feedback Store

**Files:**
- Create: `backend/app/storage/qa_feedback_store.py`
- Test: `backend/tests/test_qa_feedback.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_qa_feedback.py
import pytest
from app.storage.qa_feedback_store import QaFeedbackStore


@pytest.fixture
def store(tmp_path, monkeypatch):
    import app.storage.postgres_store as pg
    monkeypatch.setattr(pg, "_get_pool", lambda name="default": None)
    s = QaFeedbackStore(db_path=str(tmp_path / "test_feedback.db"))
    return s


def test_set_and_get_feedback(store):
    store.set_feedback("sess_1", 0, "up")
    store.set_feedback("sess_1", 2, "down")
    results = store.get_feedbacks("sess_1")
    assert len(results) == 2
    assert {"message_index": 0, "feedback": "up"} in results
    assert {"message_index": 2, "feedback": "down"} in results


def test_update_feedback(store):
    store.set_feedback("sess_1", 0, "up")
    store.set_feedback("sess_1", 0, "down")
    results = store.get_feedbacks("sess_1")
    assert len(results) == 1
    assert results[0]["feedback"] == "down"


def test_delete_feedback(store):
    store.set_feedback("sess_1", 0, "up")
    store.delete_feedback("sess_1", 0)
    results = store.get_feedbacks("sess_1")
    assert len(results) == 0


def test_get_feedbacks_empty(store):
    results = store.get_feedbacks("nonexistent")
    assert results == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_qa_feedback.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.storage.qa_feedback_store'`

- [ ] **Step 3: Implement QaFeedbackStore**

```python
# backend/app/storage/qa_feedback_store.py
"""Q&A feedback persistence (thumbs up/down per message)."""

from __future__ import annotations

import logging
import sqlite3
from typing import Any

logger = logging.getLogger(__name__)


class QaFeedbackStore:
    def __init__(self, db_path: str = "openmelon.db") -> None:
        self._db_path = db_path
        self._init_schema()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS qa_feedback (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    message_index INTEGER NOT NULL,
                    feedback TEXT NOT NULL CHECK (feedback IN ('up', 'down')),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(session_id, message_index)
                )
            """)

    def set_feedback(self, session_id: str, message_index: int, feedback: str) -> None:
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO qa_feedback (session_id, message_index, feedback)
                   VALUES (?, ?, ?)
                   ON CONFLICT(session_id, message_index)
                   DO UPDATE SET feedback = excluded.feedback, updated_at = CURRENT_TIMESTAMP""",
                (session_id, message_index, feedback),
            )

    def delete_feedback(self, session_id: str, message_index: int) -> None:
        with self._conn() as conn:
            conn.execute(
                "DELETE FROM qa_feedback WHERE session_id = ? AND message_index = ?",
                (session_id, message_index),
            )

    def get_feedbacks(self, session_id: str) -> list[dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT message_index, feedback FROM qa_feedback WHERE session_id = ?",
                (session_id,),
            ).fetchall()
            return [{"message_index": r["message_index"], "feedback": r["feedback"]} for r in rows]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_qa_feedback.py -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/storage/qa_feedback_store.py backend/tests/test_qa_feedback.py
git commit -m "feat(backend): add qa_feedback store with CRUD operations"
```

---

### Task 2: Backend -- Feedback API Endpoints

**Files:**
- Modify: `backend/app/api/schemas.py`
- Modify: `backend/app/api/routers/query.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_qa_feedback.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_qa_feedback.py`:

```python
from fastapi.testclient import TestClient
from app.main import app


def test_set_feedback_endpoint():
    client = TestClient(app)
    resp = client.post("/api/query/feedback", json={
        "session_id": "test_sess", "message_index": 0, "feedback": "up"
    })
    assert resp.status_code == 200
    assert resp.json()["success"] is True


def test_get_feedback_endpoint():
    client = TestClient(app)
    client.post("/api/query/feedback", json={
        "session_id": "test_sess2", "message_index": 1, "feedback": "down"
    })
    resp = client.get("/api/query/feedback/test_sess2")
    assert resp.status_code == 200
    data = resp.json()
    assert any(f["message_index"] == 1 and f["feedback"] == "down" for f in data["feedbacks"])


def test_delete_feedback_endpoint():
    client = TestClient(app)
    client.post("/api/query/feedback", json={
        "session_id": "test_sess3", "message_index": 0, "feedback": "up"
    })
    resp = client.post("/api/query/feedback", json={
        "session_id": "test_sess3", "message_index": 0, "feedback": None
    })
    assert resp.status_code == 200
    get_resp = client.get("/api/query/feedback/test_sess3")
    assert len(get_resp.json()["feedbacks"]) == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_qa_feedback.py::test_set_feedback_endpoint -v`
Expected: FAIL with 404 (endpoint not found)

- [ ] **Step 3: Add schemas to schemas.py**

Append to `backend/app/api/schemas.py`:

```python
class FeedbackRequest(BaseModel):
    session_id: str
    message_index: int
    feedback: Optional[str] = None  # "up", "down", or null to delete


class FeedbackResponse(BaseModel):
    feedbacks: List[Dict[str, Any]]
```

- [ ] **Step 4: Add feedback endpoints to query.py**

Add to `backend/app/api/routers/query.py` (after the existing endpoints):

```python
from app.api.schemas import FeedbackRequest

@router.post("/query/feedback")
async def set_feedback(request: FeedbackRequest, req: Request):
    store = getattr(req.app.state, "qa_feedback_store", None)
    if store is None:
        raise InternalError(details="Feedback store not initialized")
    if request.feedback is None:
        store.delete_feedback(request.session_id, request.message_index)
    else:
        store.set_feedback(request.session_id, request.message_index, request.feedback)
    return {"success": True}


@router.get("/query/feedback/{session_id}")
async def get_feedback(session_id: str, req: Request):
    store = getattr(req.app.state, "qa_feedback_store", None)
    if store is None:
        raise InternalError(details="Feedback store not initialized")
    return {"feedbacks": store.get_feedbacks(session_id)}
```

- [ ] **Step 5: Initialize store in main.py**

In `backend/app/main.py` lifespan handler, add after other store initializations:

```python
from app.storage.qa_feedback_store import QaFeedbackStore
app.state.qa_feedback_store = QaFeedbackStore(db_path=settings.DATABASE_URL.replace("sqlite:///", "") if "sqlite" in settings.DATABASE_URL else "openmelon.db")
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_qa_feedback.py -v`
Expected: 7 passed

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/schemas.py backend/app/api/routers/query.py backend/app/main.py backend/tests/test_qa_feedback.py
git commit -m "feat(backend): add feedback API endpoints for Q&A messages"
```

---

### Task 3: Backend -- Citation Enhancement

**Files:**
- Modify: `backend/app/engine/rag/generator.py`
- Modify: `backend/app/api/schemas.py`
- Modify: `backend/app/api/routers/query.py`
- Test: `backend/tests/test_qa_citations.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_qa_citations.py
def test_citation_schema_has_index():
    from app.api.schemas import Citation
    c = Citation(source_type="vector", filename="test.py", index=1, content_preview="def foo")
    assert c.index == 1
    assert c.content_preview == "def foo"


def test_generator_prompt_includes_citation_instruction():
    from app.engine.rag.generator import RAGGenerator
    from unittest.mock import AsyncMock
    gen = RAGGenerator(openai_client=AsyncMock())
    prompt = gen.build_prompt("test question", "test context", "vector_query", [])
    assert "[1]" in prompt["system"] or "[1]" in prompt["user"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_qa_citations.py -v`
Expected: FAIL (Citation has no index field, prompt has no citation instruction)

- [ ] **Step 3: Update Citation schema**

In `backend/app/api/schemas.py`, update the `Citation` class:

```python
class Citation(BaseModel):
    source_type: str
    filename: Optional[str] = None
    doc_type: Optional[str] = None
    chunk_index: Optional[int] = None
    index: Optional[int] = None
    content_preview: Optional[str] = None
```

- [ ] **Step 4: Update generator prompt**

In `backend/app/engine/rag/generator.py`, in `build_prompt` method, append to `system_message`:

```python
" When citing sources, use numbered references [1], [2], [3] in your answer text. "
"The numbers correspond to the order of Retrieved Context sections provided."
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_qa_citations.py -v`
Expected: 2 passed

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/schemas.py backend/app/engine/rag/generator.py backend/tests/test_qa_citations.py
git commit -m "feat(backend): add citation index and content_preview fields, update RAG prompt for citation markers"
```

---

### Task 4: Backend -- Image Multimodal Support

**Files:**
- Modify: `backend/app/api/routers/query.py`

- [ ] **Step 1: Add vision description helper**

In `backend/app/api/routers/query.py`, add a helper function:

```python
import tempfile, os
from pathlib import Path

async def _describe_image(image_bytes: bytes, filename: str) -> str:
    """Use vision model to describe an uploaded image."""
    import base64
    from app.testcase_gen.utils.llms import get_model_client
    b64 = base64.b64encode(image_bytes).decode()
    ext = Path(filename).suffix.lower().lstrip(".")
    mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp"}.get(ext, "image/png")
    client = get_model_client(use_vision=True)
    try:
        resp = await client.chat.completions.create(
            model=getattr(client, "model", "qwen-vl-max"),
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": "请详细描述这张图片的内容，包括文字、图表、界面元素等所有可见信息。"},
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                ],
            }],
            max_tokens=1000,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        logger.warning("Vision model failed for %s: %s", filename, e)
        return f"[图片: {filename} - 无法分析内容]"
```

- [ ] **Step 2: Modify query_stream to accept multipart**

Replace the `query_stream` endpoint signature to handle both JSON and form-data:

```python
@router.post("/query/stream")
async def query_stream(
    req: Request,
    intent_router = Depends(get_intent_router),
    retriever = Depends(get_retriever),
    generator = Depends(get_generator),
    session_manager = Depends(get_session_manager),
    metrics_collector = Depends(get_metrics_collector),
):
    content_type = req.headers.get("content-type", "")
    if "multipart/form-data" in content_type:
        form = await req.form()
        question = form.get("question", "")
        include_history = form.get("include_history", "true").lower() == "true"
        session_id = form.get("session_id") or None
        files = form.getlist("files")
        image_descriptions = []
        for f in files:
            data = await f.read()
            desc = await _describe_image(data, f.filename)
            image_descriptions.append(f"[图片 {f.filename}]: {desc}")
        if image_descriptions:
            question = question + "\n\n" + "\n".join(image_descriptions)
    else:
        body = await req.json()
        question = body.get("question", "")
        include_history = body.get("include_history", True)
        session_id = req.query_params.get("session_id") or None
    # ... rest of existing logic using question, include_history, session_id
```

- [ ] **Step 3: Run existing backend tests**

Run: `cd backend && python -m pytest tests/ -x -q`
Expected: All existing tests pass (no regressions)

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/routers/query.py
git commit -m "feat(backend): add multipart image support to query stream endpoint"
```

---

### Task 5: Frontend -- Chat API Layer

**Files:**
- Modify: `frontend/src/api/chat.js`
- Modify: `frontend/src/api/client.js`

- [ ] **Step 1: Add fetchFormData to client.js**

Append to `frontend/src/api/client.js`:

```javascript
export const fetchFormData = async (url, formData, { timeoutMs = 0 } = {}) => {
  const requestId = createRequestId();
  const timeoutController = new AbortController();
  const signal = timeoutMs > 0
    ? mergeSignals(null, timeoutController.signal)
    : timeoutController.signal;
  const timer = timeoutMs > 0 ? setTimeout(() => timeoutController.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs) : null;
  try {
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: { 'X-Request-ID': requestId },
      signal,
    });
    if (!response.ok) {
      const body = await parseErrorBody(response);
      const error = toAPIError({ response, body, requestId, url, method: 'POST' });
      emitAPIError(error);
      throw error;
    }
    return response;
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      const timeoutError = new APIError('请求超时', { status: 0, code: 'TIMEOUT', requestId, url, method: 'POST' });
      emitAPIError(timeoutError);
      throw timeoutError;
    }
    if (error instanceof APIError) throw error;
    const networkError = new APIError(error.message || '网络请求失败', { status: 0, code: 'NETWORK_ERROR', requestId, url, method: 'POST', details: error });
    emitAPIError(networkError);
    throw networkError;
  } finally {
    if (timer) clearTimeout(timer);
  }
};
```

- [ ] **Step 2: Add feedback and citations APIs to chat.js**

Update `frontend/src/api/chat.js`:

```javascript
import { API_BASE, fetchJSON, fetchStream, fetchFormData } from './client';

export const chatAPI = {
  // ... existing methods ...

  setFeedback: (sessionId, messageIndex, feedback) =>
    fetchJSON(`${API_BASE}/query/feedback`, {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, message_index: messageIndex, feedback }),
    }),

  getFeedback: (sessionId) =>
    fetchJSON(`${API_BASE}/query/feedback/${encodeURIComponent(sessionId)}`),

  getCitations: (sessionId) =>
    fetchJSON(`${API_BASE}/query/citations/${encodeURIComponent(sessionId)}`),

  queryStreamWithFiles: (question, files, sessionId = null, includeHistory = true) => {
    const formData = new FormData();
    formData.append('question', question);
    formData.append('include_history', String(includeHistory));
    if (sessionId) formData.append('session_id', sessionId);
    files.forEach(f => formData.append('files', f));
    return fetchFormData(`${API_BASE}/query/stream`, formData, { timeoutMs: 0 });
  },
};
```

- [ ] **Step 3: Run frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/client.js frontend/src/api/chat.js
git commit -m "feat(frontend): add feedback, citations, and form-data APIs"
```

---

### Task 6: Frontend -- MessageBubble Enhancements

**Files:**
- Modify: `frontend/src/features/QA/components/MessageBubble.jsx`

- [ ] **Step 1: Add message action props and UI**

Update `MessageBubble.jsx` to accept `onCopy`, `onRetry`, `onFeedback`, `onCitationClick`, `feedback` props. In the assistant bubble rendering, after the existing content, add:

```jsx
// Inside the assistant bubble, after citations/context chunks:
{bubbleMessage.role === 'assistant' && (
  <MessageActions
    content={bubbleMessage.content}
    feedback={feedback}
    onCopy={onCopy}
    onRetry={onRetry}
    onFeedback={onFeedback}
  />
)}
```

Add a `MessageActions` component above or below the main export:

```jsx
function MessageActions({ content, feedback, onCopy, onRetry, onFeedback }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    onCopy?.();
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1, pt: 0.75, borderTop: '1px solid', borderColor: 'divider', opacity: 0.6, '&:hover': { opacity: 1 }, transition: 'opacity 0.2s' }}>
      <Chip size="small" label={copied ? '已复制' : '复制'} onClick={handleCopy} variant="outlined" sx={{ fontSize: 11, height: 24 }} />
      <Chip size="small" label="重试" onClick={onRetry} variant="outlined" sx={{ fontSize: 11, height: 24 }} />
      <Box sx={{ ml: 'auto', display: 'flex', gap: 0.5 }}>
        <IconButton size="small" onClick={() => onFeedback?.(feedback === 'up' ? null : 'up')} sx={{ color: feedback === 'up' ? 'success.main' : 'text.secondary' }}>
          <ThumbUpOutlined sx={{ fontSize: 16 }} />
        </IconButton>
        <IconButton size="small" onClick={() => onFeedback?.(feedback === 'down' ? null : 'down')} sx={{ color: feedback === 'down' ? 'error.main' : 'text.secondary' }}>
          <ThumbDownOutlined sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Add citation marker rendering**

In the assistant bubble's ReactMarkdown, add a custom component to replace `[N]` patterns:

```jsx
// In the ReactMarkdown components prop:
<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  rehypePlugins={[rehypeRaw]}
  components={{
    text({ children }) {
      if (typeof children !== 'string') return children;
      const parts = children.split(/(\[\d+\])/g);
      if (parts.length === 1) return children;
      return parts.map((part, i) => {
        const match = part.match(/^\[(\d+)\]$/);
        if (match) {
          const idx = parseInt(match[1], 10);
          return (
            <sup key={i} onClick={() => onCitationClick?.(idx)}
              style={{ color: '#6366f1', cursor: 'pointer', fontWeight: 700, fontSize: '0.7em' }}>
              [{idx}]
            </sup>
          );
        }
        return part;
      });
    },
  }}
>
  {bubbleMessage.content}
</ReactMarkdown>
```

- [ ] **Step 3: Run frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/QA/components/MessageBubble.jsx
git commit -m "feat(frontend): add message actions bar and citation marker rendering"
```

---

### Task 7: Frontend -- QAPage Integration

**Files:**
- Modify: `frontend/src/pages/QAPage.jsx`
- Modify: `frontend/src/features/QA/hooks/useQA.js`

- [ ] **Step 1: Add feedback hooks to useQA.js**

```javascript
export function useFeedbacks(sessionId) {
  return useQuery({
    queryKey: QA_KEYS.feedbacks(sessionId),
    queryFn: () => chatAPI.getFeedback(sessionId),
    enabled: !!sessionId,
  });
}
```

Add to `QA_KEYS`:
```javascript
feedbacks: (sid) => ['qa', 'feedbacks', sid],
```

- [ ] **Step 2: Add feedback state to QAPage**

In `QAPage.jsx`, add state and effect for feedback:

```javascript
const { data: feedbackData } = useFeedbacks(currentSessionId);
const feedbackMap = useMemo(() => {
  const map = {};
  (feedbackData?.feedbacks || []).forEach(f => { map[f.message_index] = f.feedback; });
  return map;
}, [feedbackData]);
```

- [ ] **Step 3: Add retry and feedback handlers**

```javascript
const handleRetry = async (messageIndex) => {
  // Find the user question that preceded this assistant message
  const userMsg = messages[messageIndex - 1];
  if (!userMsg || userMsg.role !== 'user') return;
  // Replace the assistant message with streaming
  const newMessages = [...messages];
  newMessages[messageIndex] = { role: 'assistant', content: '' };
  setMessages(newMessages);
  setStreamingContent('');
  setIsStreaming(true);
  // ... stream logic similar to handleSendMessage but updating messageIndex
};

const handleFeedback = async (messageIndex, feedback) => {
  await chatAPI.setFeedback(currentSessionId, messageIndex, feedback);
  queryClient.invalidateQueries({ queryKey: QA_KEYS.feedbacks(currentSessionId) });
};
```

- [ ] **Step 4: Wire props to MessageBubble**

Update the MessageBubble rendering in QAPage:

```jsx
messages.map((m, i) => (
  <MessageBubble
    key={i}
    message={m}
    feedback={feedbackMap[i]}
    onCopy={() => {}}
    onRetry={() => handleRetry(i)}
    onFeedback={(fb) => handleFeedback(i, fb)}
    onCitationClick={(idx) => handleCitationClick(idx)}
  />
))
```

- [ ] **Step 5: Add image attachment state and input UI**

```javascript
const [attachedFiles, setAttachedFiles] = useState([]);
const fileInputRef = useRef(null);

const handleFileSelect = (e) => {
  const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
  setAttachedFiles(prev => [...prev, ...files]);
};

const removeFile = (index) => {
  setAttachedFiles(prev => prev.filter((_, i) => i !== index));
};
```

Update `handleSendMessage` to use `chatAPI.queryStreamWithFiles` when `attachedFiles.length > 0`.

- [ ] **Step 6: Run all tests and build**

Run: `cd frontend && npx vitest run && npx vite build`
Expected: All tests pass, build succeeds

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/QAPage.jsx frontend/src/features/QA/hooks/useQA.js
git commit -m "feat(frontend): integrate feedback, retry, citation click, and image attachments"
```

---

### Task 8: Frontend -- GraphInsightPanel Highlight

**Files:**
- Modify: `frontend/src/features/QA/components/GraphInsightPanel.jsx`
- Modify: `frontend/src/pages/QAPage.jsx`

- [ ] **Step 1: Add highlightedNodes prop to GraphInsightPanel**

Add `highlightedNodes` and `onNodeHighlightClear` props. In the vis-network initialization area, add logic to highlight nodes:

```javascript
// After networkRef.current is created:
useEffect(() => {
  if (!networkRef.current || !highlightedNodes?.length) return;
  networkRef.current.selectNodes(highlightedNodes);
  if (highlightedNodes.length > 0) {
    networkRef.current.focus(highlightedNodes[0], { scale: 1.3, animation: true });
  }
}, [highlightedNodes]);
```

- [ ] **Step 2: Add citation click handler in QAPage**

```javascript
const handleCitationClick = (citationIndex) => {
  // Find the citation with this index from the current message
  // Map citation chunk_id to graph node id
  // Call networkRef to focus and select
};
```

- [ ] **Step 3: Run all tests and build**

Run: `cd frontend && npx vitest run && npx vite build`
Expected: All tests pass, build succeeds

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/QA/components/GraphInsightPanel.jsx frontend/src/pages/QAPage.jsx
git commit -m "feat(frontend): add graph node highlight on citation click"
```

---

### Task 9: Fix Duplicate Rendering Bug & Final Verification

**Files:**
- Modify: `frontend/src/pages/QAPage.jsx`

- [ ] **Step 1: Fix the duplicate messages.map bug**

In `QAPage.jsx`, remove the duplicate `messages.map` that renders MessageBubble twice (around line 395-397).

- [ ] **Step 2: Run full test suite**

Run:
```bash
cd backend && python -m pytest tests/ -x -q
cd frontend && npx vitest run
cd frontend && npx vite build
```
Expected: All backend tests pass, all frontend tests pass, build succeeds

- [ ] **Step 3: Final commit**

```bash
git add frontend/src/pages/QAPage.jsx
git commit -m "fix(frontend): remove duplicate message rendering in QAPage"
```
