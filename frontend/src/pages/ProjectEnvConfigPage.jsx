import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
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
  Switch,
  FormControlLabel
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
import { ENVIRONMENT_TYPE_OPTIONS } from '../features/APIExecution/constants';

// Hooks
import {
  useExecProjects,
  useExecEnvironments,
  useSaveProjectMutation,
  useDeleteProjectMutation,
  useSaveEnvironmentMutation,
  useDeleteEnvironmentMutation
} from '../features/APIExecution/hooks/useAPIExecutionQueries';

const AI_BOUNDARY_OPTIONS = [
  { key: 'allow_ai_generate_dsl', label: '允许 AI 生成 DSL', description: '允许根据 OpenAPI 自动生成测试脚本草案。' },
  { key: 'allow_ai_execution', label: '允许 AI 自动执行', description: '开启后，AI/自动化任务可以直接提交执行。' },
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

export default function ProjectEnvConfigPage({ embedded = false }) {
  const showSnackbar = useSnackbar();
  
  // UI 状态
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [activeTab, setActiveTab] = useState('project');
  const [projectForm, setProjectForm] = useState({ ...EMPTY_PROJECT });
  const [envDialog, setEnvDialog] = useState({ open: false, editing: null });
  const [envForm, setEnvForm] = useState({ ...EMPTY_ENV });
  const [envVariablesText, setEnvVariablesText] = useState('{}');
  const [envHeadersText, setEnvHeadersText] = useState('{}');
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });

  const [operationAllowlistText, setOperationAllowlistText] = useState('');
  const [operationBlocklistText, setOperationBlocklistText] = useState('');
  const [riskOverridesText, setRiskOverridesText] = useState('{}');

  // TanStack Query Hooks
  const { data: projects = [], isLoading: isProjectsLoading, refetch: refetchProjects } = useExecProjects();
  const { data: environments = [], isLoading: isEnvsLoading } = useExecEnvironments(selectedProjectId);
  
  const saveProjectMutation = useSaveProjectMutation();
  const deleteProjectMutation = useDeleteProjectMutation();
  const saveEnvMutation = useSaveEnvironmentMutation(selectedProjectId);
  const deleteEnvMutation = useDeleteEnvironmentMutation(selectedProjectId);

  // 初始化选中
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      handleSelectProject(projects[0].project_id, projects);
    }
  }, [projects]);

  const handleSelectProject = (projectId, list = projects) => {
    setSelectedProjectId(projectId);
    const p = list.find(item => item.project_id === projectId);
    if (p) {
      setProjectForm({ ...EMPTY_PROJECT, ...p });
      setOperationAllowlistText((p.operation_allowlist || []).join('\n'));
      setOperationBlocklistText((p.operation_blocklist || []).join('\n'));
      setRiskOverridesText(JSON.stringify(p.risk_overrides || {}, null, 2));
    }
    setActiveTab('project');
  };

  const handleNewProject = () => {
    setSelectedProjectId('');
    setProjectForm({ ...EMPTY_PROJECT });
    setOperationAllowlistText('');
    setOperationBlocklistText('');
    setRiskOverridesText('{}');
    setActiveTab('project');
  };

  const onSaveProject = async () => {
    try {
      let riskOverrides = {};
      try { riskOverrides = JSON.parse(riskOverridesText); } catch { showSnackbar('风险覆盖 JSON 格式错误', { severity: 'error' }); return; }

      const payload = {
        ...projectForm,
        project_id: selectedProjectId || undefined,
        operation_allowlist: operationAllowlistText.split('\n').map(s => s.trim()).filter(Boolean),
        operation_blocklist: operationBlocklistText.split('\n').map(s => s.trim()).filter(Boolean),
        risk_overrides: riskOverrides,
      };

      const result = await saveProjectMutation.mutateAsync(payload);
      if (!selectedProjectId) setSelectedProjectId(result.project_id);
    } catch (e) {}
  };

  const onDeleteProject = () => {
    setConfirmDialog({
      open: true,
      title: '删除项目',
      message: `确认删除项目 "${projectForm.name}"？此操作不可撤销。`,
      onConfirm: async () => {
        setConfirmDialog({ open: false });
        await deleteProjectMutation.mutateAsync(selectedProjectId);
        setSelectedProjectId('');
      }
    });
  };

  const openEnvDialog = (env) => {
    if (env) {
      setEnvForm({ ...EMPTY_ENV, ...env });
      setEnvVariablesText(JSON.stringify(env.variables || {}, null, 2));
      setEnvHeadersText(JSON.stringify(env.headers || {}, null, 2));
      setEnvDialog({ open: true, editing: env });
    } else {
      setEnvForm({ ...EMPTY_ENV });
      setEnvVariablesText('{}');
      setEnvHeadersText('{}');
      setEnvDialog({ open: true, editing: null });
    }
  };

  const onSaveEnv = async () => {
    try {
      const payload = {
        ...envForm,
        variables: JSON.parse(envVariablesText),
        headers: JSON.parse(envHeadersText),
      };
      await saveEnvMutation.mutateAsync({ envId: envDialog.editing?.environment_id, payload });
      setEnvDialog({ ...envDialog, open: false });
    } catch (e) {
      showSnackbar('JSON 格式错误或保存失败', { severity: 'error' });
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2.5, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <FolderOpenOutlined fontSize="small" color="primary" />
          <Box>
            <Typography variant="subtitle2" fontWeight={700}>项目与环境配置</Typography>
            <Typography variant="caption" color="text.secondary">管理 API 自动化的核心元数据</Typography>
          </Box>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={handleNewProject}>新增项目</Button>
          <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={() => refetchProjects()} disabled={isProjectsLoading}>刷新</Button>
        </Stack>
      </Box>

      {/* Main content */}
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left: Projects */}
        <Paper elevation={0} sx={{ width: 240, borderRight: '1px solid', borderColor: 'divider', overflow: 'auto' }}>
          <List dense sx={{ p: 1 }}>
            {projects.map((p) => (
              <ListItemButton 
                key={p.project_id} 
                selected={p.project_id === selectedProjectId} 
                onClick={() => handleSelectProject(p.project_id)}
                sx={{ borderRadius: 1.5, mb: 0.5 }}
              >
                <ListItemText primary={p.name} primaryTypographyProps={{ variant: 'body2', fontWeight: p.project_id === selectedProjectId ? 700 : 400 }} />
              </ListItemButton>
            ))}
          </List>
        </Paper>

        {/* Right: Details */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {!selectedProjectId && !projectForm.name ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'text.secondary' }}>
              <RocketLaunchOutlined sx={{ fontSize: 48, mb: 1, opacity: 0.3 }} />
              <Typography variant="body2">请选择或创建一个项目开始配置</Typography>
            </Box>
          ) : (
            <>
              <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ px: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Tab label="项目配置" value="project" />
                <Tab label={`环境管理 (${environments.length})`} value="environments" />
              </Tabs>

              <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
                {activeTab === 'project' && (
                  <Stack spacing={3}>
                    <Box>
                      <Typography variant="overline" color="text.secondary">基本信息</Typography>
                      <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                        <TextField size="small" label="项目名称" value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} sx={{ flex: 1, maxWidth: 400 }} />
                        <Button variant="contained" size="small" onClick={onSaveProject} disabled={saveProjectMutation.isPending}>保存</Button>
                        {selectedProjectId && <Button color="error" size="small" onClick={onDeleteProject}>删除项目</Button>}
                      </Stack>
                    </Box>
                    <Divider />
                    <Box>
                      <Typography variant="overline" color="text.secondary">AI 自动化边界</Typography>
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 1.5, mt: 1.5 }}>
                        {AI_BOUNDARY_OPTIONS.map((opt) => (
                          <Paper key={opt.key} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                            <FormControlLabel 
                              control={<Checkbox size="small" checked={!!projectForm[opt.key]} onChange={(e) => setProjectForm({ ...projectForm, [opt.key]: e.target.checked })} />}
                              label={<Typography variant="body2" fontWeight={700}>{opt.label}</Typography>}
                            />
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{opt.description}</Typography>
                          </Paper>
                        ))}
                      </Box>
                    </Box>
                  </Stack>
                )}

                {activeTab === 'environments' && (
                  <Stack spacing={2}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">配置多套环境（如开发、测试、预发）。</Typography>
                      <Button size="small" variant="contained" onClick={() => openEnvDialog(null)}>新增环境</Button>
                    </Box>
                    <Table size="small">
                      <TableHead><TableRow><TableCell>环境</TableCell><TableCell>类型</TableCell><TableCell>Base URL</TableCell><TableCell align="right">操作</TableCell></TableRow></TableHead>
                      <TableBody>
                        {environments.map((env) => (
                          <TableRow key={env.environment_id} hover>
                            <TableCell fontWeight={700}>{env.name}</TableCell>
                            <TableCell><Chip label={env.environment_type} size="small" variant="outlined" /></TableCell>
                            <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{env.base_url}</TableCell>
                            <TableCell align="right">
                              <IconButton size="small" onClick={() => openEnvDialog(env)}><EditIcon fontSize="small" /></IconButton>
                              <IconButton size="small" color="error" onClick={() => deleteEnvMutation.mutate(env.environment_id)}><DeleteIcon fontSize="small" /></IconButton>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Stack>
                )}
              </Box>
            </>
          )}
        </Box>
      </Box>

      <Dialog open={envDialog.open} onClose={() => setEnvDialog({ ...envDialog, open: false })} maxWidth="sm" fullWidth>
        <DialogTitle>{envDialog.editing ? '编辑环境' : '新增环境'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField size="small" label="名称" value={envForm.name} onChange={(e) => setEnvForm({ ...envForm, name: e.target.value })} />
              <Select size="small" value={envForm.environment_type} onChange={(e) => setEnvForm({ ...envForm, environment_type: e.target.value })}>
                {ENVIRONMENT_TYPE_OPTIONS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </Select>
            </Box>
            <TextField size="small" label="Base URL" value={envForm.base_url} onChange={(e) => setEnvForm({ ...envForm, base_url: e.target.value })} />
            <TextField size="small" label="变量 JSON" multiline rows={4} value={envVariablesText} onChange={(e) => setEnvVariablesText(e.target.value)} sx={{ fontStyle: 'monospace' }} />
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setEnvDialog({ ...envDialog, open: false })}>取消</Button><Button variant="contained" onClick={onSaveEnv}>保存</Button></DialogActions>
      </Dialog>
      <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog({ open: false })} />
    </Box>
  );
}
