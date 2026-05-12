import React from 'react';
import {
  Alert,
  Box,
  Button,
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ContentCopyOutlined,
  FactCheckOutlined,
  RefreshOutlined,
  RestoreOutlined,
  RuleOutlined,
  WarningAmberOutlined,
} from '@mui/icons-material';
import { useSnackbar } from '../../../components/SnackbarProvider';
import { apiExecutionAPI } from '../../../api/execution';
import {
  formatRunTime,
  getPolicyRiskColor,
  getPolicyRiskLabel,
} from '../../APIExecution/utils';

const TASK_LABELS = {
  manual_review: '失败待诊断',
  knowledge_ingest_candidate: '知识待确认',
  knowledge_write_failure: '知识写入失败',
  scheduled_run_review: '定时执行待处理',
  policy_blocked: '策略阻断',
};

const KNOWLEDGE_STATUS = {
  active: { label: '已沉淀', color: 'success' },
  invalid: { label: '已失效', color: 'warning' },
  revoked: { label: '已撤回', color: 'default' },
};

export default function GovernanceCenter() {
  const showSnackbar = useSnackbar();
  const [tab, setTab] = React.useState('knowledge');
  const [projects, setProjects] = React.useState([]);
  const [projectId, setProjectId] = React.useState('');
  const [taskCenter, setTaskCenter] = React.useState(null);
  const [tasks, setTasks] = React.useState([]);
  const [knowledgeItems, setKnowledgeItems] = React.useState([]);
  const [knowledgeStatus, setKnowledgeStatus] = React.useState('active');
  const [knowledgeType, setKnowledgeType] = React.useState('');
  const [templates, setTemplates] = React.useState([]);
  const [loading, setLoading] = React.useState(false);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [projectData, taskSummary, taskData, knowledgeData, templateData] = await Promise.all([
        apiExecutionAPI.listProjects(),
        apiExecutionAPI.getTaskCenterSummary({ projectId, limit: 50 }),
        apiExecutionAPI.listAutomationTasks({ projectId, status: 'pending', limit: 50 }),
        apiExecutionAPI.listKnowledgeReviewItems({
          projectId,
          status: knowledgeStatus,
          itemType: knowledgeType,
          limit: 50,
        }),
        apiExecutionAPI.listFlowTemplates({ projectId, limit: 50 }),
      ]);
      setProjects(projectData.projects || []);
      setTaskCenter(taskSummary);
      setTasks(taskData.tasks || []);
      setKnowledgeItems(knowledgeData.items || []);
      setTemplates(templateData.templates || []);
    } catch (error) {
      showSnackbar(error.message || '加载治理中心失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [knowledgeStatus, knowledgeType, projectId, showSnackbar]);

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
        </Stack>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 1, mb: 2 }}>
        <Metric label="待确认知识" value={tasks.filter((task) => task.task_type === 'knowledge_ingest_candidate').length} tone="warning" />
        <Metric label="待处理任务" value={taskCenter?.pending_task_count || 0} tone="info" />
        <Metric label="写入失败" value={(taskCenter?.type_counts || []).find((item) => item.task_type === 'knowledge_write_failure')?.pending_count || 0} tone="error" />
        <Metric label="流程模板" value={templates.length} tone="success" />
      </Box>

      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', bgcolor: 'rgba(255,255,255,0.52)' }}>
        <Tabs value={tab} onChange={(_event, value) => setTab(value)} sx={{ px: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Tab value="knowledge" label="知识治理" icon={<RuleOutlined />} iconPosition="start" />
          <Tab value="tasks" label="任务中心" icon={<FactCheckOutlined />} iconPosition="start" />
          <Tab value="templates" label="模板治理" icon={<ContentCopyOutlined />} iconPosition="start" />
          <Tab value="assets" label="数据资产" icon={<WarningAmberOutlined />} iconPosition="start" />
        </Tabs>
        {loading && <LinearProgress />}
        <Box sx={{ p: 2 }}>
          {tab === 'knowledge' && (
            <KnowledgeGovernancePanel
              knowledgeItems={knowledgeItems}
              knowledgeStatus={knowledgeStatus}
              setKnowledgeStatus={setKnowledgeStatus}
              knowledgeType={knowledgeType}
              setKnowledgeType={setKnowledgeType}
              tasks={tasks}
              approveCandidate={approveCandidate}
              updateKnowledgeStatus={updateKnowledgeStatus}
            />
          )}
          {tab === 'tasks' && <TaskCenterPanel taskCenter={taskCenter} tasks={tasks} approveCandidate={approveCandidate} resolveTask={resolveTask} />}
          {tab === 'templates' && <TemplateGovernancePanel templates={templates} />}
          {tab === 'assets' && <DataAssetPanel taskCenter={taskCenter} knowledgeItems={knowledgeItems} templates={templates} />}
        </Box>
      </Paper>
    </Box>
  );
}

function KnowledgeGovernancePanel({
  knowledgeItems,
  knowledgeStatus,
  setKnowledgeStatus,
  knowledgeType,
  setKnowledgeType,
  tasks,
  approveCandidate,
  updateKnowledgeStatus,
}) {
  const candidates = tasks.filter((task) => task.task_type === 'knowledge_ingest_candidate' && task.status === 'pending');
  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>知识状态</InputLabel>
          <Select label="知识状态" value={knowledgeStatus} onChange={(event) => setKnowledgeStatus(event.target.value)}>
            <MenuItem value="active">已沉淀</MenuItem>
            <MenuItem value="invalid">已失效</MenuItem>
            <MenuItem value="revoked">已撤回</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>知识类型</InputLabel>
          <Select label="知识类型" value={knowledgeType} onChange={(event) => setKnowledgeType(event.target.value)}>
            <MenuItem value="">全部类型</MenuItem>
            <MenuItem value="api_run_summary">API 执行摘要</MenuItem>
            <MenuItem value="api_failure">API 失败经验</MenuItem>
            <MenuItem value="api_repair">API 修复经验</MenuItem>
            <MenuItem value="test_case">测试用例</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {candidates.length > 0 && (
        <Alert severity="info">
          有 {candidates.length} 条知识候选待确认。
          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
            {candidates.slice(0, 4).map((task) => (
              <Button key={task.task_id} size="small" variant="outlined" onClick={() => approveCandidate(task.task_id)}>
                确认 {task.run_id || task.task_id}
              </Button>
            ))}
          </Stack>
        </Alert>
      )}

      <KnowledgeTable items={knowledgeItems} updateKnowledgeStatus={updateKnowledgeStatus} />
    </Stack>
  );
}

function KnowledgeTable({ items, updateKnowledgeStatus }) {
  if (!items.length) return <Alert severity="info">当前筛选下暂无知识项。</Alert>;
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>知识项</TableCell>
            <TableCell>类型</TableCell>
            <TableCell>状态</TableCell>
            <TableCell>来源</TableCell>
            <TableCell>修复效果</TableCell>
            <TableCell align="right">治理操作</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => {
            const status = KNOWLEDGE_STATUS[item.status] || KNOWLEDGE_STATUS.active;
            const effect = item.payload?.repair_effect_score || item.payload?.automation_summary?.repair_effect_score;
            return (
              <TableRow key={item.knowledge_id} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{item.summary || item.knowledge_id}</Typography>
                  <Typography variant="caption" color="text.secondary">{item.knowledge_id}</Typography>
                </TableCell>
                <TableCell>{item.item_type}</TableCell>
                <TableCell><Chip size="small" color={status.color} label={status.label} variant="outlined" /></TableCell>
                <TableCell>{item.source_run_id || item.project_id || '未记录'}</TableCell>
                <TableCell>{effect?.label || (effect?.score ? `${effect.score} 分` : '未评分')}</TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={0.75} justifyContent="flex-end">
                    {item.status !== 'invalid' && (
                      <Button size="small" color="warning" onClick={() => updateKnowledgeStatus(item.knowledge_id, 'invalid')}>失效</Button>
                    )}
                    {item.status !== 'revoked' && (
                      <Button size="small" color="inherit" onClick={() => updateKnowledgeStatus(item.knowledge_id, 'revoked')}>撤回</Button>
                    )}
                    {item.status !== 'active' && (
                      <Button size="small" startIcon={<RestoreOutlined />} onClick={() => updateKnowledgeStatus(item.knowledge_id, 'active')}>恢复</Button>
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

function TaskCenterPanel({ taskCenter, tasks, approveCandidate, resolveTask }) {
  const statusCounts = taskCenter?.status_counts || {};
  const buckets = taskCenter?.action_buckets || [];
  const recentTasks = taskCenter?.recent_tasks?.length ? taskCenter.recent_tasks : tasks;
  return (
    <Stack spacing={2}>
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
      <TaskTable tasks={recentTasks} approveCandidate={approveCandidate} resolveTask={resolveTask} />
    </Stack>
  );
}

function TaskTable({ tasks, approveCandidate, resolveTask }) {
  if (!tasks?.length) return <Alert severity="success">当前没有待处理任务。</Alert>;
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>任务</TableCell>
            <TableCell>风险</TableCell>
            <TableCell>状态</TableCell>
            <TableCell>更新时间</TableCell>
            <TableCell align="right">操作</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {tasks.map((task) => (
            <TableRow key={task.task_id} hover>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{TASK_LABELS[task.task_type] || task.task_type}</Typography>
                <Typography variant="caption" color="text.secondary">{task.reason || task.task_id}</Typography>
              </TableCell>
              <TableCell><Chip size="small" color={getPolicyRiskColor(task.risk_level)} label={getPolicyRiskLabel(task.risk_level)} variant="outlined" /></TableCell>
              <TableCell><Chip size="small" label={task.status} /></TableCell>
              <TableCell>{formatRunTime(task.updated_at) || '未记录'}</TableCell>
              <TableCell align="right">
                <Stack direction="row" spacing={0.75} justifyContent="flex-end">
                  {task.task_type === 'knowledge_ingest_candidate' && task.status === 'pending' && (
                    <Button size="small" variant="contained" onClick={() => approveCandidate(task.task_id)}>确认沉淀</Button>
                  )}
                  {task.status === 'pending' && (
                    <Button size="small" variant="outlined" onClick={() => resolveTask(task.task_id)}>标记完成</Button>
                  )}
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function TemplateGovernancePanel({ templates }) {
  if (!templates.length) return <Alert severity="info">暂无流程模板。可以在 API 自动化编排工作台中保存当前 DSL 为模板。</Alert>;
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>模板</TableCell>
            <TableCell>版本</TableCell>
            <TableCell>状态</TableCell>
            <TableCell>适用范围</TableCell>
            <TableCell>历史表现</TableCell>
            <TableCell>更新时间</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {templates.map((template) => {
            const performance = template.performance_snapshot || {};
            const runCount = performance.run_count || 0;
            const passRate = performance.pass_rate !== undefined ? `${Math.round(Number(performance.pass_rate) * 100)}%` : '暂无';
            return (
              <TableRow key={template.template_id} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{template.name}</Typography>
                  <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                    {(template.tags || []).slice(0, 4).map((tag) => <Chip key={tag} size="small" label={tag} />)}
                  </Stack>
                </TableCell>
                <TableCell>{template.version || 'v1'}</TableCell>
                <TableCell><Chip size="small" color={template.deprecated ? 'warning' : 'success'} label={template.deprecated ? '已废弃' : '可用'} variant="outlined" /></TableCell>
                <TableCell>{template.scope || template.project_id || '全项目可用'}</TableCell>
                <TableCell>{runCount ? `${runCount} 次 · 通过率 ${passRate}` : '暂无执行样本'}</TableCell>
                <TableCell>{formatRunTime(template.updated_at) || '未记录'}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function DataAssetPanel({ taskCenter, knowledgeItems, templates }) {
  const failedWrites = (taskCenter?.type_counts || []).find((item) => item.task_type === 'knowledge_write_failure')?.pending_count || 0;
  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 1 }}>
        <Metric label="当前筛选知识" value={knowledgeItems.length} tone="info" />
        <Metric label="流程模板" value={templates.length} tone="success" />
        <Metric label="知识写入失败" value={failedWrites} tone={failedWrites ? 'error' : 'success'} />
        <Metric label="待处理总量" value={taskCenter?.pending_task_count || 0} tone="warning" />
      </Box>
      <Alert severity={failedWrites ? 'warning' : 'success'}>
        {failedWrites ? '存在知识写入失败任务，请在任务中心处理图谱或向量库写入问题。' : '当前没有知识写入失败任务。'}
      </Alert>
    </Stack>
  );
}

function Metric({ label, value, tone }) {
  const colors = {
    warning: { bg: 'rgba(245,158,11,0.10)', color: 'warning.main' },
    error: { bg: 'rgba(239,68,68,0.10)', color: 'error.main' },
    success: { bg: 'rgba(34,197,94,0.10)', color: 'success.main' },
    info: { bg: 'rgba(14,165,233,0.10)', color: 'info.main' },
  };
  const theme = colors[tone] || colors.info;
  return (
    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: theme.bg, border: '1px solid', borderColor: 'divider' }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h5" sx={{ color: theme.color, fontWeight: 700 }}>{value}</Typography>
    </Box>
  );
}
