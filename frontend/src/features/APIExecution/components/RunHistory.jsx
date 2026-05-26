import React from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AutoAwesomeOutlined,
  CloudSyncOutlined,
  ContentCopyOutlined,
  DeleteOutline,
  EditOutlined,
  HistoryOutlined,
  ManageSearchOutlined,
  RefreshOutlined,
  ScheduleSendOutlined,
  SearchOutlined,
  TerminalOutlined,
  WarningAmberOutlined,
} from '@mui/icons-material';
import { alpha, useTheme } from '@mui/material/styles';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { API_BASE } from '../../../api/client';
import { apiExecutionAPI } from '../../../api/execution';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { useSnackbar } from '../../../components/SnackbarProvider';
import { SWITCH_TAB_EVENT, SETTINGS_SECTION_EVENT } from '../../../constants/events';
import { useAPIExecution } from '../context';
import { EXEC_KEYS, useAPIExecutionRecommendations } from '../hooks/useAPIExecutionQueries';
import {
  formatDuration,
  formatRunTime,
  getRunModeLabel,
  getRunStatusMeta,
} from '../utils';
import VirtualizedList from '../../../components/VirtualizedList';

const getCiApiBase = () => {
  if (API_BASE.startsWith('http')) return API_BASE;
  return 'http://127.0.0.1:8000/api';
};

const getAutomationTypeLabel = (type = '') => (
  type === 'scheduled_runs' ? '定时执行' : type === 'spec_sync' ? '规格同步' : '自动化入口'
);

const getTriggerStatusColor = (status = '') => {
  if (status === 'queued' || status === 'updated') return 'success';
  if (status === 'blocked') return 'error';
  if (status === 'skipped' || status === 'unchanged') return 'default';
  return 'warning';
};

const recommendationSeverityMeta = {
  error: { label: '严重', color: 'error' },
  warning: { label: '警告', color: 'warning' },
  info: { label: '建议', color: 'info' },
};

const riskLabel = {
  low: '低风险',
  medium: '需确认',
  high: '高风险',
};

export default function RunHistory() {
  const {
    projects,
    runHistoryProjectId,
    setRunHistoryProjectId,
    runHistoryStatus,
    setRunHistoryStatus,
    runHistoryKeyword,
    setRunHistoryKeyword,
    fetchHistory,
    backgroundRunId,
    backgroundRunStatus,
    cancellingRunId,
    refreshBackgroundRun,
    cancelBackgroundRun,
    runHistory,
    handleDeleteRun,
    handleBatchDeleteRuns,
    handleClearAllRuns,
    loadRunIntoEditor,
    handleReplayRun,
    handleAutoRepairRun,
    automationTasks,
    handleTriggerScheduledRuns,
    handleTriggerSpecSync,
    automationTriggerResult,
  } = useAPIExecution();

  const [clearAllDialogOpen, setClearAllDialogOpen] = React.useState(false);
  const [copiedSnippet, setCopiedSnippet] = React.useState('');

  const copySnippet = async (key, text) => {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(text);
    setCopiedSnippet(key);
    window.setTimeout(() => setCopiedSnippet(''), 1500);
  };

  const openGovernanceCenter = () => {
    sessionStorage.setItem('openmelon_settings_section', 'governance');
    window.dispatchEvent(new CustomEvent(SETTINGS_SECTION_EVENT, { detail: { section: 'governance' } }));
    window.dispatchEvent(new CustomEvent(SWITCH_TAB_EVENT, { detail: { tabIndex: 6 } }));
  };

  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        border: '1px solid rgba(255, 255, 255, 0.45)',
        bgcolor: 'rgba(255, 255, 255, 0.45)',
        backdropFilter: 'blur(20px)',
        borderRadius: 4.5,
        boxShadow: '0 8px 32px rgba(15, 23, 42, 0.02), inset 0 1px 0 rgba(255,255,255,0.7)',
      }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} gap={1.5} sx={{ mb: 2.5 }}>
        <Box>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <HistoryOutlined color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 800 }}>执行历史</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" fontWeight={500}>这里只保留 API 执行记录；知识、任务和模板治理已移到设置里的治理中心。</Typography>
        </Box>
        <Button variant="outlined" startIcon={<ManageSearchOutlined />} onClick={openGovernanceCenter} sx={{ borderRadius: 2, fontWeight: 700 }}>
          前往治理中心{automationTasks?.length ? `（${automationTasks.length}）` : ''}
        </Button>
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2.5 }}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>项目</InputLabel>
          <Select label="项目" value={runHistoryProjectId} onChange={(event) => setRunHistoryProjectId(event.target.value)} sx={{ borderRadius: 2 }}>
            <MenuItem value="">全部项目</MenuItem>
            {projects.map((project) => (
              <MenuItem key={project.project_id} value={project.project_id}>{project.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>执行状态</InputLabel>
          <Select label="执行状态" value={runHistoryStatus} onChange={(event) => setRunHistoryStatus(event.target.value)} sx={{ borderRadius: 2 }}>
            <MenuItem value="">全部状态</MenuItem>
            <MenuItem value="passed">通过</MenuItem>
            <MenuItem value="failed">失败</MenuItem>
            <MenuItem value="running">执行中</MenuItem>
            <MenuItem value="queued">排队中</MenuItem>
            <MenuItem value="cancelled">已取消</MenuItem>
          </Select>
        </FormControl>
        <TextField
          size="small"
          label="搜索执行记录"
          value={runHistoryKeyword}
          onChange={(event) => setRunHistoryKeyword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') fetchHistory();
          }}
          InputProps={{ endAdornment: <SearchOutlined fontSize="small" color="action" /> }}
          sx={{ minWidth: 220, flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
        <Button variant="outlined" startIcon={<RefreshOutlined />} onClick={fetchHistory} sx={{ borderRadius: 2, fontWeight: 700 }}>刷新</Button>
        <Button variant="outlined" color="error" startIcon={<DeleteOutline />} onClick={() => setClearAllDialogOpen(true)} sx={{ borderRadius: 2, fontWeight: 700 }}>清空全部</Button>
      </Stack>

      <Dialog
        open={clearAllDialogOpen}
        onClose={() => setClearAllDialogOpen(false)}
        PaperProps={{ sx: { borderRadius: 3.5, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: 'error.main' }}>危险操作：清空全部</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontWeight: 500 }}>
            您确定要清空<strong>所有</strong>的执行历史记录吗？这将会删除库中保存的所有历史，且该操作不可撤销。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearAllDialogOpen(false)} color="inherit" sx={{ borderRadius: 2, fontWeight: 700 }}>取消</Button>
          <Button 
            onClick={() => { 
              handleClearAllRuns(); 
              setClearAllDialogOpen(false); 
            }} 
            color="error" 
            variant="contained" 
            disableElevation 
            sx={{ borderRadius: 2, fontWeight: 800 }}
          >
            确定清空
          </Button>
        </DialogActions>
      </Dialog>

      {backgroundRunId && (
        <Alert
          severity="info"
          action={(
            <Stack direction="row" spacing={1}>
              <Button size="small" onClick={refreshBackgroundRun} sx={{ fontWeight: 800 }}>刷新</Button>
              <Button size="small" color="warning" disabled={cancellingRunId === backgroundRunId} onClick={cancelBackgroundRun} sx={{ fontWeight: 800 }}>
                {cancellingRunId === backgroundRunId ? '取消中...' : '取消'}
              </Button>
            </Stack>
          )}
          sx={{ mb: 2.5, borderRadius: 3.5 }}
        >
          后台任务：{backgroundRunId} · {getRunStatusMeta(backgroundRunStatus).label}
        </Alert>
      )}

      <AutomationOpsPanel
        onTriggerScheduledRuns={handleTriggerScheduledRuns}
        onTriggerSpecSync={handleTriggerSpecSync}
        automationTriggerResult={automationTriggerResult}
        copiedSnippet={copiedSnippet}
        onCopySnippet={copySnippet}
      />

      <APIExecutionRecommendationsPanel
        projectId={runHistoryProjectId}
        onAfterAction={fetchHistory}
        onFocusRun={(runId) => {
          setRunHistoryKeyword(runId);
          setRunHistoryStatus('');
        }}
      />

      <RunHistoryTable
        runHistory={runHistory}
        loadRunIntoEditor={loadRunIntoEditor}
        handleReplayRun={handleReplayRun}
        handleAutoRepairRun={handleAutoRepairRun}
        handleDeleteRun={handleDeleteRun}
        handleBatchDeleteRuns={handleBatchDeleteRuns}
      />
    </Paper>
  );
}

export function APIExecutionRecommendationsPanel({ projectId, onFocusRun, onAfterAction }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const showSnackbar = useSnackbar();
  const [confirmDialog, setConfirmDialog] = React.useState({ open: false });
  const recommendationsQuery = useAPIExecutionRecommendations(projectId);
  const actionMutation = useMutation({
    pushKey: 'actionMutation',
    mutationFn: apiExecutionAPI.executeRecommendationAction,
    onSuccess: async (data) => {
      showSnackbar(data?.message || 'API 自动化闭环动作已执行', { severity: 'success' });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: EXEC_KEYS.recommendations(projectId) }),
        queryClient.invalidateQueries({ queryKey: ['exec', 'history'] }),
        queryClient.invalidateQueries({ queryKey: EXEC_KEYS.tasks(projectId) }),
        queryClient.invalidateQueries({ queryKey: ['exec', 'agent-context'] }),
      ]);
      onAfterAction?.();
    },
    onError: (error) => {
      showSnackbar(error.message || 'API 自动化闭环动作执行失败', { severity: 'error' });
    },
  });

  const recommendations = recommendationsQuery.data?.items || [];
  const visibleItems = recommendations.slice(0, 4);

  const handleLocalAction = (recommendation, action) => {
    const entry = action.entry || recommendation.entry || {};
    const runId = action.target_id || recommendation.related_run_id || entry.run_id || '';
    if (action.action === 'open_run' && runId) {
      onFocusRun?.(runId);
      showSnackbar('已按执行 ID 定位历史记录', { severity: 'info' });
      return;
    }
    if (action.action === 'open_task') {
      if (entry.run_id || recommendation.related_run_id) {
        onFocusRun?.(entry.run_id || recommendation.related_run_id);
        showSnackbar('已定位任务关联的执行记录', { severity: 'info' });
        return;
      }
      showSnackbar('请在当前 API 自动化工作台检查队列、策略和待办状态', { severity: 'info' });
    }
  };

  const executeAction = async (recommendation, action, confirm = false) => {
    if (action.frontend_only) {
      handleLocalAction(recommendation, action);
      return;
    }
    await actionMutation.mutateAsync({
      action: action.action || action.id,
      targetId: action.target_id || recommendation.related_run_id || recommendation.related_task_id || '',
      projectId,
      confirm,
      params: action.params || {},
    });
  };

  const requestAction = (recommendation, action) => {
    if (!action.requires_confirmation) {
      executeAction(recommendation, action, false);
      return;
    }
    setConfirmDialog({
      open: true,
      title: action.risk_level === 'high' ? '确认执行高风险闭环动作' : '确认执行闭环动作',
      message: `将执行「${action.label}」。\n\n来源建议：${recommendation.title}\n原因：${recommendation.reason}`,
      confirmText: action.label,
      danger: action.risk_level === 'high',
      onConfirm: async () => {
        setConfirmDialog({ open: false });
        await executeAction(recommendation, action, true);
      },
    });
  };

  return (
    <Paper
      elevation={0}
      sx={{
        mb: 2.5,
        p: 2,
        border: '1px solid rgba(255, 255, 255, 0.45)',
        bgcolor: 'rgba(255, 255, 255, 0.45)',
        backdropFilter: 'blur(20px)',
        borderRadius: 3.5,
        boxShadow: '0 8px 32px rgba(15, 23, 42, 0.02), inset 0 1px 0 rgba(255,255,255,0.7)',
      }}
    >
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} gap={1.5}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box sx={{ width: 32, height: 32, borderRadius: 1.5, bgcolor: 'rgba(79, 70, 229, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5' }}>
              <WarningAmberOutlined fontSize="small" />
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 855 }}>API 自动化闭环建议</Typography>
              <Typography variant="caption" color="text.secondary" fontWeight={500}>从失败诊断、策略审计、队列和待确认任务中生成，不进入治理中心。</Typography>
            </Box>
          </Stack>
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshOutlined />}
            onClick={() => recommendationsQuery.refetch()}
            disabled={recommendationsQuery.isFetching}
            sx={{ borderRadius: 1.5, fontWeight: 700 }}
          >
            刷新建议
          </Button>
        </Stack>

        {recommendationsQuery.isError ? (
          <Alert severity="error" sx={{ borderRadius: 2 }}>{recommendationsQuery.error?.message || '闭环建议加载失败'}</Alert>
        ) : !recommendations.length && !recommendationsQuery.isLoading ? (
          <Alert severity="success" sx={{ borderRadius: 2 }}>当前未发现需要处理的 API 自动化闭环项。</Alert>
        ) : (
          <Stack spacing={1.5}>
            {visibleItems.map((recommendation) => {
              const meta = recommendationSeverityMeta[recommendation.severity] || recommendationSeverityMeta.info;
              return (
                <Box
                  key={recommendation.id}
                  sx={{
                    p: 2,
                    border: '1px solid',
                    borderColor: alpha(theme.palette[meta.color].main, 0.2),
                    borderRadius: 3,
                    bgcolor: alpha(theme.palette[meta.color].main, 0.04),
                    backdropFilter: 'blur(8px)',
                    transition: 'all 0.25s',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: `0 8px 24px ${alpha(theme.palette[meta.color].main, 0.08)}`,
                      borderColor: alpha(theme.palette[meta.color].main, 0.4),
                    }
                  }}
                >
                  <Stack spacing={1.25}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Chip size="small" color={meta.color} label={meta.label} variant="outlined" sx={{ borderRadius: 1.5, fontWeight: 700 }} />
                      <Typography variant="body2" sx={{ fontWeight: 800 }}>{recommendation.title}</Typography>
                      {!!recommendation.risk_level && (
                        <Chip size="small" label={riskLabel[recommendation.risk_level] || recommendation.risk_level} sx={{ borderRadius: 1.5, fontWeight: 700 }} />
                      )}
                    </Stack>
                    <Typography variant="caption" color="text.secondary" fontWeight={500}>{recommendation.reason}</Typography>
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                      {(recommendation.evidence || []).slice(0, 4).map((item) => (
                        <Chip key={`${recommendation.id}-${item.label}`} size="small" label={`${item.label}: ${item.value}`} sx={{ borderRadius: 1.5, fontWeight: 600 }} />
                      ))}
                    </Stack>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {(recommendation.actions || []).map((action) => (
                        <Button
                          key={`${recommendation.id}-${action.id}`}
                          size="small"
                          variant={action.risk_level === 'high' ? 'contained' : 'outlined'}
                          color={action.risk_level === 'high' ? 'warning' : 'primary'}
                          startIcon={<AutoAwesomeOutlined />}
                          disabled={actionMutation.isPending}
                          onClick={() => requestAction(recommendation, action)}
                          sx={{ borderRadius: 1.5, fontWeight: 700 }}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </Stack>
                  </Stack>
                </Box>
              );
            })}
            {recommendations.length > visibleItems.length && (
              <Typography variant="caption" color="text.secondary" fontWeight={500}>
                还有 {recommendations.length - visibleItems.length} 条建议，优先展示严重和最新项。
              </Typography>
            )}
          </Stack>
        )}
      </Stack>
      <ConfirmDialog
        {...confirmDialog}
        onCancel={() => setConfirmDialog({ open: false })}
      />
    </Paper>
  );
}

function AutomationOpsPanel({
  onTriggerScheduledRuns,
  onTriggerSpecSync,
  automationTriggerResult,
  copiedSnippet,
  onCopySnippet,
}) {
  const ciApiBase = getCiApiBase();
  const scheduledSnippet = `curl -X POST "${ciApiBase}/api-execution/automation/scheduled-runs/trigger"`;
  const specSyncSnippet = `curl -X POST "${ciApiBase}/api-execution/automation/spec-sync/trigger"`;

  return (
    <Paper
      elevation={0}
      sx={{
        mb: 2.5,
        p: 2,
        border: '1px solid rgba(255, 255, 255, 0.45)',
        bgcolor: 'rgba(255, 255, 255, 0.45)',
        backdropFilter: 'blur(20px)',
        borderRadius: 3.5,
        boxShadow: '0 8px 32px rgba(15, 23, 42, 0.02), inset 0 1px 0 rgba(255,255,255,0.7)',
      }}
    >
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'center' }} gap={1.5}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box sx={{ width: 32, height: 32, borderRadius: 1.5, bgcolor: 'rgba(79, 70, 229, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5' }}>
              <TerminalOutlined fontSize="small" />
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>调度 / CI / 存储健康</Typography>
              <Typography variant="caption" color="text.secondary" fontWeight={500}>项目级定时触发和规格同步</Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button size="small" variant="outlined" startIcon={<ScheduleSendOutlined />} onClick={onTriggerScheduledRuns} sx={{ borderRadius: 1.5, fontWeight: 700 }}>
              触发定时执行
            </Button>
            <Button size="small" variant="outlined" startIcon={<CloudSyncOutlined />} onClick={onTriggerSpecSync} sx={{ borderRadius: 1.5, fontWeight: 700 }}>
              同步规格 DSL
            </Button>
          </Stack>
        </Stack>

        {automationTriggerResult && (
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Chip size="small" label={getAutomationTypeLabel(automationTriggerResult.type)} color="primary" variant="outlined" sx={{ borderRadius: 1.5, fontWeight: 700 }} />
            <Typography variant="caption" color="text.secondary" fontWeight={500}>
              {automationTriggerResult.triggered_at || '刚刚'}
            </Typography>
            {(automationTriggerResult.items || []).slice(0, 6).map((item) => (
              <Chip
                key={`${automationTriggerResult.type}-${item.project_id}-${item.status}-${item.run_id || item.spec_id || item.reason}`}
                size="small"
                color={getTriggerStatusColor(item.status)}
                label={`${item.project_name || item.project_id || '项目'}：${item.status}${item.reason ? ` · ${item.reason}` : ''}`}
                variant="outlined"
                sx={{ borderRadius: 1.5 }}
              />
            ))}
          </Stack>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.1fr 0.9fr' }, gap: 1.5, alignItems: 'start' }}>
          <Box sx={{ minWidth: 0 }}>
            <Stack spacing={1}>
              {[
                ['scheduled', '定时执行', scheduledSnippet],
                ['spec-sync', '规格同步', specSyncSnippet],
              ].map(([key, label, snippet]) => (
                <Box
                  key={key}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '80px 1fr auto' },
                    alignItems: 'center',
                    gap: 1.5,
                    minWidth: 0,
                  }}
                >
                  <Typography variant="caption" fontWeight={850}>{label}</Typography>
                  <Box
                    component="pre"
                    sx={{
                      m: 0,
                      px: 1.5,
                      py: 1,
                      borderRadius: 2,
                      bgcolor: 'rgba(15,23,42,0.06)',
                      color: 'text.primary',
                      overflowX: 'auto',
                      fontSize: 12,
                      fontFamily: 'monospace',
                    }}
                  >
                    {snippet}
                  </Box>
                  <Button size="small" startIcon={<ContentCopyOutlined />} onClick={() => onCopySnippet(key, snippet)} sx={{ borderRadius: 1.5, fontWeight: 700 }}>
                    {copiedSnippet === key ? '已复制' : '复制'}
                  </Button>
                </Box>
              ))}
            </Stack>
          </Box>
        </Box>
      </Stack>
    </Paper>
  );
}

function RunHistoryTable({ runHistory, loadRunIntoEditor, handleReplayRun, handleAutoRepairRun, handleDeleteRun, handleBatchDeleteRuns }) {
  const [selectedIds, setSelectedIds] = React.useState([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState(null); // 'batch' or run_id string
  const selectedIdSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);

  React.useEffect(() => {
    setSelectedIds([]);
  }, [runHistory]);

  const handleSelectAll = (event) => {
    if (event.target.checked) {
      setSelectedIds(runHistory.map((run) => run.run_id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (event, id) => {
    if (event.target.checked) {
      setSelectedIds((prev) => [...prev, id]);
    } else {
      setSelectedIds((prev) => prev.filter((item) => item !== id));
    }
  };

  const confirmDelete = () => {
    if (deleteTarget === 'batch') {
      handleBatchDeleteRuns(selectedIds);
      setSelectedIds([]);
    } else if (deleteTarget) {
      handleDeleteRun(deleteTarget);
      setSelectedIds((prev) => prev.filter((id) => id !== deleteTarget));
    }
    setDeleteDialogOpen(false);
    setDeleteTarget(null);
  };

  if (!runHistory.length) {
    return <Alert severity="info" sx={{ borderRadius: 3.5 }}>暂无执行历史。完成一次 API 自动化执行后，这里会展示最近记录。</Alert>;
  }

  const isAllSelected = runHistory.length > 0 && selectedIds.length === runHistory.length;
  const isIndeterminate = selectedIds.length > 0 && selectedIds.length < runHistory.length;
  const columnTemplate = '56px minmax(240px, 1.6fr) 120px 96px 96px 160px 180px';
  const scrollHeight = 'min(64vh, 680px)';

  return (
    <Box sx={{ minWidth: 0 }}>
      {selectedIds.length > 0 && (
        <Stack direction="row" spacing={2} sx={{ mb: 2, px: 2, py: 1, bgcolor: 'error.50', borderRadius: 2.5, alignItems: 'center' }}>
          <Typography variant="body2" sx={{ color: 'error.main', fontWeight: 700 }}>已选择 {selectedIds.length} 项</Typography>
          <Button
            size="small"
            variant="contained"
            color="error"
            disableElevation
            onClick={() => { setDeleteTarget('batch'); setDeleteDialogOpen(true); }}
            startIcon={<DeleteOutline />}
            sx={{ borderRadius: 1.5, fontWeight: 700 }}
          >
            批量删除
          </Button>
        </Stack>
      )}

      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden', bgcolor: 'rgba(255, 255, 255, 0.45)' }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: columnTemplate,
            alignItems: 'center',
            px: 1.5,
            py: 1.25,
            bgcolor: 'rgba(248,250,252,0.9)',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Checkbox
              color="primary"
              indeterminate={isIndeterminate}
              checked={isAllSelected}
              onChange={handleSelectAll}
              size="small"
            />
          </Box>
          <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>执行记录</Typography>
          <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>状态</Typography>
          <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>模式</Typography>
          <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>耗时</Typography>
          <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>时间</Typography>
          <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textAlign: 'right', pr: 2 }}>操作</Typography>
        </Box>

        <VirtualizedList
          items={runHistory}
          height={scrollHeight}
          estimateSize={76}
          overscan={10}
          getItemKey={(run) => run.run_id}
          ariaLabel="执行历史列表"
          renderItem={(run, index) => {
            const statusMeta = getRunStatusMeta(run.status);
            const isSelected = selectedIdSet.has(run.run_id);
            return (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: columnTemplate,
                  alignItems: 'center',
                  minHeight: 74,
                  px: 1.5,
                  py: 1,
                  borderBottom: index === runHistory.length - 1 ? 'none' : '1px solid',
                  borderColor: 'divider',
                  bgcolor: isSelected ? 'rgba(239,68,68,0.04)' : 'rgba(255, 255, 255, 0.25)',
                  transition: 'all 0.15s ease',
                  '&:hover': {
                    bgcolor: isSelected ? 'rgba(239,68,68,0.07)' : 'rgba(255, 255, 255, 0.75)',
                  },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Checkbox
                    color="primary"
                    checked={isSelected}
                    onChange={(event) => handleSelectOne(event, run.run_id)}
                    size="small"
                  />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {run.case_name || run.case_id || run.run_id}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                    {run.run_id}
                  </Typography>
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Chip size="small" color={statusMeta.color} label={statusMeta.label} variant="outlined" sx={{ borderRadius: 1.5, fontWeight: 700 }} />
                </Box>
                <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 500 }}>{getRunModeLabel(run.mode)}</Typography>
                <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 500 }}>{formatDuration(run.duration_ms)}</Typography>
                <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 500 }}>{formatRunTime(run.run_at) || '未记录'}</Typography>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', pr: 1 }}>
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    <Tooltip title="载入到编辑器"><IconButton size="small" onClick={() => loadRunIntoEditor(run)}><EditOutlined fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="重跑"><IconButton size="small" onClick={() => handleReplayRun(run)}><RefreshOutlined fontSize="small" /></IconButton></Tooltip>
                    {run.status === 'failed' && (
                      <Tooltip title="受控修复"><IconButton size="small" onClick={() => handleAutoRepairRun(run.run_id)}><AutoAwesomeOutlined fontSize="small" /></IconButton></Tooltip>
                    )}
                    <Tooltip title="删除记录">
                      <IconButton size="small" color="error" onClick={() => { setDeleteTarget(run.run_id); setDeleteDialogOpen(true); }}>
                        <DeleteOutline fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Box>
              </Box>
            );
          }}
        />
      </Box>

      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        PaperProps={{ sx: { borderRadius: 3.5, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 800 }}>确认删除</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontWeight: 500 }}>
            {deleteTarget === 'batch'
              ? `您确定要删除选中的 ${selectedIds.length} 条执行记录吗？`
              : '您确定要删除这条执行记录吗？'}
            此操作不可撤销。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} color="inherit" sx={{ borderRadius: 2, fontWeight: 700 }}>取消</Button>
          <Button onClick={confirmDelete} color="error" variant="contained" disableElevation sx={{ borderRadius: 2, fontWeight: 800 }}>
            确定删除
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
