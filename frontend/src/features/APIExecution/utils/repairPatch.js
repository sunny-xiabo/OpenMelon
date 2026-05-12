export const getLowRiskRepairOperations = (repairDraft) => {
  const grouped = repairDraft?.repair_suggestion_groups?.low_risk_apply || [];
  if (grouped.length) {
    return grouped.map((item) => item.operation).filter(Boolean);
  }
  return (repairDraft?.patch_operations || []).filter((operation) => operation.safe_to_apply);
};

export const applyRepairOperationsToScript = (script, operations) => {
  if (!script || !operations?.length) return script;
  const nextScript = JSON.parse(JSON.stringify(script));
  const steps = nextScript.steps || [];
  operations.forEach((operation) => {
    if (!operation?.field) return;
    const target = operation.step_id
      ? steps.find((step) => step.id === operation.step_id)
      : nextScript;
    if (!target) return;
    target[operation.field] = operation.after;
  });
  return nextScript;
};

export const markAiRepairSource = (script, source, operations = []) => ({
  ...script,
  ai_repair_source: source,
  ai_repair_applied_at: new Date().toISOString(),
  ai_repair_applied_operations: operations.map((operation) => ({
    step_id: operation.step_id || '',
    field: operation.field || '',
    reason: operation.reason || '',
    safe_to_apply: Boolean(operation.safe_to_apply),
  })),
});

export const buildRepairApplyConfirmMessage = (title, operations) => {
  const lines = (operations || []).map((operation, index) => (
    `${index + 1}. ${operation.step_id || '全局'} · ${operation.field || '字段'}：${operation.reason || '无说明'}`
  ));
  return [
    title,
    '',
    ...(lines.length ? lines : ['本次没有字段级补丁，将应用完整修复草稿。']),
    '',
    '应用后会回到流程编排工作台，请再确认 DSL 后执行。',
  ].join('\n');
};
