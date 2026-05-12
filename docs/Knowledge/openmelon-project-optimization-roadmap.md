# OpenMelon 项目优化路线图

## 目标

把当前“功能可用”推进到“可稳定演示、可持续回归、可逐步扩展”。

## 现状判断

- API 自动化主链路已完成基础闭环。
- 数据仪表盘、失败诊断、知识沉淀、模板推荐和受控重跑已连通。
- P0/P1 已完成主体收口，详见 `docs/Knowledge/openmelon-p0-p1-closeout.md`。
- 0.2.8.2 当前变更较多，已按功能域拆分归档边界，详见 `docs/Knowledge/openmelon-0.2.8.2-change-batches.md`。
- 下一阶段进入 P2 前，优先保持 P0/P1 稳定，只接受缺陷修复和小幅体验修补。

## 优先级

### P0：可演示、可回归

- [x] 内置 Demo OpenAPI 资产一键加载。
- [x] 固定 Demo Project 一键初始化项目、环境、知识和失败样例。
- [x] 验收脚本沉淀到 `docs/Knowledge`，每次发版可重复跑。
- [x] 任务中心轻量聚合接口：统一 pending/failed/resolved 任务统计、类型分布、风险分布和最近待处理项。
- [ ] Playwright 级端到端 smoke：导入、生成、执行、诊断、修复、沉淀。（已明确后置到 UI 验收阶段，不阻塞 P0/P1 收口）

### P1：可治理、可追踪

- [x] 设置页治理中心：知识库审核、任务中心、模板治理和数据资产状态。
- [x] 设置页日志中心：执行、策略、任务和知识事件只读追踪。
- [x] 知识来源与修复效果追踪。
- [x] 模板版本、废弃状态、适用范围和历史表现。
- [x] 统一日志接口计划沉淀。
- [x] 统一业务事件日志接口落地：`/api/logs/events`、`/api/logs/summary`、`/api/logs/events/{event_id}/related`。
- [x] 保留原系统日志文件接口：`/api/logs`、`/api/logs/list`。
- [x] 全项目核心业务日志写入补齐：测试用例生成、向量入库、文档索引、RAG 查询、图谱治理、Prompt Hub、文件管理、企业 webhook 和 AI 助手。

### P2：可观察、可趋势化

- [ ] 执行趋势图：通过率、失败率、平均耗时。
- [ ] flaky 接口排行和失败原因趋势。
- [ ] 知识命中率、历史方案复用率、修复后通过率。

### P3：可扩展、可维护

- [ ] `api_execution/routers.py` 按领域拆分。
- [ ] 前端 API 自动化继续拆分子模块。
- [ ] 统一后端聚合 helper 和前端错误处理。
- [ ] 完善契约测试、UI smoke 和 demo fixtures。

## 当前建议执行顺序

1. P0/P1 收口记录归档。
2. P0/P1 缺陷修复和小幅体验修补。
3. P2 趋势化计划启动。
4. Playwright smoke（UI 阶段再做）。
5. 后端 router 拆分（P3）。
