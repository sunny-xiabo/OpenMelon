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
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  ContentCopyOutlined,
  FactCheckOutlined,
  FilterAltOffOutlined,
  RefreshOutlined,
  RuleOutlined,
  WarningAmberOutlined,
  ChevronRightOutlined,
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
  const theme = useTheme();
  const showSnackbar = useSnackbar();
  
  // Core UI tab state
  const [tab, setTab] = React.useState('tasks');
  const [projectId, setProjectId] = React.useState('');
  
  // Filter states
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

  // TanStack Query Hooks
  const { data: projects = [] } = useGovernanceProjects();
  const { data: taskSummary, isLoading: isSummaryLoading, refetch: refetchSummary } = useTaskSummary(projectId);
  const { data: tasks = [], isLoading: isTasksLoading, refetch: refetchTasks } = useAutomationTasks(projectId, taskStatus);
  const { data: knowledgeItems = [], isLoading: isKnowledgeLoading, refetch: refetchKnowledge } = useKnowledgeItems({
    projectId, status: knowledgeStatus, itemType: knowledgeType
  });
  const { data: allKnowledgeData, refetch: refetchAllKnowledge } = useAllKnowledgeItems(projectId);
  const { data: templates = [], isLoading: isTemplatesLoading, refetch: refetchTemplates } = useFlowTemplates(projectId);

  // Mutations
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
    refetchTasks();
    refetchKnowledge();
    refetchAllKnowledge();
    refetchTemplates();
  };

  const requestDeleteKnowledgeItem = (item) => {
    setConfirmDialog({
      open: true,
      title: '永久删除知识项',
      message: `将永久删除知识项：${item.summary || item.knowledge_id}\n\n此操作将直接同步至底层的 PostgreSQL 知识库，删除后无法恢复。是否确认？`,
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
      showSnackbar(`${label}已成功复制到剪贴板！`, { severity: 'success' });
    } catch {
      showSnackbar('复制失败，浏览器不支持或拒绝写入剪贴板', { severity: 'warning' });
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

  // Derivative Filter Logics
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
    <Box sx={{ p: 0, background: 'radial-gradient(ellipse at 50% -20%, rgba(99, 102, 241, 0.03) 0%, transparent 80%)' }}>
      <style>
        {`
          .process-step-box {
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          }
          .process-step-box:hover {
            transform: translateY(-2px);
            background: rgba(255,255,255,0.7) !important;
            border-color: rgba(26, 115, 232, 0.25) !important;
          }
          .filter-action-btn {
            background: white !important;
            border: 1px solid rgba(0,0,0,0.06) !important;
            box-shadow: 0 2px 8px rgba(0,0,0,0.02) !important;
            transition: all 0.2s !important;
          }
          .filter-action-btn:hover {
            background: rgba(26, 115, 232, 0.04) !important;
            border-color: rgba(26, 115, 232, 0.15) !important;
            color: #1a73e8 !important;
            transform: translateY(-1px);
          }
        `}
      </style>

      {/* Header and Filter Center */}
      <Box sx={{ px: 3, py: 2.2, borderBottom: '1px solid', borderColor: 'rgba(255, 255, 255, 0.4)', bgcolor: 'rgba(255, 255, 255, 0.2)' }}>
        <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" alignItems="center" gap={2}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 900, color: 'text.primary', letterSpacing: '-0.01em' }}>
              知识与资产治理中心
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
              统一调度自动化决策待办队列，监控 PostgreSQL 知识沉淀与共享流程模板库。
            </Typography>
          </Box>
          
          <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="flex-end" sx={{ flexWrap: 'wrap', gap: 1.5 }}>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel id="gov-project-filter-label">项目范围过滤</InputLabel>
              <Select 
                labelId="gov-project-filter-label"
                label="项目范围过滤" 
                value={projectId} 
                onChange={(e) => setProjectId(e.target.value)} 
                sx={{ 
                  borderRadius: 2.2,
                  fontSize: '12px',
                  fontWeight: 600,
                  bgcolor: 'white',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,0,0,0.06)' },
                  '&:focus-within .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main' }
                }}
              >
                <MenuItem value="" sx={{ fontSize: '12px', fontWeight: 600 }}>全部项目可共享</MenuItem>
                {projects.map((p) => (
                  <MenuItem key={p.project_id} value={p.project_id} sx={{ fontSize: '12px' }}>
                    {p.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            
            <Tooltip title="同步治理数据">
              <span>
                <IconButton 
                  className="filter-action-btn"
                  onClick={handleRefresh} 
                  disabled={isGlobalLoading || isActionPending} 
                  sx={{ width: 38, height: 38 }}
                >
                  <RefreshOutlined fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            
            <Tooltip title="重置全部筛选">
              <span>
                <IconButton 
                  className="filter-action-btn"
                  onClick={resetFilters} 
                  disabled={isGlobalLoading}
                  sx={{ width: 38, height: 38 }}
                >
                  <FilterAltOffOutlined fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Stack>
      </Box>

      {/* Main Governance Content */}
      <Box sx={{ p: { xs: 2, md: 3.5 } }}>
        {/* Telemetry Metric Deck */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 2, mb: 3 }}>
          <Metric label="候选知识确认 (Ingests)" value={tasks.filter((t) => t.task_type === 'knowledge_ingest_candidate' && t.status === 'pending').length} tone="warning" />
          <Metric label="待处理图谱队列" value={taskSummary?.pending_task_count || 0} tone="info" />
          <Metric label="写入阻断异常" value={(taskSummary?.type_counts || []).find((i) => i.task_type === 'knowledge_write_failure')?.pending_count || 0} tone="error" />
          <Metric label="当前诊断项目" value={selectedProject?.name || '跨项目共享'} tone="info" compact />
          <Metric label="有效共享模板" value={filteredTemplates.length} tone="success" />
        </Box>

        {/* Process Guide interactive chain cards */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 2, mb: 4 }}>
          {GOVERNANCE_STEPS.map((step, index) => {
            const isActive = tab === step.key;
            return (
              <Box
                key={step.key}
                className="process-step-box"
                sx={{
                  p: 2.2, 
                  borderRadius: 4, 
                  border: '1px solid',
                  borderColor: isActive ? 'primary.main' : 'rgba(255, 255, 255, 0.45)',
                  bgcolor: isActive ? alpha(theme.palette.primary.main, 0.06) : 'rgba(255, 255, 255, 0.45)',
                  cursor: 'pointer',
                  boxShadow: isActive 
                    ? `0 6px 20px ${alpha(theme.palette.primary.main, 0.08)}, inset 0 1px 0 rgba(255,255,255,0.7)` 
                    : '0 4px 12px rgba(15,23,42,0.01), inset 0 1px 0 rgba(255,255,255,0.7)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
                onClick={() => setTab(step.key)}
              >
                <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0 }}>
                  <Box 
                    sx={{ 
                      width: 28, 
                      height: 28, 
                      borderRadius: '50%', 
                      bgcolor: isActive ? 'primary.main' : 'rgba(0,0,0,0.06)', 
                      color: isActive ? 'white' : 'text.secondary', 
                      display: 'grid', 
                      placeItems: 'center', 
                      fontSize: '11px', 
                      fontWeight: 900,
                      boxShadow: isActive ? `0 0 10px ${alpha(theme.palette.primary.main, 0.4)}` : 'none',
                      flexShrink: 0
                    }}
                  >
                    {index + 1}
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 800, color: 'text.primary', fontSize: '13px' }}>
                      {step.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.15, fontWeight: 500 }} noWrap>
                      {step.caption}
                    </Typography>
                  </Box>
                </Stack>
                {isActive && <ChevronRightOutlined sx={{ fontSize: 16, color: 'primary.main', ml: 1, flexShrink: 0 }} />}
              </Box>
            );
          })}
        </Box>

        {/* Unified sleek glassmorphic Table Panel with Tabs header */}
        <Paper 
          elevation={0}
          sx={{ 
            borderRadius: 4.5, 
            overflow: 'hidden', 
            bgcolor: 'rgba(255,255,255,0.55)', 
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.45)',
            boxShadow: '0 8px 32px rgba(15, 23, 42, 0.02), inset 0 1px 0 rgba(255,255,255,0.7)',
          }}
        >
          <Tabs 
            value={tab} 
            onChange={(_e, v) => setTab(v)} 
            sx={{ 
              px: 2, 
              borderBottom: '1px solid rgba(0,0,0,0.04)', 
              bgcolor: 'rgba(255, 255, 255, 0.25)',
              '& .MuiTabs-indicator': {
                height: 3,
                borderRadius: '3px 3px 0 0',
              },
              '& .MuiTab-root': {
                fontSize: '12px',
                fontWeight: 800,
                textTransform: 'none',
                minHeight: 48,
                '&.Mui-selected': { color: 'primary.main' }
              }
            }}
          >
            <Tab label="代办事件队列" value="tasks" icon={<FactCheckOutlined sx={{ fontSize: 16 }} />} iconPosition="start" />
            <Tab label="数据知识归档" value="knowledge" icon={<RuleOutlined sx={{ fontSize: 16 }} />} iconPosition="start" />
            <Tab label="自动化流程模板" value="templates" icon={<ContentCopyOutlined sx={{ fontSize: 16 }} />} iconPosition="start" />
            <Tab label="数据资产健康度" value="assets" icon={<WarningAmberOutlined sx={{ fontSize: 16 }} />} iconPosition="start" />
          </Tabs>

          {isGlobalLoading && <LinearProgress sx={{ height: 3 }} />}

          <Box sx={{ p: 3 }}>
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
          open={confirmDialog.open} 
          title={confirmDialog.title} 
          message={confirmDialog.message}
          confirmText={confirmDialog.confirmText} 
          danger={confirmDialog.danger}
          onConfirm={confirmDialog.onConfirm || (() => {})}
          onCancel={() => setConfirmDialog(EMPTY_CONFIRM_DIALOG)}
          PaperProps={{
            sx: { borderRadius: 4, px: 1, pb: 1 }
          }}
        />
      </Box>
    </Box>
  );
}
