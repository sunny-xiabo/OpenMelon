# 全链路自动化：用例库架构与实施方案

基于“后期生成的用例可以跟 API 和 UI 链路打通”的战略视角，我们必须在底层数据模型上进行前瞻性设计。

## 💡 架构决策 (Architectural Decisions)

### 1. 跨项目聚合的“场景驱动模型”
为了实现全链路打通，**用例（Test Case）绝对不能与单一的 Project（项目）强绑定**。
真实的业务链路往往是跨系统的（例如：调用订单后台服务 API 造数据 -> 驱动商城前端 UI 下单 -> 检查履约中心后台 API 状态）。
- **决策**：引入 **`BusinessModule` (业务模块/目录)** 作为最高组织单元。一个 TestCase 挂载在 Module 下。
- **扩展性**：TestCase 内部分为多个 Step，每个 Step 可以独立指定它执行的引擎类型（API 引擎 或 UI 引擎）以及目标 Project。

### 2. 界面设计：Postman 风格的 IDE 布局
- **决策**：全面转向【左树右工作区】的现代 IDE 布局。
- **兼容临时调试**：对于原本向导式的“随手测”，我们会在右侧默认打开一个名为 **“未命名 (Untitled)”** 的草稿用例。用户依然可以像以前一样快速挑接口、写断言并运行。运行满意后，点击“保存”即可将草稿持久化到左侧的模块树中。

---

## 🛠️ 后端数据层变更计划 (Backend DB Schema)

现有的 `sqlite_store.py` 需要扩展以下三张核心表：

### 1. `test_modules` (用例目录树)
用于在左侧建立无限层级的文件夹结构。
- `id`: UUID
- `name`: 模块/目录名称 (e.g., "支付链路回归")
- `parent_id`: 父节点 ID (支持多级树状结构)
- `created_at` / `updated_at`

### 2. `test_cases` (自动化用例)
- `id`: UUID
- `module_id`: 归属的模块 ID
- `name`: 用例名称
- `type`: 用例类型 (枚举：`API_ONLY`, `UI_ONLY`, `E2E_MIXED`)
- `dsl_content`: 完整的编排 JSON 文本（后续可无缝增加 UI 操作的 DSL）
- `created_at` / `updated_at`

### 3. `case_execution_history` (执行报告持久化)
- `id`: UUID
- `case_id`: 关联的用例 ID
- `run_status`: 状态 (`passed`, `failed`, `error`)
- `report_data`: 详细的执行日志 JSON
- `executed_at`: 运行时间
- **打通仪表盘**：仪表盘可以直接 `GROUP BY module_id` 统计不同业务模块的自动化覆盖与健康度。

---

## 🏃 实施步骤 (Next Actions)

为保证您的环境稳定，建议分阶段交付：

**Phase 1: 核心存储层重构**
1. 修改 `backend/app/api_execution/sqlite_store.py`，新建并初始化上述三张表。
2. 暴露 `CRUD` 接口 (`routers.py`)：拉取模块树、保存用例、读取用例。

**Phase 2: UI 容器重构**
1. 将现存的 `APIExecutionPage` 改造为【分屏布局】。
2. 引入 `TreeItem` 组件渲染左侧模块树。

**Phase 3: 上下文数据对接**
1. 将右侧编辑器与新暴露的保存接口打通。
