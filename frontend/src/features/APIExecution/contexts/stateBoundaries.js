export const API_EXECUTION_STATE_BOUNDARIES = {
  ui: {
    owner: 'UIContext',
    state: ['activeStep', 'loading', 'loadingMessage', 'confirmDialog'],
    role: '页面步骤、全局加载和确认弹窗，只承载交互状态。',
  },
  spec: {
    owner: 'SpecContext',
    state: ['sourceUrl', 'selectedFile', 'spec', 'searchText', 'selectedOperationIds'],
    role: 'OpenAPI 文档来源、解析结果和接口选择。',
  },
  project: {
    owner: 'ProjectEnvContext',
    state: ['projects', 'environments', 'selectedProjectId', 'selectedEnvironmentId', 'policy', 'environment'],
    role: '项目、环境、策略和执行配置快照。',
  },
  dsl: {
    owner: 'DSLContext',
    state: ['dslText', 'parsedScript', 'assertionForm', 'aiPatch', 'disabledFlowStepIds'],
    role: '测试 DSL 编辑态、断言编辑态和 AI 编排补丁。',
  },
  execution: {
    owner: 'ExecutionContext',
    state: ['runResult', 'runReport', 'backgroundRunId', 'backgroundRunStatus'],
    role: '当前执行和后台执行轮询状态。',
  },
  history: {
    owner: 'RunHistoryContext',
    state: ['runHistory', 'automationTasks', 'runHistoryFilters'],
    role: '执行历史、任务中心摘要和历史筛选条件。',
  },
};

export const CROSS_DOMAIN_ACTIONS = {
  specChanged: '解析/切换 API 文档后，SpecContext 发起，CombinedProvider 负责清空 DSL 与执行结果。',
  loadRunIntoEditor: '从历史记录或外部跳转载入 run 时，CombinedProvider 同步 project/env、dsl、execution 和 ui。',
  executionFinished: '执行完成后，ExecutionContext 只通知已注册的 history 刷新回调，不直接读写 history 状态。',
};
