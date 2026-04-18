# 前端迁移完成报告

## 迁移概述

前端已从原生 JS 成功迁移至 React 18 + MUI (Material-UI)。

## 技术栈

| 技术 | 版本 | 用途 |
|-----|------|------|
| React | 18.x | 核心框架 |
| MUI (Material-UI) | 5.x | UI 组件库 |
| vis-network | 9.x | 图谱可视化 |
| markmap | 0.18.x | 思维导图 |
| react-markdown | 10.x | Markdown 渲染 |
| Vite | 5.x | 构建工具 |

## 已完成功能

### 页面组件
- [x] QAPage - 问答页（会话管理、图谱可视化、企业推送）
- [x] GraphPage - 图谱总览（实体搜索、筛选、节点详情）
- [x] ManagePage - 导入管理（文件上传、列表管理、批量操作）
- [x] TestCasePage - 测试用例生成（文件/文本模式、三阶段输出）
- [x] CoveragePage - 覆盖率视图（表格、进度条）
- [x] MarkMapPage - 思维导图（Markdown 编辑、实时预览）

### 通用组件
- [x] ConfirmDialog - 确认弹窗
- [x] StatusBadge - 状态标签
- [x] PageHeader - 页面标题栏
- [x] LoadingOverlay - 加载遮罩
- [x] ThreeStageOutput - 三阶段输出
- [x] TestCaseListView - 用例列表视图
- [x] TestCaseMindMap - 用例思维导图
- [x] ErrorBoundary - 错误边界
- [x] SnackbarProvider - 消息提示

### 设计规范
- [x] CSS 变量系统（颜色、间距、圆角）
- [x] MUI 主题配置
- [x] 统一组件样式

## MUI 组件使用

| MUI 组件 | 使用页面 |
|---------|---------|
| Button | 全部页面 |
| TextField | 全部页面 |
| Select | QAPage, GraphPage, ManagePage |
| Table | ManagePage, CoveragePage |
| Dialog | ManagePage, TestCasePage |
| Chip | 全部页面 |
| IconButton | 全部页面 |
| Tooltip | 全部页面 |
| Paper | 全部页面 |
| Box, Typography | 全部页面 |
| Autocomplete | TestCasePage |
| LinearProgress | ManagePage, CoveragePage, ThreeStageOutput |
| Collapse | ThreeStageOutput |
| AppBar, Toolbar | App.jsx |

## 构建产物

```
dist/
├── index.html           # 入口 HTML
├── assets/
│   ├── index-*.css      # 样式 (3.41 KB)
│   ├── index-*.js       # 主代码 (58 KB)
│   ├── mui-*.js         # MUI 组件 (442 KB)
│   ├── vis-*.js         # 图谱可视化 (498 KB)
│   └── markmap-*.js     # 思维导图 (652 KB)
```

## API 对接

| 功能 | API | 页面 |
|-----|-----|------|
| 搜索图谱 | `GET /api/graph/entity/{name}` | GraphPage |
| 全图加载 | `GET /api/graph/full` | GraphPage, QAPage |
| 节点详情 | `GET /api/graph/node/{id}` | GraphPage |
| 筛选条件 | `GET /api/graph/filters` | GraphPage, QAPage, TestCasePage |
| 覆盖率 | `GET /api/graph/coverage` | CoveragePage |
| 文件列表 | `GET /api/manage/files` | ManagePage |
| 文件删除 | `DELETE /api/manage/files/{id}` | ManagePage |
| 文件重索引 | `POST /api/manage/files/{id}/reindex` | ManagePage |
| 文件上传 | `POST /api/upload/async` | ManagePage |
| 上传状态 | `GET /api/upload/status/{id}` | ManagePage |
| 问答 | `POST /api/query` | QAPage |
| 会话列表 | `GET /api/sessions` | QAPage |
| 会话历史 | `GET /api/history/{id}` | QAPage |
| 用例生成(文件) | `POST /api/test-cases/generate` | TestCasePage |
| 用例生成(文本) | `POST /api/test-cases/generate-from-context` | TestCasePage |
| 导出Excel | `POST /api/test-cases/export` | TestCasePage |
| 向量库状态 | `GET /api/test-cases/vector/status` | TestCasePage |
| 存入向量库 | `POST /api/test-cases/store-vector` | TestCasePage |
| 企业推送 | `POST /api/webhook/{platform}` | QAPage |

## 开发命令

```bash
# 开发模式
npm run dev

# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

## 迁移���益

1. **代码规范**: 统一使用 MUI 组件，告别手写 CSS
2. **体积优化**: CSS 从 24KB 减少到 3.4KB
3. **可维护性**: 组件化设计，通用组件复用
4. **设计一致**: CSS 变量 + MUI 主题统一管理
5. **开发效率**: MUI 组件开箱即用，减少重复代码
