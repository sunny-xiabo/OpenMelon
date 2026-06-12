/**
 * Node type metadata -- icons, colors, default configs, and category groupings.
 * Used by NodePalette, NodeConfigPanel, and custom node renderers.
 */

export const NODE_CATEGORIES = [
  {
    id: 'flow',
    label: '流程控制',
    types: ['start', 'end', 'if_else', 'iteration', 'variable_aggregator'],
  },
  {
    id: 'ai',
    label: 'AI 能力',
    types: ['llm', 'knowledge_retrieval', 'parameter_extractor', 'question_classifier'],
  },
  {
    id: 'data',
    label: '数据处理',
    types: ['http_request', 'code', 'template'],
  },
  {
    id: 'integration',
    label: '集成工具',
    types: ['tool'],
  },
];

export const NODE_DEFINITIONS = {
  start: {
    type: 'start',
    label: '开始',
    icon: 'PlayArrow',
    color: '#4caf50',
    description: '工作流入口，定义输入变量',
    defaultConfig: {
      variables: [],
    },
    defaultWidth: 200,
    defaultHeight: 80,
    inputs: [],
    outputs: [{ id: 'source', label: '输出' }],
  },
  end: {
    type: 'end',
    label: '结束',
    icon: 'Stop',
    color: '#9e9e9e',
    description: '工作流终点，收集最终输出',
    defaultConfig: {
      outputs: [],
      inputs: [],
    },
    defaultWidth: 200,
    defaultHeight: 80,
    inputs: [{ id: 'target', label: '输入' }],
    outputs: [],
  },
  llm: {
    type: 'llm',
    label: 'LLM',
    icon: 'SmartToy',
    color: '#7c4dff',
    description: '调用大语言模型生成文本',
    defaultConfig: {
      model: '',
      prompt_template: '',
      system_prompt: '',
      temperature: 0.7,
      max_tokens: 4096,
      inputs: [],
    },
    defaultWidth: 244,
    defaultHeight: 120,
    inputs: [{ id: 'target', label: '输入' }],
    outputs: [{ id: 'source', label: '输出' }],
  },
  http_request: {
    type: 'http_request',
    label: 'HTTP 请求',
    icon: 'Http',
    color: '#2196f3',
    description: '发送 HTTP 请求调用外部 API',
    defaultConfig: {
      method: 'GET',
      url: '',
      headers: {},
      params: {},
      body: null,
      body_type: 'json',
      timeout: 30,
    },
    defaultWidth: 244,
    defaultHeight: 100,
    inputs: [{ id: 'target', label: '输入' }],
    outputs: [{ id: 'source', label: '输出' }],
  },
  code: {
    type: 'code',
    label: '代码执行',
    icon: 'Code',
    color: '#ff9800',
    description: '执行自定义 Python 代码',
    defaultConfig: {
      language: 'python',
      code: 'def main(args):\n    return {"result": args.get("input", "")}',
      inputs: [],
      timeout: 10,
    },
    defaultWidth: 244,
    defaultHeight: 100,
    inputs: [{ id: 'target', label: '输入' }],
    outputs: [{ id: 'source', label: '输出' }],
  },
  if_else: {
    type: 'if_else',
    label: '条件判断',
    icon: 'CallSplit',
    color: '#ffc107',
    description: '根据条件分支执行',
    defaultConfig: {
      conditions: [],
      logical_operator: 'and',
    },
    defaultWidth: 244,
    defaultHeight: 100,
    inputs: [{ id: 'target', label: '输入' }],
    outputs: [
      { id: 'true', label: 'True' },
      { id: 'false', label: 'False' },
    ],
  },
  knowledge_retrieval: {
    type: 'knowledge_retrieval',
    label: '知识检索',
    icon: 'Search',
    color: '#00bcd4',
    description: '从知识库中检索相关信息',
    defaultConfig: {
      retrieval_mode: 'hybrid',
      query_variable: [],
      top_k: 5,
      score_threshold: 0.5,
    },
    defaultWidth: 244,
    defaultHeight: 100,
    inputs: [{ id: 'target', label: '查询' }],
    outputs: [{ id: 'source', label: '结果' }],
  },
  template: {
    type: 'template',
    label: '模板变换',
    icon: 'Description',
    color: '#e91e63',
    description: '使用 Jinja2 模板格式化文本',
    defaultConfig: {
      template: '',
      inputs: [],
    },
    defaultWidth: 244,
    defaultHeight: 100,
    inputs: [{ id: 'target', label: '输入' }],
    outputs: [{ id: 'source', label: '输出' }],
  },
  variable_aggregator: {
    type: 'variable_aggregator',
    label: '变量聚合',
    icon: 'Merge',
    color: '#607d8b',
    description: '合并多个分支的变量',
    defaultConfig: {
      aggregations: [],
    },
    defaultWidth: 244,
    defaultHeight: 80,
    inputs: [
      { id: 'target_1', label: '分支 1' },
      { id: 'target_2', label: '分支 2' },
    ],
    outputs: [{ id: 'source', label: '输出' }],
  },
  iteration: {
    type: 'iteration',
    label: '迭代',
    icon: 'Loop',
    color: '#3f51b5',
    description: '遍历数组执行子流程',
    defaultConfig: {
      input_variable: [],
      iterator_variable: 'item',
      max_iterations: 100,
      parallel: false,
    },
    defaultWidth: 244,
    defaultHeight: 100,
    inputs: [{ id: 'target', label: '输入' }],
    outputs: [{ id: 'source', label: '输出' }],
  },
  tool: {
    type: 'tool',
    label: '工具调用',
    icon: 'Build',
    color: '#795548',
    description: '调用 OpenMelon 内部功能',
    defaultConfig: {
      tool_type: 'testcase_gen',
      config: {},
      inputs: [],
    },
    defaultWidth: 244,
    defaultHeight: 100,
    inputs: [{ id: 'target', label: '输入' }],
    outputs: [{ id: 'source', label: '输出' }],
  },
  parameter_extractor: {
    type: 'parameter_extractor',
    label: '参数提取',
    icon: 'Tune',
    color: '#8bc34a',
    description: '用 LLM 从文本中提取结构化参数',
    defaultConfig: {
      model: '',
      parameters: [],
      input_variable: [],
    },
    defaultWidth: 244,
    defaultHeight: 100,
    inputs: [{ id: 'target', label: '输入' }],
    outputs: [{ id: 'source', label: '输出' }],
  },
  question_classifier: {
    type: 'question_classifier',
    label: '问题分类',
    icon: 'Category',
    color: '#ff5722',
    description: '将用户输入分类到预定义类别',
    defaultConfig: {
      model: '',
      categories: [],
      input_variable: [],
    },
    defaultWidth: 244,
    defaultHeight: 100,
    inputs: [{ id: 'target', label: '输入' }],
    outputs: [{ id: 'source', label: '分类结果' }],
  },
};

/**
 * Generate a unique node ID for a given type.
 */
let _nodeCounter = {};
export function generateNodeId(type) {
  _nodeCounter[type] = (_nodeCounter[type] || 0) + 1;
  return `${type}_${_nodeCounter[type]}`;
}

/**
 * Reset the node ID counter (e.g., when loading a workflow).
 */
export function resetNodeIdCounter() {
  _nodeCounter = {};
}
