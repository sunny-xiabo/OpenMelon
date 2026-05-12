# API Flow Orchestration 验收清单

## 目标

用一个可重复的 demo 场景验收 P0/P1/P2 是否真的串起来，而不是只停留在接口和组件层面。

示例 API 文档：`docs/samples/api-flow-demo-openapi.json`

## Demo 路径

业务目标：

```text
登录后创建订单并查询订单详情
```

建议步骤：

1. 进入 API 自动化。
2. 点击“初始化 Demo 项目”，自动加载 `docs/samples/api-flow-demo-openapi.json` 并切换到 Demo 项目/环境。
3. 在步骤 2 输入业务目标并点击“生成 AI 草稿”。
4. 在草稿预览中检查：
   - 编排质量评分是否展示。
   - 步骤是否包含登录、创建订单、查询订单。
   - 登录步骤是否提取 `access_token`。
   - 创建订单步骤是否提取 `order_id`。
   - 查询订单步骤是否引用 `{{order_id}}`。
   - 断言推荐是否包含状态码、字段存在和响应耗时。
5. 点击“应用草稿到工作台”。
6. 在步骤 3 检查：
   - 步骤列表顺序正确。
   - 流程图能看到依赖和变量传递。
   - 缩放/平移可用。
   - 高级 JSON 中 DSL 与预览一致。
7. 保存为流程模板，再从模板列表载入。
8. 复制模板、另存为新模板，确认模板列表可搜索/筛选。
9. 手动制造一个失败断言并执行。
10. 查看失败诊断和 AI 修复草稿，确认能预览并应用。

## 验收标准

- AI 草稿不会静默覆盖当前 DSL，必须经过预览确认。
- 草稿应用后能进入流程编排工作台继续人工编辑。
- 变量链路至少覆盖 token 和资源 ID。
- 质量评分能暴露待确认项，而不是只给“满分”。
- 推荐模板可以套用或合并片段。
- 失败后能看到诊断分类，并能生成修复草稿。
- changelog 和 P2 文档同步更新。
- Demo 项目初始化后应包含项目、环境、执行样例、失败诊断样例和知识样本。

## 待记录问题

| 时间 | 操作路径 | 现象 | 影响 | 处理建议 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 2026-05-12 | 步骤 4 执行失败后点击“AI 修复补丁” | 后端返回 `repair_draft` 但无 `patch_operations` 时，结果页未展示“预览修复草稿” | 用户看不到可人工确认的修复建议，只能回到编排页寻找入口 | 结果页展示条件同时覆盖 `patch_operations` 与 `repair_draft.draft_script`，无直接补丁时显示草稿预览入口 | 已修复 |
| 2026-05-12 | 步骤 4 执行失败后点击“AI 修复补丁” | 按钮直接绑定生成函数，React 点击事件被误作为执行报告传入 | Step 4 无法稳定生成修复草稿 | 按钮显式传入当前 `runReport` | 已修复 |

## 回归命令

```bash
uv run pytest backend/tests/test_api_execution_ai_assistant.py backend/tests/test_api_execution_flow_draft.py backend/tests/test_api_execution_diagnostics.py backend/tests/test_api_execution_dashboard.py backend/tests/test_api_execution_project_environment.py
cd frontend && npm run lint
cd frontend && npm run build
```
