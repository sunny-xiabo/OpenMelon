import React from 'react';
import {
  Box,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ContentCopyOutlined,
  FactCheckOutlined,
  FilterAltOffOutlined,
  RefreshOutlined,
  RuleOutlined,
  WarningAmberOutlined,
} from '@mui/icons-material';
import { useSnackbar } from '../../../components/SnackbarProvider';
import ConfirmDialog from '../../../components/ConfirmDialog';
import EmptyState from '../../../components/EmptyState';
import {
  DataAssetPanel,
  GOVERNANCE_STEPS,
  KnowledgeGovernancePanel,
  Metric,
  TASK_LABELS,
  TaskCenterPanel,
  TemplateGovernancePanel,
} from './GovernanceCenterParts';

// Hooks
import {
  useGovernanceProjects,
  useTaskSummary,
  useAutomationTasks,
  useKnowledgeItems,
  useAllKnowledgeItems,
  useFlowTemplates,
  useApproveCandidate,
  useResolveTask,
  useUpdateKnowledgeStatus,
  useDeleteKnowledgeItem,
  useDeleteTemplate,
} from '../hooks/useGovernance';

const EMPTY_CONFIRM_DIALOG = {
  open: false,
  title: '',
  message: '',
  onConfirm: null,
  confirmText: '确认',
  danger: false,
};

export default function GovernanceCenter() {
  const showSnackbar = useSnackbar();
  
  // 核心 UI 状态
  const [tab, setTab] = React.useState('tasks');
  const [projectId, setProjectId] = React.useState('');
  
  // 筛选状态
  const [knowledgeStatus, setKnowledgeStatus] = React.useState('active');
  const [knowledgeType, setKnowledgeType] = React.useState('');
  const [knowledgeKeyword, setKnowledgeKeyword] = React.useState('');
  const [taskStatus, setTaskStatus] = React.useState('pending');
  const [taskType, setTaskType] = React.useState('');
  const [taskRisk, setTaskRisk] = React.useState('');
  const [taskKeyword, setTaskKeyword] = React.useState('');
  const [templateKeyword, setTemplateKeyword] = React.useState('');
  const [templateStatus, setTemplateStatus] = React.useState('');
  
  const [confirmDialog, setConfirmDialog] = React.useState(EMPTY_CONFIRM_DIALOG);

  // 使用 TanStack Query 钩子
  const { data: projects = [] } = useGovernanceProjects();
  const { data: taskSummary, isLoading: isSummaryLoading, refetch: refetchSummary } = useTaskSummary(projectId);
  const { data: tasks = [], isLoading: isTasksLoading } = useAutomationTasks(projectId, taskStatus);
  const { data: knowledgeItems = [], isLoading: isKnowledgeLoading } = useKnowledgeItems({
    projectId, status: knowledgeStatus, itemType: knowledgeType
  });
  const { data: allKnowledgeData } = useAllKnowledgeItems(projectId);
  const { data: templates = [], isLoading: isTemplatesLoading } = useFlowTemplates(projectId);

  // 突变操作
  const approveMutation = useApproveCandidate();
  const resolveMutation = useResolveTask();
  const updateKnowledgeMutation = useUpdateKnowledgeStatus();
  const deleteKnowledgeMutation = useDeleteKnowledgeItem();
  const deleteTemplateMutation = useDeleteTemplate();

  const knowledgeAssetItems = allKnowledgeData?.items || [];
  const knowledgeTypeOptions = allKnowledgeData?.typeOptions || [];

  const selectedProject = React.useMemo(
    () => projects.find((p) => p.project_id === projectId),
    [projectId, projects]
  );

  const isGlobalLoading = isSummaryLoading || isTasksLoading || isKnowledgeLoading || isTemplatesLoading;
  const isActionPending = approveMutation.isPending || resolveMutation.isPending || 
                           updateKnowledgeMutation.isPending || deleteKnowledgeMutation.isPending || 
                           deleteTemplateMutation.isPending;

  const handleRefresh = () => {
    refetchSummary();
    // 其他 query 会由于 key 的统一性（前缀为 'gov'）通过 invalidate 刷新，或者手动 refetch
  };

  const requestDeleteKnowledgeItem = (item) => {
    setConfirmDialog({
      open: true,
      title: '永久删除知识项',
      message: `将永久删除知识项：${item.summary || item.knowledge_id}\n\n此操作不可恢复。`,
      confirmText: '永久删除',
      danger: true,
      onConfirm: async () => {
        setConfirmDialog(EMPTY_CONFIRM_DIALOG);
        await deleteKnowledgeMutation.mutateAsync(item.knowledge_id);
      },
    });
  };

  const copyText = async (text, label = '内容') => {
    try {
      await navigator.clipboard.writeText(String(text || ''));
      showSnackbar(`${label}已复制`, { severity: 'success' });
    } catch {
      showSnackbar('复制失败', { severity: 'warning' });
    }
  };

  const resetFilters = () => {
    setProjectId('');
    setKnowledgeStatus('active');
    setKnowledgeType('');
    setKnowledgeKeyword('');
    setTaskStatus('pending');
    setTaskType('');
    setTaskRisk('');
    setTaskKeyword('');
    setTemplateKeyword('');
    setTemplateStatus('');
  };

  // 派生过滤逻辑
  const filteredTasks = React.useMemo(() => {
    const kw = taskKeyword.trim().toLowerCase();
    return tasks.filter((task) => {
      if (taskType && task.task_type !== taskType) return false;
      if (taskRisk && task.risk_level !== taskRisk) return false;
      if (!kw) return true;
      return [task.task_id, task.run_id, task.task_type, TASK_LABELS[task.task_type], task.reason].some(v => String(v || '').toLowerCase().includes(kw));
    });
  }, [taskKeyword, taskRisk, taskType, tasks]);

  const filteredKnowledgeItems = React.useMemo(() => {
    const kw = knowledgeKeyword.trim().toLowerCase();
    if (!kw) return knowledgeItems;
    return knowledgeItems.filter((item) => [item.knowledge_id, item.item_type, item.summary].some(v => String(v || '').toLowerCase().includes(kw)));
  }, [knowledgeItems, knowledgeKeyword]);

  const filteredTemplates = React.useMemo(() => {
    const kw = templateKeyword.trim().toLowerCase();
    return templates.filter((t) => {
      if (templateStatus === 'active' && t.deprecated) return false;
      if (templateStatus === 'deprecated' && !t.deprecated) return false;
      if (!kw) return true;
      return [t.template_id, t.name, t.description].some(v => String(v || '').toLowerCase().includes(kw));
    });
  }, [templateKeyword, templateStatus, templates]);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} gap={1.5} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>治理中心</Typography>
          <Typography variant="body2" color="text.secondary">统一处理知识、任务、模板和数据资产状态。</Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>项目</InputLabel>
            <Select label="项目" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <MenuItem value="">全部项目</MenuItem>
              {projects.map((p) => <MenuItem key={p.project_id} value={p.project_id}>{p.name}</MenuItem>)}
            </Select>
          </FormControl>
          <Tooltip title="刷新治理中心">
            <span>
              <IconButton onClick={handleRefresh} disabled={isGlobalLoading || isActionPending}>
                <RefreshOutlined />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="清空筛选">
            <span>
              <IconButton onClick={resetFilters} disabled={isGlobalLoading}>
                <FilterAltOffOutlined />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 1, mb: 2 }}>
        <Metric label="待确认知识" value={tasks.filter((t) => t.task_type === 'knowledge_ingest_candidate' && t.status === 'pending').length} tone="warning" />
        <Metric label="待处理任务" value={taskSummary?.pending_task_count || 0} tone="info" />
        <Metric label="写入失败" value={(taskSummary?.type_counts || []).find((i) => i.task_type === 'knowledge_write_failure')?.pending_count || 0} tone="error" />
        <Metric label="当前项目" value={selectedProject?.name || '全部'} tone="info" compact />
        <Metric label="流程模板" value={filteredTemplates.length} tone="success" />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 1, mb: 2 }}>
        {GOVERNANCE_STEPS.map((step, index) => (
          <Box
            key={step.key}
            sx={{
              p: 1.25, borderRadius: 2, border: '1px solid',
              borderColor: tab === step.key ? 'primary.main' : 'divider',
              bgcolor: tab === step.key ? 'rgba(25,118,210,0.08)' : 'rgba(255,255,255,0.46)',
              cursor: 'pointer',
            }}
            onClick={() => setTab(step.key)}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip size="small" label={index + 1} color={tab === step.key ? 'primary' : 'default'} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{step.label}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap>{step.caption}</Typography>
              </Box>
            </Stack>
          </Box>
        ))}
      </Box>

      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', bgcolor: 'rgba(255,255,255,0.52)' }}>
        <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ px: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Tab value="tasks" label="待办队列" icon={<FactCheckOutlined />} iconPosition="start" />
          <Tab value="knowledge" label="知识库" icon={<RuleOutlined />} iconPosition="start" />
          <Tab value="templates" label="模板库" icon={<ContentCopyOutlined />} iconPosition="start" />
          <Tab value="assets" label="资产健康" icon={<WarningAmberOutlined />} iconPosition="start" />
        </Tabs>
        {(isGlobalLoading || isActionPending) && <LinearProgress />}
        <Box sx={{ p: 2 }}>
          {!isGlobalLoading && tab === 'tasks' && (
            <TaskCenterPanel
              taskCenter={taskSummary} tasks={filteredTasks} rawTaskCount={tasks.length}
              taskStatus={taskStatus} setTaskStatus={setTaskStatus}
              taskType={taskType} setTaskType={setTaskType}
              taskRisk={taskRisk} setTaskRisk={setTaskRisk}
              taskKeyword={taskKeyword} setTaskKeyword={setTaskKeyword}
              taskTypeOptions={tasks.map((t) => t.task_type).filter(Boolean)}
              approveCandidate={(id) => approveMutation.mutate(id)}
              resolveTask={(id) => resolveMutation.mutate(id)}
              copyText={copyText}
            />
          )}
          {!isGlobalLoading && tab === 'knowledge' && (
            <KnowledgeGovernancePanel
              knowledgeItems={knowledgeItems} knowledgeTypeOptions={knowledgeTypeOptions}
              filteredKnowledgeItems={filteredKnowledgeItems}
              knowledgeStatus={knowledgeStatus} setKnowledgeStatus={setKnowledgeStatus}
              knowledgeType={knowledgeType} setKnowledgeType={setKnowledgeType}
              knowledgeKeyword={knowledgeKeyword} setKnowledgeKeyword={setKnowledgeKeyword}
              updateKnowledgeStatus={(id, s) => updateKnowledgeMutation.mutate({ id, status: s })}
              requestDeleteKnowledgeItem={requestDeleteKnowledgeItem}
              copyText={copyText}
            />
          )}
          {!isGlobalLoading && tab === 'templates' && (
            <TemplateGovernancePanel
              templates={filteredTemplates} rawTemplateCount={templates.length}
              templateKeyword={templateKeyword} setTemplateKeyword={setTemplateKeyword}
              templateStatus={templateStatus} setTemplateStatus={setTemplateStatus}
              deleteTemplate={(id) => deleteTemplateMutation.mutate(id)}
              copyText={copyText}
            />
          )}
          {!isGlobalLoading && tab === 'assets' && (
            <DataAssetPanel
              taskCenter={taskSummary} knowledgeItems={knowledgeAssetItems} templates={templates}
            />
          )}
        </Box>
      </Paper>
      <ConfirmDialog
        open={confirmDialog.open} title={confirmDialog.title} message={confirmDialog.message}
        confirmText={confirmDialog.confirmText} danger={confirmDialog.danger}
        onConfirm={confirmDialog.onConfirm || (() => {})}
        onCancel={() => setConfirmDialog(EMPTY_CONFIRM_DIALOG)}
      />
    </Box>
  );
}
