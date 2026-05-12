# API 流程编排 P2 计划与进度

## 目标

P2 将 API 自动化从“手动选择接口并编排”升级为“基于业务目标生成流程草稿”。第一阶段只做安全闭环：AI 生成草稿、用户预览、人工确认后应用到流程工作台，不自动执行、不静默覆盖当前 DSL。

## P2.1 深化

## 阶段 C/D/E 计划与状态

### 阶段 C：诊断台深化（已完成）

- [x] 修复建议分级：后端 `repair_draft.repair_suggestion_groups` 拆分为 `low_risk_apply`、`needs_review`、`investigation`。
- [x] 三栏诊断台展示：前端修复草稿预览按“低风险可应用 / 需要人工确认 / 只作为排查建议”展示。
- [x] 修复对比：字段级 patch 展示调整前、调整后、原因和低风险标记。
- [x] 仅应用低风险项：只将 `low_risk_apply` 对应字段写回当前 DSL，不带入需人工确认或排查建议。
- [x] 应用前差异确认：点击应用前展示本次将修改的字段清单和风险提示。
- [x] 应用后标记改动来源：回到编排工作台后标记该 DSL 来自 AI 低风险修复或完整修复草稿。
- [x] 执行概览联动：从失败记录抽屉展示修复建议分级摘要，并可跳转到 API 自动化诊断台。

### 阶段 D：受控执行闭环（已完成）

- [x] 低风险补丁应用后支持“应用并受控重跑”，重跑前展示策略判断。
- [x] 修复前后对比固化到执行报告，展示通过/失败变化、修改字段和剩余失败原因。
- [x] 自动修复重跑次数受项目策略限制，不做静默循环重跑。
- [x] 失败步骤重跑与修复草稿联动，可优先只重跑受影响失败步骤。

### 阶段 E：智能化与知识沉淀（已完成基础版）

- [x] 成功修复经验沉淀到知识库，记录失败特征、补丁类型、最终结果和适用条件；第一版采用“生成候选 -> 人工确认沉淀”的手动闭环。
- [x] 相似失败召回历史修复经验，优先展示已验证方案。
- [x] 模板推荐结合历史成功率、失败率和业务标签，而不只看文本匹配。
- [x] AI 多方案修复：给出低风险、安全但保守、激进调整等多方案，并要求人工选择。
- [x] 修复效果评分：根据重跑结果、风险等级和历史稳定性给修复建议打分。

#### 阶段 E 手动沉淀入口（已完成基础版）

- 后端新增 `POST /api/api-execution/knowledge/runs/{run_id}/candidate`，可针对指定执行记录生成知识沉淀候选任务。
- 运行结果页在存在 `repair_history` 或受控修复汇总时展示“修复经验沉淀”入口。
- 用户需先生成修复经验候选，再点击“确认沉淀”写入本地知识库、向量库和图谱；不做失败后自动沉淀。
- 已确认沉淀的候选不会被再次改回待处理，避免重复确认污染待办列表。
- 修复草稿会展示相似失败召回出的历史已验证修复方案，按历史修复效果评分排序。
- AI 修复草稿新增多方案区：低风险直接应用、保守人工确认、激进调整排查，仍要求用户选择和确认。
- 修复草稿新增修复效果评分，综合低风险补丁数量、需确认项、历史验证方案和诊断复杂度计算。
- 受控修复重跑报告新增 `repair_effect_score`，沉淀知识时会保留修复效果评分。
- AI 流程草稿的模板推荐结合模板历史执行次数、通过率和失败率，推荐理由会展示历史表现。

### 编排健康检查增强（已完成基础版）

- 工作台会识别拖拽排序后依赖步骤位于当前步骤之后的风险。
- 工作台会识别 `depends_on` 自依赖、缺失依赖和循环依赖。
- 工作台会识别变量由后续步骤产生、当前步骤引用自身才提取的变量、未定义变量。
- 工作台会识别初始变量与步骤提取重名、多个步骤重复提取同名变量，避免后续引用来源不明确。

### 编排质量评分（已完成基础版）

- 草稿接口返回 `quality_score`，包含分数、等级、标签和问题项。
- 评分关注步骤完整性、变量未定义、鉴权不明确、断言偏少、高风险操作和待确认项。
- 草稿预览展示评分和问题 chips，帮助用户判断草稿能否直接进入工作台。

### 推荐模板一键套用/合并片段（已完成基础版）

- 推荐模板从只读展示升级为可操作。
- “套用”会直接使用模板脚本进入工作台。
- “合并片段”会把模板步骤追加到当前 AI 草稿，并重排模板步骤 ID，保留人工确认步骤。

### 失败诊断生成修复草稿（已完成基础版）

- `ai/repair-patch` 响应新增 `repair_draft`。
- 修复草稿包含 patched script、步骤摘要、变更步骤标记、质量评分和诊断来源提示。
- 修复草稿预览新增“修复对比”，展示字段级 patch 的调整前、调整后、原因和低风险标记。
- 修复草稿新增建议分级 `repair_suggestion_groups`：
  - `low_risk_apply`：低风险字段级补丁，可应用后再回到工作台确认。
  - `needs_review`：涉及断言口径、请求数据或性能阈值的补丁，需要人工确认。
  - `investigation`：环境、数据、服务或鉴权类排查建议，不直接修改脚本。
- 阶段 C 诊断台深化已启动：修复草稿预览支持“仅应用低风险项”，只把 `low_risk_apply` 对应字段写回当前 DSL，保留完整修复草稿应用作为人工确认路径。
- 前端失败后 AI 修复建议新增“预览修复草稿”，用户确认后再应用到工作台。
- 保留“直接应用补丁”作为快速路径。

### 验收与 UI 打磨（已启动）

- 新增 `docs/samples/api-flow-demo-openapi.json` 作为真实场景验收样例。
- 新增 `docs/Knowledge/api-flow-orchestration-acceptance.md`，沉淀验收路径、检查点和问题记录表。
- 草稿/修复草稿预览按区域折叠，默认突出流程步骤和质量评分。
- 变量链路展示从密集 chips 调整为“变量提取 / 变量引用”分组。

## 优先级

### P2-1：AI 流程草稿生成（已完成）

- 在步骤 2「挑选范围工作台」新增业务目标输入。
- 新增 `POST /api/api-execution/ai/flow-draft`。
- 输入 `spec_id`、`business_goal`、可选 `operation_ids`、项目/环境/Base URL。
- 后端基于当前 OpenAPI operations 选择候选接口并生成 `APITestCaseDsl` 草稿。
- 没有选择接口时按业务目标从全部接口中召回；有选择接口时只在已选范围内生成。

### P2-2：草稿预览与人工确认（已完成）

- 前端新增 AI 流程草稿预览弹窗。
- 展示草稿用例名、项目、环境、Base URL、步骤链路、依赖、变量提取、断言数量和不确定项。
- 用户点击“应用草稿到工作台”后才写入当前 DSL 并进入步骤 3 编排工作台。

### P2-3：变量链路自动补全（已完成基础增强版）

- 登录/鉴权步骤自动补 `access_token` 提取占位。
- 后续步骤自动补 `Authorization: Bearer {{access_token}}`。
- 创建类 POST 步骤自动补资源 ID 提取占位，例如 `order_id`。
- 后续路径参数 `id` 或 `*_id` 自动引用创建步骤提取变量。
- 多个创建资源会注册多个资源 ID，例如 `cart_id`、`order_id`。
- 后续 Query/Header/Body 中与已知变量同名的占位字段会自动替换为 `{{variable}}`。
- 草稿预览会展示每个步骤的变量提取和变量引用位置。
- 不确定的 token 路径、ID 路径和路径参数来源会进入预览提示。

### P2-4：断言推荐（已完成基础版）

- 基于响应状态码生成基础 `status_code_in`。
- 基于响应 schema 生成字段存在断言 `json_path_exists`。
- 自动补基础响应耗时断言 `response_time_lt`。
- 草稿预览展示每个步骤的断言推荐摘要。
- 当前只生成低风险基础断言，不默认生成业务值相等这类强断言。

### P2-5：失败闭环增强（已完成基础版）

- 将现有失败后 AI 修复建议细分为变量缺失、依赖顺序异常、断言过严、路径参数缺失、body 参数缺失。
- 当前已新增变量引用失败分类 `variable_reference_missing`。
- 422 参数校验建议补充检查 `{{变量}}`、body/path/query 与前置 extraction。
- 后续可把失败诊断入口直接转为“应用到流程编排草稿”。

### P2-6：模板智能推荐（已完成基础版）

- 根据业务目标、已选接口、历史模板标签推荐可复用流程模板。
- 草稿接口返回 `template_recommendations`。
- 草稿预览展示推荐模板名称和步骤数。
- 后续增强支持从模板片段合成新流程草稿。

## 接口约定

`POST /api/api-execution/ai/flow-draft`

请求：

```json
{
  "spec_id": "string",
  "business_goal": "登录后创建订单并查询订单详情",
  "operation_ids": ["optional selected operation ids"],
  "project_name": "string",
  "environment_name": "string",
  "base_url": "string",
  "project_policy_snapshot": {}
}
```

响应：

```json
{
  "draft_script": "APITestCaseDsl",
  "selected_operation_ids": [],
  "step_summaries": [],
  "uncertainties": [],
  "template_recommendations": [],
  "quality_score": {},
  "summary": "string",
  "requires_approval": true,
  "ai_mode": "heuristic",
  "model_name": "",
  "fallback_reason": ""
}
```

## 验证

- `uv run pytest backend/tests/test_api_execution_flow_draft.py backend/tests/test_api_execution_dashboard.py backend/tests/test_api_execution_project_environment.py`
- `npm run lint`
- `npm run build`
