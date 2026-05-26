import React from 'react';
import { Stack, Box, Typography, Button, CircularProgress, Paper, Chip, Alert, Divider } from '@mui/material';
import { AccountTreeOutlined, AutoAwesomeOutlined, ContentCopyOutlined, DataObjectOutlined, FormatAlignLeftOutlined, PlayCircleOutlineOutlined } from '@mui/icons-material';
import { useAPIExecution } from '../context';
import {
  applyRepairOperationsToScript,
  buildRepairApplyConfirmMessage,
  getLowRiskRepairOperations,
  markAiRepairSource,
} from '../utils/repairPatch';
import { ASSERTION_TYPES, EXTRACTION_SOURCES, METHOD_COLORS } from '../constants';
import StageHeader from './StageHeader';
import FlowWorkbench from '../../APIExecutionFlow/components/FlowWorkbench';
import AIFlowDraftDialog from './AIFlowDraftDialog';

const ROOT_FIELDS = ['case_id', 'name', 'target_project', 'environment', 'base_url', 'variables', 'steps', 'cleanup_steps'];
const STEP_FIELDS = ['id', 'name', 'method', 'path', 'operation_id', 'headers', 'query', 'path_params', 'body', 'assertions', 'extractions'];
const ASSERTION_FIELDS = ['type', 'expected', 'path', 'value'];
const EXTRACTION_FIELDS = ['name', 'source', 'path'];
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const ASSERTION_TYPE_VALUES = ASSERTION_TYPES.map((item) => item.value);
const EXTRACTION_SOURCE_VALUES = EXTRACTION_SOURCES.map((item) => item.value);

const quotedFieldCompletion = (field) => ({ label: field, type: 'property', apply: `${field}": ` });
const quotedValueCompletion = (value) => ({ label: value, type: 'constant', apply: value });
const CANVAS_NODE_WIDTH = 220;
const CANVAS_NODE_HEIGHT = 96;
const CANVAS_LAYER_GAP = 88;
const CANVAS_ROW_GAP = 24;
const CANVAS_PADDING = 32;
const METHOD_CANVAS_COLORS = {
  GET: { bg: '#dcfce7', border: '#22c55e', text: '#166534' },
  POST: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
  PUT: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
  PATCH: { bg: '#f3e8ff', border: '#a855f7', text: '#6b21a8' },
  DELETE: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
};

const truncateCanvasText = (value, maxLength) => {
  const text = String(value || '');
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
};

const collectDependencyGraph = (script, disabledStepIds = []) => {
  const steps = script?.steps || [];
  const stepIds = new Set(steps.map((step) => step.id).filter(Boolean));
  const disabled = new Set(disabledStepIds || []);
  const edges = [];
  const missingEdges = [];
  const disabledDependencyEdges = [];
  const dependentsByStep = {};

  for (const step of steps) {
    for (const dependency of step.depends_on || []) {
      const edge = { from: dependency, to: step.id };
      if (!stepIds.has(dependency)) {
        missingEdges.push(edge);
      } else {
        edges.push(edge);
        dependentsByStep[dependency] = [...(dependentsByStep[dependency] || []), step.id];
        if (disabled.has(dependency) && !disabled.has(step.id)) {
          disabledDependencyEdges.push(edge);
        }
      }
    }
  }

  return {
    steps,
    edges,
    missingEdges,
    disabledDependencyEdges,
    rootSteps: steps.filter((step) => !(step.depends_on || []).length),
    disabled,
    dependentsByStep,
  };
};

const buildDependencyCanvas = (graph) => {
  const steps = graph.steps || [];
  const stepById = Object.fromEntries(steps.map((step, index) => [step.id, { step, index }]));
  const layerCache = {};

  const resolveLayer = (stepId, visiting = new Set()) => {
    if (!stepId || !stepById[stepId]) return 0;
    if (layerCache[stepId] !== undefined) return layerCache[stepId];
    if (visiting.has(stepId)) return 0;
    visiting.add(stepId);
    const deps = stepById[stepId].step.depends_on || [];
    const knownDeps = deps.filter((dependency) => stepById[dependency]);
    const layer = knownDeps.length
      ? Math.max(...knownDeps.map((dependency) => resolveLayer(dependency, visiting))) + 1
      : 0;
    visiting.delete(stepId);
    layerCache[stepId] = layer;
    return layer;
  };

  steps.forEach((step) => resolveLayer(step.id));

  const layers = [];
  steps.forEach((step, index) => {
    const layer = layerCache[step.id] || 0;
    layers[layer] = layers[layer] || [];
    layers[layer].push({ step, index });
  });

  const layerCount = Math.max(layers.length, 1);
  const maxRows = Math.max(...layers.map((layer) => layer?.length || 0), 1);
  const width = (CANVAS_PADDING * 2) + (layerCount * CANVAS_NODE_WIDTH) + ((layerCount - 1) * CANVAS_LAYER_GAP);
  const height = (CANVAS_PADDING * 2) + (maxRows * CANVAS_NODE_HEIGHT) + ((maxRows - 1) * CANVAS_ROW_GAP);
  const positions = {};

  layers.forEach((layer = [], layerIndex) => {
    const layerHeight = (layer.length * CANVAS_NODE_HEIGHT) + (Math.max(layer.length - 1, 0) * CANVAS_ROW_GAP);
    const startY = CANVAS_PADDING + Math.max((height - (CANVAS_PADDING * 2) - layerHeight) / 2, 0);
    layer.forEach(({ step }, rowIndex) => {
      positions[step.id] = {
        x: CANVAS_PADDING + layerIndex * (CANVAS_NODE_WIDTH + CANVAS_LAYER_GAP),
        y: startY + rowIndex * (CANVAS_NODE_HEIGHT + CANVAS_ROW_GAP),
      };
    });
  });

  return { width, height, positions };
};

function DependencyGraphPanel({ script, runStepId, setRunStepId, disabledStepIds }) {
  const graph = React.useMemo(
    () => collectDependencyGraph(script, disabledStepIds),
    [disabledStepIds, script],
  );
  const canvas = React.useMemo(() => buildDependencyCanvas(graph), [graph]);

  if (!script?.steps?.length) return null;

  const hasWarnings = graph.missingEdges.length || graph.disabledDependencyEdges.length;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 4.5,
        border: '1px solid rgba(255, 255, 255, 0.45)',
        bgcolor: 'rgba(255, 255, 255, 0.45)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 32px rgba(15, 23, 42, 0.02), inset 0 1px 0 rgba(255,255,255,0.7)',
      }}
    >
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box sx={{ width: 32, height: 32, borderRadius: 1.5, bgcolor: 'rgba(79, 70, 229, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5' }}>
              <AccountTreeOutlined fontSize="small" />
            </Box>
            <Box>
              <Typography variant="subtitle2" fontWeight={850}>依赖图确认</Typography>
              <Typography variant="caption" color="text.secondary">运行前确认步骤顺序、前置依赖和禁用影响</Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={`${graph.steps.length} 个步骤`} variant="outlined" sx={{ borderRadius: 2, fontWeight: 700 }} />
            <Chip size="small" label={`${graph.edges.length} 条依赖`} color={graph.edges.length ? 'primary' : 'default'} variant="outlined" sx={{ borderRadius: 2, fontWeight: 700 }} />
            <Chip size="small" label={`${graph.rootSteps.length} 个起点`} variant="outlined" sx={{ borderRadius: 2, fontWeight: 700 }} />
            <Chip size="small" label={`${graph.disabled.size} 个禁用`} color={graph.disabled.size ? 'warning' : 'default'} variant="outlined" sx={{ borderRadius: 2, fontWeight: 700 }} />
          </Stack>
        </Stack>

        {hasWarnings && (
          <Alert severity="warning" sx={{ borderRadius: 3.5 }}>
            {!!graph.missingEdges.length && `存在 ${graph.missingEdges.length} 条依赖指向不存在的步骤。`}
            {!!graph.disabledDependencyEdges.length && ` 存在 ${graph.disabledDependencyEdges.length} 条依赖的前置步骤已禁用。`}
          </Alert>
        )}

        {!hasWarnings && (
          <Alert severity="success" sx={{ borderRadius: 3.5 }}>
            当前依赖图可解析，执行时会按 `depends_on` 关系串联步骤。
          </Alert>
        )}

        <Box
          sx={{
            border: '1px solid rgba(15, 23, 42, 0.08)',
            borderRadius: 3.5,
            background: 'radial-gradient(circle at 50% 50%, rgba(248, 250, 252, 0.6) 0%, rgba(241, 245, 249, 0.6) 100%)',
            backdropFilter: 'blur(8px)',
            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.03)',
            overflowX: 'auto',
            overflowY: 'hidden',
            position: 'relative',
          }}
        >
          <Box sx={{ minWidth: Math.max(canvas.width, 760), p: 1 }}>
            <svg
              width="100%"
              height={canvas.height}
              viewBox={`0 0 ${canvas.width} ${canvas.height}`}
              role="img"
              aria-label="API 步骤依赖画布"
              style={{ display: 'block' }}
            >
              <defs>
                <style>{`
                  .node-group {
                    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), filter 0.25s ease;
                  }
                  .node-group:hover {
                    transform: translateY(-4px);
                    filter: drop-shadow(0 12px 28px rgba(99, 102, 241, 0.35));
                  }
                  .node-group-selected {
                    filter: drop-shadow(0 8px 24px rgba(79, 70, 229, 0.25));
                  }
                  .laser-line {
                    stroke-dasharray: 8 6;
                    animation: laserFlow 1.5s linear infinite;
                  }
                  @keyframes laserFlow {
                    from { stroke-dashoffset: 28; }
                    to { stroke-dashoffset: 0; }
                  }
                `}</style>
                <pattern id="cyber-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <rect width="40" height="40" fill="none" />
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(99, 102, 241, 0.05)" strokeWidth="1" />
                  <path d="M 20 0 L 20 20 L 0 20" fill="none" stroke="rgba(99, 102, 241, 0.02)" strokeWidth="0.5" />
                </pattern>
                <linearGradient id="selected-node-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="100%" stopColor="#eef2ff" />
                </linearGradient>
                <linearGradient id="laser-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#818cf8" />
                  <stop offset="100%" stopColor="#4f46e5" />
                </linearGradient>
                <linearGradient id="laser-gradient-warning" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#fbbf24" />
                  <stop offset="100%" stopColor="#d97706" />
                </linearGradient>
                <marker id="dependency-arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="strokeWidth">
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#4f46e5" />
                </marker>
                <marker id="dependency-arrow-warning" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="strokeWidth">
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#d97706" />
                </marker>
              </defs>
              <rect width="100%" height="100%" fill="url(#cyber-grid)" />
              {graph.edges.map((edge) => {
                const from = canvas.positions[edge.from];
                const to = canvas.positions[edge.to];
                if (!from || !to) return null;
                const warning = graph.disabledDependencyEdges.some((item) => item.from === edge.from && item.to === edge.to);
                const fromX = from.x + CANVAS_NODE_WIDTH;
                const fromY = from.y + CANVAS_NODE_HEIGHT / 2;
                const toX = to.x;
                const toY = to.y + CANVAS_NODE_HEIGHT / 2;
                const curve = Math.max((toX - fromX) / 2, 48);
                return (
                  <g key={`${edge.from}-${edge.to}`}>
                    {/* Glowing background line */}
                    <path
                      d={`M ${fromX} ${fromY} C ${fromX + curve} ${fromY}, ${toX - curve} ${toY}, ${toX - 8} ${toY}`}
                      fill="none"
                      stroke={warning ? 'rgba(245, 158, 11, 0.2)' : 'rgba(79, 70, 229, 0.2)'}
                      strokeWidth={4}
                      filter="blur(2px)"
                    />
                    {/* Moving laser dashed line */}
                    <path
                      className="laser-line"
                      d={`M ${fromX} ${fromY} C ${fromX + curve} ${fromY}, ${toX - curve} ${toY}, ${toX - 8} ${toY}`}
                      fill="none"
                      stroke={warning ? 'url(#laser-gradient-warning)' : 'url(#laser-gradient)'}
                      strokeWidth={2}
                      markerEnd={`url(#${warning ? 'dependency-arrow-warning' : 'dependency-arrow'})`}
                    />
                  </g>
                );
              })}
              {graph.steps.map((step, index) => {
                const position = canvas.positions[step.id];
                if (!position) return null;
                const disabled = graph.disabled.has(step.id);
                const selected = runStepId === step.id;
                const methodColors = METHOD_CANVAS_COLORS[step.method] || { bg: '#e2e8f0', border: '#94a3b8', text: '#334155' };
                const missingDependencyCount = (step.depends_on || []).filter((dependency) => (
                  graph.missingEdges.some((edge) => edge.from === dependency && edge.to === step.id)
                )).length;
                return (
                  <g
                    key={step.id || index}
                    className={`node-group ${selected ? 'node-group-selected' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setRunStepId(step.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') setRunStepId(step.id);
                    }}
                    style={{ cursor: 'pointer', outline: 'none' }}
                  >
                    <title>{`${step.id || `s${index + 1}`} ${step.name || step.operation_id || step.path}`}</title>
                    <rect
                      x={position.x}
                      y={position.y}
                      width={CANVAS_NODE_WIDTH}
                      height={CANVAS_NODE_HEIGHT}
                      rx="10"
                      fill={disabled ? 'rgba(248, 250, 252, 0.6)' : selected ? 'url(#selected-node-grad)' : '#ffffff'}
                      stroke={missingDependencyCount ? '#ef4444' : selected ? '#4f46e5' : 'rgba(15, 23, 42, 0.08)'}
                      strokeWidth={selected ? 2.5 : 1.5}
                    />
                    <rect
                      x={position.x}
                      y={position.y}
                      width="6"
                      height={CANVAS_NODE_HEIGHT}
                      rx="3"
                      fill={disabled ? '#94a3b8' : methodColors.border}
                    />
                    <rect
                      x={position.x + 14}
                      y={position.y + 12}
                      width="58"
                      height="24"
                      rx="6"
                      fill={methodColors.bg}
                      stroke={methodColors.border}
                    />
                    <text x={position.x + 43} y={position.y + 28} textAnchor="middle" fontSize="11" fontWeight="700" fill={methodColors.text}>
                      {step.method || 'STEP'}
                    </text>
                    <text x={position.x + 84} y={position.y + 28} fontSize="12" fontWeight="800" fill={disabled ? '#64748b' : '#0f172a'}>
                      {step.id || `s${index + 1}`}
                    </text>
                    {disabled && (
                      <text x={position.x + CANVAS_NODE_WIDTH - 46} y={position.y + 28} fontSize="11" fontWeight="700" fill="#d97706">
                        已禁用
                      </text>
                    )}
                    {missingDependencyCount > 0 && (
                      <text x={position.x + CANVAS_NODE_WIDTH - 58} y={position.y + 28} fontSize="11" fontWeight="700" fill="#dc2626">
                        缺依赖
                      </text>
                    )}
                    <text x={position.x + 16} y={position.y + 58} fontSize="13" fontWeight="800" fill={disabled ? '#64748b' : '#111827'}>
                      {truncateCanvasText(step.name || step.operation_id || step.path, 23)}
                    </text>
                    <text x={position.x + 16} y={position.y + 78} fontSize="11" fill="#64748b" fontFamily="monospace">
                      {truncateCanvasText(step.path || step.operation_id || '', 28)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, 1fr)' }, gap: 2 }}>
          {graph.steps.map((step, index) => {
            const disabled = graph.disabled.has(step.id);
            const selected = runStepId === step.id;
            return (
              <Box
                key={step.id || index}
                role="button"
                tabIndex={0}
                onClick={() => setRunStepId(step.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') setRunStepId(step.id);
                }}
                sx={{
                  p: 2,
                  borderRadius: 3.5,
                  border: '1px solid',
                  borderColor: selected ? 'rgba(79, 70, 229, 0.5)' : 'rgba(15, 23, 42, 0.06)',
                  bgcolor: disabled ? 'rgba(241, 245, 249, 0.5)' : selected ? 'rgba(238, 242, 255, 0.8)' : 'rgba(255, 255, 255, 0.6)',
                  backdropFilter: 'blur(10px)',
                  boxShadow: selected ? '0 8px 24px rgba(79, 70, 229, 0.08)' : '0 2px 8px rgba(0,0,0,0.01)',
                  cursor: 'pointer',
                  opacity: disabled ? 0.72 : 1,
                  outline: 'none',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  '&:hover': {
                    borderColor: selected ? 'rgba(79, 70, 229, 0.7)' : 'rgba(79, 70, 229, 0.3)',
                    bgcolor: selected ? 'rgba(238, 242, 255, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                    transform: 'translateY(-2px)',
                    boxShadow: selected ? '0 12px 28px rgba(79, 70, 229, 0.12)' : '0 6px 16px rgba(0,0,0,0.04)',
                  },
                  '&:focus-visible': { boxShadow: '0 0 0 2px rgba(79, 70, 229, 0.25)' },
                }}
              >
                <Stack spacing={1}>
                  <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Chip size="small" label={step.method || 'STEP'} color={METHOD_COLORS[step.method] || 'default'} sx={{ borderRadius: 1.5, fontWeight: 700 }} />
                    <Typography variant="caption" fontWeight={850}>{step.id || `s${index + 1}`}</Typography>
                    {disabled && <Chip size="small" label="已禁用" color="warning" variant="outlined" sx={{ borderRadius: 1.5 }} />}
                  </Stack>
                  <Typography variant="body2" fontWeight={800} noWrap>{step.name || step.operation_id || step.path}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }} noWrap>{step.path || step.operation_id}</Typography>
                  <Divider />
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {(step.depends_on || []).length ? (
                      (step.depends_on || []).map((dependency) => (
                        <Chip key={dependency} size="small" label={`依赖 ${dependency}`} variant="outlined" color={graph.missingEdges.some((edge) => edge.from === dependency && edge.to === step.id) ? 'error' : 'default'} sx={{ borderRadius: 1.5 }} />
                      ))
                    ) : (
                      <Chip size="small" label="起点步骤" variant="outlined" sx={{ borderRadius: 1.5 }} />
                    )}
                    {!!(graph.dependentsByStep[step.id] || []).length && (
                      <Chip size="small" label={`后续 ${graph.dependentsByStep[step.id].length}`} variant="outlined" color="primary" sx={{ borderRadius: 1.5 }} />
                    )}
                  </Stack>
                </Stack>
              </Box>
            );
          })}
        </Box>
      </Stack>
    </Paper>
  );
}

const getDslFieldCompletions = (docBeforeCursor) => {
  if (/"assertions"\s*:\s*\[[\s\S]*$/.test(docBeforeCursor)) return ASSERTION_FIELDS;
  if (/"extractions"\s*:\s*\[[\s\S]*$/.test(docBeforeCursor)) return EXTRACTION_FIELDS;
  if (/"(?:steps|cleanup_steps)"\s*:\s*\[[\s\S]*$/.test(docBeforeCursor)) return STEP_FIELDS;
  return ROOT_FIELDS;
};

const dslCompletionSource = (context) => {
  const line = context.state.doc.lineAt(context.pos);
  const beforeLine = line.text.slice(0, context.pos - line.from);
  const docBeforeCursor = context.state.doc.sliceString(0, context.pos);
  const stringMatch = beforeLine.match(/"([^"]*)$/);
  const keyPrefixMatch = beforeLine.match(/(?:^|[,{]\s*)"([^"]*)$/);
  const valuePrefixMatch = beforeLine.match(/"([^"]+)"\s*:\s*"([^"]*)$/);

  if (valuePrefixMatch) {
    const [, fieldName, prefix] = valuePrefixMatch;
    const valuesByField = {
      method: HTTP_METHODS,
      type: ASSERTION_TYPE_VALUES,
      source: EXTRACTION_SOURCE_VALUES,
    };
    const values = valuesByField[fieldName];
    if (!values) return null;
    return {
      from: context.pos - prefix.length,
      options: values.map(quotedValueCompletion),
    };
  }

  if (keyPrefixMatch || (context.explicit && stringMatch)) {
    const prefix = (keyPrefixMatch || stringMatch)?.[1] || '';
    return {
      from: context.pos - prefix.length,
      options: getDslFieldCompletions(docBeforeCursor).map(quotedFieldCompletion),
    };
  }

  return null;
};

export default function StepOrchestrate() {
  const {
    dslText, setDslText, enhanceDslWithAi, globalHeadersText, setGlobalHeadersText,
    bearerToken, setBearerToken, parsedScript, runStepId, setRunStepId, runSelectedStep, runAllSteps, forceStopActiveExecution, loading,
    baseUrl, setBaseUrl, exportPytestScript, exportPostmanCollection, aiPatch, applyAiPatch,
    backgroundRunStatus, activeExecutionMode, aiEnhancing, runReport, disabledFlowStepIds, setDisabledFlowStepIds, requestConfirm,
    generateAiRepairPatch,
    selectedProjectId, projectName
  } = useAPIExecution();
  const [flowDirty, setFlowDirty] = React.useState(false);
  const [repairDraftOpen, setRepairDraftOpen] = React.useState(false);
  const autoRepairSuggestionRunRef = React.useRef('');
  const executionDisabled = loading || ['queued', 'running'].includes(backgroundRunStatus);
  const lowRiskRepairOperations = React.useMemo(
    () => getLowRiskRepairOperations(aiPatch?.repair_draft),
    [aiPatch?.repair_draft],
  );
  const jsonValidation = React.useMemo(() => {
    if (!dslText.trim()) return { valid: false, message: '暂无脚本' };
    try {
      const parsed = JSON.parse(dslText);
      return { valid: true, message: `${parsed.steps?.length || 0} 个步骤` };
    } catch (error) {
      return { valid: false, message: error.message || 'JSON 格式错误' };
    }
  }, [dslText]);

  const beautifyDslJson = () => {
    try {
      setDslText(JSON.stringify(JSON.parse(dslText), null, 2));
    } catch {
      // Invalid JSON is already surfaced in the editor status.
    }
  };

  const copyDslJson = async () => {
    if (!dslText) return;
    await navigator.clipboard?.writeText(dslText);
  };

  const confirmBeforeExecution = async () => {
    if (!flowDirty) return true;
    return requestConfirm('当前步骤配置有未保存修改，直接执行会使用上一次保存的 DSL。仍然继续执行？');
  };

  const handleRunSelectedStep = async () => {
    if (!await confirmBeforeExecution()) return;
    runSelectedStep();
  };

  const handleRunAllSteps = async () => {
    if (!await confirmBeforeExecution()) return;
    runAllSteps();
  };

  const applyRepairDraft = async () => {
    if (!aiPatch?.repair_draft?.draft_script) return;
    const operations = aiPatch?.repair_draft?.patch_operations || aiPatch?.patch_operations || [];
    const confirmed = await requestConfirm(buildRepairApplyConfirmMessage('确认应用完整 AI 修复草稿？', operations));
    if (!confirmed) return;
    setDslText(JSON.stringify(markAiRepairSource(aiPatch.repair_draft.draft_script, 'full_repair_draft', operations), null, 2));
    setRepairDraftOpen(false);
  };

  const applyLowRiskRepairOperations = async () => {
    if (!parsedScript || !lowRiskRepairOperations.length) return;
    const confirmed = await requestConfirm(buildRepairApplyConfirmMessage('确认仅应用低风险 AI 修复项？', lowRiskRepairOperations));
    if (!confirmed) return;
    const patched = applyRepairOperationsToScript(parsedScript, lowRiskRepairOperations);
    setDslText(JSON.stringify(markAiRepairSource(patched, 'low_risk_repair', lowRiskRepairOperations), null, 2));
    setRepairDraftOpen(false);
  };

  const applyDirectAiPatch = async () => {
    const operations = aiPatch?.patch_operations || [];
    if (!operations.length) return;
    const confirmed = await requestConfirm(buildRepairApplyConfirmMessage('确认应用 AI 补丁到脚本？', operations));
    if (!confirmed) return;
    if (aiPatch?.repair_draft?.draft_script) {
      setDslText(JSON.stringify(markAiRepairSource(aiPatch.repair_draft.draft_script, 'direct_patch', operations), null, 2));
      return;
    }
    applyAiPatch();
  };

  React.useEffect(() => {
    const runKey = runReport?.run_id || runReport?.run_at || '';
    if (!runKey || runReport?.status !== 'failed' || !parsedScript || loading || aiEnhancing) return;
    if (autoRepairSuggestionRunRef.current === runKey) return;
    autoRepairSuggestionRunRef.current = runKey;
    generateAiRepairPatch(runReport);
  }, [aiEnhancing, generateAiRepairPatch, loading, parsedScript, runReport]);

  return (
    <>
    <Stack spacing={4}>
                <StageHeader
                  title="编排与执行"
                  action={(
                    <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                      <Button 
                        variant={activeExecutionMode === 'single' ? 'contained' : 'outlined'} 
                        color={activeExecutionMode === 'single' ? 'warning' : 'primary'}
                        startIcon={<PlayCircleOutlineOutlined />} 
                        disabled={!dslText || (executionDisabled && activeExecutionMode !== 'single')} 
                        onClick={activeExecutionMode === 'single' ? forceStopActiveExecution : handleRunSelectedStep}
                        sx={{ borderRadius: 2, fontWeight: 700, px: 3, bgcolor: activeExecutionMode === 'single' ? undefined : '#ffffff' }}
                      >
                        {activeExecutionMode === 'single' ? '强制结束单步' : '单步执行选中步骤'}
                      </Button>
                      <Button 
                        variant="contained" 
                        color={activeExecutionMode === 'all' ? 'warning' : 'primary'}
                        disabled={!dslText || (executionDisabled && activeExecutionMode !== 'all')} 
                        onClick={activeExecutionMode === 'all' ? forceStopActiveExecution : handleRunAllSteps}
                        sx={{ 
                          borderRadius: 2, 
                          fontWeight: 800, 
                          px: 4,
                          background: activeExecutionMode === 'all' ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          boxShadow: activeExecutionMode === 'all' ? '0 4px 14px rgba(245, 158, 11, 0.28)' : '0 4px 14px rgba(16, 185, 129, 0.3)',
                          '&:hover': {
                            background: activeExecutionMode === 'all' ? 'linear-gradient(135deg, #d97706 0%, #b45309 100%)' : 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                          }
                        }}
                      >
                        {activeExecutionMode === 'all' ? '强制结束执行' : '全量链路执行'}
                      </Button>
                    </Stack>
                  )}
                />

                <DependencyGraphPanel
                  script={parsedScript}
                  runStepId={runStepId}
                  setRunStepId={setRunStepId}
                  disabledStepIds={disabledFlowStepIds}
                />

                <Paper sx={{ 
                  borderRadius: 4.5, 
                  border: '1px solid rgba(255, 255, 255, 0.45)', 
                  bgcolor: 'rgba(255, 255, 255, 0.45)',
                  backdropFilter: 'blur(20px)',
                  boxShadow: '0 8px 32px rgba(15, 23, 42, 0.02), inset 0 1px 0 rgba(255,255,255,0.7)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  <Box sx={{ 
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap',
                    p: 2.5, borderBottom: '1px solid rgba(0, 0, 0, 0.06)', bgcolor: 'rgba(255, 255, 255, 0.25)'
                  }}>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Box sx={{ width: 44, height: 44, borderRadius: '12px', bgcolor: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5', boxShadow: '0 2px 8px rgba(79, 70, 229, 0.15)' }}>
                      <DataObjectOutlined />
                    </Box>
                    <Box>
                      <Typography variant="subtitle2" fontWeight={800} color="text.primary" sx={{ mb: 0.5 }}>流程核心 (DSL)</Typography>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: jsonValidation.valid ? 'success.main' : 'error.main', boxShadow: jsonValidation.valid ? '0 0 8px rgba(34, 197, 94, 0.6)' : 'none' }} />
                        <Typography variant="caption" color={jsonValidation.valid ? 'text.secondary' : 'error.main'} fontWeight={600}>
                          {jsonValidation.valid ? `语法就绪 · ${jsonValidation.message}` : jsonValidation.message}
                        </Typography>
                      </Stack>
                    </Box>
                  </Stack>
                  
                  <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Button size="small" variant="outlined" startIcon={<FormatAlignLeftOutlined />} disabled={!dslText || !jsonValidation.valid} onClick={beautifyDslJson} sx={{ borderRadius: 2, bgcolor: '#fff' }}>一键美化</Button>
                    <Button size="small" variant="outlined" startIcon={<ContentCopyOutlined />} disabled={!dslText} onClick={copyDslJson} sx={{ borderRadius: 2, bgcolor: '#fff' }}>复制</Button>
                    <Button size="small" variant="outlined" onClick={exportPytestScript} sx={{ borderRadius: 2, bgcolor: '#fff' }}>导出 Pytest</Button>
                    <Button size="small" variant="outlined" onClick={exportPostmanCollection} sx={{ borderRadius: 2, bgcolor: '#fff' }}>导出 Postman</Button>
                    <Button
                      size="small"
                      variant="contained"
                      disabled={!parsedScript || loading}
                      onClick={enhanceDslWithAi}
                      startIcon={aiEnhancing ? <CircularProgress size={14} color="inherit" thickness={5} /> : <AutoAwesomeOutlined fontSize="small" />}
                      sx={{
                        borderRadius: 2,
                        background: 'linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%)',
                        color: '#fff',
                        fontWeight: 800,
                        boxShadow: '0 4px 12px rgba(217, 70, 239, 0.3)',
                        '&:hover': {
                          background: 'linear-gradient(135deg, #7c3aed 0%, #c026d3 100%)',
                          boxShadow: '0 6px 16px rgba(217, 70, 239, 0.4)',
                        }
                      }}
                    >
                      {aiEnhancing ? 'AI 深度编排中...' : '智能补全编排'}
                    </Button>
                  </Stack>
                </Box>

                <FlowWorkbench
                  dslText={dslText}
                  setDslText={setDslText}
                  parsedScript={parsedScript}
                  runStepId={runStepId}
                  setRunStepId={setRunStepId}
                  baseUrl={baseUrl}
                  setBaseUrl={setBaseUrl}
                  bearerToken={bearerToken}
                  setBearerToken={setBearerToken}
                  globalHeadersText={globalHeadersText}
                  setGlobalHeadersText={setGlobalHeadersText}
                  runReport={runReport}
                  disabledStepIds={disabledFlowStepIds}
                  setDisabledStepIds={setDisabledFlowStepIds}
                  onDirtyChange={setFlowDirty}
                  requestConfirm={requestConfirm}
                  selectedProjectId={selectedProjectId}
                  projectName={projectName}
                  completionSource={dslCompletionSource}
                />
              </Paper>

                {aiPatch?.patch_operations?.length > 0 && (
                  <Paper 
                    elevation={0} 
                    sx={{ 
                      p: 3, 
                      borderRadius: 4, 
                      border: '1px solid',
                      borderColor: aiPatch.automatic_applicable ? 'success.light' : 'warning.light',
                      bgcolor: aiPatch.automatic_applicable ? '#f0fdf4' : '#fffbeb',
                      position: 'relative',
                      overflow: 'hidden',
                      boxShadow: '0 8px 24px -8px rgba(0,0,0,0.05)'
                    }}
                  >
                    <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, bgcolor: aiPatch.automatic_applicable ? 'success.main' : 'warning.main' }} />
                    <Stack spacing={2}>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Box sx={{ width: 32, height: 32, borderRadius: 1.5, bgcolor: aiPatch.automatic_applicable ? 'success.100' : 'warning.100', display: 'flex', alignItems: 'center', justifyContent: 'center', color: aiPatch.automatic_applicable ? 'success.main' : 'warning.main' }}>
                          <AutoAwesomeOutlined fontSize="small" />
                        </Box>
                        <Typography variant="subtitle1" fontWeight={800} sx={{ color: aiPatch.automatic_applicable ? 'success.dark' : 'warning.dark' }}>
                          {aiPatch.summary}
                        </Typography>
                      </Stack>
                      <Stack spacing={1.5} sx={{ pl: 5.5 }}>
                        {aiPatch.patch_operations.map((operation, index) => (
                          <Box key={`${operation.step_id}-${operation.field}-${index}`} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                            <Box sx={{ mt: 1, width: 5, height: 5, borderRadius: '50%', bgcolor: aiPatch.automatic_applicable ? 'success.main' : 'warning.main', opacity: 0.5 }} />
                            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                              <Typography component="span" fontWeight={800} color="text.primary" sx={{ fontFamily: 'monospace', bgcolor: 'rgba(0,0,0,0.04)', px: 0.5, py: 0.2, borderRadius: 1 }}>{operation.step_id}</Typography>
                              <Typography component="span" fontWeight={700} sx={{ ml: 1, color: 'primary.main' }}>[{operation.field}]</Typography>
                              {' '}{operation.reason}
                            </Typography>
                          </Box>
                        ))}
                      </Stack>
                      <Stack direction="row" spacing={2} sx={{ pl: 5.5, pt: 1.5 }}>
                        {!!aiPatch.repair_draft?.draft_script && (
                          <Button 
                            size="small" 
                            variant="contained" 
                            color={aiPatch.automatic_applicable ? 'success' : 'warning'} 
                            onClick={() => setRepairDraftOpen(true)} 
                            sx={{ borderRadius: 2, fontWeight: 800, boxShadow: 'none' }}
                          >
                            预览修复编排
                          </Button>
                        )}
                        <Button 
                          size="small" 
                          variant="outlined" 
                          onClick={applyDirectAiPatch} 
                          sx={{ borderRadius: 2, fontWeight: 700, bgcolor: '#ffffff', borderColor: aiPatch.automatic_applicable ? 'success.light' : 'warning.light', color: aiPatch.automatic_applicable ? 'success.dark' : 'warning.dark' }}
                        >
                          直接应用修复
                        </Button>
                      </Stack>
                    </Stack>
                  </Paper>
                )}
              </Stack>
              <AIFlowDraftDialog
                open={repairDraftOpen}
                draft={aiPatch?.repair_draft}
                onClose={() => setRepairDraftOpen(false)}
                onApply={applyRepairDraft}
                onApplyLowRisk={applyLowRiskRepairOperations}
              />
  </>
  );
}
