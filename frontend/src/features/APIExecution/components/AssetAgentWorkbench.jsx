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
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Add, AltRouteOutlined, AutoAwesome, BlockOutlined, DeleteForeverOutlined, DeleteOutline, EditOutlined, InfoOutlined, MergeType, MoreVert, RestoreOutlined, ScienceOutlined, TipsAndUpdatesOutlined, WarningAmberOutlined } from '@mui/icons-material';
import { useAPIExecution } from '../context';
import { apiExecutionAPI } from '../../../api/execution';
import { useSnackbar } from '../../../components/SnackbarProvider';
import EmptyState from '../../../components/EmptyState';
import { METHOD_COLORS } from '../constants';
import { formatRunTime, getRunStatusMeta } from '../utils';
import { EXEC_KEYS, useProjectAssets } from '../hooks/useAPIExecutionQueries';
import { useQueryClient } from '@tanstack/react-query';

const ACTIVE_STATUSES = new Set(['active', 'changed']);

const RISK_META = {
  low: { label: '低风险', color: 'success' },
  medium: { label: '中风险', color: 'warning' },
  high: { label: '高风险', color: 'error' },
  blocked: { label: '阻断', color: 'error' },
};

const STATUS_META = {
  active: { label: '有效', color: 'success' },
  changed: { label: '变更', color: 'warning' },
  removed: { label: '移除', color: 'error' },
  deprecated: { label: '废弃', color: 'default' },
  hidden: { label: '隐藏', color: 'default' },
  excluded: { label: '已排除', color: 'default' },
};

const MODULE_STATUS_META = {
  active: { label: '有效', color: 'success' },
  hidden: { label: '隐藏', color: 'default' },
  excluded: { label: '已排除', color: 'default' },
  removed: { label: '移除', color: 'error' },
};

const sourceLabel = (source) => (source === 'manual' ? '手动' : 'OpenAPI');

const getInterfaceLabel = (item) => `${item.method || ''} ${item.path || ''}`.trim();

const normalizeResource = (value = '') => {
  const cleaned = String(value).toLowerCase().replace(/[^0-9a-z]+/g, '_').replace(/^_+|_+$/g, '');
  if (cleaned.endsWith('ies')) return `${cleaned.slice(0, -3)}y`;
  if (cleaned.endsWith('s') && cleaned.length > 3) return cleaned.slice(0, -1);
  return cleaned;
};

const resourceFromPath = (path = '') => {
  const segments = String(path)
    .split('/')
    .map((item) => item.trim())
    .filter((item) => item && !/^\{[^}]+\}$/.test(item));
  const staticSegments = segments.filter((item) => !['api', 'v1', 'v2', 'v3'].includes(item.toLowerCase()) && !/^v\d+$/i.test(item));
  return normalizeResource(staticSegments.at(-1) || segments.at(-1) || '');
};

const textTokens = (item) => `${item.operation_id || ''} ${item.summary || ''} ${item.description || ''} ${item.path || ''}`.toLowerCase();

const looksLikeAuthInterface = (item) => /login|auth|token|signin|session|oauth/.test(textTokens(item));

const looksLikeCreateInterface = (item) => {
  if (looksLikeAuthInterface(item)) return false;
  if ((item.method || '').toUpperCase() !== 'POST') return false;
  const text = textTokens(item);
  return /create|add|new|submit|register|创建|新增/.test(text) || !String(item.path || '').includes('{');
};

const hasPathVariable = (item) => /\{[^}]+\}/.test(String(item.path || ''));

const planInsightStorageKey = (projectId) => `api-execution:last-asset-plan-insight:${projectId || 'default'}`;

const readStoredPlanInsight = (projectId) => {
  if (!projectId || typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(planInsightStorageKey(projectId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeStoredPlanInsight = (projectId, insight) => {
  if (!projectId || typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(planInsightStorageKey(projectId), JSON.stringify(insight));
  } catch {
    // sessionStorage can be unavailable in private or locked-down browser modes.
  }
};

function AgentRecommendationPanel({ advice, lastPlanInsight }) {
  const backendRecommendations = lastPlanInsight?.recommendations || [];
  return (
    <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: '#ffffff', border: '1px solid rgba(15, 23, 42, 0.08)' }}>
      <Stack spacing={1.25}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
          <Stack direction="row" spacing={1} alignItems="center">
            <TipsAndUpdatesOutlined color="primary" fontSize="small" />
            <Box>
              <Typography variant="subtitle2" fontWeight={850}>Agent 推荐</Typography>
              <Typography variant="caption" color="text.secondary">测试计划、风险解释、待补配置和链路依赖建议</Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={advice.scopeLabel} color={advice.scope.length ? 'primary' : 'default'} variant="outlined" />
            <Chip size="small" label={`${advice.highRisk.length} 个高风险`} color={advice.highRisk.length ? 'warning' : 'default'} variant="outlined" />
            <Chip size="small" label={`${advice.dependencyMatches.length} 条可串联依赖`} color={advice.dependencyMatches.length ? 'success' : 'default'} variant="outlined" />
          </Stack>
        </Stack>

        {!!advice.missing.length && (
          <Alert severity="warning" icon={<WarningAmberOutlined fontSize="inherit" />}>
            {advice.missing.join('；')}
          </Alert>
        )}

        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
          <Chip size="small" icon={<AltRouteOutlined />} label={advice.creates.length ? `创建接口 ${advice.creates.length} 个` : '未发现创建接口'} variant="outlined" />
          <Chip size="small" label={advice.pathVariableConsumers.length ? `路径参数接口 ${advice.pathVariableConsumers.length} 个` : '无路径参数依赖'} variant="outlined" />
          <Chip size="small" label={advice.auth.length ? `鉴权相关 ${advice.auth.length} 个` : '未纳入登录接口'} variant="outlined" />
        </Stack>

        {lastPlanInsight?.orchestrationSummary && (
          <Alert severity={lastPlanInsight.dependencyGraph?.length ? 'success' : 'info'}>
            {lastPlanInsight.orchestrationSummary}
          </Alert>
        )}

        {!!backendRecommendations.length && (
          <Stack spacing={0.75}>
            {backendRecommendations.slice(0, 3).map((item, index) => (
              <Typography key={`${item.type || 'recommendation'}-${index}`} variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {item.title ? `${item.title}：` : ''}{item.message}
              </Typography>
            ))}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

export default function AssetAgentWorkbench({ focus = 'all' } = {}) {
  const showAssetActions = focus !== 'agent';
  const showAgentActions = focus !== 'assets';
  const workbenchCopy = focus === 'assets'
    ? {
      title: '接口资产台账',
      description: '维护项目模块和接口资产，支持 OpenAPI 同步后的归类、状态和风险标注。',
    }
    : focus === 'agent'
      ? {
        title: 'Agent 测试范围',
        description: '选择模块或接口后生成冒烟、负向或变更影响测试 DSL，随后进入编排执行。',
      }
      : {
        title: '项目接口资产与 Agent 冒烟测试',
        description: '从已沉淀的模块和接口发起测试，Agent 会生成冒烟 DSL，并套用项目风险策略。',
      };
  const {
    selectedProjectId,
    projectName,
    baseUrl,
    environmentName,
    setDslText,
    setRunStepId,
    setActiveStep,
    requestConfirm,
    loading,
    setLoading,
    setLoadingMessage,
  } = useAPIExecution();
  const showSnackbar = useSnackbar();
  const queryClient = useQueryClient();
  const { data: projectAssets, isLoading } = useProjectAssets(selectedProjectId);
  const [activeModuleId, setActiveModuleId] = React.useState('');
  const [keyword, setKeyword] = React.useState('');
  const [methodFilter, setMethodFilter] = React.useState('all');
  const [riskFilter, setRiskFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [selectedInterfaceIds, setSelectedInterfaceIds] = React.useState(new Set());
  const [detailInterface, setDetailInterface] = React.useState(null);
  const [editValues, setEditValues] = React.useState(null);
  const [savingInterface, setSavingInterface] = React.useState(false);
  const [moduleDialogOpen, setModuleDialogOpen] = React.useState(false);
  const [moduleEditDialogOpen, setModuleEditDialogOpen] = React.useState(false);
  const [moduleRemoveDialogOpen, setModuleRemoveDialogOpen] = React.useState(false);
  const [moduleMenuAnchor, setModuleMenuAnchor] = React.useState(null);
  const [moduleMenuTarget, setModuleMenuTarget] = React.useState(null);
  const [moduleEditValues, setModuleEditValues] = React.useState({ name: '', description: '', status: 'active', sort_order: 100 });
  const [moduleRemoveMode, setModuleRemoveMode] = React.useState('exclude');
  const [moduleRemoveTargetId, setModuleRemoveTargetId] = React.useState('');
  const [interfaceDialogOpen, setInterfaceDialogOpen] = React.useState(false);
  const [newModule, setNewModule] = React.useState({ name: '', description: '' });
  const [newInterface, setNewInterface] = React.useState({
    module_id: '',
    method: 'GET',
    path: '',
    operation_id: '',
    summary: '',
    description: '',
    risk_level: 'low',
  });
  const [savingAsset, setSavingAsset] = React.useState(false);
  const [savingModule, setSavingModule] = React.useState(false);
  const [impactLoading, setImpactLoading] = React.useState(false);
  const [lastPlanInsight, setLastPlanInsight] = React.useState(null);

  const modules = React.useMemo(() => projectAssets?.modules || [], [projectAssets?.modules]);
  const interfaces = React.useMemo(() => projectAssets?.interfaces || [], [projectAssets?.interfaces]);

  React.useEffect(() => {
    setActiveModuleId('');
    setSelectedInterfaceIds(new Set());
    setLastPlanInsight(readStoredPlanInsight(selectedProjectId));
  }, [selectedProjectId]);

  const moduleCounts = React.useMemo(() => {
    const counts = {};
    for (const item of interfaces) {
      if (!ACTIVE_STATUSES.has(item.status)) continue;
      counts[item.module_id] = (counts[item.module_id] || 0) + 1;
    }
    return counts;
  }, [interfaces]);

  const moduleTotalCounts = React.useMemo(() => {
    const counts = {};
    for (const item of interfaces) {
      counts[item.module_id] = (counts[item.module_id] || 0) + 1;
    }
    return counts;
  }, [interfaces]);

  const filteredInterfaces = React.useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return interfaces.filter((item) => {
      if (activeModuleId && item.module_id !== activeModuleId) return false;
      if (methodFilter !== 'all' && item.method !== methodFilter) return false;
      if (riskFilter !== 'all' && item.risk_level !== riskFilter) return false;
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!normalizedKeyword) return true;
      return [item.interface_key, item.path, item.summary, item.operation_id, item.module_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedKeyword));
    });
  }, [activeModuleId, interfaces, keyword, methodFilter, riskFilter, statusFilter]);

  const activeInterfaces = interfaces.filter((item) => ACTIVE_STATUSES.has(item.status));
  const impactInterfaceCount = interfaces.filter((item) => item.source !== 'manual' && ['added', 'changed'].includes(item.change_state) && ACTIVE_STATUSES.has(item.status)).length;
  const selectedInFiltered = filteredInterfaces.filter((item) => selectedInterfaceIds.has(item.interface_id));
  const activeModule = modules.find((item) => item.module_id === activeModuleId);
  const moduleMergeTargets = React.useMemo(
    () => modules.filter((item) => item.module_id !== moduleMenuTarget?.module_id && !['excluded', 'removed'].includes(item.status)),
    [moduleMenuTarget?.module_id, modules],
  );
  const selectedScopeInterfaces = React.useMemo(() => {
    if (selectedInterfaceIds.size) {
      return interfaces.filter((item) => selectedInterfaceIds.has(item.interface_id));
    }
    if (activeModuleId) {
      return interfaces.filter((item) => item.module_id === activeModuleId && ACTIVE_STATUSES.has(item.status));
    }
    return filteredInterfaces.filter((item) => ACTIVE_STATUSES.has(item.status));
  }, [activeModuleId, filteredInterfaces, interfaces, selectedInterfaceIds]);

  const agentAdvice = React.useMemo(() => {
    const scope = selectedScopeInterfaces.filter((item) => ACTIVE_STATUSES.has(item.status));
    const highRisk = scope.filter((item) => item.risk_level === 'high');
    const blocked = scope.filter((item) => item.risk_level === 'blocked');
    const auth = scope.filter(looksLikeAuthInterface);
    const creates = scope.filter(looksLikeCreateInterface);
    const pathVariableConsumers = scope.filter((item) => hasPathVariable(item) && !looksLikeCreateInterface(item));
    const createResources = new Set(creates.map((item) => resourceFromPath(item.path)).filter(Boolean));
    const dependencyMatches = pathVariableConsumers.filter((item) => createResources.has(resourceFromPath(item.path)));
    const missing = [];
    if (!baseUrl?.trim()) missing.push('Base URL 未配置，执行前需要补齐。');
    if (!scope.length) missing.push('还没有选择可测试接口，建议先选模块或勾选接口。');
    if (!auth.length && !scope.some((item) => item.headers?.Authorization)) missing.push('未发现登录/鉴权接口；如接口需要认证，请确认项目级认证配置。');
    if (blocked.length) missing.push(`${blocked.length} 个接口为阻断风险，默认不会进入自动测试。`);

    return {
      scope,
      highRisk,
      blocked,
      auth,
      creates,
      pathVariableConsumers,
      dependencyMatches,
      missing,
      scopeLabel: selectedInterfaceIds.size
        ? `已选 ${selectedInterfaceIds.size} 个接口`
        : activeModule
          ? `模块：${activeModule.name}`
          : `当前筛选 ${scope.length} 个有效接口`,
    };
  }, [activeModule, baseUrl, selectedInterfaceIds.size, selectedScopeInterfaces]);

  const toggleInterface = (interfaceId) => {
    setSelectedInterfaceIds((current) => {
      const next = new Set(current);
      if (next.has(interfaceId)) next.delete(interfaceId);
      else next.add(interfaceId);
      return next;
    });
  };

  const openDetail = (item) => {
    setDetailInterface(item);
    setEditValues({
      summary: item.summary || '',
      description: item.description || '',
      module_id: item.module_id || '',
      risk_level: item.risk_level || 'low',
      status: item.status || 'active',
      method: item.method || 'GET',
      path: item.path || '',
      operation_id: item.operation_id || '',
    });
  };

  const updateEditValue = (field, value) => {
    setEditValues((current) => ({ ...(current || {}), [field]: value }));
  };

  const invalidateAssets = () => {
    if (!selectedProjectId) return Promise.resolve();
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: EXEC_KEYS.assets(selectedProjectId) }),
      queryClient.invalidateQueries({ queryKey: EXEC_KEYS.agentContext(selectedProjectId) }),
    ]);
  };

  const openInterfaceDialog = () => {
    setNewInterface({
      module_id: activeModuleId || modules[0]?.module_id || '',
      method: 'GET',
      path: '',
      operation_id: '',
      summary: '',
      description: '',
      risk_level: 'low',
    });
    setInterfaceDialogOpen(true);
  };

  const createModule = async () => {
    if (!selectedProjectId || !newModule.name.trim()) {
      showSnackbar('请填写模块名称', { severity: 'warning' });
      return;
    }
    setSavingAsset(true);
    try {
      const created = await apiExecutionAPI.createProjectModule(selectedProjectId, {
        name: newModule.name.trim(),
        description: newModule.description.trim(),
      });
      await invalidateAssets();
      setActiveModuleId(created.module_id);
      setNewModule({ name: '', description: '' });
      setModuleDialogOpen(false);
      showSnackbar('模块已新增', { severity: 'success' });
    } catch (error) {
      showSnackbar(error.message || '模块新增失败', { severity: 'error' });
    } finally {
      setSavingAsset(false);
    }
  };

  const closeModuleMenu = () => {
    setModuleMenuAnchor(null);
  };

  const openModuleMenu = (event, module) => {
    event.stopPropagation();
    setModuleMenuAnchor(event.currentTarget);
    setModuleMenuTarget(module);
  };

  const openModuleEdit = (module) => {
    setModuleMenuTarget(module);
    setModuleEditValues({
      name: module.name || '',
      description: module.description || '',
      status: module.status || 'active',
      sort_order: module.sort_order || 100,
    });
    setModuleEditDialogOpen(true);
    closeModuleMenu();
  };

  const openModuleRemove = (module, mode = 'exclude') => {
    setModuleMenuTarget(module);
    setModuleRemoveMode(mode);
    const target = modules.find((item) => item.module_id !== module.module_id && !['excluded', 'removed'].includes(item.status));
    setModuleRemoveTargetId(target?.module_id || '');
    setModuleRemoveDialogOpen(true);
    closeModuleMenu();
  };

  const saveModuleEdits = async () => {
    if (!moduleMenuTarget?.module_id) return;
    if (!moduleEditValues.name.trim()) {
      showSnackbar('请填写模块名称', { severity: 'warning' });
      return;
    }
    setSavingModule(true);
    try {
      const updated = await apiExecutionAPI.updateProjectModule(moduleMenuTarget.module_id, {
        name: moduleEditValues.name.trim(),
        description: moduleEditValues.description.trim(),
        status: moduleEditValues.status,
        sort_order: Number(moduleEditValues.sort_order || 100),
      });
      await invalidateAssets();
      setActiveModuleId(updated.status === 'excluded' ? '' : updated.module_id);
      setModuleEditDialogOpen(false);
      showSnackbar('模块已更新', { severity: 'success' });
    } catch (error) {
      showSnackbar(error.message || '模块更新失败', { severity: 'error' });
    } finally {
      setSavingModule(false);
    }
  };

  const removeModule = async () => {
    if (!moduleMenuTarget?.module_id) return;
    if (moduleRemoveMode === 'migrate' && !moduleRemoveTargetId) {
      showSnackbar('请选择迁移目标模块', { severity: 'warning' });
      return;
    }
    setSavingModule(true);
    try {
      await apiExecutionAPI.removeProjectModule(moduleMenuTarget.module_id, {
        mode: moduleRemoveMode,
        target_module_id: moduleRemoveMode === 'migrate' ? moduleRemoveTargetId : '',
      });
      await invalidateAssets();
      if (activeModuleId === moduleMenuTarget.module_id) setActiveModuleId(moduleRemoveMode === 'migrate' ? moduleRemoveTargetId : '');
      setSelectedInterfaceIds(new Set());
      setModuleRemoveDialogOpen(false);
      showSnackbar(moduleRemoveMode === 'migrate' ? '模块接口已迁移，源模块已排除' : '模块及接口已排除', { severity: 'success' });
    } catch (error) {
      showSnackbar(error.message || '模块移除失败', { severity: 'error' });
    } finally {
      setSavingModule(false);
    }
  };

  const restoreModule = async (module = moduleMenuTarget) => {
    if (!module?.module_id) return;
    setSavingModule(true);
    closeModuleMenu();
    try {
      const updated = await apiExecutionAPI.updateProjectModule(module.module_id, { status: 'active' });
      await invalidateAssets();
      setActiveModuleId(updated.module_id);
      showSnackbar('模块已恢复', { severity: 'success' });
    } catch (error) {
      showSnackbar(error.message || '模块恢复失败', { severity: 'error' });
    } finally {
      setSavingModule(false);
    }
  };

  const deleteManualModule = async (module = moduleMenuTarget) => {
    if (!module?.module_id) return;
    const confirmed = await requestConfirm(`确认永久删除空模块 ${module.name}？只有没有接口的手工模块才能删除。`);
    if (!confirmed) return;
    setSavingModule(true);
    closeModuleMenu();
    try {
      await apiExecutionAPI.deleteProjectModule(module.module_id);
      await invalidateAssets();
      if (activeModuleId === module.module_id) setActiveModuleId('');
      showSnackbar('空手工模块已删除', { severity: 'success' });
    } catch (error) {
      showSnackbar(error.message || '模块删除失败', { severity: 'error' });
    } finally {
      setSavingModule(false);
    }
  };

  const createInterface = async () => {
    if (!selectedProjectId || !newInterface.module_id || !newInterface.path.trim()) {
      showSnackbar('请选择模块并填写接口路径', { severity: 'warning' });
      return;
    }
    setSavingAsset(true);
    try {
      const created = await apiExecutionAPI.createProjectInterface(selectedProjectId, {
        ...newInterface,
        path: newInterface.path.trim(),
        operation_id: newInterface.operation_id.trim(),
        summary: newInterface.summary.trim(),
        description: newInterface.description.trim(),
      });
      await invalidateAssets();
      setActiveModuleId(created.module_id);
      setSelectedInterfaceIds(new Set([created.interface_id]));
      setInterfaceDialogOpen(false);
      showSnackbar('接口已新增', { severity: 'success' });
    } catch (error) {
      showSnackbar(error.message || '接口新增失败', { severity: 'error' });
    } finally {
      setSavingAsset(false);
    }
  };

  const deleteManualInterface = async () => {
    if (!detailInterface?.interface_id) return;
    const confirmed = await requestConfirm(`确认删除手工接口 ${getInterfaceLabel(detailInterface)}？删除后不可恢复。`);
    if (!confirmed) return;
    setSavingInterface(true);
    try {
      await apiExecutionAPI.deleteProjectInterface(detailInterface.interface_id);
      setSelectedInterfaceIds((current) => {
        const next = new Set(current);
        next.delete(detailInterface.interface_id);
        return next;
      });
      setDetailInterface(null);
      await invalidateAssets();
      showSnackbar('手工接口已删除', { severity: 'success' });
    } catch (error) {
      showSnackbar(error.message || '接口删除失败', { severity: 'error' });
    } finally {
      setSavingInterface(false);
    }
  };

  const removeOpenAPIInterface = async () => {
    if (!detailInterface?.interface_id) return;
    const confirmed = await requestConfirm(`确认移除接口 ${getInterfaceLabel(detailInterface)}？它不会参与 Agent、编排、统计和影响重测；后续 OpenAPI 同步会保持排除，可随时恢复。`);
    if (!confirmed) return;
    await setInterfaceStatus('excluded', { successMessage: '接口已排除' });
  };

  const restoreInterface = async () => {
    if (!detailInterface?.interface_id) return;
    await setInterfaceStatus(detailInterface.change_state === 'changed' ? 'changed' : 'active', { successMessage: '接口已恢复' });
  };

  const saveInterfaceEdits = async () => {
    if (!detailInterface?.interface_id || !editValues) return;
    setSavingInterface(true);
    try {
      const updated = await apiExecutionAPI.updateProjectInterface(detailInterface.interface_id, editValues);
      setDetailInterface(updated);
      setEditValues({
        summary: updated.summary || '',
        description: updated.description || '',
        module_id: updated.module_id || '',
        risk_level: updated.risk_level || 'low',
        status: updated.status || 'active',
        method: updated.method || 'GET',
        path: updated.path || '',
        operation_id: updated.operation_id || '',
      });
      await invalidateAssets();
      showSnackbar('接口资产已更新', { severity: 'success' });
    } catch (error) {
      showSnackbar(error.message || '接口资产保存失败', { severity: 'error' });
    } finally {
      setSavingInterface(false);
    }
  };

  const setInterfaceStatus = async (status, { successMessage = '' } = {}) => {
    if (!detailInterface?.interface_id) return;
    setSavingInterface(true);
    try {
      const payload = status === 'hidden' ? { status, hidden: true } : { status };
      const updated = await apiExecutionAPI.updateProjectInterface(detailInterface.interface_id, payload);
      setDetailInterface(updated);
      setEditValues((current) => ({ ...(current || {}), status: updated.status || status }));
      await invalidateAssets();
      showSnackbar(successMessage || (ACTIVE_STATUSES.has(status) ? '接口已恢复为有效' : '接口状态已更新'), { severity: 'success' });
    } catch (error) {
      showSnackbar(error.message || '接口状态更新失败', { severity: 'error' });
    } finally {
      setSavingInterface(false);
    }
  };

  const selectFiltered = () => {
    setSelectedInterfaceIds((current) => {
      const next = new Set(current);
      filteredInterfaces.forEach((item) => {
        if (ACTIVE_STATUSES.has(item.status)) next.add(item.interface_id);
      });
      return next;
    });
  };

  const buildPlan = async ({ moduleId = '', interfaceIds = [], includeHighRisk = false, testIntent = 'smoke' } = {}) => {
    if (!selectedProjectId) return;
    setLoadingMessage(testIntent === 'negative' ? 'Agent 正在生成参数负向测试计划...' : 'Agent 正在生成冒烟测试计划...');
    setLoading(true);
    try {
      const data = await apiExecutionAPI.buildAssetTestPlan(selectedProjectId, {
        module_id: moduleId,
        interface_ids: interfaceIds,
        test_intent: testIntent,
        include_high_risk: includeHighRisk,
      });
      const nextPlanInsight = {
        recommendations: data.recommendations || [],
        dependencyGraph: data.dependency_graph || [],
        orchestrationSummary: data.orchestration_summary || '',
      };
      setLastPlanInsight(nextPlanInsight);
      writeStoredPlanInsight(selectedProjectId, nextPlanInsight);
      if (data.requires_high_risk_confirmation && !includeHighRisk) {
        const confirmed = await requestConfirm('本次范围包含高风险接口，是否纳入脚本并在执行时携带人工确认？');
        if (confirmed) {
          await buildPlan({ moduleId, interfaceIds, includeHighRisk: true, testIntent });
        }
        return;
      }
      if (!data.script?.steps?.length) {
        showSnackbar(data.summary || '当前范围没有可执行接口', { severity: 'warning' });
        return;
      }
      const nextScript = {
        ...data.script,
        target_project: projectName?.trim() || data.script.target_project,
        environment: environmentName?.trim() || data.script.environment,
        base_url: baseUrl?.trim() || data.script.base_url,
      };
      setDslText(JSON.stringify(nextScript, null, 2));
      setRunStepId(nextScript.steps?.[0]?.id || '');
      setActiveStep(2);
      const dependencyCount = data.dependency_graph?.length || 0;
      showSnackbar(`Agent 已生成 ${nextScript.steps?.length || 0} 个${testIntent === 'negative' ? '负向' : '冒烟'}步骤${dependencyCount ? `，发现 ${dependencyCount} 条依赖` : ''}，跳过 ${data.skipped_interfaces?.length || 0} 个接口`, { severity: 'success' });
    } catch (error) {
      showSnackbar(error.message || 'Agent 测试计划生成失败', { severity: 'error' });
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const runImpactPlan = async () => {
    if (!selectedProjectId) return;
    setImpactLoading(true);
    try {
      const impact = await apiExecutionAPI.getAssetImpact(selectedProjectId);
      if (!impact.suggested_interface_ids?.length) {
        showSnackbar(impact.summary || '当前没有需要重测的变更接口', { severity: 'info' });
        return;
      }
      await buildPlan({ interfaceIds: impact.suggested_interface_ids });
    } catch (error) {
      showSnackbar(error.message || '变更影响分析失败', { severity: 'error' });
    } finally {
      setImpactLoading(false);
    }
  };

  if (!selectedProjectId) {
    return (
      <Alert severity="info">
        请先在项目配置中选择或创建项目，再维护接口资产或发起 Agent 测试。
      </Alert>
    );
  }

  return (
    <>
      <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid rgba(255, 255, 255, 0.6)', background: 'rgba(255, 255, 255, 0.55)', backdropFilter: 'blur(10px)', boxShadow: '0 8px 32px rgba(15, 23, 42, 0.04)' }}>
        <Stack spacing={2.5}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
            <Box>
              <Typography variant="subtitle1" fontWeight={800} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ScienceOutlined color="primary" /> {workbenchCopy.title}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {workbenchCopy.description}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {showAssetActions && (
                <>
                  <Button size="small" variant="outlined" startIcon={<Add />} onClick={() => setModuleDialogOpen(true)}>
                    新增模块
                  </Button>
                  <Button size="small" variant="outlined" startIcon={<Add />} disabled={!modules.length} onClick={openInterfaceDialog}>
                    新增接口
                  </Button>
                </>
              )}
              <Chip size="small" label={`${modules.length} 个模块`} />
              <Chip size="small" color={activeInterfaces.length ? 'success' : 'default'} variant="outlined" label={`${activeInterfaces.length} 个有效接口`} />
              <Chip size="small" color="warning" variant="outlined" label={`${interfaces.filter((item) => item.status === 'changed').length} 个变更`} />
            </Stack>
          </Stack>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '260px minmax(0, 1fr)' }, gap: 2 }}>
            <Paper elevation={0} sx={{ p: 1.5, borderRadius: 3, border: '1px solid rgba(15, 23, 42, 0.08)', bgcolor: '#ffffff' }}>
              <Stack spacing={1}>
                <Button
                  fullWidth
                  variant={!activeModuleId ? 'contained' : 'outlined'}
                  onClick={() => setActiveModuleId('')}
                  sx={{ justifyContent: 'space-between' }}
                >
                  全部模块
                  <Chip size="small" label={activeInterfaces.length} />
                </Button>
                {modules.map((module) => {
                  const moduleStatus = MODULE_STATUS_META[module.status] || { label: module.status || '未知', color: 'default' };
                  const isModuleExcluded = ['excluded', 'removed'].includes(module.status);
                  return (
                    <Stack key={module.module_id} direction="row" spacing={0.75} alignItems="center" sx={{ opacity: isModuleExcluded ? 0.65 : 1 }}>
                      <Button
                        fullWidth
                        variant={activeModuleId === module.module_id ? 'contained' : 'outlined'}
                        onClick={() => setActiveModuleId(module.module_id)}
                        sx={{ justifyContent: 'space-between', textAlign: 'left', minWidth: 0 }}
                      >
                        <Typography noWrap variant="body2" fontWeight={700}>{module.name}</Typography>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          {module.status !== 'active' && <Chip size="small" label={moduleStatus.label} color={moduleStatus.color} variant="outlined" />}
                          <Chip size="small" label={moduleCounts[module.module_id] || 0} />
                        </Stack>
                      </Button>
                      <IconButton size="small" aria-label={`${module.name} 模块操作`} onClick={(event) => openModuleMenu(event, module)}>
                        <MoreVert fontSize="small" />
                      </IconButton>
                    </Stack>
                  );
                })}
              </Stack>
            </Paper>

            <Stack spacing={1.5} sx={{ minWidth: 0 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr repeat(3, 1fr)' }, gap: 1 }}>
                <TextField size="small" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索 path / summary / operationId" />
                <FormControl size="small">
                  <InputLabel>方法</InputLabel>
                  <Select label="方法" value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)}>
                    <MenuItem value="all">全部</MenuItem>
                    {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => <MenuItem key={method} value={method}>{method}</MenuItem>)}
                  </Select>
                </FormControl>
                <FormControl size="small">
                  <InputLabel>风险</InputLabel>
                  <Select label="风险" value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
                    <MenuItem value="all">全部</MenuItem>
                    {Object.entries(RISK_META).map(([value, meta]) => <MenuItem key={value} value={value}>{meta.label}</MenuItem>)}
                  </Select>
                </FormControl>
                <FormControl size="small">
                  <InputLabel>状态</InputLabel>
                  <Select label="状态" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                    <MenuItem value="all">全部</MenuItem>
                    {Object.entries(STATUS_META).map(([value, meta]) => <MenuItem key={value} value={value}>{meta.label}</MenuItem>)}
                  </Select>
                </FormControl>
              </Box>

              {showAgentActions && (
                <AgentRecommendationPanel advice={agentAdvice} lastPlanInsight={lastPlanInsight} />
              )}

              {showAgentActions ? (
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Button variant="outlined" onClick={selectFiltered} disabled={!filteredInterfaces.length}>选择当前结果</Button>
                  <Button variant="text" color="error" disabled={!selectedInterfaceIds.size} onClick={() => setSelectedInterfaceIds(new Set())}>清空选择</Button>
                  <Button
                    variant="outlined"
                    startIcon={<AutoAwesome />}
                    disabled={loading || impactLoading || !impactInterfaceCount}
                    onClick={runImpactPlan}
                  >
                    测试变更影响 ({impactInterfaceCount})
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<AutoAwesome />}
                    disabled={loading || !activeModuleId}
                    onClick={() => buildPlan({ moduleId: activeModuleId })}
                  >
                    测试该模块
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<AutoAwesome />}
                    disabled={loading || !activeModuleId}
                    onClick={() => buildPlan({ moduleId: activeModuleId, testIntent: 'negative' })}
                  >
                    负向测试该模块
                  </Button>
                  <Button
                    variant="contained"
                    color="secondary"
                    startIcon={<AutoAwesome />}
                    disabled={loading || !selectedInterfaceIds.size}
                    onClick={() => buildPlan({ interfaceIds: Array.from(selectedInterfaceIds) })}
                  >
                    测试选中接口 ({selectedInterfaceIds.size})
                  </Button>
                  <Button
                    variant="outlined"
                    color="secondary"
                    startIcon={<AutoAwesome />}
                    disabled={loading || !selectedInterfaceIds.size}
                    onClick={() => buildPlan({ interfaceIds: Array.from(selectedInterfaceIds), testIntent: 'negative' })}
                  >
                    负向测试选中
                  </Button>
                  <Typography variant="caption" color="text.secondary">
                    当前显示 {filteredInterfaces.length} 个，当前页已选 {selectedInFiltered.length} 个
                  </Typography>
                </Stack>
              ) : (
                <Typography variant="caption" color="text.secondary">
                  当前显示 {filteredInterfaces.length} 个接口；点击“查看”可编辑资产信息、风险和状态。
                </Typography>
              )}

              {activeModule && (
                <Alert severity="info">
                  当前模块：{activeModule.name}，共 {moduleCounts[activeModule.module_id] || 0} 个有效接口。
                </Alert>
              )}

              <TableContainer sx={{ maxHeight: 520, borderRadius: 2, border: '1px solid rgba(15, 23, 42, 0.08)', bgcolor: '#ffffff' }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {showAgentActions && <TableCell padding="checkbox" />}
                      <TableCell>方法</TableCell>
                      <TableCell>接口</TableCell>
                      <TableCell>模块</TableCell>
                      <TableCell>风险</TableCell>
                      <TableCell>状态</TableCell>
                      <TableCell>最近测试</TableCell>
                      <TableCell align="right">详情</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredInterfaces.map((item) => {
                      const selected = selectedInterfaceIds.has(item.interface_id);
                      const risk = RISK_META[item.risk_level] || { label: item.risk_level || '未知', color: 'default' };
                      const status = STATUS_META[item.status] || { label: item.status || '未知', color: 'default' };
                      const testStatus = getRunStatusMeta(item.last_test_status);
                      const disabled = !ACTIVE_STATUSES.has(item.status);
                      return (
                        <TableRow key={item.interface_id} hover selected={selected} sx={{ opacity: disabled ? 0.55 : 1 }}>
                          {showAgentActions && (
                            <TableCell padding="checkbox">
                              <Checkbox size="small" checked={selected} disabled={disabled} onChange={() => toggleInterface(item.interface_id)} />
                            </TableCell>
                          )}
                          <TableCell>
                            <Chip size="small" label={item.method} color={METHOD_COLORS[item.method] || 'default'} variant="outlined" sx={{ fontWeight: 800 }} />
                          </TableCell>
                          <TableCell sx={{ minWidth: 240 }}>
                            <Typography variant="body2" fontWeight={700}>{item.summary || getInterfaceLabel(item)}</Typography>
                            <Typography variant="caption" sx={{ fontFamily: 'monospace' }} color="text.secondary">{item.path}</Typography>
                          </TableCell>
                          <TableCell>{item.module_name || item.module_key || '-'}</TableCell>
                          <TableCell><Chip size="small" label={risk.label} color={risk.color} variant={item.risk_level === 'high' || item.risk_level === 'blocked' ? 'filled' : 'outlined'} /></TableCell>
                          <TableCell><Chip size="small" label={status.label} color={status.color} variant="outlined" /></TableCell>
                          <TableCell>
                            {item.last_test_status ? (
                              <Stack spacing={0.25}>
                                <Chip size="small" label={testStatus.label} color={testStatus.color} variant="outlined" />
                                <Typography variant="caption" color="text.secondary">{formatRunTime(item.last_tested_at)}</Typography>
                              </Stack>
                            ) : (
                              <Typography variant="caption" color="text.secondary">未测试</Typography>
                            )}
                          </TableCell>
                          <TableCell align="right">
                            <Button size="small" startIcon={<InfoOutlined />} onClick={() => openDetail(item)}>查看</Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {!filteredInterfaces.length && (
                      <TableRow>
                        <TableCell colSpan={showAgentActions ? 8 : 7}>
                          <EmptyState compact title={isLoading ? '接口资产准备中' : '没有匹配接口'} description="请调整筛选条件，或先完成 OpenAPI 导入和项目资产同步。" />
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Stack>
          </Box>
        </Stack>
      </Paper>

      <Menu anchorEl={moduleMenuAnchor} open={Boolean(moduleMenuAnchor)} onClose={closeModuleMenu}>
        <MenuItem onClick={() => openModuleEdit(moduleMenuTarget)}>
          <ListItemIcon><EditOutlined fontSize="small" /></ListItemIcon>
          <ListItemText primary="编辑模块" />
        </MenuItem>
        {moduleMenuTarget?.status === 'excluded' ? (
          <MenuItem onClick={() => restoreModule(moduleMenuTarget)}>
            <ListItemIcon><RestoreOutlined fontSize="small" /></ListItemIcon>
            <ListItemText primary="恢复模块" />
          </MenuItem>
        ) : (
          <MenuItem onClick={() => openModuleRemove(moduleMenuTarget, 'exclude')}>
            <ListItemIcon><BlockOutlined fontSize="small" /></ListItemIcon>
            <ListItemText primary="移除模块" secondary="排除模块及其接口" />
          </MenuItem>
        )}
        {moduleMenuTarget?.status !== 'excluded' && (
          <MenuItem disabled={moduleMergeTargets.length === 0} onClick={() => openModuleRemove(moduleMenuTarget, 'migrate')}>
            <ListItemIcon><MergeType fontSize="small" /></ListItemIcon>
            <ListItemText primary="合并到..." secondary={moduleMergeTargets.length ? '迁移接口后排除源模块' : '暂无可合并目标'} />
          </MenuItem>
        )}
        {moduleMenuTarget?.source === 'manual' && (moduleTotalCounts[moduleMenuTarget?.module_id] || 0) === 0 && (
          <MenuItem onClick={() => deleteManualModule(moduleMenuTarget)} sx={{ color: 'error.main' }}>
            <ListItemIcon><DeleteForeverOutlined fontSize="small" color="error" /></ListItemIcon>
            <ListItemText primary="永久删除" secondary="仅限空手工模块" />
          </MenuItem>
        )}
      </Menu>

      <Dialog open={Boolean(detailInterface)} onClose={() => setDetailInterface(null)} maxWidth="md" fullWidth>
        <DialogTitle>{detailInterface?.summary || getInterfaceLabel(detailInterface || {})}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip label={detailInterface?.method} color={METHOD_COLORS[detailInterface?.method] || 'default'} />
              <Chip label={detailInterface?.risk_level || 'unknown'} />
              <Chip label={detailInterface?.status || 'unknown'} variant="outlined" />
              <Chip label={sourceLabel(detailInterface?.source)} variant="outlined" />
            </Stack>
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{detailInterface?.path}</Typography>
            {detailInterface?.source !== 'manual' && (
              <Alert severity="info">
                OpenAPI 导入接口不允许在这里修改 method/path；请通过规范同步变更。这里可以维护展示信息、模块、风险和状态。
              </Alert>
            )}
            {detailInterface?.source === 'manual' && (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '160px minmax(0, 1fr)' }, gap: 1.5 }}>
                <FormControl size="small">
                  <InputLabel>方法</InputLabel>
                  <Select label="方法" value={editValues?.method || 'GET'} onChange={(event) => updateEditValue('method', event.target.value)}>
                    {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((method) => <MenuItem key={method} value={method}>{method}</MenuItem>)}
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  label="接口路径"
                  value={editValues?.path || ''}
                  onChange={(event) => updateEditValue('path', event.target.value)}
                  fullWidth
                />
              </Box>
            )}
            <TextField
              size="small"
              label="接口摘要"
              value={editValues?.summary || ''}
              onChange={(event) => updateEditValue('summary', event.target.value)}
              fullWidth
            />
            {detailInterface?.source === 'manual' && (
              <TextField
                size="small"
                label="Operation ID"
                value={editValues?.operation_id || ''}
                onChange={(event) => updateEditValue('operation_id', event.target.value)}
                fullWidth
              />
            )}
            <TextField
              size="small"
              label="接口描述"
              value={editValues?.description || ''}
              onChange={(event) => updateEditValue('description', event.target.value)}
              fullWidth
              multiline
              minRows={3}
            />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
              <FormControl size="small">
                <InputLabel>所属模块</InputLabel>
                <Select label="所属模块" value={editValues?.module_id || ''} onChange={(event) => updateEditValue('module_id', event.target.value)}>
                  {modules.map((module) => (
                    <MenuItem key={module.module_id} value={module.module_id} disabled={['excluded', 'removed'].includes(module.status)}>
                      {module.name}{['excluded', 'removed'].includes(module.status) ? '（不可迁入）' : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small">
                <InputLabel>风险等级</InputLabel>
                <Select label="风险等级" value={editValues?.risk_level || 'low'} onChange={(event) => updateEditValue('risk_level', event.target.value)}>
                  {Object.entries(RISK_META).map(([value, meta]) => <MenuItem key={value} value={value}>{meta.label}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small">
                <InputLabel>接口状态</InputLabel>
                <Select label="接口状态" value={editValues?.status || 'active'} onChange={(event) => updateEditValue('status', event.target.value)}>
                  {Object.entries(STATUS_META).map(([value, meta]) => <MenuItem key={value} value={value}>{meta.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Box>
            {!!detailInterface?.last_failure_summary && (
              <Alert severity="error">{detailInterface.last_failure_summary}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {detailInterface?.source === 'manual' && (
              <Button color="error" startIcon={<DeleteForeverOutlined />} disabled={savingInterface} onClick={deleteManualInterface}>永久删除</Button>
            )}
            {detailInterface?.source !== 'manual' && detailInterface?.status !== 'excluded' && (
              <Button color="error" startIcon={<DeleteOutline />} disabled={savingInterface} onClick={removeOpenAPIInterface}>移除接口</Button>
            )}
            {detailInterface?.status === 'excluded' && (
              <Button color="success" startIcon={<RestoreOutlined />} disabled={savingInterface} onClick={restoreInterface}>恢复接口</Button>
            )}
            {detailInterface?.status !== 'excluded' && detailInterface?.status !== 'hidden' && (
              <Button color="warning" disabled={savingInterface} onClick={() => setInterfaceStatus('hidden')}>隐藏</Button>
            )}
            {detailInterface?.status !== 'excluded' && detailInterface?.status !== 'deprecated' && (
              <Button color="warning" disabled={savingInterface} onClick={() => setInterfaceStatus('deprecated')}>标记废弃</Button>
            )}
            {detailInterface?.status !== 'excluded' && !ACTIVE_STATUSES.has(detailInterface?.status) && (
              <Button color="success" disabled={savingInterface} onClick={restoreInterface}>恢复有效</Button>
            )}
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button onClick={() => setDetailInterface(null)}>关闭</Button>
            <Button variant="contained" disabled={savingInterface} onClick={saveInterfaceEdits}>保存</Button>
          </Stack>
        </DialogActions>
      </Dialog>

      <Dialog open={moduleEditDialogOpen} onClose={() => setModuleEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>编辑模块</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              size="small"
              label="模块名称"
              value={moduleEditValues.name}
              onChange={(event) => setModuleEditValues((current) => ({ ...current, name: event.target.value }))}
              fullWidth
              autoFocus
            />
            <TextField
              size="small"
              label="模块描述"
              value={moduleEditValues.description}
              onChange={(event) => setModuleEditValues((current) => ({ ...current, description: event.target.value }))}
              fullWidth
              multiline
              minRows={3}
            />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 140px' }, gap: 1.5 }}>
              <FormControl size="small">
                <InputLabel>模块状态</InputLabel>
                <Select label="模块状态" value={moduleEditValues.status} onChange={(event) => setModuleEditValues((current) => ({ ...current, status: event.target.value }))}>
                  {Object.entries(MODULE_STATUS_META).map(([value, meta]) => <MenuItem key={value} value={value}>{meta.label}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField
                size="small"
                type="number"
                label="排序"
                value={moduleEditValues.sort_order}
                onChange={(event) => setModuleEditValues((current) => ({ ...current, sort_order: event.target.value }))}
              />
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModuleEditDialogOpen(false)}>取消</Button>
          <Button variant="contained" disabled={savingModule} onClick={saveModuleEdits}>保存</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={moduleRemoveDialogOpen} onClose={() => setModuleRemoveDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>移除模块</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="warning">
              {moduleRemoveMode === 'migrate'
                ? '迁移会把源模块下的接口移动到目标模块，然后将源模块标记为已排除；历史接口引用仍保留。'
                : '排除模块会同时排除模块下接口，它们不会参与 Agent、编排、统计和影响重测；后续同步仍会保持排除。'}
            </Alert>
            <FormControl size="small" fullWidth>
              <InputLabel>处理方式</InputLabel>
              <Select label="处理方式" value={moduleRemoveMode} onChange={(event) => setModuleRemoveMode(event.target.value)}>
                <MenuItem value="exclude">排除模块及其接口</MenuItem>
                <MenuItem value="migrate" disabled={!moduleMergeTargets.length}>迁移到目标模块后排除当前模块</MenuItem>
              </Select>
            </FormControl>
            {moduleRemoveMode === 'migrate' && (
              <FormControl size="small" fullWidth>
                <InputLabel>目标模块</InputLabel>
                <Select label="目标模块" value={moduleRemoveTargetId} onChange={(event) => setModuleRemoveTargetId(event.target.value)}>
                  {moduleMergeTargets.map((module) => (
                    <MenuItem key={module.module_id} value={module.module_id}>{module.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModuleRemoveDialogOpen(false)}>取消</Button>
          <Button color="error" variant="contained" disabled={savingModule} onClick={removeModule}>
            {moduleRemoveMode === 'migrate' ? '迁移并排除' : '确认排除'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={moduleDialogOpen} onClose={() => setModuleDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>新增模块</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              size="small"
              label="模块名称"
              value={newModule.name}
              onChange={(event) => setNewModule((current) => ({ ...current, name: event.target.value }))}
              fullWidth
              autoFocus
            />
            <TextField
              size="small"
              label="模块描述"
              value={newModule.description}
              onChange={(event) => setNewModule((current) => ({ ...current, description: event.target.value }))}
              fullWidth
              multiline
              minRows={3}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModuleDialogOpen(false)}>取消</Button>
          <Button variant="contained" disabled={savingAsset} onClick={createModule}>新增</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={interfaceDialogOpen} onClose={() => setInterfaceDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>新增手工接口</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="info">手工接口可编辑 method/path，也可以物理删除；OpenAPI 同步接口仍由规范管理。</Alert>
            <FormControl size="small" fullWidth>
              <InputLabel>所属模块</InputLabel>
              <Select label="所属模块" value={newInterface.module_id} onChange={(event) => setNewInterface((current) => ({ ...current, module_id: event.target.value }))}>
                {modules.map((module) => (
                  <MenuItem key={module.module_id} value={module.module_id}>{module.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '160px minmax(0, 1fr)' }, gap: 1.5 }}>
              <FormControl size="small">
                <InputLabel>方法</InputLabel>
                <Select label="方法" value={newInterface.method} onChange={(event) => setNewInterface((current) => ({ ...current, method: event.target.value }))}>
                  {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((method) => <MenuItem key={method} value={method}>{method}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField
                size="small"
                label="接口路径"
                placeholder="/api/example"
                value={newInterface.path}
                onChange={(event) => setNewInterface((current) => ({ ...current, path: event.target.value }))}
                fullWidth
              />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 180px' }, gap: 1.5 }}>
              <TextField
                size="small"
                label="接口摘要"
                value={newInterface.summary}
                onChange={(event) => setNewInterface((current) => ({ ...current, summary: event.target.value }))}
                fullWidth
              />
              <FormControl size="small">
                <InputLabel>风险等级</InputLabel>
                <Select label="风险等级" value={newInterface.risk_level} onChange={(event) => setNewInterface((current) => ({ ...current, risk_level: event.target.value }))}>
                  {Object.entries(RISK_META).map(([value, meta]) => <MenuItem key={value} value={value}>{meta.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Box>
            <TextField
              size="small"
              label="Operation ID"
              value={newInterface.operation_id}
              onChange={(event) => setNewInterface((current) => ({ ...current, operation_id: event.target.value }))}
              fullWidth
            />
            <TextField
              size="small"
              label="接口描述"
              value={newInterface.description}
              onChange={(event) => setNewInterface((current) => ({ ...current, description: event.target.value }))}
              fullWidth
              multiline
              minRows={3}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInterfaceDialogOpen(false)}>取消</Button>
          <Button variant="contained" disabled={savingAsset} onClick={createInterface}>新增</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
