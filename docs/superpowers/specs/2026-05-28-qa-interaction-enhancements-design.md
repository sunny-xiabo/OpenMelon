# Q&A 界面交互增强设计

日期: 2026-05-28
状态: 待审批

## 概述

增强 OpenMelon 智能问答页面的三个交互维度：消息级操作、引用溯源图谱高亮、图片多模态查询。

## 一、消息级操作

### 功能

- **复制**：点击"复制"按钮，将 AI 回答全文写入剪贴板。纯前端，无后端改动。
- **重试**：点击"重试"按钮，用原始问题重新发送流式查询，新回答替换原消息（不追加新消息）。
- **反馈（点赞/踩）**：每条 AI 回答支持 up/down/none 三种状态，持久化到 PostgreSQL。再次点击同一按钮取消反馈。

### 交互

- 操作栏默认隐藏，hover 消息气泡时淡入显示在气泡底部。
- 反馈按钮点击后高亮（绿色/红色），再次点击取消。
- 复制成功后按钮文字短暂变为"已复制"。

### 后端改动

新增 PostgreSQL 表 `qa_feedback`：

```sql
CREATE TABLE IF NOT EXISTS qa_feedback (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    message_index INTEGER NOT NULL,
    feedback TEXT NOT NULL CHECK (feedback IN ('up', 'down')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(session_id, message_index)
);
```

新增端点：

- `POST /api/query/feedback` -- 设置/取消反馈
  - 请求: `{session_id, message_index, feedback: "up"|"down"|null}`
  - feedback 为 null 时删除记录（取消反馈）
- `GET /api/query/feedback/{session_id}` -- 获取会话所有反馈
  - 响应: `{feedbacks: [{message_index, feedback}]}`

历史消息加载时，`useChatHistory` hook 额外拉取 feedback 数据，合并到 messages state 中。

### 前端改动

- **MessageBubble**：新增 `onCopy`、`onRetry`、`onFeedback` 回调 props。assistant 气泡底部渲染操作栏。
- **QAPage**：维护 feedback state，传递回调给 MessageBubble。重试时调用 `handleSendMessage(originalQuestion)` 并替换对应消息。
- **chat.js**：新增 `chatAPI.setFeedback()` 和 `chatAPI.getFeedback(sessionId)`。

## 二、引用溯源图谱高亮

### 功能

AI 回答中出现的 `[1][2][3]` 引用标记可点击，点击后图谱面板中对应节点高亮并聚焦。

### 数据流

1. 后端 RAG Generator 的 prompt 要求 LLM 在回答中使用 `[N]` 引用标记对应 context_chunks
2. 后端 response 中 `citations` 数组包含 `{index, filename, source_type, chunk_id, content_preview}` 字段
3. 前端 MessageBubble 渲染时将 `[N]` 替换为蓝色可点击上标
4. 点击上标触发 `onCitationClick(citation)` 事件
5. QAPage 将事件转发给 GraphInsightPanel
6. GraphInsightPanel 在 vis-network 中高亮对应节点（selectNodes + focus + 脉冲动画）

### 后端改动

- **RAG Generator** (`generator.py`)：`build_prompt` 的 system message 中增加引用格式要求："在回答中使用 [1], [2], [3] 标记引用来源，编号对应 context 中的顺序"。
- **QueryResponse schema**：`citations` 数组增加 `index: int` 和 `content_preview: str` 字段。
- **流式端点**：`POST /query/stream` 流式返回纯文本，citations 在流结束后通过 session history 获取（或新增 metadata 端点）。
- **新增 `GET /api/query/citations/{session_id}`**：返回最近一条 assistant 消息的 citations 列表（带 index 和 chunk_id）。

### 前端改动

- **MessageBubble**：assistant 气泡的 markdown 渲染增加自定义组件，将 `[N]` 文本替换为 `<sup>` 可点击元素。
- **GraphInsightPanel**：新增 `highlightedNodes` prop，接收 chunk_id 列表。vis-network 渲染时对匹配节点添加高亮样式和脉冲动画。
- **QAPage**：新增 `citationClick` handler，调用 `network.focus(nodeId)` + `network.selectNodes([nodeId])`。
- **流式回答**：流式过程中不显示引用（因为 citations 尚未确定），流结束后获取 citations 并追加到消息。

## 三、图片多模态查询

### 功能

用户可在提问时附加一张或多张图片，后端用 vision 模型分析图片内容后与问题一起走 RAG 流程。

### 前端改动

- **输入区域**：输入框左侧新增附件按钮（图标），点击打开文件选择器（仅 `.png/.jpg/.jpeg/.gif/.webp`）。
- **预览**：选中图片后在输入框上方显示缩略图（64x64）、文件名、大小、移除按钮。支持拖拽图片到输入区域。
- **发送**：使用 `FormData` 发送，字段 `question`（文本）+ `files`（图片文件列表），替代当前的 JSON body。
- **状态管理**：`QAPage` 新增 `attachedFiles` state，管理附件列表。

### 后端改动

- **`POST /api/query/stream`**：改为同时接受 `application/json` 和 `multipart/form-data`。
  - JSON 格式：现有行为不变。
  - Form-data 格式：`question` 字段为文本，`files` 字段为上传的图片。
- **图片处理流程**：
  1. 接收图片文件，保存到临时目录
  2. 使用 vision 模型（`get_model_config(use_vision=True)`）生成图片内容描述
  3. 将描述拼接到 RAG context 中
  4. 正常走意图识别 -> 检索 -> 生成流程
- **复用**：复用 testcase_gen 的 `get_model_client(use_vision=True)` 获取 vision 客户端。

## 涉及文件

### 后端

| 文件 | 改动 |
|------|------|
| `backend/app/api/routers/query.py` | 新增 feedback 端点、citations 端点、multipart 支持 |
| `backend/app/api/schemas.py` | 新增 FeedbackRequest、更新 Citation schema |
| `backend/app/engine/rag/generator.py` | prompt 增加引用格式要求 |
| `backend/app/storage/postgres_store.py` | 新增 qa_feedback 表操作 |

### 前端

| 文件 | 改动 |
|------|------|
| `frontend/src/features/QA/components/MessageBubble.jsx` | 操作栏、引用标记渲染 |
| `frontend/src/features/QA/components/GraphInsightPanel.jsx` | 节点高亮 prop 和动画 |
| `frontend/src/pages/QAPage.jsx` | feedback state、重试逻辑、附件管理、citation 事件转发 |
| `frontend/src/api/chat.js` | 新增 feedback、citations API |
| `frontend/src/api/client.js` | fetchFormData 辅助函数 |

## 验证

- **后端回归**：`pytest tests/` 全部通过
- **前端回归**：`vitest run` 全部通过
- **前端构建**：`vite build` 通过
- **手动验证**：
  - 复制按钮写入剪贴板
  - 重试替换原消息
  - 点赞/踩持久化，刷新后保持
  - 引用上标可点击，图谱节点高亮
  - 图片附件发送后 vision 模型分析
