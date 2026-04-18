# OpenMelon - React Frontend

基于 React 18 + MUI (Material-UI) 的智能文档问答系统前端。

## 技术栈

| 技术 | 版本 | 用途 |
|-----|------|------|
| React | 18.x | 核心框架 |
| MUI (Material-UI) | 5.x | UI 组件库 |
| vis-network | 9.x | 图谱可视化 |
| markmap | 0.18.x | 思维导图 |
| react-markdown | 10.x | Markdown 渲染 |
| Vite | 5.x | 构建工具 |

## 项目结构

```
src/
├── components/           # 通用组件
│   ├── ConfirmDialog.jsx # 确认弹窗
│   ├── StatusBadge.jsx   # 状态标签
│   ├── PageHeader.jsx    # 页面标题栏
│   ├── LoadingOverlay.jsx# 加载遮罩
│   ├── ThreeStageOutput.jsx # 三阶段输出
│   ├── TestCaseListView.jsx # 用例列表视图
│   ├── TestCaseMindMap.jsx  # 用例思维导图
│   ├── ErrorBoundary.jsx # 错误边界
│   └── SnackbarProvider.jsx # 消息提示
├── pages/                # 页面组件
│   ├── QAPage.jsx        # 问答页
│   ├── GraphPage.jsx     # 图谱总览
│   ├── SettingsPage.jsx  # 设置模块
│   ├── NodeTypeConfigPage.jsx # 节点类型配置
│   ├── ManagePage.jsx    # 导入管理
│   ├── TestCasePage.jsx  # 测试用例生成
│   ├── CoveragePage.jsx  # 覆盖率视图
│   └── MarkMapPage.jsx   # 思维导图
├── hooks/                # 自定义 Hooks
│   └── useSession.js     # 会话管理
├── services/             # API 服务
│   └── api.js            # 接口封装
├── utils/                # 工具函数
│   └── parseTestCases.js # 用例解析
├── styles/               # 样式文件
│   └── variables.css     # CSS 变量
├── theme/                # 主题配置
│   └── index.js          # MUI 主题
├── App.jsx               # 根组件
├── main.jsx              # 入口文件
└── index.css             # 全局样式
```

## 开发命令

```bash
# 安装依赖
npm install

# 开发模式 (http://localhost:3000)
npm run dev

# 构建生产版本
npm run build

# 预览构建结果
npm run preview

# 代码检查
npm run lint
```

## 页面功能

### 问答页 (QAPage)
- 会话管理（新建、切换、删除）
- 消息列表（支持 Markdown 渲染）
- 图谱可���化（右侧面板，可收起）
- 推理步骤展开
- 企业微信推送

### 图谱总览 (GraphPage)
- 实体搜索
- 类型/模块筛选
- 分块显示开关
- 节点详情面板

### 设置 (SettingsPage)
- 配置项目录导航
- 当前已接入节点类型配置

### 节点类型配置 (NodeTypeConfigPage)
- 服务端类型管理（新增 / 编辑 / 删除，写回 `backend/config/node_types.json`）
- 前端样式调整（颜色/尺寸覆盖，保存到 `localStorage`）
- 约束限制提示（保留类型、fallback 唯一、fixed 类型重启要求）
- 卡片视图 / 表格视图切换

### 导入管理 (ManagePage)
- 文件拖拽上传
- 单文件/文件夹模式切换
- 上传进度显示
- 文件列表（分页、筛选、搜索）
- 批量删除、重新索引
- 测试用例生成入口

### 测试用例生成 (TestCasePage)
- 文件生成模式
- 文本描述模式
- 三阶段输出（需求分析 -> 用例生成 -> 用例评审）
- 列表/思维导图视图
- 导出 Excel
- 存入向量库
- 模块选择（下拉选择或手动输入）

### 覆盖率视图 (CoveragePage)
- 模块覆盖率表格
- 进度条可视化
- 统计汇总

### 思维导图 (MarkMapPage)
- Markdown 编辑
- 实时预览

## 组件设计

### 通用组件

| 组件 | 说明 |
|-----|------|
| ConfirmDialog | MUI Dialog 封装的确认弹窗 |
| StatusBadge | 文件状态标签（已索引/失败/重新索引中） |
| PageHeader | 页面标题栏（统一风格） |
| LoadingOverlay | 全屏加载遮罩 |

### 设计规范

项目使用 CSS 变量统一管理设计规范：

```css
/* 颜色 */
--color-primary: #1a73e8;
--color-success: #1e8e3e;
--color-warning: #e37400;
--color-danger: #d93025;

/* 间距 */
--spacing-xs: 4px;
--spacing-sm: 8px;
--spacing-md: 12px;
--spacing-lg: 16px;

/* 圆角 */
--radius-sm: 4px;
--radius-md: 6px;
--radius-lg: 8px;
```

## API 接口

```javascript
// 图谱相关
graphAPI.searchEntity(name)
graphAPI.getFullGraph(params)
graphAPI.getNodeDetail(nodeId)
graphAPI.getFilters()
graphAPI.getNodeTypes()
graphAPI.createNodeType(payload)
graphAPI.updateNodeType(nodeType, payload)
graphAPI.deleteNodeType(nodeType)
graphAPI.getCoverage()

// 文件管理
fileAPI.list()
fileAPI.delete(recordId)
fileAPI.reindex(recordId)

// 问答
chatAPI.query(message, sessionId)
chatAPI.getSessions()
chatAPI.getHistory(sessionId)
chatAPI.deleteSession(sessionId)

// 上传
uploadAPI.uploadAsync(files, docType, module)
uploadAPI.getStatus(taskId)

// 测试用例
testCaseAPI.generateFromFile(file, context, requirements, module)
testCaseAPI.generateFromContext(context, requirements, module)
testCaseAPI.exportToExcel(testCases)

// 向量库
vectorAPI.checkStatus()
vectorAPI.storeTestCases(markdown, module)
```

## MUI 图标使用

项目使用以下 MUI 图标：

- `Delete`, `Refresh`, `AddTask`, `Close` - 操作图标
- `Edit`, `Visibility` - 编辑/查看切换
- `ZoomIn`, `ZoomOut`, `FitScreen`, `Download`, `Fullscreen`, `FullscreenExit` - 导图控制
- `ChevronLeft`, `ChevronRight`, `ExpandMore`, `ExpandLess` - 展开/收起

## 构建产物

构建后产物位于 `dist/` 目录，由��端 FastAPI 服务静态托管。

```bash
npm run build
# 输出:
# dist/index.html
# dist/assets/index-*.css
# dist/assets/index-*.js
# dist/assets/mui-*.js
# dist/assets/vis-*.js
# dist/assets/markmap-*.js
```

## API 代理

开发环境通过 Vite 代理访问后端 API (`http://localhost:8000`)。
