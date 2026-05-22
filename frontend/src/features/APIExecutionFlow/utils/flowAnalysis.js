const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z_][\w.-]*)\s*\}\}/g;
const RESOURCE_ID_PATTERN = /(?:^|_)([a-zA-Z][\w]*)_id$/;

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

export const buildFlowGraph = (steps, flowSummary, options = {}) => {
  const includeInferredSequence = options.includeInferredSequence !== false;
  const stepIndex = new Map(steps.map((step, index) => [step.id, index]));
  const dependencyEdges = [];
  const variableEdges = [];
  const resourceEdges = [];
  const resourceEdgeKeys = new Set();

  const addResourceEdge = (from, to, name, inferred = false) => {
    if (!from || !to || from === to) return;
    const key = `${from}->${to}:${name}`;
    if (resourceEdgeKeys.has(key)) return;
    resourceEdgeKeys.add(key);
    resourceEdges.push({ from, to, name, type: 'resource', inferred });
  };

  steps.forEach((step, index) => {
    (step.depends_on || []).forEach((dep) => {
      if (stepIndex.has(dep)) dependencyEdges.push({ from: dep, to: step.id, type: 'dependency' });
    });
    (flowSummary.consumed.get(step.id) || []).forEach((name) => {
      const producer = flowSummary.produced.get(name);
      if (producer?.step?.id && producer.step.id !== step.id) {
        variableEdges.push({ from: producer.step.id, to: step.id, name, type: 'variable' });
        if (isResourceIdVariable(name) && isResourceConsumerStep(step, name)) {
          addResourceEdge(producer.step.id, step.id, name);
        }
      }
    });
    if (includeInferredSequence && !step.depends_on?.length && index > 0) {
      dependencyEdges.push({ from: steps[index - 1].id, to: step.id, type: 'sequence', inferred: true });
    }
  });

  inferResourceEdges(steps, flowSummary).forEach((edge) => addResourceEdge(edge.from, edge.to, edge.name, true));
  resourceEdges.sort((left, right) => {
    const leftSource = stepIndex.get(left.from) ?? 0;
    const rightSource = stepIndex.get(right.from) ?? 0;
    if (leftSource !== rightSource) return leftSource - rightSource;
    return (stepIndex.get(left.to) ?? 0) - (stepIndex.get(right.to) ?? 0);
  });

  return { dependencyEdges, variableEdges, resourceEdges };
};

const isResourceIdVariable = (name = '') => name === 'id' || name.endsWith('_id');

const resourceNameFromVariable = (name = '') => {
  if (name === 'id') return '';
  const match = name.match(RESOURCE_ID_PATTERN);
  return match?.[1] || name.replace(/_id$/, '');
};

const singularize = (value = '') => value.replace(/ies$/, 'y').replace(/s$/, '');

const normalizeResourceToken = (value = '') => singularize(String(value).toLowerCase().replace(/[^a-z0-9]/g, ''));

const pathTokens = (path = '') => String(path)
  .split('/')
  .map((part) => part.replace(/[{}]/g, '').trim())
  .filter(Boolean);

const stepSearchText = (step) => [
  step?.id,
  step?.name,
  step?.operation_id,
  step?.path,
].filter(Boolean).join(' ').toLowerCase();

const isResourceConsumerStep = (step, variableName) => {
  const method = String(step?.method || '').toUpperCase();
  if (!['GET', 'PUT', 'PATCH', 'DELETE'].includes(method)) return false;
  const resource = normalizeResourceToken(resourceNameFromVariable(variableName));
  const text = normalizeResourceToken(stepSearchText(step));
  const hasResourceName = !resource || text.includes(resource);
  const hasIdSlot = pathTokens(step?.path).some((part) => ['id', `${resource}id`, `${resource}_id`, variableName].includes(part.toLowerCase()));
  return hasResourceName && hasIdSlot;
};

const inferResourceEdges = (steps, flowSummary) => {
  const candidates = Array.from(flowSummary.produced.entries())
    .filter(([name]) => isResourceIdVariable(name))
    .map(([name, producer]) => ({
      name,
      producer,
      resource: normalizeResourceToken(resourceNameFromVariable(name)),
    }))
    .filter(({ producer }) => producer?.step?.id);

  if (!candidates.length) return [];

  const edges = [];
  steps.forEach((step) => {
    candidates.forEach(({ name, producer, resource }) => {
      if (producer.step.id === step.id) return;
      const method = String(step.method || '').toUpperCase();
      if (!['GET', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;

      const text = normalizeResourceToken(stepSearchText(step));
      const hasResourceName = !resource || text.includes(resource);
      const hasIdSlot = pathTokens(step.path).some((part) => {
        const normalized = normalizeResourceToken(part);
        return normalized === 'id' || normalized === `${resource}id` || normalized === normalizeResourceToken(name);
      });
      if (hasResourceName && hasIdSlot) {
        edges.push({ from: producer.step.id, to: step.id, name });
      }
    });
  });
  return edges;
};

export const normalizeDependsOn = (dependsOn = []) => Array.from(new Set((dependsOn || []).filter(Boolean))).sort();

export const buildFlowLayout = (steps) => {
  const stepIndex = new Map(steps.map((step, index) => [step.id, index]));
  const levels = new Map();
  const visiting = new Set();

  const levelOf = (step) => {
    if (!step?.id) return 0;
    if (levels.has(step.id)) return levels.get(step.id);
    if (visiting.has(step.id)) {
      levels.set(step.id, stepIndex.get(step.id) || 0);
      return levels.get(step.id);
    }
    visiting.add(step.id);
    const depLevels = (step.depends_on || [])
      .map((depId) => steps[stepIndex.get(depId)])
      .filter(Boolean)
      .map((depStep) => levelOf(depStep));
    visiting.delete(step.id);
    const level = depLevels.length ? Math.max(...depLevels) + 1 : 0;
    levels.set(step.id, level);
    return level;
  };

  steps.forEach(levelOf);

  const lanesByLevel = new Map();
  const positions = new Map();
  steps.forEach((step) => {
    const level = levels.get(step.id) || 0;
    const lane = lanesByLevel.get(level) || 0;
    lanesByLevel.set(level, lane + 1);
    positions.set(step.id, {
      x: 32 + level * 330,
      y: 36 + lane * 166,
      level,
      lane,
    });
  });
  return { positions, levels };
};

export const wouldCreateDependencyCycle = (steps, sourceId, targetId) => {
  if (!sourceId || !targetId || sourceId === targetId) return true;
  const byId = new Map(steps.map((step) => [step.id, step]));
  if (!byId.has(sourceId) || !byId.has(targetId)) return true;

  const visit = (stepId, seen = new Set()) => {
    if (stepId === targetId) return true;
    if (seen.has(stepId)) return false;
    seen.add(stepId);
    const step = byId.get(stepId);
    return (step?.depends_on || []).some((depId) => visit(depId, seen));
  };
  return visit(sourceId);
};

export const applyDependencyConnection = (steps, sourceId, targetId) => {
  if (!sourceId || !targetId || sourceId === targetId) {
    return { steps, changed: false, error: '不能连接到自身。' };
  }
  const sourceExists = steps.some((step) => step.id === sourceId);
  const targetExists = steps.some((step) => step.id === targetId);
  if (!sourceExists || !targetExists) {
    return { steps, changed: false, error: '连接的步骤不存在。' };
  }
  if (wouldCreateDependencyCycle(steps, sourceId, targetId)) {
    return { steps, changed: false, error: '该连接会形成循环依赖。' };
  }
  let changed = false;
  const nextSteps = steps.map((step) => {
    if (step.id !== targetId) return step;
    const current = step.depends_on || [];
    if (current.includes(sourceId)) return step;
    changed = true;
    return { ...step, depends_on: [...current, sourceId] };
  });
  return { steps: nextSteps, changed, error: changed ? '' : '依赖已存在。' };
};

export const removeDependencyConnection = (steps, sourceId, targetId) => {
  let changed = false;
  const nextSteps = steps.map((step) => {
    if (step.id !== targetId) return step;
    const nextDepends = (step.depends_on || []).filter((depId) => depId !== sourceId);
    if (nextDepends.length === (step.depends_on || []).length) return step;
    changed = true;
    return { ...step, depends_on: nextDepends };
  });
  return { steps: nextSteps, changed };
};

const nextParallelGroupName = (steps) => {
  const used = new Set(steps.map((step) => step.parallel_group).filter(Boolean));
  let index = 1;
  while (used.has(`parallel_read_${index}`)) index += 1;
  return `parallel_read_${index}`;
};

export const validateParallelGroupSelection = (steps, selectedIds, flowSummary, disabledSet = new Set()) => {
  const selectedSet = new Set(selectedIds || []);
  const selected = steps.filter((step) => selectedSet.has(step.id));
  if (selected.length < 2) return { valid: false, error: '至少选择 2 个步骤才能设置并行组。' };
  if (selected.some((step) => disabledSet.has(step.id))) return { valid: false, error: '禁用步骤不能加入并行组。' };
  if (selected.some((step) => !['GET', 'HEAD'].includes(String(step.method || '').toUpperCase()))) {
    return { valid: false, error: '第一版只允许 GET/HEAD 安全读请求设置并行组。' };
  }
  const dependencyKey = normalizeDependsOn(selected[0].depends_on).join('|');
  if (selected.some((step) => normalizeDependsOn(step.depends_on).join('|') !== dependencyKey)) {
    return { valid: false, error: '所选步骤必须拥有完全相同的 depends_on 集合。' };
  }
  const unsafeConsumer = selected.find((step) => (flowSummary?.consumed?.get(step.id) || []).some((name) => name !== 'access_token'));
  if (unsafeConsumer) {
    return { valid: false, error: `${unsafeConsumer.name || unsafeConsumer.id} 消费了业务变量，不能自动并行。` };
  }
  return { valid: true, error: '' };
};

export const applyParallelGroup = (steps, selectedIds, flowSummary, disabledSet = new Set()) => {
  const validation = validateParallelGroupSelection(steps, selectedIds, flowSummary, disabledSet);
  if (!validation.valid) return { steps, changed: false, error: validation.error };
  const selectedSet = new Set(selectedIds);
  const groupName = nextParallelGroupName(steps);
  const nextSteps = steps.map((step) => (selectedSet.has(step.id) ? { ...step, parallel_group: groupName } : step));
  return { steps: nextSteps, changed: true, error: '', groupName };
};

export const clearParallelGroups = (steps, selectedIds) => {
  const selectedSet = new Set(selectedIds || []);
  let changed = false;
  const nextSteps = steps.map((step) => {
    if (!selectedSet.has(step.id) || !step.parallel_group) return step;
    changed = true;
    return { ...step, parallel_group: '' };
  });
  return { steps: nextSteps, changed };
};
