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
  BugReportOutlined,
  CloseOutlined,
  OpenInNewOutlined,
  RefreshOutlined,
} from '@mui/icons-material';
import {
  formatDuration,
  formatRunTime,
  getRunModeLabel,
  getRunStatusMeta,
} from '../../../features/APIExecution/utils';
import { getAssertionTypeLabel } from '../../../features/APIExecution/constants';
import EmptyState from '../../../components/EmptyState';

export const STATUS_ORDER = ['passed', 'failed', 'running', 'queued', 'cancelled'];
export const STATUS_LABELS = {
  passed: '通过',
  failed: '失败',
  running: '执行中',
  queued: '排队中',
  cancelled: '已取消',
};

export const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;

const ACTIVE_STATUSES = new Set(['queued', 'running']);

export const getRunActionLabel = (status) => {
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

export function Toolbar({ projects, projectId, setProjectId, loadSummary, loading }) {
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

export function DashboardSkeleton() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Metrics Skeletons */}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} variant="rectangular" height={94} sx={{ flex: '1 1 180px', borderRadius: 3 }} />
        ))}
      </Box>
      
      {/* Charts Skeletons */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Skeleton variant="rectangular" height={260} sx={{ flex: '1 1 320px', borderRadius: 3 }} />
        <Skeleton variant="rectangular" height={260} sx={{ flex: '1 1 320px', borderRadius: 3 }} />
        <Skeleton variant="rectangular" height={260} sx={{ flex: '1 1 320px', borderRadius: 3 }} />
      </Box>

      {/* Table Skeleton */}
      <Skeleton variant="rectangular" height={400} sx={{ borderRadius: 3 }} />
    </Box>
  );
}

export function TopList({ title, items = [], emptyText }) {
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
        <EmptyState compact title={emptyText} />
      )}
    </Paper>
  );
}

export function TemplateStatsTable({ items = [] }) {
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
        <EmptyState compact title="暂无模板执行表现" description="载入流程模板后执行，后续会在这里展示模板通过率和失败率。" />
      )}
    </Paper>
  );
}

export function RunDetailDrawer({ open, run, loading, onClose, onOpenAPIExecution, onOpenDiagnostics }) {
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
                <EmptyState compact title="暂无步骤明细" description="可跳转 API 自动化查看完整脚本和历史记录。" />
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
