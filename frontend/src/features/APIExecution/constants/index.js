export const METHOD_COLORS = {
  GET: 'success',
  POST: 'primary',
  PUT: 'warning',
  PATCH: 'secondary',
  DELETE: 'error',
};

export const ASSERTION_TYPES = [
  { value: 'status_code', label: '状态码等于', placeholder: '200' },
  { value: 'status_code_in', label: '状态码属于', placeholder: '200,201,204' },
  { value: 'json_path_exists', label: 'JSON 路径存在', placeholder: '' },
  { value: 'json_path_equals', label: 'JSON 路径等于', placeholder: 'OpenMelon' },
  { value: 'body_contains', label: '响应体包含', placeholder: 'success' },
  { value: 'header_equals', label: '响应头等于', placeholder: 'trace-id' },
  { value: 'response_time_lt', label: '响应时间小于(ms)', placeholder: '1000' },
];

export const ASSERTION_TYPES_WITH_PATH = new Set(['json_path_exists', 'json_path_equals', 'header_equals']);

export const EXTRACTION_SOURCES = [
  { value: 'body', label: '响应 JSON', placeholder: 'data.token' },
  { value: 'header', label: '响应 Header', placeholder: 'x-request-id' },
  { value: 'status_code', label: '状态码', placeholder: '' },
  { value: 'body_text', label: '响应文本', placeholder: '' },
];

export const BATCH_RUN_MAX_STEPS = 5;
export const BATCH_STEP_TIMEOUT_MS = 3000;
export const BATCH_REQUEST_TIMEOUT_MS = 20000;
export const BACKGROUND_STEP_TIMEOUT_MS = 5000;
export const BACKGROUND_RUN_TIMEOUT_MS = 120000;
export const NEW_PROJECT_VALUE = '__new_project__';
export const NEW_ENVIRONMENT_VALUE = '__new_environment__';

export const ENVIRONMENT_TYPE_OPTIONS = [
  { value: 'dev', label: '开发 dev' },
  { value: 'test', label: '测试 test' },
  { value: 'staging', label: '预发 staging' },
  { value: 'prod', label: '生产 prod' },
];

export const RUN_STATUS_META = {
  queued: { label: '排队中', color: 'warning' },
  running: { label: '执行中', color: 'info' },
  passed: { label: '通过', color: 'success' },
  failed: { label: '失败', color: 'error' },
  cancelled: { label: '已取消', color: 'default' },
};

export const WORKFLOW_STEPS = [
  { index: '01', title: '导入规范', description: '上传文件或粘贴 OpenAPI URL，先拿到稳定接口资产。' },
  { index: '02', title: '挑选范围', description: '按 Tag 和关键词收窄范围，只生成当前需要的场景。' },
  { index: '03', title: '编排执行', description: '补充断言、变量提取与运行参数，快速试跑。' },
  { index: '04', title: '定位问题', description: '直接查看失败诊断、重跑异常步骤并导出脚本。' },
];
