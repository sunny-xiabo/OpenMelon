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
import { apiExecutionAPI } from '../../../api/execution';
import {
  DataAssetPanel,
  GOVERNANCE_STEPS,
  KnowledgeGovernancePanel,
  Metric,
  TASK_LABELS,
  TaskCenterPanel,
  TemplateGovernancePanel,
} from './GovernanceCenterParts';

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
  const [tab, setTab] = React.useState('tasks');
  const [projects, setProjects] = React.useState([]);
  const [projectId, setProjectId] = React.useState('');
  const [taskCenter, setTaskCenter] = React.useState(null);
  const [tasks, setTasks] = React.useState([]);
  const [knowledgeItems, setKnowledgeItems] = React.useState([]);
  const [knowledgeAssetItems, setKnowledgeAssetItems] = React.useState([]);
  const [knowledgeTypeOptions, setKnowledgeTypeOptions] = React.useState([]);
  const [knowledgeStatus, setKnowledgeStatus] = React.useState('active');
  const [knowledgeType, setKnowledgeType] = React.useState('');
  const [knowledgeKeyword, setKnowledgeKeyword] = React.useState('');
  const [taskStatus, setTaskStatus] = React.useState('pending');
  const [taskType, setTaskType] = React.useState('');
  const [taskRisk, setTaskRisk] = React.useState('');
  const [taskKeyword, setTaskKeyword] = React.useState('');
  const [templates, setTemplates] = React.useState([]);
  const [templateKeyword, setTemplateKeyword] = React.useState('');
  const [templateStatus, setTemplateStatus] = React.useState('');
  const [confirmDialog, setConfirmDialog] = React.useState(EMPTY_CONFIRM_DIALOG);
  const [loading, setLoading] = React.useState(false);

  const selectedProject = React.useMemo(
    () => projects.find((project) => project.project_id === projectId),
    [projectId, projects],
  );

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [projectData, taskSummary, taskData, knowledgeData, knowledgeTypeData, templateData] = await Promise.all([
        apiExecutionAPI.listProjects(),
        apiExecutionAPI.getTaskCenterSummary({ projectId, limit: 50 }),
        apiExecutionAPI.listAutomationTasks({ projectId, status: taskStatus, limit: 100 }),
        apiExecutionAPI.listKnowledgeReviewItems({
          projectId,
          status: knowledgeStatus,
          itemType: knowledgeType,
          limit: 100,
        }),
        apiExecutionAPI.listKnowledgeReviewItems({
          projectId,
          limit: 500,
        }),
        apiExecutionAPI.listFlowTemplates({ projectId, limit: 100 }),
      ]);
      const knowledgeAssets = knowledgeTypeData.items || [];
      setProjects(projectData.projects || []);
      setTaskCenter(taskSummary);
      setTasks(taskData.items || taskData.tasks || []);
      setKnowledgeItems(knowledgeData.items || []);
      setKnowledgeAssetItems(knowledgeAssets);
      setKnowledgeTypeOptions([...new Set(knowledgeAssets.map((item) => item.item_type).filter(Boolean))].sort());
      setTemplates(templateData.items || templateData.templates || []);
    } catch (error) {
      showSnackbar(error.message || '加载治理中心失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [knowledgeStatus, knowledgeType, projectId, showSnackbar, taskStatus]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const approveCandidate = async (taskId) => {
    try {
      const data = await apiExecutionAPI.approveKnowledgeCandidate(taskId);
      showSnackbar(`已确认沉淀：${data.knowledge_count} 条知识，向量写入 ${data.vector_written || 0}`, data.errors?.length ? 'warning' : 'success');
      loadData();
    } catch (error) {
      showSnackbar(error.message || '确认沉淀失败', 'error');
    }
  };

  const resolveTask = async (taskId) => {
    try {
      await apiExecutionAPI.resolveAutomationTask(taskId);
      showSnackbar('待处理项已标记完成', 'success');
      loadData();
    } catch (error) {
      showSnackbar(error.message || '更新待处理项失败', 'error');
    }
  };

  const updateKnowledgeStatus = async (knowledgeId, status) => {
    try {
      await apiExecutionAPI.updateKnowledgeStatus(knowledgeId, { status });
      showSnackbar(status === 'active' ? '知识项已恢复有效' : status === 'invalid' ? '知识项已标记失效' : '知识项已撤回', 'success');
      loadData();
    } catch (error) {
      showSnackbar(error.message || '更新知识状态失败', 'error');
    }
  };

  const deleteKnowledgeItem = async (knowledgeId) => {
    try {
      await apiExecutionAPI.deleteKnowledgeItem(knowledgeId);
      showSnackbar('知识项已永久删除', 'success');
      loadData();
    } catch (error) {
      showSnackbar(error.message || '永久删除知识项失败', 'error');
    }
  };

  const requestDeleteKnowledgeItem = (item) => {
    setConfirmDialog({
      open: true,
      title: '永久删除知识项',
      message: `将永久删除知识项：${item.summary || item.knowledge_id}\n\n此操作不会保留在知识治理列表中，不能恢复。若该知识已写入向量库或图谱，外部索引可能需要后续重建。\n\n建议仅删除误写入、脏数据或敏感信息。`,
      confirmText: '永久删除',
      danger: true,
      onConfirm: async () => {
        setConfirmDialog(EMPTY_CONFIRM_DIALOG);
        await deleteKnowledgeItem(item.knowledge_id);
      },
    });
  };

  const deleteTemplate = async (templateId) => {
    try {
      await apiExecutionAPI.deleteFlowTemplate(templateId);
      showSnackbar('流程模板已删除', 'success');
      loadData();
    } catch (error) {
      showSnackbar(error.message || '删除流程模板失败', 'error');
    }
  };

  const copyText = async (text, label = '内容') => {
    try {
      await navigator.clipboard.writeText(String(text || ''));
      showSnackbar(`${label}已复制`, 'success');
    } catch {
      showSnackbar('复制失败，请手动选择文本', 'warning');
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

  const filteredTasks = React.useMemo(() => {
    const keyword = taskKeyword.trim().toLowerCase();
    return tasks.filter((task) => {
      if (taskType && task.task_type !== taskType) return false;
      if (taskRisk && task.risk_level !== taskRisk) return false;
      if (!keyword) return true;
      return [
        task.task_id,
        task.run_id,
        task.task_type,
        TASK_LABELS[task.task_type],
        task.reason,
        task.status,
        task.risk_level,
        task.project_id,
        task.environment_id,
        JSON.stringify(task.summary || {}),
        JSON.stringify(task.decision || {}),
      ].some((value) => String(value || '').toLowerCase().includes(keyword));
    });
  }, [taskKeyword, taskRisk, taskType, tasks]);

  const filteredKnowledgeItems = React.useMemo(() => {
    const keyword = knowledgeKeyword.trim().toLowerCase();
    if (!keyword) return knowledgeItems;
    return knowledgeItems.filter((item) => [
      item.knowledge_id,
      item.item_type,
      item.source_run_id,
      item.project_id,
      item.summary,
      item.governance_note,
    ].some((value) => String(value || '').toLowerCase().includes(keyword)));
  }, [knowledgeItems, knowledgeKeyword]);

  const filteredTemplates = React.useMemo(() => {
    const keyword = templateKeyword.trim().toLowerCase();
    return templates.filter((template) => {
      if (templateStatus === 'active' && template.deprecated) return false;
      if (templateStatus === 'deprecated' && !template.deprecated) return false;
      if (!keyword) return true;
      return [
        template.template_id,
        template.name,
        template.description,
        template.scope,
        template.project_id,
        ...(template.tags || []),
      ].some((value) => String(value || '').toLowerCase().includes(keyword));
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
            <Select label="项目" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <MenuItem value="">全部项目</MenuItem>
              {projects.map((project) => (
                <MenuItem key={project.project_id} value={project.project_id}>{project.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Tooltip title="刷新治理中心">
            <span>
              <IconButton onClick={loadData} disabled={loading}>
                <RefreshOutlined />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="清空筛选">
            <span>
              <IconButton onClick={resetFilters} disabled={loading}>
                <FilterAltOffOutlined />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 1, mb: 2 }}>
        <Metric label="待确认知识" value={tasks.filter((task) => task.task_type === 'knowledge_ingest_candidate' && task.status === 'pending').length} tone="warning" />
        <Metric label="待处理任务" value={taskCenter?.pending_task_count || 0} tone="info" />
        <Metric label="写入失败" value={(taskCenter?.type_counts || []).find((item) => item.task_type === 'knowledge_write_failure')?.pending_count || 0} tone="error" />
        <Metric label="当前项目" value={selectedProject?.name || '全部'} tone="info" compact />
        <Metric label="流程模板" value={filteredTemplates.length} tone="success" />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 1, mb: 2 }}>
        {GOVERNANCE_STEPS.map((step, index) => (
          <Box
            key={step.key}
            sx={{
              p: 1.25,
              borderRadius: 2,
              border: '1px solid',
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
        <Tabs value={tab} onChange={(_event, value) => setTab(value)} sx={{ px: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Tab value="tasks" label="待办队列" icon={<FactCheckOutlined />} iconPosition="start" />
          <Tab value="knowledge" label="知识库" icon={<RuleOutlined />} iconPosition="start" />
          <Tab value="templates" label="模板库" icon={<ContentCopyOutlined />} iconPosition="start" />
          <Tab value="assets" label="资产健康" icon={<WarningAmberOutlined />} iconPosition="start" />
        </Tabs>
        {loading && <LinearProgress />}
        <Box sx={{ p: 2 }}>
          {tab === 'tasks' && (
            <TaskCenterPanel
              taskCenter={taskCenter}
              tasks={filteredTasks}
              rawTaskCount={tasks.length}
              taskStatus={taskStatus}
              setTaskStatus={setTaskStatus}
              taskType={taskType}
              setTaskType={setTaskType}
              taskRisk={taskRisk}
              setTaskRisk={setTaskRisk}
              taskKeyword={taskKeyword}
              setTaskKeyword={setTaskKeyword}
              taskTypeOptions={tasks.map((task) => task.task_type).filter(Boolean)}
              approveCandidate={approveCandidate}
              resolveTask={resolveTask}
              copyText={copyText}
            />
          )}
          {tab === 'knowledge' && (
            <KnowledgeGovernancePanel
              knowledgeItems={knowledgeItems}
              knowledgeTypeOptions={knowledgeTypeOptions}
              filteredKnowledgeItems={filteredKnowledgeItems}
              knowledgeStatus={knowledgeStatus}
              setKnowledgeStatus={setKnowledgeStatus}
              knowledgeType={knowledgeType}
              setKnowledgeType={setKnowledgeType}
              knowledgeKeyword={knowledgeKeyword}
              setKnowledgeKeyword={setKnowledgeKeyword}
              updateKnowledgeStatus={updateKnowledgeStatus}
              requestDeleteKnowledgeItem={requestDeleteKnowledgeItem}
              copyText={copyText}
            />
          )}
          {tab === 'templates' && (
            <TemplateGovernancePanel
              templates={filteredTemplates}
              rawTemplateCount={templates.length}
              templateKeyword={templateKeyword}
              setTemplateKeyword={setTemplateKeyword}
              templateStatus={templateStatus}
              setTemplateStatus={setTemplateStatus}
              deleteTemplate={deleteTemplate}
              copyText={copyText}
            />
          )}
          {tab === 'assets' && (
            <DataAssetPanel
              taskCenter={taskCenter}
              knowledgeItems={knowledgeAssetItems}
              templates={templates}
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
      />
    </Box>
  );
}
