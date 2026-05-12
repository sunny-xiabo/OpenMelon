import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  AssignmentLateOutlined,
  BugReportOutlined,
  CloseOutlined,
  OpenInNewOutlined,
  RefreshOutlined,
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
import { getAssertionTypeLabel } from '../../../features/APIExecution/constants';

const STATUS_ORDER = ['passed', 'failed', 'running', 'queued', 'cancelled'];
const STATUS_LABELS = {
  passed: '通过',
  failed: '失败',
  running: '执行中',
  queued: '排队中',
  cancelled: '已取消',
};

const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;

const ACTIVE_STATUSES = new Set(['queued', 'running']);

const getRunActionLabel = (status) => {
  if (status === 'failed') return '诊断';
  if (ACTIVE_STATUSES.has(status)) return '进度';
  if (status === 'cancelled') return '原因';
  return '详情';
};

const getRunSummarySeverity = (status) => {
  if (status === 'failed') return 'error';
  if (status === 'passed') return 'success';
  if (status === 'cancelled') return 'warning';
  return 'info';
};

const getRunSummaryText = (run) => {
  if (!run) return '';
  if (run.status === 'failed') return run.failure_reason || '执行失败';
  if (run.status === 'passed') return '执行已完成，全部步骤通过';
  if (run.status === 'queued') return '任务排队中，等待可用执行槽位';
  if (run.status === 'running') return run.current_step_name ? `正在执行：${run.current_step_name}` : '正在执行接口步骤';
  if (run.status === 'cancelled') return run.failure_reason || '执行已取消';
  return run.failure_reason || '执行状态已记录';
};

const formatJsonPreview = (value) => {
  if (value === null || value === undefined || value === '') return '未记录';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const buildRepairSuggestionSummary = (run) => {
  const groups = run?.repair_suggestion_groups || run?.repair_draft?.repair_suggestion_groups;
  if (groups) {
    return {
      lowRisk: groups.low_risk_apply?.length || 0,
      needsReview: groups.needs_review?.length || 0,
      investigation: groups.investigation?.length || 0,
      source: 'ai',
    };
  }
  return {
    lowRisk: 0,
    needsReview: 0,
    investigation: run?.failure_diagnostics?.length || run?.repair_suggestions?.length || 0,
    source: 'diagnostics',
  };
};

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

function Toolbar({ projects, projectId, setProjectId, loadSummary, loading }) {
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
      <Box>
        <Typography variant="subtitle2">API 执行概览</Typography>
        <Typography variant="caption" color="text.secondary">基于真实执行历史聚合，快速定位失败和待处理事项。</Typography>
      </Box>
      <Stack direction="row" spacing={1} alignItems="center">
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>项目</InputLabel>
          <Select label="项目" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <MenuItem value="">全部项目</MenuItem>
            {projects.map((project) => (
              <MenuItem key={project.project_id} value={project.project_id}>{project.name || project.project_id}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Tooltip title="刷新概览">
          <span>
            <IconButton size="small" onClick={loadSummary} disabled={loading} sx={{ bgcolor: (theme) => alpha(theme.palette.accent.indigo, 0.08) }}>
              <RefreshOutlined fontSize="small" sx={{ animation: loading ? 'spin 1s linear infinite' : 'none', '@keyframes spin': { '0%': { transform: 'rotate(0)' }, '100%': { transform: 'rotate(360deg)' } } }} />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
    </Stack>
  );
}

function TopList({ title, items = [], emptyText }) {
  const max = Math.max(...items.map((item) => item.count || 0), 1);
  return (
    <Paper elevation={0} sx={{ flex: '1 1 320px', p: 2, border: '1px solid rgba(255, 255, 255, 0.6)', background: 'rgba(255, 255, 255, 0.5)', borderRadius: 3 }}>
      <Typography variant="subtitle2" sx={{ mb: 1.5 }}>{title}</Typography>
      {items.length ? (
        <Stack spacing={1.25}>
          {items.map((item) => (
            <Box key={item.label}>
              <Stack direction="row" justifyContent="space-between" gap={1} sx={{ mb: 0.5 }}>
                <Typography variant="caption" noWrap title={item.label} sx={{ fontWeight: 700 }}>{item.label}</Typography>
                <Typography variant="caption" color="text.secondary">{item.count}</Typography>
              </Stack>
              <LinearProgress variant="determinate" value={Math.round(((item.count || 0) / max) * 100)} color="error" sx={{ height: 7, borderRadius: 999 }} />
            </Box>
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary">{emptyText}</Typography>
      )}
    </Paper>
  );
}

function TemplateStatsTable({ items = [] }) {
  return (
    <Paper elevation={0} sx={{ p: 2, border: '1px solid rgba(255, 255, 255, 0.6)', background: 'rgba(255, 255, 255, 0.5)', borderRadius: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" gap={1}>
        <Typography variant="subtitle2">流程模板执行表现</Typography>
        <Typography variant="caption" color="text.secondary">按最近执行记录中的模板来源聚合</Typography>
      </Stack>
      {items.length ? (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>模板</TableCell>
                <TableCell align="right">执行数</TableCell>
                <TableCell align="right">通过率</TableCell>
                <TableCell align="right">失败率</TableCell>
                <TableCell align="right">失败数</TableCell>
                <TableCell align="right">平均耗时</TableCell>
                <TableCell>最近执行</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.template_id}>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>{item.template_name || item.template_id}</Typography>
                    <Typography variant="caption" color="text.secondary">{item.template_id}</Typography>
                  </TableCell>
                  <TableCell align="right">{item.run_count}</TableCell>
                  <TableCell align="right">
                    <Chip
                      size="small"
                      color={item.pass_rate >= 80 ? 'success' : item.pass_rate >= 50 ? 'warning' : 'error'}
                      label={formatPercent(item.pass_rate)}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Chip
                      size="small"
                      color={item.failure_rate > 20 ? 'error' : item.failure_rate > 0 ? 'warning' : 'success'}
                      label={formatPercent(item.failure_rate)}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="right">{item.failed_count}</TableCell>
                  <TableCell align="right">{formatDuration(item.average_duration_ms)}</TableCell>
                  <TableCell>{formatRunTime(item.last_run_at) || '未记录'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Typography variant="body2" color="text.secondary">暂无带模板来源的执行记录。载入流程模板后执行，后续会在这里展示模板通过率和失败率。</Typography>
      )}
    </Paper>
  );
}

function RunDetailDrawer({ open, run, loading, onClose, onOpenAPIExecution, onOpenDiagnostics }) {
  const visibleResults = (run?.results || []).filter((result) => run?.status === 'failed' ? result.status !== 'passed' : true);
  const meta = getRunStatusMeta(run?.status);
  const repairSummary = buildRepairSuggestionSummary(run);
  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 560 }, p: 0 } }}>
      <Box sx={{ p: 2.5, borderBottom: '1px solid', borderColor: 'divider', background: (theme) => theme.palette.gradients.headerBlue }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2}>
          <Box>
            <Typography variant="subtitle1" fontWeight={800}>{run?.status === 'failed' ? '失败诊断' : '执行详情'}</Typography>
            <Typography variant="caption" color="text.secondary">{run?.case_name || run?.case_id || '正在加载执行记录'}</Typography>
          </Box>
          <IconButton size="small" onClick={onClose}><CloseOutlined fontSize="small" /></IconButton>
        </Stack>
      </Box>
      <Box sx={{ p: 2.5, overflow: 'auto' }}>
        {loading || !run ? (
          <Stack spacing={1.5}>
            <Skeleton variant="rectangular" height={96} sx={{ borderRadius: 2 }} />
            <Skeleton variant="rectangular" height={220} sx={{ borderRadius: 2 }} />
          </Stack>
        ) : (
          <Stack spacing={2}>
            <Alert severity={getRunSummarySeverity(run.status)}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Chip size="small" color={meta.color} label={meta.label} />
                <Typography variant="body2" fontWeight={700}>{getRunSummaryText(run)}</Typography>
              </Stack>
              <Typography variant="caption" display="block">
                共 {run.total || 0} 步，通过 {run.passed || 0} / 失败 {run.failed || 0}，耗时 {formatDuration(run.duration_ms)}
              </Typography>
            </Alert>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button size="small" variant="contained" startIcon={<OpenInNewOutlined />} onClick={onOpenAPIExecution}>
                跳转 API 自动化
              </Button>
              {run.status === 'failed' && (
                <Button size="small" variant="outlined" color="secondary" startIcon={<BugReportOutlined />} onClick={onOpenDiagnostics}>
                  打开修复诊断台
                </Button>
              )}
              <Button size="small" variant="outlined" onClick={onClose}>关闭</Button>
            </Stack>

            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>执行信息</Typography>
              <InfoRow label="Run ID" value={run.run_id || '未记录'} />
              <InfoRow label="模式" value={getRunModeLabel(run.mode)} />
              <InfoRow label="执行时间" value={formatRunTime(run.run_at) || '未记录'} />
              <InfoRow label="项目" value={(run.execution_options?.project_policy_snapshot || {}).name || run.execution_options?.project_id || '未绑定项目'} />
              <InfoRow label="环境" value={(run.execution_options?.environment_snapshot || {}).name || run.execution_options?.environment_id || '未指定环境'} />
            </Paper>

            {!!run.failure_diagnostics?.length && (
              <Paper variant="outlined" sx={{ p: 1.5 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>诊断建议</Typography>
                <Stack spacing={1}>
                  {run.failure_diagnostics.map((diagnostic, index) => (
                    <Box key={`${diagnostic.category}-${index}`}>
                      <Typography variant="body2" fontWeight={700}>{diagnostic.explanation || diagnostic.category}</Typography>
                      {(diagnostic.suggestions || []).map((suggestion) => (
                        <Typography key={suggestion} variant="caption" display="block" color="text.secondary">{suggestion}</Typography>
                      ))}
                    </Box>
                  ))}
                </Stack>
              </Paper>
            )}

            {run.status === 'failed' && (
              <Paper variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} sx={{ mb: 1 }} flexWrap="wrap">
                  <Box>
                    <Typography variant="subtitle2">修复建议分级摘要</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {repairSummary.source === 'ai' ? '来自 AI 修复草稿分级' : '基于当前失败诊断，进入 API 自动化后可生成完整修复草稿'}
                    </Typography>
                  </Box>
                  <Button size="small" variant="text" onClick={onOpenDiagnostics}>查看诊断台</Button>
                </Stack>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip size="small" color="success" variant="outlined" label={`低风险可应用 ${repairSummary.lowRisk}`} />
                  <Chip size="small" color="warning" variant="outlined" label={`需要人工确认 ${repairSummary.needsReview}`} />
                  <Chip size="small" color="info" variant="outlined" label={`排查建议 ${repairSummary.investigation}`} />
                </Stack>
              </Paper>
            )}

            <Stack spacing={1.5}>
              {visibleResults.map((result) => {
                const resultMeta = getRunStatusMeta(result.status);
                return (
                <Paper key={result.step_id || result.url} variant="outlined" sx={{ p: 1.5, borderLeft: '4px solid', borderLeftColor: result.status === 'passed' ? 'success.main' : 'error.main' }}>
                  <Stack direction="row" justifyContent="space-between" gap={1}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={800}>{result.name || result.step_id || '执行步骤'}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>{result.method} {result.url}</Typography>
                    </Box>
                    <Chip size="small" color={resultMeta.color} label={result.status_code ?? resultMeta.label} />
                  </Stack>
                  {result.error && <Typography variant="caption" color="error" display="block" sx={{ mt: 1 }}>{result.error}</Typography>}
                  {!!result.assertions?.length && (
                    <Stack spacing={1} sx={{ mt: 1.25 }}>
                      {result.assertions.filter((assertion) => run.status !== 'failed' || !assertion.passed).map((assertion, index) => (
                        <Box key={`${assertion.type}-${index}`} sx={{ p: 1, borderRadius: 1, bgcolor: assertion.passed ? 'rgba(46,125,50,0.06)' : 'rgba(217,48,37,0.06)' }}>
                          <Typography variant="caption" fontWeight={800}>{getAssertionTypeLabel(assertion.type)}{assertion.path ? ` · ${assertion.path}` : ''}</Typography>
                          <Typography variant="caption" display="block" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                            期望：{formatJsonPreview(assertion.expected)}；实际：{formatJsonPreview(assertion.actual)}
                          </Typography>
                          {assertion.message && <Typography variant="caption" display="block" color="error.main">{assertion.message}</Typography>}
                        </Box>
                      ))}
                    </Stack>
                  )}
                  <ReqResPreview title="请求摘要" value={result.request} />
                  <ReqResPreview title="响应摘要" value={result.response} />
                </Paper>
              );})}
              {!visibleResults.length && (
                <Typography variant="body2" color="text.secondary">暂无步骤明细，可跳转 API 自动化查看完整脚本和历史记录。</Typography>
              )}
            </Stack>
          </Stack>
        )}
      </Box>
    </Drawer>
  );
}

function InfoRow({ label, value }) {
  return (
    <Stack direction="row" spacing={1.5} justifyContent="space-between" sx={{ py: 0.5, borderBottom: '1px dashed', borderColor: 'divider' }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="caption" sx={{ fontWeight: 700, textAlign: 'right', wordBreak: 'break-word' }}>{value}</Typography>
    </Stack>
  );
}

function ReqResPreview({ title, value }) {
  if (!value || (typeof value === 'object' && !Object.keys(value).length)) return null;
  return (
    <Box sx={{ mt: 1.25 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={700}>{title}</Typography>
      <Box component="pre" sx={{ m: 0, mt: 0.5, p: 1, borderRadius: 1, bgcolor: 'rgba(15,23,42,0.04)', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 160, overflow: 'auto' }}>
        {formatJsonPreview(value)}
      </Box>
    </Box>
  );
}
