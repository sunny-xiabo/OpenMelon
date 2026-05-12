import React from 'react';
import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import { METHOD_COLORS } from '../../APIExecution/constants';

export default function FlowGraphView({
  steps,
  activeStepId,
  disabledSet,
  flowSummary,
  flowGraph,
  getResultForStep,
  onSelectStep,
}) {
  const nodeWidth = 220;
  const nodeHeight = 118;
  const gap = 72;
  const top = 54;
  const left = 28;
  const width = Math.max(640, left * 2 + steps.length * nodeWidth + Math.max(0, steps.length - 1) * gap);
  const height = 300;
  const [scale, setScale] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const panRef = React.useRef(null);
  const positions = React.useMemo(() => new Map(steps.map((step, index) => [
    step.id,
    {
      x: left + index * (nodeWidth + gap),
      y: top + (index % 2) * 34,
    },
  ])), [steps]);

  const centerOf = (stepId, side = 'right') => {
    const position = positions.get(stepId) || { x: left, y: top };
    return {
      x: position.x + (side === 'left' ? 0 : nodeWidth),
      y: position.y + nodeHeight / 2,
    };
  };

  const renderEdge = (edge, index, color, dashed = false, label = '') => {
    const start = centerOf(edge.from);
    const end = centerOf(edge.to, 'left');
    const midX = (start.x + end.x) / 2;
    const offset = edge.type === 'variable' ? 34 : edge.inferred ? -24 : 0;
    const path = `M ${start.x} ${start.y + offset} C ${midX} ${start.y + offset}, ${midX} ${end.y + offset}, ${end.x} ${end.y + offset}`;
    return (
      <g key={`${edge.type}-${edge.from}-${edge.to}-${edge.name || index}`}>
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={dashed ? '6 5' : undefined}
          markerEnd={`url(#arrow-${edge.type})`}
          opacity="0.84"
        />
        {label && (
          <text x={midX} y={Math.min(start.y, end.y) + offset - 8} textAnchor="middle" fill={color} fontSize="11" fontWeight="700">
            {label}
          </text>
        )}
      </g>
    );
  };

  if (!steps.length) {
    return <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>暂无步骤可视化。</Typography>;
  }

  const clampScale = (value) => Math.min(1.6, Math.max(0.6, value));
  const zoomBy = (delta) => setScale((prev) => clampScale(Number((prev + delta).toFixed(2))));
  const resetView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const handleWheel = (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    zoomBy(event.deltaY > 0 ? -0.08 : 0.08);
  };

  const handleMouseDown = (event) => {
    panRef.current = { startX: event.clientX, startY: event.clientY, origin: offset };
  };

  const handleMouseMove = (event) => {
    if (!panRef.current) return;
    const next = {
      x: panRef.current.origin.x + event.clientX - panRef.current.startX,
      y: panRef.current.origin.y + event.clientY - panRef.current.startY,
    };
    setOffset(next);
  };

  const stopPan = () => {
    panRef.current = null;
  };

  return (
    <Box sx={{ mt: 1.5, borderTop: '1px solid rgba(255,255,255,0.65)', pt: 1.5 }}>
      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mb: 1 }}>
        <Button size="small" variant="outlined" onClick={() => zoomBy(-0.1)}>缩小</Button>
        <Button size="small" variant="outlined" onClick={() => zoomBy(0.1)}>放大</Button>
        <Button size="small" variant="outlined" onClick={resetView}>重置</Button>
      </Stack>
      <Box
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopPan}
        onMouseLeave={stopPan}
        sx={{
          overflow: 'hidden',
          borderRadius: 2,
          bgcolor: 'rgba(255,255,255,0.38)',
          cursor: panRef.current ? 'grabbing' : 'grab',
          height,
        }}
      >
      <Box sx={{ position: 'relative', minWidth: width, height, transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: '0 0' }}>
        <svg width={width} height={height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <defs>
            <marker id="arrow-dependency" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
              <path d="M 0 0 L 8 4 L 0 8 z" fill="#64748b" />
            </marker>
            <marker id="arrow-sequence" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
              <path d="M 0 0 L 8 4 L 0 8 z" fill="#94a3b8" />
            </marker>
            <marker id="arrow-variable" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
              <path d="M 0 0 L 8 4 L 0 8 z" fill="#059669" />
            </marker>
          </defs>
          {flowGraph.dependencyEdges.map((edge, index) => renderEdge(edge, index, edge.inferred ? '#94a3b8' : '#64748b', edge.inferred, edge.inferred ? '' : 'depends'))}
          {flowGraph.variableEdges.map((edge, index) => renderEdge(edge, index, '#059669', true, `{{${edge.name}}}`))}
        </svg>
        {steps.map((step, index) => {
          const position = positions.get(step.id);
          const selected = step.id === activeStepId;
          const refs = flowSummary.consumed.get(step.id) || [];
          const result = getResultForStep(step.id);
          return (
            <Paper
              key={step.id}
              elevation={0}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => onSelectStep(step.id)}
              sx={{
                position: 'absolute',
                left: position.x,
                top: position.y,
                width: nodeWidth,
                height: nodeHeight,
                p: 1.25,
                borderRadius: 2,
                border: '1px solid',
                borderColor: selected ? 'primary.main' : 'divider',
                bgcolor: disabledSet.has(step.id) ? 'rgba(241,245,249,0.86)' : selected ? 'rgba(99,102,241,0.10)' : 'rgba(255,255,255,0.92)',
                opacity: disabledSet.has(step.id) ? 0.62 : 1,
                cursor: 'pointer',
                boxShadow: selected ? '0 8px 24px rgba(99,102,241,0.15)' : '0 4px 14px rgba(15,23,42,0.06)',
              }}
            >
              <Stack spacing={0.75} sx={{ height: '100%' }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                  <Chip size="small" label={step.method} color={METHOD_COLORS[step.method] || 'default'} variant="outlined" sx={{ fontWeight: 800 }} />
                  <Typography variant="caption" color="text.secondary">#{index + 1}</Typography>
                </Stack>
                <Typography variant="body2" fontWeight={800} noWrap>{step.name || step.id}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {step.path}
                </Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 'auto' }}>
                  {!!step.assertions?.length && <Chip size="small" label={`${step.assertions.length} 断言`} variant="outlined" />}
                  {!!step.extractions?.length && <Chip size="small" label={`${step.extractions.length} 提取`} color="success" variant="outlined" />}
                  {!!refs.length && <Chip size="small" label={`${refs.length} 引用`} color="warning" variant="outlined" />}
                  {result && <Chip size="small" label={result.status} color={result.status === 'passed' ? 'success' : 'error'} variant="outlined" />}
                </Stack>
              </Stack>
            </Paper>
          );
        })}
        <Stack direction="row" spacing={1} sx={{ position: 'absolute', left, bottom: 8 }}>
          <Chip size="small" label="顺序/依赖" variant="outlined" sx={{ borderColor: '#64748b', color: '#475569' }} />
          <Chip size="small" label="变量传递" variant="outlined" sx={{ borderColor: '#059669', color: '#047857' }} />
        </Stack>
      </Box>
      </Box>
    </Box>
  );
}
