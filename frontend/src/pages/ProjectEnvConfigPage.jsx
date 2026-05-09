import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  Switch,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  Alert,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  FolderOpenOutlined,
  Refresh as RefreshIcon,
  RocketLaunchOutlined,
} from '@mui/icons-material';
import ConfirmDialog from '../components/ConfirmDialog';
import { useSnackbar } from '../components/SnackbarProvider';
import { apiExecutionAPI } from '../services/api';
import { ENVIRONMENT_TYPE_OPTIONS } from '../features/APIExecution/constants';

const AI_BOUNDARY_OPTIONS = [
  { key: 'allow_ai_generate_dsl', label: '允许 AI 生成 DSL', description: '允许根据 OpenAPI 自动生成测试脚本草稿。' },
  { key: 'allow_ai_execution', label: '允许 AI 自动执行', description: '开启后，AI/自动化任务可以直接提交执行。生产环境建议关闭。' },
  { key: 'allow_ai_repair', label: '允许 AI 自动修复', description: '允许根据失败结果生成修复补丁或受控重跑。' },
  { key: 'allow_scheduled_execution', label: '允许定时执行', description: '允许该项目被定时任务触发执行。' },
  { key: 'allow_overwrite_history', label: '允许覆盖原记录', description: '重跑失败步骤时可合并更新原执行记录。' },
];

const EMPTY_PROJECT = {
  name: '',
  allow_ai_generate_dsl: true,
  allow_ai_execution: false,
  allow_ai_repair: false,
  allow_scheduled_execution: false,
  allow_overwrite_history: true,
  max_auto_repairs: 0,
  max_reruns: 0,
  max_requests_per_run: 0,
  operation_allowlist: [],
  operation_blocklist: [],
  risk_overrides: {},
};

const EMPTY_ENV = {
  name: '',
  environment_type: 'test',
  base_url: '',
  headers: {},
  variables: {},
  timeout_ms: 30000,
  continue_on_failure: true,
  enabled: true,
};

function toProjectForm(project) {
  if (!project) return { ...EMPTY_PROJECT };
  return {
    name: project.name || '',
    allow_ai_generate_dsl: project.allow_ai_generate_dsl ?? true,
    allow_ai_execution: project.allow_ai_execution ?? false,
    allow_ai_repair: project.allow_ai_repair ?? false,
    allow_scheduled_execution: project.allow_scheduled_execution ?? false,
    allow_overwrite_history: project.allow_overwrite_history ?? true,
    max_auto_repairs: project.max_auto_repairs ?? 0,
    max_reruns: project.max_reruns ?? 0,
    max_requests_per_run: project.max_requests_per_run ?? 0,
    operation_allowlist: project.operation_allowlist || [],
    operation_blocklist: project.operation_blocklist || [],
    risk_overrides: project.risk_overrides || {},
  };
}

function toEnvForm(env) {
  if (!env) return { ...EMPTY_ENV };
  return {
    name: env.name || '',
    environment_type: env.environment_type || 'test',
    base_url: env.base_url || '',
    headers: env.headers || {},
    variables: env.variables || {},
    timeout_ms: env.timeout_ms ?? 30000,
    continue_on_failure: env.continue_on_failure ?? true,
    enabled: env.enabled ?? true,
  };
}

export default function ProjectEnvConfigPage({ embedded = false }) {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projectForm, setProjectForm] = useState({ ...EMPTY_PROJECT });
  const [environments, setEnvironments] = useState([]);
  const [activeTab, setActiveTab] = useState('project');
  const [envDialog, setEnvDialog] = useState({ open: false, editing: null });
  const [envForm, setEnvForm] = useState({ ...EMPTY_ENV });
  const [envVariablesText, setEnvVariablesText] = useState('{}');
  const [envHeadersText, setEnvHeadersText] = useState('{}');
  const [loading, setLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });
  const [operationAllowlistText, setOperationAllowlistText] = useState('');
  const [operationBlocklistText, setOperationBlocklistText] = useState('');
  const [riskOverridesText, setRiskOverridesText] = useState('{}');
  const showSnackbar = useSnackbar();

  const loadProjects = async () => {
    setLoading(true);
    try {
      const data = await apiExecutionAPI.listProjects();
      const list = data.projects || [];
      setProjects(list);
      if (list.length && !selectedProjectId) {
        selectProject(list[0].project_id, list);
      }
    } catch {
      showSnackbar('加载项目列表失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadEnvironments = async (projectId) => {
    if (!projectId) { setEnvironments([]); return; }
    try {
      const data = await apiExecutionAPI.listEnvironments(projectId);
      setEnvironments(data.environments || []);
    } catch {
      showSnackbar('加载环境列表失败', 'error');
    }
  };

  const selectProject = (projectId, projectList) => {
    setSelectedProjectId(projectId);
    const list = projectList || projects;
    const project = list.find((p) => p.project_id === projectId);
    const form = toProjectForm(project);
    setProjectForm(form);
    setOperationAllowlistText((form.operation_allowlist || []).join('\n'));
    setOperationBlocklistText((form.operation_blocklist || []).join('\n'));
    setRiskOverridesText(JSON.stringify(form.risk_overrides || {}, null, 2));
    setActiveTab('project');
    loadEnvironments(projectId);
  };

  const handleNewProject = () => {
    setSelectedProjectId('');
    setProjectForm({ ...EMPTY_PROJECT });
    setOperationAllowlistText('');
    setOperationBlocklistText('');
    setRiskOverridesText('{}');
    setEnvironments([]);
    setActiveTab('project');
  };

  const handleSaveProject = async () => {
    if (!projectForm.name.trim()) {
      showSnackbar('项目名称不能为空', 'warning');
      return;
    }
    try {
      let allowlist = operationAllowlistText.split('\n').map((s) => s.trim()).filter(Boolean);
      let blocklist = operationBlocklistText.split('\n').map((s) => s.trim()).filter(Boolean);
      let riskOverrides = {};
      try { riskOverrides = JSON.parse(riskOverridesText); } catch { showSnackbar('接口风险覆盖 JSON 格式错误，请检查', 'error'); return; }

      const payload = {
        ...projectForm,
        operation_allowlist: allowlist,
        operation_blocklist: blocklist,
        risk_overrides: riskOverrides,
      };
      if (selectedProjectId) payload.project_id = selectedProjectId;

      const result = await apiExecutionAPI.saveProject(payload);
      showSnackbar(selectedProjectId ? '项目已更新' : '项目已创建', 'success');
      await loadProjects();
      if (result?.project_id) selectProject(result.project_id);
    } catch {
      showSnackbar('保存项目失败', 'error');
    }
  };

  const handleDeleteProject = () => {
    if (!selectedProjectId) return;
    setConfirmDialog({
      open: true,
      title: '删除项目',
      message: `确认删除项目 "${projectForm.name}" 及其所有环境？此操作不可撤销。`,
      onConfirm: async () => {
        try {
          await apiExecutionAPI.deleteProject(selectedProjectId);
          showSnackbar('项目已删除', 'success');
          setSelectedProjectId('');
          await loadProjects();
        } catch {
          showSnackbar('删除项目失败', 'error');
        }
      },
    });
  };

  const openEnvDialog = (env) => {
    if (env) {
      const form = toEnvForm(env);
      setEnvForm(form);
      setEnvVariablesText(JSON.stringify(form.variables || {}, null, 2));
      setEnvHeadersText(JSON.stringify(form.headers || {}, null, 2));
      setEnvDialog({ open: true, editing: env });
    } else {
      setEnvForm({ ...EMPTY_ENV });
      setEnvVariablesText('{}');
      setEnvHeadersText('{}');
      setEnvDialog({ open: true, editing: null });
    }
  };

  const closeEnvDialog = () => {
    setEnvDialog({ open: false, editing: null });
  };

  const handleSaveEnvironment = async () => {
    if (!selectedProjectId) {
      showSnackbar('请先选择或创建项目', 'warning');
      return;
    }
    if (!envForm.name.trim()) {
      showSnackbar('环境名称不能为空', 'warning');
      return;
    }
    try {
      let variables = {};
      let headers = {};
      try { variables = JSON.parse(envVariablesText); } catch { showSnackbar('环境变量 JSON 格式错误，请检查', 'error'); return; }
      try { headers = JSON.parse(envHeadersText); } catch { showSnackbar('请求头 JSON 格式错误，请检查', 'error'); return; }

      const payload = {
        ...envForm,
        variables,
        headers,
        timeout_ms: Number(envForm.timeout_ms) || 30000,
      };
      let savedEnvId = null;
      if (envDialog.editing?.environment_id) {
        payload.environment_id = envDialog.editing.environment_id;
        await apiExecutionAPI.updateEnvironment(envDialog.editing.environment_id, payload);
        showSnackbar('环境已更新', 'success');
      } else {
        const result = await apiExecutionAPI.saveEnvironment(selectedProjectId, payload);
        savedEnvId = result?.environment_id;
        showSnackbar('环境已创建', 'success');
      }
      closeEnvDialog();
      await loadEnvironments(selectedProjectId);
      if (savedEnvId) {
        const currentProject = projects.find((p) => p.project_id === selectedProjectId);
        if (currentProject && !currentProject.default_environment_id) {
          await apiExecutionAPI.saveProject({ ...currentProject, default_environment_id: savedEnvId });
        }
      }
    } catch {
      showSnackbar('保存环境失败', 'error');
    }
  };

  const handleDeleteEnvironment = (env) => {
    setConfirmDialog({
      open: true,
      title: '删除环境',
      message: `确认删除环境 "${env.name}"？此操作不可撤销。`,
      onConfirm: async () => {
        try {
          await apiExecutionAPI.deleteEnvironment(env.environment_id);
          showSnackbar('环境已删除', 'success');
          await loadEnvironments(selectedProjectId);
        } catch {
          showSnackbar('删除环境失败', 'error');
        }
      },
    });
  };

  useEffect(() => { loadProjects(); }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: embedded ? '100%' : 'auto', minHeight: 0 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2.5, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <FolderOpenOutlined fontSize="small" color="primary" />
          <Box>
            <Typography variant="subtitle2" fontWeight={700}>项目与环境配置</Typography>
            <Typography variant="caption" color="text.secondary">管理 API 自动化的项目和测试环境</Typography>
          </Box>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={handleNewProject}>新增项目</Button>
          <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={loadProjects} disabled={loading}>刷新</Button>
        </Stack>
      </Box>

      {/* Main content: sidebar + detail */}
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: { xs: 'column', md: 'row' } }}>
        {/* Left: Project list */}
        <Paper elevation={0} sx={{ width: { xs: '100%', md: 240 }, minWidth: 0, borderRight: { xs: 'none', md: '1px solid' }, borderBottom: { xs: '1px solid', md: 'none' }, borderColor: 'divider', overflow: 'auto' }}>
          <List dense disablePadding sx={{ p: 0.75 }}>
            {projects.length === 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ px: 1.5, py: 2, display: 'block', textAlign: 'center' }}>
                {loading ? '加载中...' : '暂无项目'}
              </Typography>
            )}
            {projects.map((project) => (
              <ListItemButton
                key={project.project_id}
                selected={project.project_id === selectedProjectId}
                onClick={() => selectProject(project.project_id)}
                sx={{ borderRadius: 1.5, mb: 0.25 }}
              >
                <ListItemText
                  primary={project.name || '(未命名)'}
                  primaryTypographyProps={{ variant: 'body2', fontWeight: project.project_id === selectedProjectId ? 700 : 400 }}
                />
              </ListItemButton>
            ))}
          </List>
        </Paper>

        {/* Right: Detail with tabs */}
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {!selectedProjectId ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'text.secondary' }}>
              <RocketLaunchOutlined sx={{ fontSize: 48, mb: 1, opacity: 0.3 }} />
              <Typography variant="body2">请从左侧选择一个项目，或点击"新增项目"</Typography>
            </Box>
          ) : (
            <>
              {/* Tabs header */}
              <Tabs
                value={activeTab}
                onChange={(_, v) => setActiveTab(v)}
                sx={{ px: 2.5, borderBottom: '1px solid', borderColor: 'divider', minHeight: 40 }}
              >
                <Tab label="项目配置" value="project" sx={{ minHeight: 40, textTransform: 'none' }} />
                <Tab
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      环境管理
                      <Chip label={environments.length} size="small" sx={{ height: 18, fontSize: '0.7rem' }} />
                    </Box>
                  }
                  value="environments"
                  sx={{ minHeight: 40, textTransform: 'none' }}
                />
              </Tabs>

              {/* Tab content */}
              <Box sx={{ flex: 1, overflow: 'auto', p: 2.5 }}>
                {activeTab === 'project' && (
                  <Stack spacing={3}>
                    {/* Project basic info */}
                    <Box>
                      <Typography variant="overline" color="text.secondary">基本信息</Typography>
                      <Stack spacing={2} sx={{ mt: 1 }}>
                        <TextField
                          size="small"
                          label="项目名称"
                          value={projectForm.name}
                          onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                          sx={{ maxWidth: 400 }}
                        />
                        <Stack direction="row" spacing={1}>
                          <Button variant="contained" size="small" onClick={handleSaveProject}>
                            {selectedProjectId ? '保存项目' : '创建项目'}
                          </Button>
                          {selectedProjectId && (
                            <Button variant="text" color="error" size="small" startIcon={<DeleteIcon />} onClick={handleDeleteProject}>
                              删除项目
                            </Button>
                          )}
                        </Stack>
                      </Stack>
                    </Box>

                    <Divider />

                    {/* AI policy */}
                    <Box>
                      <Typography variant="overline" color="text.secondary">AI 自动化边界</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                        控制 AI 能做到哪一步。生产或高风险接口建议收紧。
                      </Typography>
                      <Alert severity="info" sx={{ mb: 2 }}>推荐默认：允许生成 DSL、允许修复；自动执行和定时执行按项目风险再开启。</Alert>
                      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 1.25, mb: 2 }}>
                        {AI_BOUNDARY_OPTIONS.map((item) => (
                          <Box key={item.key} sx={{ display: 'flex', alignItems: 'flex-start', p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, bgcolor: '#fff' }}>
                            <Checkbox
                              size="small"
                              checked={Boolean(projectForm[item.key])}
                              onChange={(e) => setProjectForm({ ...projectForm, [item.key]: e.target.checked })}
                              sx={{ mt: -0.5 }}
                            />
                            <Box>
                              <Typography variant="body2" fontWeight={700}>{item.label}</Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>{item.description}</Typography>
                            </Box>
                          </Box>
                        ))}
                      </Box>
                      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2, mb: 2 }}>
                        <TextField size="small" label="最大自动修复次数" type="number" value={projectForm.max_auto_repairs} onChange={(e) => setProjectForm({ ...projectForm, max_auto_repairs: Number(e.target.value) })} helperText="建议 1-3；0 表示不限。" />
                        <TextField size="small" label="最大重跑次数" type="number" value={projectForm.max_reruns} onChange={(e) => setProjectForm({ ...projectForm, max_reruns: Number(e.target.value) })} helperText="建议 1-2；0 表示不限。" />
                        <TextField size="small" label="单次最大请求数" type="number" value={projectForm.max_requests_per_run} onChange={(e) => setProjectForm({ ...projectForm, max_requests_per_run: Number(e.target.value) })} helperText="限制批量执行规模，0 表示不限。" />
                      </Box>
                      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 2 }}>
                        <TextField size="small" label="接口白名单" multiline minRows={2} value={operationAllowlistText} onChange={(e) => setOperationAllowlistText(e.target.value)} placeholder={'GET /health\nGET /users'} helperText="每行一个 METHOD path。" />
                        <TextField size="small" label="接口黑名单" multiline minRows={2} value={operationBlocklistText} onChange={(e) => setOperationBlocklistText(e.target.value)} placeholder={'DELETE /users/{id}\nPOST /payments'} helperText="每行一个 METHOD path。" />
                      </Box>
                      <TextField
                        size="small"
                        label="接口风险覆盖 JSON"
                        multiline
                        minRows={3}
                        value={riskOverridesText}
                        onChange={(e) => setRiskOverridesText(e.target.value)}
                        placeholder={'{"DELETE /users/{id}": "high"}'}
                        helperText="用于人工指定接口风险等级：low / medium / high / blocked。"
                        sx={{ width: '100%', '& .MuiInputBase-input': { fontFamily: 'monospace' } }}
                      />
                    </Box>
                  </Stack>
                )}

                {activeTab === 'environments' && (
                  <Stack spacing={2}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        当前项目共 {environments.length} 个环境
                      </Typography>
                      <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => openEnvDialog(null)}>
                        新增环境
                      </Button>
                    </Box>

                    {environments.length === 0 ? (
                      <Paper elevation={0} sx={{ p: 4, textAlign: 'center', border: '1px dashed', borderColor: 'divider', borderRadius: 2 }}>
                        <Typography variant="body2" color="text.secondary">暂无环境，点击上方按钮创建第一个环境</Typography>
                      </Paper>
                    ) : (
                      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow sx={{ bgcolor: 'grey.50' }}>
                              <TableCell sx={{ fontWeight: 600 }}>环境名称</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>类型</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>Base URL</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>超时</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 600 }}>操作</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {environments.map((env) => (
                              <TableRow key={env.environment_id} hover>
                                <TableCell>
                                  <Typography variant="body2" fontWeight={600}>{env.name}</Typography>
                                </TableCell>
                                <TableCell>
                                  <Chip
                                    label={ENVIRONMENT_TYPE_OPTIONS.find((o) => o.value === env.environment_type)?.label || env.environment_type}
                                    size="small"
                                    variant="outlined"
                                    color={env.environment_type === 'prod' ? 'error' : env.environment_type === 'staging' ? 'warning' : 'default'}
                                  />
                                </TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', maxWidth: 200 }} noWrap>{env.base_url}</TableCell>
                                <TableCell>{env.timeout_ms}ms</TableCell>
                                <TableCell align="right">
                                  <Tooltip title="编辑"><IconButton size="small" onClick={() => openEnvDialog(env)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                                  <Tooltip title="删除"><IconButton size="small" color="error" onClick={() => handleDeleteEnvironment(env)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </Paper>
                    )}
                  </Stack>
                )}
              </Box>
            </>
          )}
        </Box>
      </Box>

      {/* Environment edit dialog */}
      <Dialog open={envDialog.open} onClose={closeEnvDialog} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {envDialog.editing ? `编辑环境: ${envDialog.editing.name}` : '新建环境'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField size="small" label="环境名称" value={envForm.name} onChange={(e) => setEnvForm({ ...envForm, name: e.target.value })} autoFocus />
              <FormControl size="small">
                <InputLabel>环境类型</InputLabel>
                <Select label="环境类型" value={envForm.environment_type} onChange={(e) => setEnvForm({ ...envForm, environment_type: e.target.value })}>
                  {ENVIRONMENT_TYPE_OPTIONS.map((item) => (
                    <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 2 }}>
              <TextField size="small" label="Base URL" value={envForm.base_url} onChange={(e) => setEnvForm({ ...envForm, base_url: e.target.value })} placeholder="http://localhost:8000" />
              <TextField size="small" label="超时(ms)" type="number" value={envForm.timeout_ms} onChange={(e) => setEnvForm({ ...envForm, timeout_ms: Number(e.target.value) })} />
            </Box>
            <TextField
              size="small"
              label="环境变量 JSON"
              multiline
              minRows={4}
              value={envVariablesText}
              onChange={(e) => setEnvVariablesText(e.target.value)}
              placeholder={'{"user_id": "10001", "access_token": "..."}'}
              helperText="可在脚本中用 {{user_id}} 这类变量引用。"
              sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace' } }}
            />
            <TextField
              size="small"
              label="请求头 JSON"
              multiline
              minRows={2}
              value={envHeadersText}
              onChange={(e) => setEnvHeadersText(e.target.value)}
              placeholder={'{"Authorization": "Bearer ..."}'}
              sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace' } }}
            />
            <FormControlLabel
              control={<Switch checked={envForm.enabled} onChange={(e) => setEnvForm({ ...envForm, enabled: e.target.checked })} />}
              label="启用此环境"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeEnvDialog}>取消</Button>
          <Button variant="contained" onClick={handleSaveEnvironment}>
            {envDialog.editing ? '保存' : '创建'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={() => { confirmDialog.onConfirm?.(); setConfirmDialog({ ...confirmDialog, open: false }); }}
        onCancel={() => setConfirmDialog({ ...confirmDialog, open: false })}
      />
    </Box>
  );
}
