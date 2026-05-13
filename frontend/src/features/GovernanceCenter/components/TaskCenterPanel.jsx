import {
  Box,
  Button,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { ContentCopyOutlined, FactCheckOutlined } from '@mui/icons-material';
import EmptyState from '../../../components/EmptyState';
import {
  formatRunTime,
  getPolicyRiskColor,
  getPolicyRiskLabel,
} from '../../APIExecution/utils';
import {
  getTaskDisplayLabel,
  getTaskSource,
  Metric,
  TASK_CATEGORY_LABELS,
  TASK_LABELS,
  TASK_STATUS_LABELS,
} from './governanceModel';

export function TaskCenterPanel({
  taskCenter,
  tasks,
  rawTaskCount,
  taskStatus,
  setTaskStatus,
  taskType,
  setTaskType,
  taskRisk,
  setTaskRisk,
  taskKeyword,
  setTaskKeyword,
  taskTypeOptions,
  approveCandidate,
  resolveTask,
  copyText,
}) {
  const statusCounts = taskCenter?.status_counts || {};
  const buckets = taskCenter?.action_buckets || [];
  const typeOptions = [...new Set([...Object.keys(TASK_LABELS), ...(taskTypeOptions || [])].filter(Boolean))];
  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>任务状态</InputLabel>
          <Select label="任务状态" value={taskStatus} onChange={(event) => setTaskStatus(event.target.value)}>
            <MenuItem value="">全部状态</MenuItem>
            {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
              <MenuItem key={value} value={value}>{label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel>任务类型</InputLabel>
          <Select label="任务类型" value={taskType} onChange={(event) => setTaskType(event.target.value)}>
            <MenuItem value="">全部类型</MenuItem>
            {typeOptions.map((value) => (
              <MenuItem key={value} value={value}>{TASK_LABELS[value] || value}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>风险</InputLabel>
          <Select label="风险" value={taskRisk} onChange={(event) => setTaskRisk(event.target.value)}>
            <MenuItem value="">全部风险</MenuItem>
            <MenuItem value="low">低</MenuItem>
            <MenuItem value="medium">中</MenuItem>
            <MenuItem value="high">高</MenuItem>
            <MenuItem value="blocked">阻断</MenuItem>
          </Select>
        </FormControl>
        <TextField
          size="small"
          label="关键词"
          value={taskKeyword}
          onChange={(event) => setTaskKeyword(event.target.value)}
          sx={{ minWidth: 220, flex: 1 }}
        />
        <Typography variant="caption" color="text.secondary">
          显示 {tasks.length} / {rawTaskCount}
        </Typography>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 1 }}>
        <Metric label="待处理" value={taskCenter?.pending_task_count || statusCounts.pending || 0} tone="warning" />
        <Metric label="失败" value={taskCenter?.failed_task_count || statusCounts.failed || 0} tone="error" />
        <Metric label="已完成" value={taskCenter?.resolved_task_count || statusCounts.resolved || 0} tone="success" />
        <Metric label="总任务" value={taskCenter?.total_task_count || 0} tone="info" />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 1 }}>
        {buckets.map((bucket) => (
          <Box key={bucket.bucket} sx={{ p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'rgba(255,255,255,0.42)' }}>
            <Typography variant="caption" color="text.secondary">{bucket.label}</Typography>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }}>
              <Typography variant="h6">{bucket.pending_count}</Typography>
              <Chip size="small" label={`共 ${bucket.count}`} />
            </Stack>
          </Box>
        ))}
      </Box>
      <TaskTable tasks={tasks} approveCandidate={approveCandidate} resolveTask={resolveTask} copyText={copyText} />
    </Stack>
  );
}

function TaskTable({ tasks, approveCandidate, resolveTask, copyText }) {
  if (!tasks?.length) return <EmptyState compact title="当前没有待处理任务" description="待确认知识、失败诊断和策略阻断会在这里进入处理队列。" />;
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>任务</TableCell>
            <TableCell>来源</TableCell>
            <TableCell>风险</TableCell>
            <TableCell>状态</TableCell>
            <TableCell>更新时间</TableCell>
            <TableCell align="right">操作</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {tasks.map((task) => {
            const taskLabel = getTaskDisplayLabel(task);
            const categoryLabel = TASK_CATEGORY_LABELS[task.task_type] || task.task_type || '其他任务';
            const statusLabel = TASK_STATUS_LABELS[task.status] || task.status || '未知';
            const source = getTaskSource(task);
            return (
              <TableRow key={task.task_id} hover>
                <TableCell>
                  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.25 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{taskLabel}</Typography>
                    <Chip size="small" label={categoryLabel} variant="outlined" />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">{task.reason || task.task_id}</Typography>
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.25 }}>
                    <Chip size="small" label={source.label} variant="outlined" />
                    <Typography variant="body2" sx={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {source.value}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">{source.helper || task.task_id}</Typography>
                </TableCell>
                <TableCell><Chip size="small" color={getPolicyRiskColor(task.risk_level)} label={getPolicyRiskLabel(task.risk_level)} variant="outlined" /></TableCell>
                <TableCell><Chip size="small" label={statusLabel} /></TableCell>
                <TableCell>{formatRunTime(task.updated_at) || '未记录'}</TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={0.75} justifyContent="flex-end" sx={{ flexWrap: 'wrap' }}>
                    {task.task_type === 'knowledge_ingest_candidate' && task.status === 'pending' && (
                      <Button size="small" variant="contained" onClick={() => approveCandidate(task.task_id)}>确认沉淀</Button>
                    )}
                    {task.status === 'pending' && (
                      <Button size="small" variant="outlined" onClick={() => resolveTask(task.task_id)}>标记完成</Button>
                    )}
                    <Tooltip title="复制任务 ID">
                      <IconButton size="small" onClick={() => copyText(task.task_id, '任务 ID')}>
                        <ContentCopyOutlined fontSize="inherit" />
                      </IconButton>
                    </Tooltip>
                    {task.run_id && (
                      <Tooltip title="复制执行 ID">
                        <IconButton size="small" onClick={() => copyText(task.run_id, '执行 ID')}>
                          <FactCheckOutlined fontSize="inherit" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
