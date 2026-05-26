import React from 'react';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Alert, Box, Button, Chip, Paper, Stack, Tooltip, Typography } from '@mui/material';
import {
  AccountTreeOutlined,
  CallSplitOutlined,
  LinkOffOutlined,
  RestartAltOutlined,
  SaveOutlined,
} from '@mui/icons-material';
import { METHOD_COLORS } from '../../APIExecution/constants';
import {
  applyDependencyConnection,
  applyParallelGroup,
  buildFlowGraph,
  buildFlowLayout,
  buildFlowSummary,
  clearParallelGroups,
  removeDependencyConnection,
  validateParallelGroupSelection,
  wouldCreateDependencyCycle,
} from '../utils/flowAnalysis';

const nodeTypes = { apiStep: ApiStepNode };

const cloneSteps = (steps) => JSON.parse(JSON.stringify(steps || []));

function ApiStepNode({ data, selected }) {
  const { step, index, refs, result, disabled } = data;
  return (
    <Paper
      elevation={0}
      sx={{
        position: 'relative',
        width: 260,
        minHeight: 132,
        p: 1.25,
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: disabled ? 'rgba(241,245,249,0.92)' : selected ? 'rgba(25,118,210,0.08)' : '#fff',
        opacity: disabled ? 0.62 : 1,
        boxShadow: selected ? '0 10px 26px rgba(25,118,210,0.18)' : '0 6px 18px rgba(15,23,42,0.08)',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ width: 8, height: 8, background: '#64748b', borderColor: '#fff', opacity: 0.72 }} />
      <Handle type="source" position={Position.Right} style={{ width: 8, height: 8, background: '#64748b', borderColor: '#fff', opacity: 0.72 }} />
      <Stack spacing={0.75}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
          <Chip size="small" label={step.method} color={METHOD_COLORS[step.method] || 'default'} variant="outlined" sx={{ fontWeight: 800 }} />
          <Typography variant="caption" color="text.secondary">#{index + 1}</Typography>
        </Stack>
        <Typography variant="body2" fontWeight={800} noWrap>{step.name || step.id}</Typography>
        <Tooltip title={step.path || ''} arrow enterDelay={300} disableHoverListener={!step.path}>
          <Typography
            variant="caption"
            color="text.secondary"
            style={{ WebkitBoxOrient: 'vertical' }}
            sx={{
              fontFamily: 'monospace',
              wordBreak: 'break-all',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              cursor: step.path ? 'help' : 'default',
            }}
          >
            {step.path}
          </Typography>
        </Tooltip>
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
          {!!step.parallel_group && <Chip size="small" label={step.parallel_group} color="info" variant="outlined" />}
          {!!step.assertions?.length && <Chip size="small" label={`${step.assertions.length} 断言`} variant="outlined" />}
          {!!step.extractions?.length && <Chip size="small" label={`${step.extractions.length} 提取`} color="success" variant="outlined" />}
          {!!refs.length && <Chip size="small" label={`${refs.length} 引用`} color="warning" variant="outlined" />}
          {result && <Chip size="small" label={result.status} color={result.status === 'passed' ? 'success' : 'error'} variant="outlined" />}
        </Stack>
      </Stack>
    </Paper>
  );
}

export default function FlowGraphView({
  steps,
  activeStepId,
  disabledSet,
  getResultForStep,
  onSelectStep,
  onApplyOrchestration,
  height = 440,
  dense = false,
}) {
  return (
    <ReactFlowProvider>
      <EditableFlowGraph
        steps={steps}
        activeStepId={activeStepId}
        disabledSet={disabledSet}
        getResultForStep={getResultForStep}
        onSelectStep={onSelectStep}
        onApplyOrchestration={onApplyOrchestration}
        height={height}
        dense={dense}
      />
    </ReactFlowProvider>
  );
}

function EditableFlowGraph({
  steps,
  activeStepId,
  disabledSet,
  getResultForStep,
  onSelectStep,
  onApplyOrchestration,
  height,
  dense,
}) {
  const [draftSteps, setDraftSteps] = React.useState(() => cloneSteps(steps));
  const [nodes, setNodes] = React.useState([]);
  const [edges, setEdges] = React.useState([]);
  const [selectedNodeIds, setSelectedNodeIds] = React.useState([]);
  const [dirtyCount, setDirtyCount] = React.useState(0);
  const [message, setMessage] = React.useState('');
  const sourceSignature = React.useMemo(
    () => JSON.stringify((steps || []).map((step) => ({
      id: step.id,
      depends_on: step.depends_on || [],
      parallel_group: step.parallel_group || '',
    }))),
    [steps],
  );

  React.useEffect(() => {
    setDraftSteps(cloneSteps(steps));
    setDirtyCount(0);
    setSelectedNodeIds([]);
    setMessage('');
  }, [sourceSignature, steps]);

  const draftSummary = React.useMemo(() => buildFlowSummary({ steps: draftSteps }), [draftSteps]);
  const draftGraph = React.useMemo(() => buildFlowGraph(draftSteps, draftSummary, { includeInferredSequence: false }), [draftSteps, draftSummary]);

  React.useEffect(() => {
    const layout = buildFlowLayout(draftSteps);
    setNodes((previousNodes) => {
      const previousById = new Map(previousNodes.map((node) => [node.id, node]));
      return draftSteps.map((step, index) => {
        const previous = previousById.get(step.id);
        const layoutPosition = layout.positions.get(step.id) || { x: 32 + index * 330, y: 36 };
        return {
          id: step.id,
          type: 'apiStep',
          position: previous?.position || { x: layoutPosition.x, y: layoutPosition.y },
          data: {
            step,
            index,
            refs: draftSummary.consumed.get(step.id) || [],
            result: getResultForStep(step.id),
            disabled: disabledSet.has(step.id),
          },
          selected: step.id === activeStepId,
          draggable: true,
          deletable: false,
        };
      });
    });
  }, [activeStepId, disabledSet, draftSteps, draftSummary, getResultForStep]);

  React.useEffect(() => {
    const dependencyEdges = draftGraph.dependencyEdges.map((edge) => ({
      id: `dep-${edge.from}-${edge.to}`,
      source: edge.from,
      target: edge.to,
      type: 'smoothstep',
      label: 'depends',
      markerEnd: { type: MarkerType.ArrowClosed },
      data: { kind: 'dependency' },
      style: { stroke: '#475569', strokeWidth: 2 },
      labelStyle: { fill: '#475569', fontWeight: 700 },
      deletable: true,
    }));
    const resourceEdgeKeys = new Set((draftGraph.resourceEdges || []).map((edge) => `${edge.from}->${edge.to}:${edge.name}`));
    const visibleVariableEdges = draftGraph.variableEdges.filter((edge) => !resourceEdgeKeys.has(`${edge.from}->${edge.to}:${edge.name}`));
    const variableEdges = visibleVariableEdges.map((edge, index) => ({
      id: `var-${edge.from}-${edge.to}-${edge.name}-${index}`,
      source: edge.from,
      target: edge.to,
      type: 'smoothstep',
      label: `{{${edge.name}}}`,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#059669' },
      data: { kind: 'variable' },
      style: { stroke: '#059669', strokeWidth: 2, strokeDasharray: '6 5' },
      labelStyle: { fill: '#047857', fontWeight: 700 },
      selectable: false,
      deletable: false,
      animated: true,
    }));
    const resourceEdges = (draftGraph.resourceEdges || []).map((edge, index) => ({
      id: `resource-${edge.from}-${edge.to}-${edge.name}-${index}`,
      source: edge.from,
      target: edge.to,
      type: 'smoothstep',
      label: `资源 ${edge.name}`,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#2563eb' },
      data: { kind: 'resource' },
      style: {
        stroke: '#2563eb',
        strokeWidth: 2.5,
        strokeDasharray: edge.inferred ? '2 6' : '8 4',
      },
      labelStyle: { fill: '#1d4ed8', fontWeight: 800 },
      labelBgStyle: { fill: '#eff6ff', fillOpacity: 0.96 },
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 4,
      selectable: false,
      deletable: false,
      animated: true,
    }));
    setEdges([...dependencyEdges, ...resourceEdges, ...variableEdges]);
  }, [draftGraph]);

  const updateDraftSteps = React.useCallback((nextSteps, feedback = '') => {
    setDraftSteps(nextSteps);
    setDirtyCount((count) => count + 1);
    setMessage(feedback);
  }, []);

  const onNodesChange = React.useCallback((changes) => {
    setNodes((items) => applyNodeChanges(changes, items));
  }, []);

  const onEdgesChange = React.useCallback((changes) => {
    setEdges((items) => applyEdgeChanges(changes, items));
  }, []);

  const onConnect = React.useCallback((connection) => {
    const result = applyDependencyConnection(draftSteps, connection.source, connection.target);
    if (!result.changed) {
      setMessage(result.error || '未产生新的依赖。');
      return;
    }
    updateDraftSteps(result.steps, '已添加依赖，点击“应用到 DSL”后生效。');
    setEdges((items) => addEdge({ ...connection, id: `dep-${connection.source}-${connection.target}` }, items));
  }, [draftSteps, updateDraftSteps]);

  const onEdgesDelete = React.useCallback((deletedEdges) => {
    let nextSteps = draftSteps;
    let changed = false;
    deletedEdges.filter((edge) => edge.data?.kind === 'dependency').forEach((edge) => {
      const result = removeDependencyConnection(nextSteps, edge.source, edge.target);
      nextSteps = result.steps;
      changed = changed || result.changed;
    });
    if (changed) updateDraftSteps(nextSteps, '已删除依赖，点击“应用到 DSL”后生效。');
  }, [draftSteps, updateDraftSteps]);

  const isValidConnection = React.useCallback((connection) => (
    !wouldCreateDependencyCycle(draftSteps, connection.source, connection.target)
  ), [draftSteps]);

  const applySelectedParallelGroup = () => {
    const result = applyParallelGroup(draftSteps, selectedNodeIds, draftSummary, disabledSet);
    if (!result.changed) {
      setMessage(result.error || '无法设置并行组。');
      return;
    }
    updateDraftSteps(result.steps, `已设置并行组 ${result.groupName}。`);
  };

  const clearSelectedParallelGroups = () => {
    const result = clearParallelGroups(draftSteps, selectedNodeIds);
    if (!result.changed) {
      setMessage('请选择已有并行组的节点。');
      return;
    }
    updateDraftSteps(result.steps, '已取消所选节点的并行组。');
  };

  const applyToDsl = () => {
    onApplyOrchestration?.(cloneSteps(draftSteps));
    setDirtyCount(0);
    setMessage('编排变更已应用到 DSL。');
  };

  const resetDraft = () => {
    setDraftSteps(cloneSteps(steps));
    setDirtyCount(0);
    setSelectedNodeIds([]);
    setMessage('已恢复到当前 DSL。');
  };

  const parallelValidation = validateParallelGroupSelection(draftSteps, selectedNodeIds, draftSummary, disabledSet);

  if (!steps.length) {
    return <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>暂无步骤可视化。</Typography>;
  }

  return (
    <Box sx={{ mt: dense ? 0 : 1.5, borderTop: dense ? 'none' : '1px solid rgba(255,255,255,0.65)', pt: dense ? 0 : 1.5 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} sx={{ mb: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip size="small" icon={<AccountTreeOutlined />} label={`${draftSteps.length} 步`} variant="outlined" />
          <Chip size="small" label={`${draftGraph.dependencyEdges.length} 依赖`} variant="outlined" sx={{ borderColor: '#475569', color: '#334155' }} />
          <Chip size="small" label={`${draftGraph.variableEdges.length} 变量`} variant="outlined" sx={{ borderColor: '#059669', color: '#047857' }} />
          {!!draftGraph.resourceEdges?.length && <Chip size="small" label={`${draftGraph.resourceEdges.length} 资源引线`} variant="outlined" sx={{ borderColor: '#2563eb', color: '#1d4ed8' }} />}
          {!!dirtyCount && <Chip size="small" color="warning" label={`${dirtyCount} 项未应用`} />}
        </Stack>
        <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
          <Tooltip title={parallelValidation.valid ? '为所选安全读请求设置并行组' : parallelValidation.error}>
            <span>
              <Button size="small" variant="outlined" startIcon={<CallSplitOutlined />} disabled={!parallelValidation.valid} onClick={applySelectedParallelGroup}>
                设并行组
              </Button>
            </span>
          </Tooltip>
          <Button size="small" variant="outlined" startIcon={<LinkOffOutlined />} onClick={clearSelectedParallelGroups}>
            取消并行
          </Button>
          <Button size="small" variant="outlined" startIcon={<RestartAltOutlined />} disabled={!dirtyCount} onClick={resetDraft}>
            重置
          </Button>
          <Button size="small" variant="contained" startIcon={<SaveOutlined />} disabled={!dirtyCount} onClick={applyToDsl}>
            应用到 DSL
          </Button>
        </Stack>
      </Stack>
      {!!message && <Alert severity={message.includes('不能') || message.includes('无法') || message.includes('循环') ? 'warning' : 'info'} sx={{ mb: 1 }}>{message}</Alert>}
      <Box
        sx={{
          height: typeof height === 'number' ? `${height}px` : height,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1.5,
          overflow: 'hidden',
          bgcolor: '#f8fafc',
          '& .react-flow__attribution': { display: 'none' },
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          onSelectionChange={({ nodes: selectedNodes }) => setSelectedNodeIds(selectedNodes.map((node) => node.id))}
          onNodeClick={(_, node) => onSelectStep?.(node.id)}
          isValidConnection={isValidConnection}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable
          nodesConnectable
          elementsSelectable
        >
          <Background gap={28} size={1} color="rgba(15,23,42,0.14)" />
          <Controls />
          <MiniMap pannable zoomable nodeStrokeWidth={3} style={{ borderRadius: 8 }} />
        </ReactFlow>
      </Box>
      <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
        <Chip size="small" label="实线：depends_on，可编辑" variant="outlined" sx={{ borderColor: '#475569', color: '#334155' }} />
        <Chip size="small" label="蓝色点划线：资源 ID 流向，只读" variant="outlined" sx={{ borderColor: '#2563eb', color: '#1d4ed8' }} />
        <Chip size="small" label="虚线：变量传递，只读" variant="outlined" sx={{ borderColor: '#059669', color: '#047857' }} />
      </Stack>
    </Box>
  );
}
