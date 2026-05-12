import {
  Box,
  Chip,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  DragIndicatorOutlined,
  KeyboardArrowDownOutlined,
  KeyboardArrowUpOutlined,
  SwapVertOutlined,
} from '@mui/icons-material';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { METHOD_COLORS } from '../../APIExecution/constants';

export default function FlowStepList({
  steps,
  activeStepId,
  disabledSet,
  flowSummary,
  activeDragStepId,
  setActiveDragStepId,
  getResultForStep,
  onDragEnd,
  onSelectStep,
  onMoveStep,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const stepIds = steps.map((step) => step.id);

  return (
    <Paper sx={{ p: 2, borderRadius: 3, border: '1px solid rgba(255,255,255,0.65)', bgcolor: 'rgba(255,255,255,0.52)' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
        <SwapVertOutlined color="primary" fontSize="small" />
        <Typography variant="subtitle2" fontWeight={800}>流程步骤</Typography>
        <Chip size="small" label={`${steps.length} 步`} variant="outlined" />
      </Stack>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setActiveDragStepId(active.id)}
        onDragCancel={() => setActiveDragStepId('')}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={stepIds} strategy={verticalListSortingStrategy}>
          <Stack spacing={1}>
            {steps.map((step, index) => (
              <SortableStepCard
                key={step.id}
                step={step}
                index={index}
                selected={step.id === activeStepId}
                disabled={disabledSet.has(step.id)}
                refs={flowSummary.consumed.get(step.id) || []}
                result={getResultForStep(step.id)}
                isDragging={activeDragStepId === step.id}
                isFirst={index === 0}
                isLast={index === steps.length - 1}
                onSelect={() => onSelectStep(step.id)}
                onMove={(direction) => onMoveStep(step.id, direction)}
              />
            ))}
          </Stack>
        </SortableContext>
      </DndContext>
    </Paper>
  );
}

function SortableStepCard({
  step,
  index,
  selected,
  disabled,
  refs,
  result,
  isDragging,
  isFirst,
  isLast,
  onSelect,
  onMove,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: step.id });

  return (
    <Box
      ref={setNodeRef}
      onClick={onSelect}
      sx={{
        p: 1.25,
        borderRadius: 2,
        border: '1px solid',
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'rgba(99,102,241,0.08)' : disabled ? 'rgba(148,163,184,0.08)' : 'rgba(255,255,255,0.72)',
        cursor: 'pointer',
        opacity: disabled || isDragging ? 0.58 : 1,
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 2 : 1,
        boxShadow: isDragging ? '0 10px 24px rgba(15,23,42,0.16)' : 'none',
        position: 'relative',
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
          <Tooltip title="拖拽排序">
            <IconButton
              size="small"
              {...attributes}
              {...listeners}
              onClick={(event) => event.stopPropagation()}
              sx={{ cursor: isDragging ? 'grabbing' : 'grab', flexShrink: 0 }}
            >
              <DragIndicatorOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
          <Chip size="small" label={step.method} color={METHOD_COLORS[step.method] || 'default'} variant="outlined" sx={{ fontWeight: 800 }} />
          <Typography variant="body2" noWrap fontWeight={800}>{step.name || step.path}</Typography>
        </Stack>
        <Stack direction="row" spacing={0.25}>
          <Tooltip title="上移">
            <span><IconButton size="small" disabled={isFirst} onClick={(event) => { event.stopPropagation(); onMove(-1); }}><KeyboardArrowUpOutlined fontSize="small" /></IconButton></span>
          </Tooltip>
          <Tooltip title="下移">
            <span><IconButton size="small" disabled={isLast} onClick={(event) => { event.stopPropagation(); onMove(1); }}><KeyboardArrowDownOutlined fontSize="small" /></IconButton></span>
          </Tooltip>
        </Stack>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontFamily: 'monospace', wordBreak: 'break-all' }}>{step.path}</Typography>
      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
        {!!step.assertions?.length && <Chip size="small" label={`${step.assertions.length} 断言`} variant="outlined" />}
        {!!step.extractions?.length && <Chip size="small" label={`${step.extractions.length} 提取`} color="success" variant="outlined" />}
        {!!refs.length && <Chip size="small" label={`引用 ${refs.length}`} color="warning" variant="outlined" />}
        {disabled && <Chip size="small" label="本次禁用" color="default" variant="outlined" />}
        {result && <Chip size="small" label={`${result.status_code || ''} ${result.status}`} color={result.status === 'passed' ? 'success' : 'error'} variant="outlined" />}
        <Chip size="small" label={`#${index + 1}`} variant="outlined" />
      </Stack>
    </Box>
  );
}
