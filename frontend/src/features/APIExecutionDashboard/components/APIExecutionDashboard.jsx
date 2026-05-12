import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  AssignmentLateOutlined,
  BugReportOutlined,
  RuleOutlined,
  SpeedOutlined,
  TaskAltOutlined,
} from '@mui/icons-material';
import MetricCard from '../../Coverage/components/MetricCard';
import EmptyState from '../../../components/EmptyState';
import { useSnackbar } from '../../../components/SnackbarProvider';
import { apiExecutionAPI } from '../../../api/execution';
import { API_EXECUTION_DASHBOARD_REFRESH_EVENT, SWITCH_TAB_EVENT } from '../../../constants/events';
import {
  formatDuration,
  formatRunTime,
  getRunModeLabel,
  getRunStatusMeta,
} from '../../../features/APIExecution/utils';
import {
  formatPercent,
  getRunActionLabel,
  RunDetailDrawer,
  STATUS_LABELS,
  STATUS_ORDER,
  TemplateStatsTable,
  Toolbar,
  TopList,
} from './APIExecutionDashboardParts';

export default function APIExecutionDashboard({ onOpenAPIExecution }) {
  const showSnackbar = useSnackbar();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedRun, setSelectedRun] = useState(null);
  const [selectedRunLoading, setSelectedRunLoading] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const data = await apiExecutionAPI.listProjects();
      setProjects(data.projects || []);
    } catch (error) {
      console.error(error);
    }
  }, []);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiExecutionAPI.getDashboardSummary({ projectId, limit: 50 });
      setSummary(data);
    } catch (error) {
      showSnackbar(error.message || '加载 API 执行概览失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [projectId, showSnackbar]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    window.addEventListener(API_EXECUTION_DASHBOARD_REFRESH_EVENT, loadSummary);
    return () => window.removeEventListener(API_EXECUTION_DASHBOARD_REFRESH_EVENT, loadSummary);
  }, [loadSummary]);

  const statusRows = useMemo(() => {
    const counts = summary?.status_counts || {};
    const total = Math.max(summary?.total_runs || 0, 1);
    return STATUS_ORDER.map((status) => ({
      status,
      label: STATUS_LABELS[status],
      count: counts[status] || 0,
      percent: Math.round(((counts[status] || 0) / total) * 100),
      meta: getRunStatusMeta(status),
    }));
  }, [summary]);

  const openRunDetail = async (runId) => {
    if (!runId) return;
    setSelectedRunLoading(true);
    try {
      const data = await apiExecutionAPI.getRun(runId);
      setSelectedRun(data);
    } catch (error) {
      showSnackbar(error.message || '加载执行诊断失败', 'error');
    } finally {
      setSelectedRunLoading(false);
    }
  };

  const openRunInAPIExecution = () => {
    if (!selectedRun?.run_id) return;
    sessionStorage.setItem('openmelon_api_execution_run_id', selectedRun.run_id);
    window.dispatchEvent(new CustomEvent(SWITCH_TAB_EVENT, { detail: { tabIndex: 4 } }));
    onOpenAPIExecution?.();
    showSnackbar('已切换到 API 自动化，可在历史记录中载入该执行记录', 'info');
  };

  const openRunDiagnosticsInAPIExecution = () => {
    if (!selectedRun?.run_id) return;
    sessionStorage.setItem('openmelon_api_execution_run_id', selectedRun.run_id);
    sessionStorage.setItem('openmelon_api_execution_focus_repair_diagnostics', '1');
    window.dispatchEvent(new CustomEvent(SWITCH_TAB_EVENT, { detail: { tabIndex: 4 } }));
    onOpenAPIExecution?.();
    showSnackbar('已切换到 API 自动化，可继续生成和预览修复诊断台', 'info');
  };

  if (loading && !summary) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4, 5].map((item) => (
            <Skeleton key={item} variant="rectangular" height={112} sx={{ borderRadius: 3, flex: '1 1 180px' }} />
          ))}
        </Box>
        <Skeleton variant="rectangular" height={280} sx={{ borderRadius: 3 }} />
      </Box>
    );
  }

  if (!summary?.total_runs) {
    return (
      <Paper elevation={0} sx={{ p: 3, border: '1px solid rgba(255, 255, 255, 0.6)', background: 'rgba(255, 255, 255, 0.5)', borderRadius: 3 }}>
        <Toolbar projects={projects} projectId={projectId} setProjectId={setProjectId} loadSummary={loadSummary} loading={loading} />
        <EmptyState compact title="暂无 API 执行记录" description="完成一次 API 自动化执行后，这里会展示健康度、失败分布和诊断入口。" />
      </Paper>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Toolbar projects={projects} projectId={projectId} setProjectId={setProjectId} loadSummary={loadSummary} loading={loading} />

      <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
        <MetricCard label="执行总数" value={summary.total_runs} helper="最近 50 条执行记录" accent="rgba(26,115,232,0.08)" icon={<RuleOutlined fontSize="inherit" />} />
        <MetricCard label="通过率" value={formatPercent(summary.pass_rate)} helper="按已完成记录计算" accent="rgba(16,185,129,0.08)" icon={<TaskAltOutlined fontSize="inherit" />} trend={{ text: summary.pass_rate >= 80 ? '健康' : '需关注', color: summary.pass_rate >= 80 ? '#22c55e' : '#ef4444' }} />
        <MetricCard label="失败数" value={summary.status_counts?.failed || 0} helper="可点击失败记录查看诊断" accent="rgba(239,68,68,0.08)" icon={<BugReportOutlined fontSize="inherit" />} />
        <MetricCard label="待处理项" value={summary.pending_task_count || 0} helper="人工确认、知识沉淀等队列" accent="rgba(245,158,11,0.08)" icon={<AssignmentLateOutlined fontSize="inherit" />} />
        <MetricCard label="平均耗时" value={formatDuration(summary.average_duration_ms)} helper="排除排队和执行中记录" accent="rgba(8,145,178,0.08)" icon={<SpeedOutlined fontSize="inherit" />} />
      </Box>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Paper elevation={0} sx={{ flex: '1 1 320px', p: 2, border: '1px solid rgba(255, 255, 255, 0.6)', background: 'rgba(255, 255, 255, 0.5)', borderRadius: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>状态分布</Typography>
          <Stack spacing={1.25}>
            {statusRows.map((item) => (
              <Box key={item.status}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                  <Chip size="small" color={item.meta.color} label={item.label} variant="outlined" />
                  <Typography variant="caption" color="text.secondary">{item.count} 条</Typography>
                </Stack>
                <LinearProgress variant="determinate" value={item.percent} color={item.meta.color === 'default' ? 'inherit' : item.meta.color} sx={{ height: 8, borderRadius: 999 }} />
              </Box>
            ))}
          </Stack>
        </Paper>

        <TopList title="失败原因 Top 5" items={summary.failure_reason_top} emptyText="最近记录暂无失败原因" />
        <TopList title="失败步骤 Top 5" items={summary.failure_step_top} emptyText="最近记录暂无失败步骤" />
      </Box>

      <TemplateStatsTable items={summary.template_stats || []} />

      <Paper elevation={0} sx={{ p: 2, border: '1px solid rgba(255, 255, 255, 0.6)', background: 'rgba(255, 255, 255, 0.5)', borderRadius: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" gap={1}>
          <Typography variant="subtitle2">最近执行记录</Typography>
          <Typography variant="caption" color="text.secondary">点击记录可查看详情，失败记录会展示诊断信息</Typography>
        </Stack>
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, maxHeight: 440 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>状态</TableCell>
                <TableCell>用例</TableCell>
                <TableCell>项目 / 环境</TableCell>
                <TableCell>模式</TableCell>
                <TableCell align="right">通过 / 失败</TableCell>
                <TableCell align="right">耗时</TableCell>
                <TableCell>时间</TableCell>
                <TableCell align="right">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(summary.recent_runs || []).map((run) => {
                const meta = getRunStatusMeta(run.status);
                const actionLabel = getRunActionLabel(run.status);
                return (
                  <TableRow key={run.run_id} hover sx={{ cursor: 'pointer' }} onClick={() => openRunDetail(run.run_id)}>
                    <TableCell><Chip size="small" color={meta.color} label={meta.label} /></TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={700}>{run.case_name || run.case_id || '未命名用例'}</Typography>
                      {run.failure_reason && <Typography variant="caption" color={run.status === 'failed' ? 'error.main' : 'text.secondary'} noWrap sx={{ display: 'block', maxWidth: 260 }}>{run.failure_reason}</Typography>}
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" display="block">{run.project_name || run.project_id || '未绑定项目'}</Typography>
                      <Typography variant="caption" display="block" color="text.secondary">{run.environment_name || run.environment_id || '未指定环境'}</Typography>
                    </TableCell>
                    <TableCell>{getRunModeLabel(run.mode)}</TableCell>
                    <TableCell align="right">{run.passed} / {run.failed}</TableCell>
                    <TableCell align="right">{formatDuration(run.duration_ms)}</TableCell>
                    <TableCell>{formatRunTime(run.run_at) || '未记录'}</TableCell>
                    <TableCell align="right">
                      <Button size="small" variant={run.status === 'failed' ? 'outlined' : 'text'} color={run.status === 'failed' ? 'error' : 'primary'} onClick={(event) => { event.stopPropagation(); openRunDetail(run.run_id); }}>
                        {actionLabel}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <RunDetailDrawer
        open={Boolean(selectedRun) || selectedRunLoading}
        run={selectedRun}
        loading={selectedRunLoading}
        onClose={() => setSelectedRun(null)}
        onOpenAPIExecution={openRunInAPIExecution}
        onOpenDiagnostics={openRunDiagnosticsInAPIExecution}
      />
    </Box>
  );
}
