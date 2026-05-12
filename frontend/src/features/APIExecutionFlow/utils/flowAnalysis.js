const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z_][\w.-]*)\s*\}\}/g;

export const scanVariables = (value, found = new Set()) => {
  if (value === null || value === undefined) return found;
  if (typeof value === 'string') {
    for (const match of value.matchAll(VARIABLE_PATTERN)) found.add(match[1]);
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => scanVariables(item, found));
    return found;
  }
  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => {
      scanVariables(key, found);
      scanVariables(item, found);
    });
  }
  return found;
};

export const buildFlowSummary = (script) => {
  const initialVariables = new Set([
    ...Object.keys(script?.variables || {}),
    ...(script?.setup_variables || []).map((item) => item.name).filter(Boolean),
  ]);
  const produced = new Map();
  const consumed = new Map();
  const warnings = [];
  const steps = script?.steps || [];
  const stepIds = new Set();
  const stepIndex = new Map();
  const producersByName = new Map();

  steps.forEach((step, index) => {
    if (!step.id) warnings.push(`第 ${index + 1} 步缺少步骤 ID`);
    if (step.id && stepIds.has(step.id)) warnings.push(`步骤 ID 重复：${step.id}`);
    if (step.id) {
      stepIds.add(step.id);
      if (!stepIndex.has(step.id)) stepIndex.set(step.id, index);
    }
    (step.extractions || []).forEach((item) => {
      if (!item.name) return;
      const producers = producersByName.get(item.name) || [];
      producers.push({ step, index });
      producersByName.set(item.name, producers);
      produced.set(item.name, { step, index });
    });
    const refs = Array.from(scanVariables({
      headers: step.headers,
      query: step.query,
      path_params: step.path_params,
      body: step.body,
      path: step.path,
    }));
    consumed.set(step.id, refs);
  });

  producersByName.forEach((producers, name) => {
    if (initialVariables.has(name)) {
      warnings.push(`变量 {{${name}}} 同时存在于初始变量和步骤提取，后续引用可能不确定`);
    }
    if (producers.length > 1) {
      warnings.push(`变量提取重复：{{${name}}} 由 ${producers.map(({ step }) => step.name || step.id).join('、')} 产生`);
    }
  });

  steps.forEach((step, index) => {
    (step.depends_on || []).forEach((dep) => {
      if (dep === step.id) {
        warnings.push(`${step.name || step.id} 不能依赖自身`);
        return;
      }
      if (!stepIndex.has(dep)) {
        warnings.push(`${step.name || step.id} 依赖不存在的步骤 ${dep}`);
        return;
      }
      const depIndex = stepIndex.get(dep);
      if (depIndex >= index) {
        warnings.push(`${step.name || step.id} 依赖步骤 ${dep} 位于当前步骤之后，拖拽排序可能破坏执行顺序`);
      }
    });
    (consumed.get(step.id) || []).forEach((name) => {
      const producer = produced.get(name);
      if (!initialVariables.has(name) && !producer) {
        warnings.push(`${step.name || step.id} 引用了未定义变量 {{${name}}}`);
        return;
      }
      if (!producer) return;
      if (producer.step.id === step.id) {
        warnings.push(`${step.name || step.id} 引用了本步骤才提取的变量 {{${name}}}，请求阶段可能不可用`);
        return;
      }
      if (producer.index > index) {
        warnings.push(`${step.name || step.id} 引用了后续步骤才产生的变量 {{${name}}}`);
      }
    });
  });

  detectDependencyCycles(steps, stepIndex).forEach((cycle) => {
    warnings.push(`检测到循环依赖：${cycle.join(' -> ')}`);
  });

  return { initialVariables, produced, consumed, warnings };
};

const detectDependencyCycles = (steps, stepIndex) => {
  const graph = new Map();
  steps.forEach((step) => {
    if (!step.id) return;
    graph.set(step.id, (step.depends_on || []).filter((dep) => stepIndex.has(dep)));
  });

  const visiting = new Set();
  const visited = new Set();
  const path = [];
  const cycles = [];
  const cycleKeys = new Set();

  const visit = (stepId) => {
    if (visiting.has(stepId)) {
      const cycle = [...path.slice(path.indexOf(stepId)), stepId];
      const key = cycle.join('>');
      if (!cycleKeys.has(key)) {
        cycleKeys.add(key);
        cycles.push(cycle);
      }
      return;
    }
    if (visited.has(stepId)) return;
    visiting.add(stepId);
    path.push(stepId);
    (graph.get(stepId) || []).forEach(visit);
    path.pop();
    visiting.delete(stepId);
    visited.add(stepId);
  };

  graph.forEach((_, stepId) => visit(stepId));
  return cycles;
};

export const buildFlowGraph = (steps, flowSummary) => {
  const stepIndex = new Map(steps.map((step, index) => [step.id, index]));
  const dependencyEdges = [];
  const variableEdges = [];

  steps.forEach((step, index) => {
    (step.depends_on || []).forEach((dep) => {
      if (stepIndex.has(dep)) dependencyEdges.push({ from: dep, to: step.id, type: 'dependency' });
    });
    (flowSummary.consumed.get(step.id) || []).forEach((name) => {
      const producer = flowSummary.produced.get(name);
      if (producer?.step?.id && producer.step.id !== step.id) {
        variableEdges.push({ from: producer.step.id, to: step.id, name, type: 'variable' });
      }
    });
    if (!step.depends_on?.length && index > 0) {
      dependencyEdges.push({ from: steps[index - 1].id, to: step.id, type: 'sequence', inferred: true });
    }
  });

  return { dependencyEdges, variableEdges };
};
