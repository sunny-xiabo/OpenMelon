import { useState, useMemo } from 'react';
import {
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
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
import { apiExecutionAPI } from '../../../services/api';
import { SWITCH_TAB_EVENT } from '../../../constants/events';
import {
  formatDuration,
  formatRunTime,
  getRunModeLabel,
  getRunStatusMeta,
} from '../../../features/APIExecution/utils';
import {
  DashboardSkeleton,
  formatPercent,
  getRunActionLabel,
  RunDetailDrawer,
  STATUS_LABELS,
  STATUS_ORDER,
  TemplateStatsTable,
  Toolbar,
  TopList,
} from './APIExecutionDashboardParts';

// Hooks
import { useExecProjects } from '../../../features/APIExecution/hooks/useAPIExecutionQueries';
import { useAPIExecSummary } from '../../../features/Dashboard/hooks/useDashboard';

export default function APIExecutionDashboard({ onOpenAPIExecution }) {
  const showSnackbar = useSnackbar();
  
  // UI 交互状态
  const [projectId, setProjectId] = useState('');
  const [selectedRun, setSelectedRun] = useState(null);
  const [selectedRunLoading, setSelectedRunLoading] = useState(false);

  // 使用 TanStack Query
  const { data: projects = [] } = useExecProjects();
  const { 
    data: summary, 
    isLoading, 
    isFetching, 
    refetch, 
    error 
  } = useAPIExecSummary(projectId);

  const statusRows = useMemo(() => {
    if (!summary) return [];
    const counts = summary.status_counts || {};
    const total = Math.max(summary.total_runs || 0, 1);
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
    } catch (err) {
      showSnackbar(err.message || '加载详情失败', { severity: 'error' });
    } finally {
      setSelectedRunLoading(false);
    }
  };

  const navigateToExecution = (focusDiagnostics = false) => {
    if (!selectedRun?.run_id) return;
    sessionStorage.setItem('openmelon_api_execution_run_id', selectedRun.run_id);
    if (focusDiagnostics) {
      sessionStorage.setItem('openmelon_api_execution_focus_repair_diagnostics', '1');
    }
    window.dispatchEvent(new CustomEvent(SWITCH_TAB_EVENT, { detail: { tabIndex: 4 } }));
    onOpenAPIExecution?.();
  };

  if (error && !summary) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Toolbar 
          projects={projects} 
          projectId={projectId} 
          setProjectId={setProjectId} 
          loadSummary={refetch} 
          loading={isFetching} 
        />
        <EmptyState variant="error" title="概览加载失败" description={error.message} onAction={refetch} />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Toolbar 
        projects={projects} 
        projectId={projectId} 
        setProjectId={setProjectId} 
        loadSummary={refetch} 
        loading={isFetching} 
      />

      {isLoading && !summary ? (
        <DashboardSkeleton />
      ) : !summary?.total_runs ? (
        <EmptyState compact title="暂无执行记录" description="完成一次 API 自动化任务后，这里将同步执行健康度、失败分布和诊断入口。" />
      ) : (
        <>
          {/* Metrics */}
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <MetricCard label="累计执行" value={summary.total_runs} helper="最近 50 条快照" accent="rgba(26,115,232,0.08)" icon={<RuleOutlined fontSize="inherit" />} />
            <MetricCard label="通过率" value={formatPercent(summary.pass_rate)} helper="任务成功比率" accent="rgba(16,185,129,0.08)" icon={<TaskAltOutlined fontSize="inherit" />} trend={{ text: summary.pass_rate >= 80 ? '健康' : '待优化', color: summary.pass_rate >= 80 ? '#22c55e' : '#ef4444' }} />
            <MetricCard label="失败数" value={summary.status_counts?.failed || 0} helper="需重点关注记录" accent="rgba(239,68,68,0.08)" icon={<BugReportOutlined fontSize="inherit" />} />
            <MetricCard label="待确认" value={summary.pending_task_count || 0} helper="待入库或待确认" accent="rgba(245,158,11,0.08)" icon={<AssignmentLateOutlined fontSize="inherit" />} />
            <MetricCard label="平均耗时" value={formatDuration(summary.average_duration_ms)} helper="单任务执行速度" accent="rgba(8,145,178,0.08)" icon={<SpeedOutlined fontSize="inherit" />} />
          </Box>

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Paper elevation={0} sx={{ flex: '1 1 320px', p: 2.5, border: '1px solid rgba(255, 255, 255, 0.6)', background: 'rgba(255, 255, 255, 0.5)', borderRadius: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 2 }}>状态分布</Typography>
              <Stack spacing={1.5}>
                {statusRows.map((item) => (
                  <Box key={item.status}>
                    <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                      <Chip size="small" color={item.meta.color} label={item.label} variant="outlined" />
                      <Typography variant="caption" fontWeight={600}>{item.count} 条</Typography>
                    </Stack>
                    <LinearProgress variant="determinate" value={item.percent} color={item.meta.color === 'default' ? 'inherit' : item.meta.color} sx={{ height: 6, borderRadius: 3 }} />
                  </Box>
                ))}
              </Stack>
            </Paper>
            {/* 增加空值保护映射 */}
            <TopList title="失败原因排行" items={summary.failure_reason_top || []} />
            <TopList title="热点失败步骤" items={summary.failure_step_top || []} />
          </Box>

          <TemplateStatsTable items={summary.template_stats || []} />

          <Paper elevation={0} sx={{ p: 2, border: '1px solid rgba(255, 255, 255, 0.6)', background: 'rgba(255, 255, 255, 0.5)', borderRadius: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>最近执行快照</Typography>
            <TableContainer sx={{ maxHeight: 440 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>状态</TableCell>
                    <TableCell>场景</TableCell>
                    <TableCell>项目 / 环境</TableCell>
                    <TableCell align="right">结果</TableCell>
                    <TableCell align="right">耗时</TableCell>
                    <TableCell>时间</TableCell>
                    <TableCell align="right">操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(summary.recent_runs || []).map((run) => {
                    const meta = getRunStatusMeta(run.status);
                    return (
                      <TableRow key={run.run_id} hover onClick={() => openRunDetail(run.run_id)} sx={{ cursor: 'pointer' }}>
                        <TableCell><Chip size="small" color={meta.color} label={meta.label} /></TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={700}>{run.case_name || '未命名任务'}</Typography>
                          {run.failure_reason && <Typography variant="caption" color="error" noWrap sx={{ display: 'block', maxWidth: 200 }}>{run.failure_reason}</Typography>}
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" display="block">{run.project_name}</Typography>
                          <Typography variant="caption" color="text.secondary">{run.environment_name}</Typography>
                        </TableCell>
                        <TableCell align="right">{run.passed} / {run.failed}</TableCell>
                        <TableCell align="right">{formatDuration(run.duration_ms)}</TableCell>
                        <TableCell>{formatRunTime(run.run_at)}</TableCell>
                        <TableCell align="right">
                          <Button size="small" variant={run.status === 'failed' ? 'outlined' : 'text'} onClick={(e) => { e.stopPropagation(); openRunDetail(run.run_id); }}>
                            {getRunActionLabel(run.status)}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}

      <RunDetailDrawer
        open={!!selectedRun || selectedRunLoading}
        run={selectedRun}
        loading={selectedRunLoading}
        onClose={() => setSelectedRun(null)}
        onOpenAPIExecution={() => navigateToExecution(false)}
        onOpenDiagnostics={() => navigateToExecution(true)}
      />
    </Box>
  );
}
