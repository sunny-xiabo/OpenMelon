# API Flow Orchestration 路线图

## 目标与原则

将 API 自动化第 3 步从“JSON 脚本编辑 + 执行按钮”升级为“流程编排工作台”。第一版不引入复杂画布，先做列表式业务链路编排：用户可以调整步骤顺序、配置步骤参数、断言、变量提取、依赖关系，并继续复用现有 `APITestCaseDsl` 执行引擎。

设计原则：

- 优先复用现有 `APITestCaseDsl`，避免 DSL 分叉。
- 先做好列表式流程编排，再引入拖拽和可视化画布。
- 用户在表单工作台中完成主流程，高级 JSON 仅作为兜底编辑入口。
- 流程编排能力必须与执行报告、失败诊断、API 执行概览形成闭环。

## 范围

- 不新增后端执行模型。
- DSL 沿用现有 `steps`、`assertions`、`extractions`、`depends_on`、`retry`、`variables`、`setup_variables`。
- 第一阶段不新增数据库表。
- 第一阶段不引入 React Flow 或自由连线画布。

## 已完成 MVP

- 在 `API 自动化 -> 步骤 3: 编排与执行` 中新增 `FlowWorkbench`。
- 左侧为流程步骤列表，支持步骤选择和上移/下移排序。
- 中间为变量流转摘要，展示初始变量、步骤产出变量和当前步骤引用变量。
- 右侧为步骤配置面板，可编辑 Header、Query、Path Params、Body、断言、变量提取、重试配置和依赖步骤。
- 底部保留高级 DSL JSON 编辑区，默认折叠。
- `npm run lint` 与 `npm run build` 已通过。

## P0 完成情况

P0 工作台交互硬化已完成，当前 API 自动化第 3 步已从“选接口执行”升级为可编辑、可校验、可执行的列表式流程编排工作台。

- 步骤列表支持选择、上移/下移、执行结果状态回填和本次启用/禁用。
- 步骤配置支持 Header、Query、Path Params、Body、依赖、断言、变量提取和失败重试配置。
- 断言、变量提取、失败重试提供快速编辑表单，并保留 JSON 兜底编辑。
- 变量流转区展示初始变量、步骤产出、当前步骤引用，并支持将变量插入 Header、Query、Path Params 或 Body。
- 新增只读流程图视图，支持在“列表 / 图”之间切换，展示顺序边、显式依赖边和变量传递边。
- 切换步骤、展开高级 JSON、执行前都会识别未保存草稿并提示确认。
- 执行时禁用步骤仅在前端过滤，不写入 DSL schema。
- `npm run lint` 已通过。

## P1 完成情况

流程模板、拖拽排序、模板复制/另存、流程图交互和失败后 AI 修复建议已完成，当前编排工作台已经具备第一版流程复用与可视化操作能力。

- 后端新增流程模板 CRUD：
  - `GET /api/api-execution/flow-templates?project_id=&limit=100`
  - `POST /api/api-execution/flow-templates`
  - `DELETE /api/api-execution/flow-templates/{template_id}`
- 模板存储复用现有 `automation_definitions`，通过 `definition_type=flow_template` 与执行自动化定义区分，不新增数据库表。
- 前端 API 层新增 `listFlowTemplates`、`saveFlowTemplate`、`deleteFlowTemplate`。
- 编排工作台顶部新增“载入流程模板”“保存为流程模板”入口。
- 模板内容包含名称、说明、标签、项目 ID 和完整 DSL 脚本。
- 载入模板会替换当前 DSL，并通过统一确认弹窗提示。
- 模板弹窗支持关键词搜索、标签筛选。
- 模板支持编辑元信息并用当前 DSL 覆盖保存。
- 模板支持复制为副本；编辑已有模板时支持另存为新模板。
- 模板保存/另存后会把 `flow_template_id`、`flow_template_name`、`flow_template_tags` 写回当前 DSL，后续执行可进入模板维度统计。
- 流程步骤列表支持基于 `@dnd-kit` 的拖拽排序，保留上/下移按钮作为精确操作。
- 拖拽排序只调整 `steps` 顺序，不自动改写 `depends_on`。
- 流程图视图支持缩放、重置和拖拽平移，节点点击继续联动步骤选择。
- 执行失败后会自动生成 AI 修复建议补丁，但仍需要用户确认后应用，不做静默自动修改。
- 流程健康检查已增强，可提示拖拽后的依赖顺序异常、循环依赖、变量由后续步骤产生和重复变量提取等风险。
- `FlowWorkbench` 已拆分为运行配置、步骤列表、变量面板、步骤编辑器、流程图、模板弹窗、高级 JSON 和工具函数模块，主组件从约 1200 行收敛到约 465 行。
- `npm run lint`、`npm run build` 与后端相关 pytest 已通过。

## 下一阶段 Backlog

### P1：流程模板与拖拽排序

> P0、只读流程图、流程模板保存/载入、模板复制/另存、拖拽排序、流程图缩放/平移、失败后 AI 修复建议已完成。

#### 已完成的 P0 明细

- 将步骤配置面板中的 JSON 文本框进一步表单化：
  - assertions 使用断言类型、path、expected 分字段编辑。（已完成）
  - extractions 使用 name、source、path 分字段编辑。（已完成）
  - retry 使用 max_attempts、delay_ms、backoff_factor、retry_on 分字段编辑。（已完成）
- 增加未保存变更提示：
  - 切换步骤、展开高级 JSON、执行前，如果当前 stepDraft 未保存，提示保存或继续。（已完成）
- 增加步骤状态回填：
  - 执行报告返回后，在步骤列表显示最近状态和状态码。（已完成基础版）
- 增加步骤启用/禁用：
  - 第一版仅前端执行前过滤 disabled step，不写入后端 schema。（已完成）
  - 高级 JSON 中不保存 disabled 状态，避免污染后端 DSL。
- 增加变量引用补全：
  - 在 Header、Query、Path Params、Body 文本框旁展示可插入变量 chips。（已完成）

- 新增“保存为流程模板”能力。
- 第一版模板可复用现有项目存储中的 `auto_generated_dsl` 或新增轻量 `automation_definitions` 记录。
- 模板字段建议：
  - template_id
  - project_id
  - name
  - description
  - script
  - tags
  - created_at / updated_at
- 前端入口：
  - API 自动化第 3 步顶部新增“保存模板”“载入模板”。
  - API 执行概览可按模板维度统计通过率和失败率。
  - 当前已在编排工作台顶部落地保存/载入、编辑覆盖、复制、另存为新模板入口。

### P1：拖拽排序

- 在上移/下移稳定后引入拖拽排序。（已完成）
- 采用 React 18 兼容的 `@dnd-kit/core`、`@dnd-kit/sortable` 和 `@dnd-kit/utilities`。（已完成）
- 拖拽只改变 `steps` 顺序，不自动改 `depends_on`。（已完成）
- 如果拖拽导致依赖顺序反常，仅给 warning，不强制阻止。（沿用现有 warning 机制）

### 已完成：只读流程图可视化

- 引入只读流程图视图，不先做自由连线编辑。
- 节点来源：
  - 每个 step 一个节点。
  - `depends_on` 生成依赖边。
  - `extractions` 与 `{{variable}}` 引用生成变量边。
- 用户可在“列表视图 / 流程图视图”之间切换。
- 已完成轻量 SVG 实现，不新增 React Flow；当前支持缩放、重置和拖拽平移，后续如要自由连线编辑再评估画布库。

### P2：AI 辅助编排

- 用户输入业务目标，AI 基于已导入 OpenAPI operations 生成链路草稿。
- AI 输出必须标注不确定项：
  - 缺少测试账号。
  - 缺少 path 参数。
  - token 提取路径不确定。
  - 断言口径不确定。
- AI 生成结果先进入工作台草稿，用户确认后再写入 DSL。
- 失败后 AI 结合执行诊断修复变量提取、断言、路径参数或 body。
- 当前已完成失败后自动生成修复建议补丁；P2 继续补“按业务目标生成链路草稿”和“跨模板推荐步骤组合”。
- P2-1 到 P2-6 已完成基础版，详见 `docs/Knowledge/api-flow-orchestration-p2-plan.md`。

## 校验规则

- 重复 step id 给出提醒。
- `depends_on` 指向不存在步骤时给出提醒。
- `{{variable}}` 引用未定义变量时给出提醒。
- JSON 字段保存时做格式校验，错误时阻止保存当前步骤。
- 执行前校验不阻塞低风险 warning，但阻塞 JSON 解析错误、空步骤、无效 Base URL。
- 生产环境写操作仍交给现有 policy 引擎阻断，不在前端重复实现强策略。

## 数据与接口演进

### 当前阶段

- 无新增后端接口。
- 无新增数据库表。
- 流程定义等同当前 `APITestCaseDsl`。
- 执行继续走现有：
  - 单步：`POST /api/api-execution/runs/single-step`
  - 批量：`POST /api/api-execution/runs`
  - 后台：`POST /api/api-execution/runs/async`

### 模板阶段候选接口

- `GET /api/api-execution/flow-templates?project_id=`
- `POST /api/api-execution/flow-templates`
- `PATCH /api/api-execution/flow-templates/{template_id}`
- `DELETE /api/api-execution/flow-templates/{template_id}`
- `POST /api/api-execution/flow-templates/{template_id}/instantiate`

接口命名最终以现有 `automation_definitions` 存储语义为准，避免重复概念。

## 验收清单

- 生成 DSL 后能看到步骤列表和配置面板。
- 上移/下移步骤后，JSON DSL 中 `steps` 顺序同步变化。
- 编辑断言、变量提取、Header、Query、Body 后，DSL 正确更新。
- 未定义变量引用能显示提醒，但不阻塞用户继续编辑。
- 单步执行和执行全部步骤仍能正常触发。
- 高级 JSON 编辑仍可使用，并能反向更新工作台视图。
- `npm run lint` 通过。
- `npm run build` 通过。

## 风险与约束

- `APITestStep` 暂无 `disabled` 字段，禁用步骤不能直接写入 DSL。
- 表单化编辑复杂对象会增加 UI 状态复杂度，需要优先保证 JSON 兜底可用。
- 可视化画布容易扩大范围，必须先以只读视图落地。
- AI 编排必须保留人工确认步骤，不能直接自动执行高风险链路。
