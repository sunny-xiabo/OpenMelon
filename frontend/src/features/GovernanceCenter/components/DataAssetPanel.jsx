import {
  Alert,
  Box,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import {
  Metric,
  TASK_LABELS,
} from './governanceModel';

export function DataAssetPanel({ taskCenter, knowledgeItems, templates }) {
  const failedWrites = (taskCenter?.type_counts || []).find((item) => item.task_type === 'knowledge_write_failure')?.pending_count || 0;
  const activeKnowledge = knowledgeItems.filter((item) => (item.status || 'active') === 'active').length;
  const pausedKnowledge = knowledgeItems.filter((item) => ['invalid', 'revoked'].includes(item.status)).length;
  const availableTemplates = templates.filter((template) => !template.deprecated).length;
  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 1 }}>
        <Metric label="有效知识" value={activeKnowledge} tone="success" />
        <Metric label="停用知识" value={pausedKnowledge} tone={pausedKnowledge ? 'warning' : 'info'} />
        <Metric label="可用模板" value={availableTemplates} tone="success" />
        <Metric label="知识写入失败" value={failedWrites} tone={failedWrites ? 'error' : 'success'} />
        <Metric label="待处理总量" value={taskCenter?.pending_task_count || 0} tone="warning" />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 1 }}>
        {(taskCenter?.type_counts || []).map((item) => (
          <Box key={item.task_type} sx={{ p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'rgba(255,255,255,0.42)' }}>
            <Typography variant="caption" color="text.secondary">{TASK_LABELS[item.task_type] || item.task_type}</Typography>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }}>
              <Typography variant="h6">{item.pending_count || 0}</Typography>
              <Chip size="small" label={`共 ${item.count || 0}`} />
            </Stack>
          </Box>
        ))}
      </Box>
      <Alert severity={failedWrites ? 'warning' : 'success'}>
        {failedWrites ? '存在知识写入失败任务，请在任务中心处理图谱或向量库写入问题。' : '当前没有知识写入失败任务。'}
      </Alert>
    </Stack>
  );
}
