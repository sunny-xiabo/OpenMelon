# OpenMelon 全链路自动化架构设计方案

> **版本**: v1.0  
> **创建时间**: 2026-05-09  
> **设计范围**: 测试用例生成 → API 自动化 → UI 自动化 → 数据仪表盘

---

## 一、核心设计理念：统一资产驱动（UAD）

将整个系统的核心抽象为一个**"测试资产（Test Asset）"**的生命周期模型：

```
[知识图谱] → [TestCase 生成] → [分发到执行引擎] → [汇聚到仪表盘]
```

**关键原则**：
- 一份 `TestCase` 是**唯一的源头资产**，它在被创建后，可以被"订阅"到一个或多个执行引擎（API Runner / UI Runner）
- 执行引擎产生的 `ExecutionResult` 携带 `case_id` 回传，仪表盘通过 `case_id` 做统一聚合
- 数据流是**单向的**：生成 → 执行 → 上报，不倒流

---

## 二、数据模型设计（全量 Schema）

### 2.1 核心实体图

```
TestModule (业务模块/目录树)
    └── TestCase (抽象用例 - 唯一源头资产)
            ├── [1..N] APITestExecution  (API 引擎执行实例)
            │           └── APIStepResult (各接口步骤结果)
            └── [1..N] UITestExecution   (UI 引擎执行实例，后期扩展)
                        └── UIStepResult  (各 UI 步骤截图/日志)
```

### 2.2 `test_modules` (业务模块目录树)

```sql
CREATE TABLE IF NOT EXISTS test_modules (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,          -- 如"支付链路", "登录回归"
    parent_id   TEXT,                   -- NULL 表示根目录，支持无限层级
    icon        TEXT,                   -- 前端显示用的图标标识符
    sort_order  INTEGER DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    FOREIGN KEY (parent_id) REFERENCES test_modules(id)
);
```

### 2.3 `test_cases` (抽象用例 - 链路核心)

```sql
CREATE TABLE IF NOT EXISTS test_cases (
    id              TEXT PRIMARY KEY,
    module_id       TEXT NOT NULL,
    name            TEXT NOT NULL,
    priority        TEXT DEFAULT 'P2',     -- P0/P1/P2/P3
    type            TEXT DEFAULT 'API',    -- API_ONLY, UI_ONLY, E2E_MIXED
    source          TEXT DEFAULT 'manual', -- manual(手动) | ai_generated(AI生成) | imported(导入)
    source_module   TEXT,                  -- AI生成时的来源业务模块名
    description     TEXT,                  -- 用例描述（来自 TestCasePage 的 parsed case）
    preconditions   TEXT,                  -- 前置条件
    steps_text      TEXT,                  -- 原始的测试步骤文本（Markdown格式，来自AI生成）
    api_dsl         TEXT,                  -- API 执行用的 JSON DSL (NULL = 尚未编排)
    ui_script       TEXT,                  -- UI 执行用的脚本 (NULL = 尚未录制/编写)
    tags            TEXT,                  -- JSON 数组字符串，如 '["smoke","regression"]'
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    FOREIGN KEY (module_id) REFERENCES test_modules(id)
);
```

> **关键字段说明**：
> - `source = 'ai_generated'`：表明该用例来自"测试用例生成"模块，并携带 `steps_text`（AI 生成的文字步骤）
> - `api_dsl`：当用户在 API 自动化页面为该用例"补全编排"后填入，NULL 表示待编排
> - `ui_script`：UI 自动化完成后填入，NULL 表示未对接

### 2.4 `test_executions` (统一执行记录 - 链路枢纽)

```sql
CREATE TABLE IF NOT EXISTS test_executions (
    id              TEXT PRIMARY KEY,
    case_id         TEXT NOT NULL,         -- 关联的 test_cases.id
    engine          TEXT NOT NULL,         -- 'api' | 'ui'
    environment     TEXT,                  -- 执行环境标识, 如 'qa', 'staging', 'prod'
    status          TEXT NOT NULL,         -- passed | failed | error | running | queued
    triggered_by    TEXT DEFAULT 'manual', -- manual | schedule | ci
    duration_ms     INTEGER,               -- 执行耗时（毫秒）
    report_data     TEXT,                  -- 完整的执行报告 JSON
    failure_reason  TEXT,                  -- 失败原因摘要（用于仪表盘快速诊断）
    executed_at     TEXT NOT NULL,
    FOREIGN KEY (case_id) REFERENCES test_cases(id)
);
```

---

## 三、链路打通方案：三条数据管道

### 管道一：TestCase 生成 → API 自动化

**当前问题**：`TestCasePage` 生成的 Markdown 用例（`parsedTestCases`）存入了 Vector Store，但与 API 自动化页面完全脱节。

**打通方案**：
1. **新增"发送到 API 自动化"按钮**（位于 `TestCasePage` 的用例列表操作区）
2. 点击后，弹出"选择目标模块"对话框，选择 `test_modules` 树中的目标目录
3. 后端将 `parsedTestCase` 结构（名称、优先级、描述、步骤文本）写入 `test_cases` 表，`source='ai_generated'`, `api_dsl=NULL`
4. **用户在 API 自动化页面**打开该用例时，看到用例的步骤描述（`steps_text`），可以：
   - 一键触发 AI 将步骤文本转化成 API DSL (`POST /ai/generate-dsl-from-steps`)
   - 手动编写 DSL
   - 运行完成后 DSL 自动保存到 `test_cases.api_dsl`

```
TestCasePage            test_cases 表           API自动化页面
    │                        │                       │
    │ ① 发送到API自动化       │                       │
    │ (携带步骤文本)          │                       │
    ├──── INSERT ───────────>│                       │
    │                        │ ② 打开用例             │
    │                        │<──── READ ────────────┤
    │                        │                       │ ③ AI 根据步骤文本补全 DSL
    │                        │                       ├── AI GENERATE ──>
    │                        │ ④ 保存编排好的 DSL     │
    │                        │<──── UPDATE ──────────┤
    │                        │                       │ ⑤ 执行并写入 test_executions
    │                        │<──── INSERT ──────────┤
```

### 管道二：TestCase 生成 → UI 自动化（后期规划）

**打通方案**（与 API 管道对称）：
1. `test_cases` 表已预留 `ui_script` 字段，与 API 模式完全对称
2. 未来 UI 录制引擎（Playwright/Selenium）生成的脚本写入 `test_cases.ui_script`
3. 执行结果写入 `test_executions`，`engine='ui'`

### 管道三：执行结果 → 数据仪表盘

**这是最关键的汇聚管道**。仪表盘通过 `test_executions` 表可以做到：

| 统计维度 | SQL 语句（概念） |
|----------|-----------------|
| 模块通过率 | `GROUP BY module_id, status` |
| API vs UI 健康度对比 | `GROUP BY engine, status` |
| 环境质量对比 | `GROUP BY environment, status` |
| 用例趋势图（最近N次） | `ORDER BY executed_at DESC LIMIT N` |
| 高失败率用例TOP10 | `WHERE status='failed' GROUP BY case_id ORDER BY count DESC` |

---

## 四、前端页面架构变更

### 4.1 TestCasePage 新增组件

新增 `SendToAutomationDialog`：
- 支持选择目标业务模块（树形选择器）
- 支持批量发送（当前页面上所有筛选后的用例）
- 区分发送到 API 或 UI 自动化（通过 type 字段）

### 4.2 API 自动化页面重构（IDE 布局）

```
┌────────────────────────────────────────────────────────────────┐
│ 顶部导航（深色锚点）                                             │
├────────────────────────────────────────────────────────────────┤
│ ┌─── 左侧资源树(280px) ─┐  ┌────── 右侧工作区 ─────────────────┐│
│ │ 📁 支付链路回归        │  │ [接口挑选] [编排断言] [执行历史]   ││
│ │   ✅ 正向支付用例       │  │                                   ││
│ │   ❌ 余额不足场景       │  │  ← 当前打开的用例详情             ││
│ │ 📁 登录模块             │  │     (Tab 1: 用例基本信息/步骤)    ││
│ │   📄 未命名草稿 *       │  │     (Tab 2: API DSL 编排器)       ││
│ └────────────────────────┘  │     (Tab 3: 执行历史与报告)       ││
│                              └───────────────────────────────────┘│
└────────────────────────────────────────────────────────────────┘
```

### 4.3 数据仪表盘新增 Tab

在 `DashboardPage` 的左侧菜单中，新增以下子视图：
- **覆盖率视图**（已有）
- **API 执行概览**：展示 API 引擎的通过率趋势、模块健康度热图
- **UI 执行概览**：展示 UI 引擎的结果（后期）
- **全链路对比视图**：同一用例在 API 与 UI 双引擎的执行状态对比

---

## 五、与当前 API 自动化模块的兼容性分析

> 本章节评估新架构方案与现有 `APIExecutionPage` 及后端代码的真实差距，确保迁移路径可落地。

### 5.1 现状盘点（当前代码结构）

| 层面 | 当前现状 | 新计划要求 | 差距评估 |
|------|---------|-----------|---------|
| **数据库** | `runs` 表存执行记录（已有 `case_id` 占位字段），`automation_definitions` 只有一个 `data` JSON blob | `test_cases` 需要独立结构化字段（优先级、步骤文本、DSL 来源） | ⚠️ 需新建三张表，不能直接复用 |
| **前端状态** | 所有状态存于 React Context，页面关闭即丢失，无持久化 | 用例保存到 DB，可随时打开回放 | ⚠️ 需增加保存/加载逻辑 |
| **UI 布局** | 4步线性向导，状态是临时的 | IDE 左树右工作区，用例是持久资产 | ⚠️ 容器需重构 |
| **执行历史** | `runs` 表已有完整记录，字段基本完整 | `test_executions` 通过 `case_id` 与具名用例关联 | ✅ 只需迁移关联逻辑，数据结构兼容 |
| **执行引擎** | `runner.py`、`run_queue.py`、`routers.py` 执行逻辑完整 | 无需改动，只需在执行时写入 `case_id` | ✅ 完全可复用 |
| **步骤组件** | `StepImport`、`StepScope`、`StepOrchestrate`、`StepResult` 内部逻辑稳定 | 从"向导页面"变成"用例详情的 Tab"，内部逻辑不变 | ✅ 核心业务逻辑 100% 可复用 |

### 5.2 关键结论

> **执行引擎和所有步骤组件完全不需要改动。**  
> 我们只是把它们从"一次性向导的页面"移入"用例资产的详情视图"，如同把活动板房的内部装修搬入永久建筑——水电不动，只换外壳。

---

## 六、平滑迁移策略（三阶段演进）

为避免对现有功能造成破坏性变更，采用**渐进式演进**，用户体验平滑过渡：

### 第一阶段：存储层奠基（无 UI 变更）

**目标**：建好"地基"，让现有向导可以选择将结果持久化。

```
当前向导（不变）+ 新增"保存为用例"按钮
    │
    └── 点击保存 → 写入 test_cases 表（api_dsl = 当前 dslText）
                  → 成功后 Snackbar 提示"已保存到用例库"
```

- 新建 `test_modules`、`test_cases`、`test_executions` 三张表
- 暴露 `POST /test-cases`、`GET /test-modules` 接口
- 向导页右上角增加 **"保存为用例"** 按钮（不影响现有操作流程）

### 第二阶段：用例树 UI（向导体验完整保留）

**目标**：引入左侧资源树，点击用例可恢复向导状态（回填 Context）。

```
左侧树（新增）          右侧区域（现有向导原封不动）
    │                        │
    │ 点击已保存用例          │
    └──── 加载 DSL ─────────>│ dslText 回填 → 向导跳到 Step 2
                              │ 用户继续编辑/重新执行
```

- 现有 4 步向导不变，只是新增"加载已有用例"的入口
- 执行时自动将 `case_id` 带入执行请求，结果写入 `test_executions`

### 第三阶段：全 IDE 布局（完整形态）

**目标**：将向导步骤正式迁移为用例详情的 Tabs，完成最终形态。

```
┌── 左侧资源树 ──┐  ┌── 右侧工作区（Tab 布局）──────────────────────┐
│ 📁 支付链路    │  │ [接口挑选] [编排与断言] [执行历史]              │
│   ✅ 正向用例  │  │                                               │
│   ❌ 余额不足  │  │  原 Step0+1 → Tab "接口挑选"                  │
│ 📄 未命名草稿* │  │  原 Step2   → Tab "编排与断言"                  │
└───────────────┘  │  原 Step3   → Tab "执行历史与报告"              │
                   └───────────────────────────────────────────────┘
```

---

## 七、实施阶段分解（更新版）

### Phase 1: 数据层建设（基础必做）
- [ ] 扩展 `sqlite_store.py`：新建 `test_modules`, `test_cases`, `test_executions` 三张表
- [ ] 扩展 `routers.py`：CRUD 接口（模块树、用例读写、执行记录查询）

### Phase 2: 向导层持久化接入（第一阶段演进）
- [ ] `APIExecutionPage` 右上角新增"保存为用例"按钮
- [ ] 执行时自动写入 `test_executions`（携带 `case_id`，无 case 时写 `NULL`）

### Phase 3: 生成器 → 用例库打通
- [ ] `TestCasePage` 新增"发送到自动化"按钮 + `SendToAutomationDialog` 组件
- [ ] 后端实现 `POST /test-cases/batch-import-from-generation`
- [ ] 新增 AI DSL 生成接口（输入：`steps_text`，输出：API DSL JSON）

### Phase 4: 左侧用例树 UI（第二阶段演进）
- [ ] `APIExecutionPage` 增加左侧树形用例浏览器
- [ ] 点击用例时将 DSL 回填至 Context，支持向导继续操作

### Phase 5: 仪表盘数据接入
- [ ] 实现 `GET /dashboard/summary` 聚合接口（按模块/引擎/环境分组）
- [ ] 仪表盘新增 API 执行概览 Tab

### Phase 6: 全 IDE 布局重构（第三阶段演进）
- [ ] 将 4 步向导组件正式迁移为用例详情的 Tab 容器

### Phase 7: UI 自动化对接（后期）
- [ ] UI 引擎执行结果写入 `test_executions`（`engine='ui'`）
- [ ] 仪表盘新增 UI 执行概览 + 全链路对比 Tab
