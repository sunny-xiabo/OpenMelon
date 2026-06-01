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
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  Alert,
  Switch,
  FormControlLabel,
  useTheme
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Add as AddIcon,
  DeleteOutline as DeleteIcon,
  EditOutlined as EditIcon,
  FolderOpenOutlined,
  Refresh as RefreshIcon,
  SaveOutlined,
  SettingsInputComponentOutlined,
  InfoOutlined,
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
  { key: 'allow_ai_generate_dsl', label: '允许 AI 生成 DSL 草案', description: '基于 OpenAPI 文档与运行上下文自动生成测试用例脚本。' },
  { key: 'allow_ai_execution', label: '允许 AI 自主执行', description: '开启后，AI/自动化智能任务可不经人工审核直接提交执行。' },
  { key: 'allow_ai_repair', label: '允许 AI 自动修复故障', description: '运行失败时由 AI Agent 自动诊断并生成自愈补丁进行受控重跑。' },
  { key: 'allow_scheduled_execution', label: '允许定时调度执行', description: '允许该项目加入全域 Cron 触发流，定时评估测试套件。' },
  { key: 'allow_overwrite_history', label: '允许覆盖历史执行', description: '重跑失败步骤时合并覆盖更新最近一条测试诊断历史记录。' },
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
  const theme = useTheme();
  const showSnackbar = useSnackbar();
  
  // UI States
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [savedProjectDraft, setSavedProjectDraft] = useState(null);
  const [activeTab, setActiveTab] = useState('project');
  const [projectForm, setProjectForm] = useState({ ...EMPTY_PROJECT });
  const [envDialog, setEnvDialog] = useState({ open: false, editing: null });
  const [envDialogTab, setEnvDialogTab] = useState('base'); // 'base', 'variables', 'headers'
  const [envForm, setEnvForm] = useState({ ...EMPTY_ENV });
  const [envVariablesText, setEnvVariablesText] = useState('{}');
  const [envHeadersText, setEnvHeadersText] = useState('{}');
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });

  const [operationAllowlistText, setOperationAllowlistText] = useState('');
  const [operationBlocklistText, setOperationBlocklistText] = useState('');
  const [riskOverridesText, setRiskOverridesText] = useState('{}');

  // Real-time JSON validation states
  const [isVariablesJsonValid, setIsVariablesJsonValid] = useState(true);
  const [isHeadersJsonValid, setIsHeadersJsonValid] = useState(true);
  const [isRiskOverridesJsonValid, setIsRiskOverridesJsonValid] = useState(true);

  // TanStack Query Hooks
  const { data: projects = [], isLoading: isProjectsLoading, refetch: refetchProjects } = useExecProjects();
  const { data: environments = [] } = useExecEnvironments(selectedProjectId);
  
  const saveProjectMutation = useSaveProjectMutation();
  const deleteProjectMutation = useDeleteProjectMutation();
  const saveEnvMutation = useSaveEnvironmentMutation(selectedProjectId);
  const deleteEnvMutation = useDeleteEnvironmentMutation(selectedProjectId);

  const visibleProjects = useMemo(() => {
    if (!savedProjectDraft?.project_id) return projects;
    const normalized = projects.map((item) => (
      item.project_id === savedProjectDraft.project_id ? { ...item, ...savedProjectDraft } : item
    ));
    if (normalized.some((item) => item.project_id === savedProjectDraft.project_id)) {
      return normalized;
    }
    return [savedProjectDraft, ...normalized];
  }, [projects, savedProjectDraft]);

  // Auto-select first project
  useEffect(() => {
    if (visibleProjects.length > 0 && !selectedProjectId && !isCreatingProject) {
      handleSelectProject(visibleProjects[0].project_id, visibleProjects);
    }
  }, [visibleProjects, selectedProjectId, isCreatingProject]);

  const handleSelectProject = (projectId, list = visibleProjects, options = {}) => {
    const { preserveTab = false } = options;
    setSelectedProjectId(projectId);
    setIsCreatingProject(false);
    const p = list.find(item => item.project_id === projectId);
    if (p) {
      setProjectForm({ ...EMPTY_PROJECT, ...p });
      setOperationAllowlistText((p.operation_allowlist || []).join('\n'));
      setOperationBlocklistText((p.operation_blocklist || []).join('\n'));
      setRiskOverridesText(JSON.stringify(p.risk_overrides || {}, null, 2));
      setIsRiskOverridesJsonValid(true);
    }
    if (!preserveTab) {
      setActiveTab('project');
    }
  };

  const handleNewProject = () => {
    setSelectedProjectId('');
    setIsCreatingProject(true);
    setProjectForm({ ...EMPTY_PROJECT });
    setOperationAllowlistText('');
    setOperationBlocklistText('');
    setRiskOverridesText('{}');
    setIsRiskOverridesJsonValid(true);
    setSavedProjectDraft(null);
    setActiveTab('project');
  };

  // Variable JSON checker
  const handleVariablesChange = (val) => {
    setEnvVariablesText(val);
    try {
      if (val.trim()) {
        const parsed = JSON.parse(val);
        setIsVariablesJsonValid(typeof parsed === 'object' && parsed !== null);
      } else {
        setIsVariablesJsonValid(true);
      }
    } catch {
      setIsVariablesJsonValid(false);
    }
  };

  // Headers JSON checker
  const handleHeadersChange = (val) => {
    setEnvHeadersText(val);
    try {
      if (val.trim()) {
        const parsed = JSON.parse(val);
        setIsHeadersJsonValid(typeof parsed === 'object' && parsed !== null);
      } else {
        setIsHeadersJsonValid(true);
      }
    } catch {
      setIsHeadersJsonValid(false);
    }
  };

  // Risk Overrides JSON checker
  const handleRiskOverridesChange = (val) => {
    setRiskOverridesText(val);
    try {
      if (val.trim()) {
        const parsed = JSON.parse(val);
        setIsRiskOverridesJsonValid(typeof parsed === 'object' && parsed !== null);
      } else {
        setIsRiskOverridesJsonValid(true);
      }
    } catch {
      setIsRiskOverridesJsonValid(false);
    }
  };

  const onSaveProject = async () => {
    if (!isRiskOverridesJsonValid) {
      showSnackbar('保存失败：风险覆盖格式不符合 JSON 规范', { severity: 'error' });
      return;
    }
    try {
      let riskOverrides = {};
      if (riskOverridesText.trim()) {
        riskOverrides = JSON.parse(riskOverridesText);
      }

      const payload = {
        ...projectForm,
        project_id: selectedProjectId || undefined,
        operation_allowlist: operationAllowlistText.split('\n').map(s => s.trim()).filter(Boolean),
        operation_blocklist: operationBlocklistText.split('\n').map(s => s.trim()).filter(Boolean),
        risk_overrides: riskOverrides,
      };

      const result = await saveProjectMutation.mutateAsync(payload);
      const savedProject = { ...projectForm, ...result };
      showSnackbar('项目配置已成功保存！', { severity: 'success' });
      setIsCreatingProject(false);
      setSavedProjectDraft(savedProject);
      setSelectedProjectId(savedProject.project_id);
      setProjectForm(savedProject);
      handleSelectProject(savedProject.project_id, [savedProject, ...visibleProjects.filter((item) => item.project_id !== savedProject.project_id)]);
      await refetchProjects();
      return result;
    } catch (e) {
      showSnackbar('保存失败，请检查数据格式', { severity: 'error' });
    }
  };

  const onDeleteProject = () => {
    setConfirmDialog({
      open: true,
      title: '删除自动化项目',
      message: `确认要永久删除项目 "${projectForm.name}" 吗？该项目关联的环境、测试套件与执行记录都将被级联清空，此操作不可撤销。`,
      onConfirm: async () => {
        setConfirmDialog({ open: false });
        await deleteProjectMutation.mutateAsync(selectedProjectId);
        showSnackbar('项目已成功删除！', { severity: 'success' });
        setSelectedProjectId('');
        setIsCreatingProject(false);
        setSavedProjectDraft(null);
      }
    });
  };

  const openEnvDialog = (env) => {
    setEnvDialogTab('base');
    if (env) {
      setEnvForm({ ...EMPTY_ENV, ...env });
      setEnvVariablesText(JSON.stringify(env.variables || {}, null, 2));
      setEnvHeadersText(JSON.stringify(env.headers || {}, null, 2));
      setIsVariablesJsonValid(true);
      setIsHeadersJsonValid(true);
      setEnvDialog({ open: true, editing: env });
    } else {
      setEnvForm({ ...EMPTY_ENV });
      setEnvVariablesText('{}');
      setEnvHeadersText('{}');
      setIsVariablesJsonValid(true);
      setIsHeadersJsonValid(true);
      setEnvDialog({ open: true, editing: null });
    }
  };

  const onSaveEnv = async () => {
    if (!isVariablesJsonValid || !isHeadersJsonValid) {
      showSnackbar('保存失败：变量或请求头 JSON 语法有误', { severity: 'error' });
      return;
    }
    if (!selectedProjectId) {
      showSnackbar('请先选择一个项目，再新增或编辑环境', { severity: 'warning' });
      return;
    }
    try {
      const payload = {
        ...envForm,
        project_id: selectedProjectId,
        variables: JSON.parse(envVariablesText),
        headers: JSON.parse(envHeadersText),
      };
      const created = await saveEnvMutation.mutateAsync({ envId: envDialog.editing?.environment_id, payload });
      setEnvDialog({ ...envDialog, open: false });
      showSnackbar('环境网关配置已更新！', { severity: 'success' });
      if (created?.environment_id) {
        await refetchProjects();
        handleSelectProject(selectedProjectId, visibleProjects, { preserveTab: true });
      }
    } catch (e) {
      showSnackbar('JSON 格式错误或保存失败', { severity: 'error' });
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, bgcolor: 'transparent', background: 'radial-gradient(ellipse at 50% -20%, rgba(14, 165, 233, 0.02) 0%, transparent 80%)' }}>
      {/* Header - Glassmorphic */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'stretch', md: 'center' }, justifyContent: 'space-between', gap: 1.5, px: { xs: 2, md: 3 }, py: 2, borderBottom: '1px solid', borderColor: 'rgba(255, 255, 255, 0.4)', bgcolor: 'rgba(255, 255, 255, 0.2)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
          <FolderOpenOutlined sx={{ fontSize: 20, color: 'primary.main' }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 900, color: 'text.primary', letterSpacing: '-0.01em' }}>项目与测试环境配置</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>管理 API 自动化的核心项目边界、执行限额与网关变量</Typography>
          </Box>
        </Box>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
          <Button 
            size="small" 
            variant="outlined" 
            startIcon={<AddIcon />} 
            onClick={handleNewProject}
            sx={{
              borderRadius: 2.2, fontSize: '11px', fontWeight: 800, bgcolor: 'white', borderColor: 'rgba(0,0,0,0.06)',
              whiteSpace: 'nowrap',
              '&:hover': { bgcolor: 'rgba(14, 165, 233, 0.05)', borderColor: 'primary.main' }
            }}
          >
            新增项目
          </Button>
          <Button 
            size="small" 
            variant="outlined" 
            startIcon={<RefreshIcon />} 
            onClick={() => refetchProjects()} 
            disabled={isProjectsLoading}
            sx={{
              borderRadius: 2.2, fontSize: '11px', fontWeight: 800, bgcolor: 'white', borderColor: 'rgba(0,0,0,0.06)',
              whiteSpace: 'nowrap',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.03)' }
            }}
          >
            同步刷新
          </Button>
        </Stack>
      </Box>

      {/* Main content - Side Cabin & Workspace */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Left: Projects Capsule Sidebar */}
        <Paper 
          elevation={0} 
          sx={{ 
            width: { xs: '100%', md: 250 },
            flexShrink: 0,
            maxHeight: { xs: 220, md: 'none' },
            borderRight: { xs: 'none', md: '1px solid' },
            borderBottom: { xs: '1px solid', md: 'none' },
            borderColor: 'rgba(255, 255, 255, 0.4)', 
            overflow: 'auto', 
            bgcolor: 'rgba(255, 255, 255, 0.1)',
            p: { xs: 1, md: 1.5 },
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', px: 1, mb: 1, display: 'block', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            已加载项目列表 ({visibleProjects.length})
          </Typography>
          <List dense sx={{ p: 0 }}>
            {visibleProjects.map((p) => {
              const isSelected = p.project_id === selectedProjectId;
              return (
                <ListItemButton 
                  key={p.project_id} 
                  selected={isSelected} 
                  onClick={() => handleSelectProject(p.project_id)}
                  sx={{ 
                    borderRadius: 2.5, 
                    mb: 0.75, 
                    p: 1.25,
                    border: '1px solid',
                    borderColor: isSelected ? 'rgba(14, 165, 233, 0.2)' : 'rgba(0,0,0,0.02)',
                    bgcolor: isSelected ? 'rgba(14, 165, 233, 0.04) !important' : 'rgba(255,255,255,0.45)',
                    boxShadow: isSelected ? '0 4px 12px rgba(14, 165, 233, 0.02), inset 0 1px 0 rgba(255,255,255,0.6)' : 'none',
                    transition: 'all 0.2s',
                    '&:hover': {
                      bgcolor: isSelected ? 'rgba(14, 165, 233, 0.08) !important' : 'rgba(255,255,255,0.7)',
                      transform: 'translateY(-1px)'
                    },
                    position: 'relative',
                    '&::before': isSelected ? {
                      content: '""',
                      position: 'absolute',
                      left: 0,
                      top: '20%',
                      bottom: '20%',
                      width: 3.5,
                      borderRadius: '0 3.5px 3.5px 0',
                      bgcolor: 'primary.main',
                    } : {}
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ width: '100%', minWidth: 0 }}>
                    <ListItemText 
                      primary={p.name} 
                      sx={{ minWidth: 0, mr: 1 }}
                      primaryTypographyProps={{ 
                        variant: 'body2', 
                        sx: { fontWeight: isSelected ? 900 : 700, color: isSelected ? 'primary.main' : 'text.primary', overflowWrap: 'anywhere' } 
                      }} 
                    />
                    {isSelected && (
                      <Chip 
                        label={`${environments.length} Envs`}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: '10px',
                          fontWeight: 800,
                          bgcolor: 'rgba(14, 165, 233, 0.1)',
                          color: 'primary.main',
                          border: 'none',
                          flexShrink: 0
                        }}
                      />
                    )}
                  </Stack>
                </ListItemButton>
              );
            })}
          </List>
        </Paper>

        {/* Right: Workspace Details */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
          {!selectedProjectId && !projectForm.name && !isCreatingProject ? (
            <Box sx={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ProjectEmptyIllustration />
            </Box>
          ) : (
            <>
              {/* Tabs */}
              <Tabs 
                value={activeTab} 
                onChange={(_, v) => setActiveTab(v)} 
                variant="scrollable"
                scrollButtons="auto"
                sx={{ 
                  px: 2, 
                  borderBottom: '1px solid', 
                  borderColor: 'rgba(255, 255, 255, 0.45)',
                  bgcolor: 'rgba(255, 255, 255, 0.35)',
                  backdropFilter: 'blur(10px)',
                  '& .MuiTab-root': {
                    fontSize: '12px',
                    fontWeight: 800,
                    textTransform: 'none',
                    minHeight: 48,
                  }
                }}
              >
                <Tab label="项目参数与安全边界" value="project" />
                <Tab label={`网关环境管理 (${environments.length})`} value="environments" />
              </Tabs>

              {/* Detail Panels */}
              <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 2, md: 3.5 } }}>
                {activeTab === 'project' && (
                  <Stack spacing={4}>
                    {/* Basic Setup */}
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block', mb: 1.5, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        基本配置元数据
                      </Typography>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }} useFlexGap flexWrap="wrap">
                        <TextField 
                          size="small" 
                          label="项目名称" 
                          value={projectForm.name} 
                          onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} 
                          sx={{ 
                            flex: 1, 
                            minWidth: { xs: '100%', sm: 240 },
                            maxWidth: 450,
                            '& .MuiOutlinedInput-root': {
                              borderRadius: 2.2,
                              fontSize: '13px',
                              fontWeight: 700,
                              bgcolor: 'white',
                            }
                          }} 
                        />
                        <Button 
                          variant="contained" 
                          size="small" 
                          startIcon={<SaveOutlined />}
                          onClick={onSaveProject} 
                          disabled={saveProjectMutation.isPending}
                          sx={{ height: 38, borderRadius: 2.2, px: 3, fontSize: '12px', fontWeight: 800, flexShrink: 0 }}
                        >
                          保存配置
                        </Button>
                        {selectedProjectId && (
                          <Button 
                            color="error" 
                            variant="outlined"
                            size="small" 
                            startIcon={<DeleteIcon />}
                            onClick={onDeleteProject}
                            sx={{ height: 38, borderRadius: 2.2, px: 2.5, fontSize: '12px', fontWeight: 800, flexShrink: 0 }}
                          >
                            删除项目
                          </Button>
                        )}
                      </Stack>
                    </Box>

                    <Divider sx={{ borderColor: 'rgba(0,0,0,0.05)' }} />

                    {/* Hidden deep execution limits fully exposed */}
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block', mb: 2.2, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        Agent 执行与重跑限额设定
                      </Typography>
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 2.5 }}>
                        <TextField
                          size="small"
                          type="number"
                          label="最大自动修复次数 (max_auto_repairs)"
                          value={projectForm.max_auto_repairs || 0}
                          onChange={(e) => setProjectForm({ ...projectForm, max_auto_repairs: parseInt(e.target.value, 10) || 0 })}
                          inputProps={{ min: 0 }}
                          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.2, bgcolor: 'white', fontSize: '12px', fontWeight: 700 } }}
                        />
                        <TextField
                          size="small"
                          type="number"
                          label="最大步骤重试次数 (max_reruns)"
                          value={projectForm.max_reruns || 0}
                          onChange={(e) => setProjectForm({ ...projectForm, max_reruns: parseInt(e.target.value, 10) || 0 })}
                          inputProps={{ min: 0 }}
                          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.2, bgcolor: 'white', fontSize: '12px', fontWeight: 700 } }}
                        />
                        <TextField
                          size="small"
                          type="number"
                          label="单次最大并发请求数 (max_requests)"
                          value={projectForm.max_requests_per_run || 0}
                          onChange={(e) => setProjectForm({ ...projectForm, max_requests_per_run: parseInt(e.target.value, 10) || 0 })}
                          inputProps={{ min: 0 }}
                          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.2, bgcolor: 'white', fontSize: '12px', fontWeight: 700 } }}
                        />
                      </Box>
                    </Box>

                    <Divider sx={{ borderColor: 'rgba(0,0,0,0.05)' }} />

                    {/* AI Automation Boundary Grid */}
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block', mb: 2, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        AI 自动化执行安全防线 (AI Boundary)
                      </Typography>
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 2 }}>
                        {AI_BOUNDARY_OPTIONS.map((opt) => {
                          const isChecked = !!projectForm[opt.key];
                          return (
                            <Paper 
                              key={opt.key} 
                              variant="outlined" 
                              sx={{ 
                                p: 2, 
                                borderRadius: 3.5, 
                                border: '1px solid',
                                borderColor: isChecked ? 'primary.main' : 'rgba(0,0,0,0.06)',
                                bgcolor: isChecked ? alpha(theme.palette.primary.main, 0.01) : 'rgba(255,255,255,0.45)',
                                boxShadow: isChecked ? `0 4px 12px ${alpha(theme.palette.primary.main, 0.03)}` : 'none',
                                transition: 'all 0.2s',
                              }}
                            >
                              <FormControlLabel 
                                control={
                                  <Switch 
                                    size="small" 
                                    checked={isChecked} 
                                    onChange={(e) => setProjectForm({ ...projectForm, [opt.key]: e.target.checked })} 
                                  />
                                }
                                label={
                                  <Typography variant="body2" sx={{ fontWeight: 800, color: isChecked ? 'primary.main' : 'text.primary', ml: 0.5 }}>
                                    {opt.label}
                                  </Typography>
                                }
                              />
                              <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary', fontWeight: 500, lineHeight: 1.5 }}>
                                {opt.description}
                              </Typography>
                            </Paper>
                          );
                        })}
                      </Box>
                    </Box>

                    <Divider sx={{ borderColor: 'rgba(0,0,0,0.05)' }} />

                    {/* OpenAPI Allowlist & Blocklist & Risk Overrides */}
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block', mb: 2, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        接口黑白名单与风险拦截规则
                      </Typography>
                      <Stack spacing={3}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3 }}>
                          <Box>
                            <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.primary', display: 'block', mb: 1 }}>
                              白名单网关：允许调用的 API 路径 (Allowlist - 按行输入，支持 * 通配符)
                            </Typography>
                            <TextField
                              multiline
                              rows={4}
                              fullWidth
                              placeholder="/api/v1/user/*&#10;/api/v1/orders/create"
                              value={operationAllowlistText}
                              onChange={(e) => setOperationAllowlistText(e.target.value)}
                              sx={{
                                '& .MuiOutlinedInput-root': {
                                  fontFamily: 'monospace',
                                  fontSize: '12px',
                                  borderRadius: 2.2,
                                  bgcolor: 'white',
                                }
                              }}
                            />
                          </Box>
                          
                          <Box>
                            <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.primary', display: 'block', mb: 1 }}>
                              黑名单网关：拦截阻断的 API 路径 (Blocklist - 按行输入，支持 * 通配符)
                            </Typography>
                            <TextField
                              multiline
                              rows={4}
                              fullWidth
                              placeholder="/api/v1/admin/*&#10;/api/v1/settings/delete"
                              value={operationBlocklistText}
                              onChange={(e) => setOperationBlocklistText(e.target.value)}
                              sx={{
                                '& .MuiOutlinedInput-root': {
                                  fontFamily: 'monospace',
                                  fontSize: '12px',
                                  borderRadius: 2.2,
                                  bgcolor: 'white',
                                }
                              }}
                            />
                          </Box>
                        </Box>

                        <Box>
                          <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.primary', display: 'block', mb: 1 }}>
                            高风险接口拦截重定义 (Risk Overrides JSON - 如 { "\"/api/v1/user/delete\": \"high\"" } )
                          </Typography>
                          <TextField
                            multiline
                            rows={3}
                            fullWidth
                            value={riskOverridesText}
                            onChange={(e) => handleRiskOverridesChange(e.target.value)}
                            error={!isRiskOverridesJsonValid}
                            helperText={!isRiskOverridesJsonValid && "风险覆盖配置必须为合法的 JSON 对象格式，如: {\"path\": \"high\"}"}
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                fontFamily: 'monospace',
                                fontSize: '12px',
                                borderRadius: 2.2,
                                bgcolor: 'white',
                              }
                            }}
                          />
                        </Box>
                      </Stack>
                    </Box>
                  </Stack>
                )}

                {activeTab === 'environments' && (
                  <Stack spacing={3}>
                    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, gap: 1.5, bgcolor: 'rgba(14,165,233,0.03)', border: '1px solid rgba(14,165,233,0.1)', p: 1.75, borderRadius: 3.5 }}>
                      <Typography variant="body2" sx={{ color: 'primary.main', fontWeight: 700 }}>
                        提示：此处配置多套测试网关环境。API 执行器执行时会读取对应的 Base URL 及全局环境变量参数。
                      </Typography>
                      <Button 
                        size="small" 
                        variant="contained" 
                        startIcon={<AddIcon />} 
                        onClick={() => openEnvDialog(null)}
                        sx={{ borderRadius: 2, fontSize: '11px', fontWeight: 800, px: 2, alignSelf: { xs: 'flex-start', sm: 'center' }, whiteSpace: 'nowrap' }}
                      >
                        新增环境
                      </Button>
                    </Box>

                    <TableContainer sx={{ border: '1px solid rgba(0,0,0,0.05)', borderRadius: 4, bgcolor: 'white', overflowX: 'auto' }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow
                            sx={{
                              '& th': {
                                bgcolor: 'rgba(241, 245, 249, 0.6)',
                                color: 'text.secondary',
                                fontWeight: 800,
                                fontSize: '11px',
                                letterSpacing: '0.05em',
                                textTransform: 'uppercase',
                                borderBottom: '1px solid rgba(0,0,0,0.06)',
                                py: 1.5,
                              }
                            }}
                          >
                            <TableCell sx={{ pl: 2.5 }}>网关环境</TableCell>
                            <TableCell>网关类型</TableCell>
                            <TableCell>网络 Base URL</TableCell>
                            <TableCell align="right" sx={{ pr: 2.5 }}>网关操作</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {environments.map((env) => (
                            <TableRow 
                              key={env.environment_id} 
                              hover
                              sx={{
                                transition: 'background-color 0.2s',
                                '&:hover': { bgcolor: 'rgba(14, 165, 233, 0.015) !important' },
                                '& td': { borderBottom: '1px solid rgba(0,0,0,0.03)', py: 1.5 }
                              }}
                            >
                              <TableCell sx={{ pl: 2.5, fontWeight: 800, color: 'text.primary', fontSize: '13px' }}>
                                {env.name}
                              </TableCell>
                              <TableCell>
                                <Chip 
                                  label={env.environment_type} 
                                  size="small" 
                                  sx={{
                                    fontSize: '10px',
                                    fontWeight: 800,
                                    height: 18,
                                    bgcolor: env.environment_type === 'prod' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(14, 165, 233, 0.08)',
                                    color: env.environment_type === 'prod' ? '#ef4444' : 'primary.main',
                                    border: 'none'
                                  }}
                                />
                              </TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: 11, color: 'text.secondary', fontWeight: 600 }}>
                                {env.base_url || '未配置 Base URL'}
                              </TableCell>
                              <TableCell align="right" sx={{ pr: 2.5 }}>
                                <Stack direction="row" spacing={1} justifyContent="flex-end">
                                  <IconButton 
                                    size="small" 
                                    onClick={() => openEnvDialog(env)}
                                    sx={{
                                      width: 26,
                                      height: 26,
                                      border: '1px solid rgba(0,0,0,0.06)',
                                      borderRadius: 1.5,
                                    }}
                                  >
                                    <EditIcon fontSize="small" sx={{ fontSize: 13 }} />
                                  </IconButton>
                                  <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() => {
                                      setConfirmDialog({
                                        open: true,
                                        title: '删除测试网关环境',
                                        message: `确认要永久删除环境 "${env.name}" 吗？删除后该环境下的所有配置将被清除，此操作不可撤销。`,
                                        onConfirm: async () => {
                                          setConfirmDialog({ open: false });
                                          await deleteEnvMutation.mutateAsync(env.environment_id);
                                          showSnackbar('环境已成功删除！', { severity: 'success' });
                                        }
                                      });
                                    }}
                                    sx={{
                                      width: 26,
                                      height: 26,
                                      border: '1px solid rgba(239, 68, 68, 0.1)',
                                      borderRadius: 1.5,
                                      '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.03)' }
                                    }}
                                  >
                                    <DeleteIcon fontSize="small" sx={{ fontSize: 13 }} />
                                  </IconButton>
                                </Stack>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Stack>
                )}
              </Box>
            </>
          )}
        </Box>
      </Box>

      {/* Segmented Dialog with Variable & Header Tabs */}
      <Dialog 
        open={envDialog.open} 
        onClose={() => setEnvDialog({ ...envDialog, open: false })} 
        maxWidth="sm" 
        fullWidth
        PaperProps={{
          sx: { borderRadius: 4.5, overflow: 'hidden' }
        }}
      >
        <DialogTitle sx={{ px: 3, pt: 2.5, pb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <SettingsInputComponentOutlined sx={{ color: 'primary.main' }} />
          <Typography component="span" variant="subtitle1" sx={{ fontWeight: 900 }}>
            {envDialog.editing ? `编辑测试网关环境：${envDialog.editing.name}` : '新增测试网关环境'}
          </Typography>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <Tabs 
            value={envDialogTab} 
            onChange={(_, v) => setEnvDialogTab(v)} 
            variant="scrollable"
            scrollButtons="auto"
            sx={{ 
              px: { xs: 1.5, sm: 3 },
              borderBottom: '1px solid rgba(0,0,0,0.06)',
              bgcolor: 'rgba(0,0,0,0.01)',
              '& .MuiTab-root': {
                fontSize: '12px',
                fontWeight: 800,
                textTransform: 'none',
                minHeight: 44,
              }
            }}
          >
            <Tab label="基本网络网关" value="base" />
            <Tab label="自定义全局变量 (Variables)" value="variables" />
            <Tab label="自定义请求标头 (Headers)" value="headers" />
          </Tabs>

          <Box sx={{ p: { xs: 2, sm: 3 } }}>
            {envDialogTab === 'base' && (
              <Stack spacing={2.5}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 }}>
                  <TextField 
                    size="small" 
                    label="环境名称" 
                    value={envForm.name} 
                    onChange={(e) => setEnvForm({ ...envForm, name: e.target.value })} 
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.2, fontSize: '12px', fontWeight: 700 } }}
                  />
                  <FormControl size="small">
                    <InputLabel id="dialog-env-type-label" sx={{ fontSize: '12px', fontWeight: 600 }}>环境类型</InputLabel>
                    <Select 
                      labelId="dialog-env-type-label"
                      label="环境类型"
                      size="small" 
                      value={envForm.environment_type} 
                      onChange={(e) => setEnvForm({ ...envForm, environment_type: e.target.value })}
                      sx={{ borderRadius: 2.2, fontSize: '12px', fontWeight: 700 }}
                    >
                      {ENVIRONMENT_TYPE_OPTIONS.map(o => (
                        <MenuItem key={o.value} value={o.value} sx={{ fontSize: '12px' }}>{o.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
                
                <TextField 
                  size="small" 
                  label="网络请求 Base URL (网关入口)" 
                  value={envForm.base_url} 
                  onChange={(e) => setEnvForm({ ...envForm, base_url: e.target.value })} 
                  placeholder="https://api.test.openmelon.com"
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.2, fontSize: '12px', fontWeight: 700 } }}
                />

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5, alignItems: 'center' }}>
                  <TextField
                    size="small"
                    type="number"
                    label="单次请求超时时间 (timeout_ms)"
                    value={envForm.timeout_ms || 30000}
                    onChange={(e) => setEnvForm({ ...envForm, timeout_ms: parseInt(e.target.value, 10) || 30000 })}
                    inputProps={{ min: 100 }}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.2, fontSize: '12px', fontWeight: 700 } }}
                  />

                  <FormControlLabel 
                    control={
                      <Switch 
                        size="small" 
                        checked={!!envForm.continue_on_failure} 
                        onChange={(e) => setEnvForm({ ...envForm, continue_on_failure: e.target.checked })} 
                      />
                    }
                    label={
                      <Typography variant="body2" sx={{ fontWeight: 800, fontSize: '12px' }}>
                        断言失败时仍继续下一步
                      </Typography>
                    }
                  />
                </Box>
              </Stack>
            )}

            {envDialogTab === 'variables' && (
              <Stack spacing={1.5}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <InfoOutlined sx={{ fontSize: 14 }} /> 环境变量为标准 JSON 键值对格式 (如 { "\"user_id\": \"1001\"" })
                </Typography>
                <TextField 
                  size="small" 
                  label="全局变量 JSON" 
                  multiline 
                  rows={8} 
                  value={envVariablesText} 
                  onChange={(e) => handleVariablesChange(e.target.value)} 
                  error={!isVariablesJsonValid}
                  helperText={!isVariablesJsonValid && "请输入合法的 JSON 格式，花括号两端请保证闭合"}
                  sx={{ 
                    '& .MuiOutlinedInput-root': {
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      borderRadius: 2.2,
                      bgcolor: 'rgba(0,0,0,0.01)'
                    } 
                  }} 
                />
              </Stack>
            )}

            {envDialogTab === 'headers' && (
              <Stack spacing={1.5}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <InfoOutlined sx={{ fontSize: 14 }} /> 请求标头为标准 JSON 键值对格式 (如 { "\"Authorization\": \"Bearer token\"" })
                </Typography>
                <TextField 
                  size="small" 
                  label="请求标头 JSON" 
                  multiline 
                  rows={8} 
                  value={envHeadersText} 
                  onChange={(e) => handleHeadersChange(e.target.value)} 
                  error={!isHeadersJsonValid}
                  helperText={!isHeadersJsonValid && "请输入合法的 JSON 格式，标头键与值均须为双引号包围的字符串"}
                  sx={{ 
                    '& .MuiOutlinedInput-root': {
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      borderRadius: 2.2,
                      bgcolor: 'rgba(0,0,0,0.01)'
                    } 
                  }} 
                />
              </Stack>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, bgcolor: 'rgba(0,0,0,0.01)' }}>
          <Button onClick={() => setEnvDialog({ ...envDialog, open: false })} sx={{ fontWeight: 800, fontSize: '12px' }}>
            取消
          </Button>
          <Button 
            variant="contained" 
            onClick={onSaveEnv}
            disabled={!isVariablesJsonValid || !isHeadersJsonValid}
            sx={{ borderRadius: 2, px: 3, fontWeight: 800, fontSize: '12px' }}
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog({ open: false })} />
    </Box>
  );
}

function ProjectEmptyIllustration() {
  return (
    <Stack alignItems="center" spacing={2.5} sx={{ py: 8 }}>
      <Box 
        component="svg" 
        width={180} 
        height={180} 
        viewBox="0 0 200 200" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="planetGrad" x1="40" y1="40" x2="160" y2="160" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0ea5e9" />
            <stop offset="1" stopColor="#0284c7" />
          </linearGradient>
          <filter id="planetGlow" x="40" y="40" width="120" height="120" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="8" result="blur" />
          </filter>
        </defs>

        {/* Orbit Ring */}
        <ellipse cx="100" cy="115" rx="70" ry="22" stroke="rgba(14, 165, 233, 0.2)" strokeWidth="2" strokeDasharray="6 4" />
        
        {/* Floating Landing Platform (Isometric Base) */}
        <path d="M40 135L100 110L160 135L100 160Z" fill="rgba(14, 165, 233, 0.05)" stroke="rgba(14, 165, 233, 0.2)" strokeWidth="1.5" />
        <path d="M40 135L40 143L100 168L160 148L160 135" fill="rgba(14, 165, 233, 0.08)" stroke="rgba(14, 165, 233, 0.2)" strokeWidth="1.5" />

        {/* Floating Tech Planet Core */}
        <circle cx="100" cy="75" r="32" fill="#0ea5e9" opacity="0.12" filter="url(#planetGlow)" />
        <circle cx="100" cy="75" r="24" fill="url(#planetGrad)" stroke="#fff" strokeWidth="2.5" />
        
        {/* Planet technical surface details */}
        <path d="M85 68 A24 24 0 0 0 115 82" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="95" cy="85" r="2" fill="#fff" />
        <circle cx="110" cy="68" r="3" fill="#fff" opacity="0.5" />

        {/* Orbital satellite node */}
        <circle cx="160" cy="110" r="4.5" fill="#0ea5e9" stroke="#fff" strokeWidth="1.2" />

        {/* technical indicators */}
        <line x1="100" y1="110" x2="100" y2="135" stroke="rgba(14, 165, 233, 0.4)" strokeWidth="1.5" strokeDasharray="3 3" />
      </Box>
      <Typography variant="h6" fontWeight={850} sx={{ color: 'text.primary', textAlign: 'center' }}>
        多项目与网关环境舱
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary', maxWidth: 420, textAlign: 'center', lineHeight: 1.6, px: 2, display: 'block', fontWeight: 600 }}>
        欢迎进入自动化测试配置中心。请在左侧面板选择现有项目，或直接点击顶部“新增项目”按钮开始全局 API 网关配置。
      </Typography>
    </Stack>
  );
}
