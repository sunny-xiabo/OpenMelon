import React from 'react';
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import {
  AccountTreeOutlined,
  AssessmentOutlined,
  HistoryOutlined,
  PlayCircleOutlineOutlined,
  ScienceOutlined,
  SettingsOutlined,
} from '@mui/icons-material';
import { APIExecutionProvider, useAPIExecution } from '../features/APIExecution/context';
import { useProjectAssets } from '../features/APIExecution/hooks/useAPIExecutionQueries';
import StepImport from '../features/APIExecution/components/StepImport';
import StepOrchestrate from '../features/APIExecution/components/StepOrchestrate';
import StepResult from '../features/APIExecution/components/StepResult';
import RunHistory from '../features/APIExecution/components/RunHistory';
import AgentGuidancePanel from '../features/APIExecution/components/AgentGuidancePanel';
import WorkflowProgressRail from '../features/APIExecution/components/WorkflowProgressRail';
import {
  WorkbenchActivityNotice,
  SimpleNextActionNotice,
  SimplePrepareSection,
  SimpleAgentSection,
  SimpleExecutionSection,
  SimpleResultSection,
  AgentSection,
  AssetsSection,
} from '../features/APIExecution/components/SimpleWorkspace';

const WORKSPACE_MODE_STORAGE_KEY = 'api-execution:workspace-mode';

const SECTION_BY_STEP = {
  0: 'config',
  1: 'agent',
  2: 'orchestrate',
  3: 'reports',
};

const WORKBENCH_SECTIONS = [
  {
    id: 'config',
    label: '项目配置',
    description: '项目、环境、OpenAPI 与安全策略',
    step: 0,
    icon: <SettingsOutlined fontSize="small" />,
  },
  {
    id: 'assets',
    label: '接口资产',
    description: '项目-模块-接口台账',
    step: null,
    icon: <AccountTreeOutlined fontSize="small" />,
  },
  {
    id: 'agent',
    label: 'Agent 测试',
    description: '按模块或接口生成测试计划',
    step: 1,
    icon: <ScienceOutlined fontSize="small" />,
  },
  {
    id: 'orchestrate',
    label: '编排执行',
    description: 'DSL 编辑、流程编排与执行',
    step: 2,
    icon: <PlayCircleOutlineOutlined fontSize="small" />,
  },
  {
    id: 'reports',
    label: '结果报告',
    description: '执行诊断、修复和报告',
    step: 3,
    icon: <AssessmentOutlined fontSize="small" />,
  },
  {
    id: 'history',
    label: '执行历史',
    description: '历史记录和回放',
    step: null,
    icon: <HistoryOutlined fontSize="small" />,
  },
];

const SIMPLE_WORKBENCH_SECTIONS = [
  { ...WORKBENCH_SECTIONS.find((item) => item.id === 'config'), label: '准备', description: '项目、环境和接口资产准备' },
  { ...WORKBENCH_SECTIONS.find((item) => item.id === 'agent'), label: '选择范围', description: '按 Agent 推荐生成测试计划' },
  { ...WORKBENCH_SECTIONS.find((item) => item.id === 'orchestrate'), label: '执行', description: '检查 DSL、变量和断言后运行' },
  { ...WORKBENCH_SECTIONS.find((item) => item.id === 'reports'), label: '结果', description: '查看结果、诊断和修复建议' },
];

const ACTIVE_STATUSES = new Set(['active', 'changed']);
const ACTIVE_RUN_STATUSES = new Set(['queued', 'running']);

const RUN_STATUS_LABELS = {
  passed: '通过',
  failed: '失败',
  queued: '排队中',
  running: '执行中',
  cancelled: '已取消',
};

const isExecutableInterface = (item) => ACTIVE_STATUSES.has(item.status) && !item.hidden;

const resolveSimpleSection = ({
  selectedProjectId,
  hasProjectConfig,
  activeInterfaceCount,
  hasDsl,
  hasExecutionResult,
  isRunActive,
}) => {
  if (!selectedProjectId || !hasProjectConfig || !activeInterfaceCount) return 'config';
  if (!hasDsl) return 'agent';
  if (!hasExecutionResult || isRunActive) return 'orchestrate';
  return 'reports';
};

const WORKBENCH_SECTION_COMPONENTS = {
  config: StepImport,
  assets: AssetsSection,
  agent: AgentSection,
  orchestrate: StepOrchestrate,
  reports: StepResult,
  history: RunHistory,
};

function APIExecutionContent() {
  const {
    activeStep,
    setActiveStep,
    loading,
    loadingMessage,
    dslText,
    runReport,
    runResult,
    projectName,
    environmentName,
    baseUrl,
    selectedProjectId,
    projects,
    projectsFetched,
    spec,
    parsedScript,
    backgroundRunStatus,
  } = useAPIExecution();
  const [workspaceMode, setWorkspaceMode] = React.useState(() => {
    if (typeof window === 'undefined') return 'simple';
    return window.localStorage.getItem(WORKSPACE_MODE_STORAGE_KEY) || 'simple';
  });
  const [activeSection, setActiveSection] = React.useState(() => SECTION_BY_STEP[activeStep] || 'config');
  const ignoredStepSyncRef = React.useRef(null);
  const previousActiveStepRef = React.useRef(activeStep);
  const manualSectionRef = React.useRef(false);
  const defaultLandingResolvedRef = React.useRef(false);
  const { data: projectAssets, isFetched: projectAssetsFetched } = useProjectAssets(selectedProjectId);
  const modules = projectAssets?.modules || [];
  const interfaces = projectAssets?.interfaces || [];
  const activeInterfaceCount = interfaces.filter(isExecutableInterface).length;
  const changedInterfaceCount = interfaces.filter((item) => item.status === 'changed' && !item.hidden).length;
  const hasExecutionResult = Boolean(runReport || runResult);
  const runStatus = runReport?.status || backgroundRunStatus || '';
  const isRunActive = ACTIVE_RUN_STATUSES.has(runStatus);
  const hasProjectConfig = Boolean(selectedProjectId && baseUrl);
  const hasDsl = Boolean(dslText);
  const scriptStepCount = parsedScript?.steps?.length || 0;
  const hasRunFailure = runReport?.status === 'failed';
  const safeProjects = Array.isArray(projects) ? projects : [];
  const hasStoredApiAutomationData = safeProjects.length > 0;

  React.useEffect(() => {
    if (previousActiveStepRef.current === activeStep) {
      return;
    }
    previousActiveStepRef.current = activeStep;
    if (ignoredStepSyncRef.current === activeStep) {
      ignoredStepSyncRef.current = null;
      return;
    }
    const nextSection = SECTION_BY_STEP[activeStep];
    if (nextSection) setActiveSection(nextSection);
  }, [activeStep]);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(WORKSPACE_MODE_STORAGE_KEY, workspaceMode);
    }
  }, [workspaceMode]);

  React.useEffect(() => {
    if (activeStep !== 0 || defaultLandingResolvedRef.current || manualSectionRef.current || !projectsFetched) return;
    if (!hasStoredApiAutomationData) {
      defaultLandingResolvedRef.current = true;
      setActiveSection('config');
      if (activeStep !== 0) {
        ignoredStepSyncRef.current = 0;
        setActiveStep(0);
      }
      return;
    }
    if (!selectedProjectId || !projectAssetsFetched) return;
    defaultLandingResolvedRef.current = true;
    setWorkspaceMode('advanced');
    setActiveSection('assets');
  }, [activeStep, hasStoredApiAutomationData, projectAssetsFetched, projectsFetched, selectedProjectId, setActiveStep]);

  const visibleSections = workspaceMode === 'simple' ? SIMPLE_WORKBENCH_SECTIONS : WORKBENCH_SECTIONS;

  React.useEffect(() => {
    if (!visibleSections.some((item) => item.id === activeSection)) {
      setActiveSection('agent');
    }
  }, [activeSection, visibleSections]);

  const handleSectionChange = (_event, sectionId, options = {}) => {
    const userInitiated = options.userInitiated ?? Boolean(_event);
    if (userInitiated) manualSectionRef.current = true;
    const section = WORKBENCH_SECTIONS.find((item) => item.id === sectionId);
    setActiveSection(sectionId);
    if (section?.step !== null && section?.step !== undefined) {
      if (section.step !== activeStep) ignoredStepSyncRef.current = section.step;
      setActiveStep(section.step);
    }
  };

  const handleAgentNavigate = (sectionId, options = {}) => {
    const userInitiated = options.userInitiated ?? true;
    if (userInitiated) manualSectionRef.current = true;
    if (sectionId === 'assets' && workspaceMode === 'simple') {
      setWorkspaceMode('advanced');
    }
    handleSectionChange(null, sectionId, { userInitiated });
  };

  const activeSectionMeta = WORKBENCH_SECTIONS.find((item) => item.id === activeSection) || WORKBENCH_SECTIONS[0];
  const LoadedWorkbenchSection = WORKBENCH_SECTION_COMPONENTS[activeSection] || StepImport;
  const isSimpleMode = workspaceMode === 'simple';
  const showGuidancePanel = !isSimpleMode;
  const suggestedSimpleSection = resolveSimpleSection({
    selectedProjectId,
    hasProjectConfig,
    activeInterfaceCount,
    hasDsl,
    hasExecutionResult,
    isRunActive,
  });

  React.useEffect(() => {
    if (
      !defaultLandingResolvedRef.current ||
      (activeStep === 0 && hasStoredApiAutomationData) ||
      !isSimpleMode ||
      manualSectionRef.current ||
      activeSection === suggestedSimpleSection
    ) return;
    const section = WORKBENCH_SECTIONS.find((item) => item.id === suggestedSimpleSection);
    setActiveSection(suggestedSimpleSection);
    if (section?.step !== null && section?.step !== undefined && section.step !== activeStep) {
      ignoredStepSyncRef.current = section.step;
      setActiveStep(section.step);
    }
  }, [activeSection, activeStep, hasStoredApiAutomationData, isSimpleMode, setActiveStep, suggestedSimpleSection]);

  const workflowSteps = React.useMemo(() => {
    const baseSteps = isSimpleMode
      ? [
        {
          id: 'config',
          section: 'config',
          title: '准备',
          complete: hasProjectConfig && activeInterfaceCount > 0,
          description: hasProjectConfig && activeInterfaceCount > 0 ? '项目、环境和接口资产已就绪' : '补齐项目、环境或接口资产',
          nextHint: '先确认 Agent 执行所需的最小条件。',
        },
        {
          id: 'agent',
          section: 'agent',
          title: '选择范围',
          complete: hasDsl,
          description: hasDsl ? `已生成${scriptStepCount ? ` ${scriptStepCount} 个步骤` : '测试计划'}` : '按推荐生成测试计划',
          nextHint: '使用 Agent 推荐范围，或切到高级模式手工选择。',
        },
        {
          id: 'orchestrate',
          section: 'orchestrate',
          title: '执行',
          complete: hasExecutionResult,
          description: isRunActive ? `任务${RUN_STATUS_LABELS[runStatus] || runStatus}` : hasExecutionResult ? '执行已产生结果' : hasDsl ? '可以执行计划' : '等待计划生成',
          nextHint: '提交 Agent 计划并观察执行状态。',
        },
        {
          id: 'reports',
          section: 'reports',
          title: '结果',
          complete: hasExecutionResult,
          description: hasExecutionResult ? `结果：${RUN_STATUS_LABELS[runStatus] || runStatus || '已生成'}` : '等待执行结果',
          nextHint: hasRunFailure ? '先看失败摘要，再进高级诊断。' : '查看通过率和失败摘要。',
        },
      ]
      : [
        {
          id: 'config',
          section: 'config',
          title: '项目配置',
          complete: hasProjectConfig,
          description: hasProjectConfig ? '项目、环境和 Base URL 已就绪' : '选择项目环境并配置 Base URL',
          nextHint: '先确认项目、环境、Base URL 和必要变量。',
        },
        {
          id: 'assets',
          section: 'assets',
          title: '接口资产',
          complete: activeInterfaceCount > 0,
          description: activeInterfaceCount > 0 ? `${modules.length} 个模块，${activeInterfaceCount} 个有效接口` : '导入规范或新增模块接口',
          nextHint: '维护项目-模块-接口台账，确认接口可被 Agent 选择。',
        },
        {
          id: 'agent',
          section: 'agent',
          title: 'Agent 生成',
          complete: hasDsl,
          description: hasDsl ? `已生成 DSL${scriptStepCount ? `，${scriptStepCount} 个步骤` : ''}` : '按模块或接口生成测试计划',
          nextHint: '在 Agent 测试中选择模块或接口，生成冒烟/负向 DSL。',
        },
        {
          id: 'orchestrate',
          section: 'orchestrate',
          title: '编排执行',
          complete: hasExecutionResult,
          description: isRunActive ? `任务${RUN_STATUS_LABELS[runStatus] || runStatus}` : hasExecutionResult ? '执行已产生结果' : hasDsl ? '检查 DSL 后执行链路' : '等待 DSL 生成',
          nextHint: '进入编排执行，确认步骤、变量和断言后运行。',
        },
        {
          id: 'reports',
          section: 'reports',
          title: '报告诊断',
          complete: hasExecutionResult,
          description: hasExecutionResult ? `结果：${RUN_STATUS_LABELS[runStatus] || runStatus || '已生成'}` : '等待执行报告',
          nextHint: hasRunFailure ? '查看失败原因并生成修复草稿。' : '查看报告、历史记录或沉淀修复经验。',
        },
      ];
    const firstIncomplete = baseSteps.find((step) => !step.complete)?.id;
    return baseSteps.map((step) => ({
      ...step,
      status: hasRunFailure && step.id === 'reports'
        ? 'warning'
        : step.complete
          ? 'done'
          : step.id === firstIncomplete || activeSection === step.section || (step.id === 'orchestrate' && isRunActive)
            ? 'active'
            : 'pending',
    }));
  }, [activeInterfaceCount, activeSection, hasDsl, hasExecutionResult, hasProjectConfig, hasRunFailure, isRunActive, isSimpleMode, modules.length, runStatus, scriptStepCount]);

  return (
    <Box sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', bgcolor: '#f8fafc', color: 'text.primary' }}>
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Box
          component="header"
          sx={{
            px: { xs: 2, md: 3 },
            py: 2.2,
            bgcolor: 'rgba(255, 255, 255, 0.45)',
            backdropFilter: 'blur(20px)',
            borderBottom: '1px solid',
            borderColor: 'rgba(255, 255, 255, 0.45)',
            boxShadow: '0 8px 32px rgba(15, 23, 42, 0.03), inset 0 1px 0 rgba(255,255,255,0.7)',
            position: 'relative',
            overflow: 'hidden',
            animation: 'rainbowBorder 10s infinite ease-in-out',
          }}
        >
          {/* Subtle decorative glowing background dots */}
          <Box sx={{ position: 'absolute', top: -30, right: 60, width: 120, height: 120, background: 'radial-gradient(circle, rgba(79, 70, 229, 0.08) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
          <Box sx={{ position: 'absolute', bottom: -30, left: 120, width: 100, height: 100, background: 'radial-gradient(circle, rgba(6, 182, 212, 0.06) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
          
          <style>{`
            @keyframes radarPulse {
              0% { transform: scale(0.9); opacity: 0.4; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
              50% { transform: scale(1.2); opacity: 1; box-shadow: 0 0 8px 3px rgba(16, 185, 129, 0.35); }
              100% { transform: scale(0.9); opacity: 0.4; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
            }
            @keyframes rainbowBorder {
              0% { border-color: rgba(99, 102, 241, 0.2); }
              50% { border-color: rgba(6, 182, 212, 0.3); }
              100% { border-color: rgba(99, 102, 241, 0.2); }
            }
          `}</style>

          <Stack spacing={2} sx={{ position: 'relative', zIndex: 1 }}>
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'center' }}>
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Typography variant="h5" fontWeight={900} sx={{ lineHeight: 1.25, letterSpacing: '-0.025em', color: 'text.primary' }}>
                    {isSimpleMode ? 'API Agent 测试工作台' : 'API 自动化工作台'}
                  </Typography>
                  <Chip
                    size="small"
                    icon={
                      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#10b981', display: 'inline-block', animation: 'radarPulse 2s infinite ease-in-out', mr: -0.5, ml: 1 }} />
                    }
                    label="极客遥测舱"
                    sx={{
                      fontSize: '10px',
                      fontWeight: 800,
                      bgcolor: 'rgba(16, 185, 129, 0.05)',
                      color: '#10b981',
                      border: '1px solid rgba(16, 185, 129, 0.15)',
                      borderRadius: '6px',
                      height: 20,
                      '& .MuiChip-icon': {
                        display: 'flex',
                        alignItems: 'center'
                      }
                    }}
                  />
                </Stack>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mt: 0.5 }}>
                  {isSimpleMode ? '跟着 Agent 完成准备、选范围、执行和看结果；高级模式保留完整治理与编排能力。' : activeSectionMeta.description}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
                {isSimpleMode ? (
                  <>
                    <Chip 
                      size="small" 
                      label={selectedProjectId ? `项目：${projectName || '已选择'}` : '项目待选择'} 
                      sx={{ 
                        fontSize: '11px', 
                        fontWeight: 800, 
                        bgcolor: selectedProjectId ? 'rgba(79, 70, 229, 0.05)' : 'rgba(0,0,0,0.03)', 
                        color: selectedProjectId ? '#4f46e5' : 'text.secondary', 
                        border: selectedProjectId ? '1px solid rgba(79, 70, 229, 0.15)' : '1px solid rgba(0,0,0,0.06)',
                        borderRadius: '6px'
                      }} 
                    />
                    <Chip 
                      size="small" 
                      label={baseUrl ? `环境：${environmentName || '已配置'}` : '环境待配置'} 
                      sx={{ 
                        fontSize: '11px', 
                        fontWeight: 800, 
                        bgcolor: baseUrl ? 'rgba(16, 185, 129, 0.05)' : 'rgba(0,0,0,0.03)', 
                        color: baseUrl ? '#10b981' : 'text.secondary', 
                        border: baseUrl ? '1px solid rgba(16, 185, 129, 0.15)' : '1px solid rgba(0,0,0,0.06)',
                        borderRadius: '6px'
                      }} 
                    />
                  </>
                ) : (
                  <>
                    <Chip 
                      size="small" 
                      label={`项目：${projectName || '未选择'}`} 
                      sx={{ 
                        fontSize: '11px', 
                        fontWeight: 800, 
                        bgcolor: selectedProjectId ? 'rgba(79, 70, 229, 0.05)' : 'rgba(0,0,0,0.03)', 
                        color: selectedProjectId ? '#4f46e5' : 'text.secondary', 
                        border: selectedProjectId ? '1px solid rgba(79, 70, 229, 0.15)' : '1px solid rgba(0,0,0,0.06)',
                        borderRadius: '6px'
                      }} 
                    />
                    <Chip 
                      size="small" 
                      label={`环境：${environmentName || '未选择'}`} 
                      sx={{ 
                        fontSize: '11px', 
                        fontWeight: 800, 
                        bgcolor: environmentName ? 'rgba(2, 132, 199, 0.05)' : 'rgba(0,0,0,0.03)', 
                        color: environmentName ? '#0284c7' : 'text.secondary', 
                        border: environmentName ? '1px solid rgba(2, 132, 199, 0.15)' : '1px solid rgba(0,0,0,0.06)',
                        borderRadius: '6px'
                      }} 
                    />
                    <Chip 
                      size="small" 
                      label={`Base URL：${baseUrl || '未配置'}`} 
                      sx={{ 
                        fontSize: '11px', 
                        fontWeight: 800, 
                        bgcolor: baseUrl ? 'rgba(16, 185, 129, 0.05)' : 'rgba(0,0,0,0.03)', 
                        color: baseUrl ? '#10b981' : 'text.secondary', 
                        border: baseUrl ? '1px solid rgba(16, 185, 129, 0.15)' : '1px solid rgba(0,0,0,0.06)',
                        borderRadius: '6px'
                      }} 
                    />
                  </>
                )}
                <Box sx={{ display: 'inline-flex', bgcolor: 'rgba(0,0,0,0.03)', p: '3px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.04)' }}>
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => {
                      manualSectionRef.current = false;
                      setWorkspaceMode('simple');
                      handleSectionChange(null, suggestedSimpleSection, { userInitiated: false });
                    }}
                    sx={{
                      py: 0.5,
                      px: 1.5,
                      fontSize: '11px',
                      fontWeight: 800,
                      borderRadius: '6px',
                      textTransform: 'none',
                      color: workspaceMode === 'simple' ? '#4f46e5' : 'text.secondary',
                      bgcolor: workspaceMode === 'simple' ? '#ffffff' : 'transparent',
                      boxShadow: workspaceMode === 'simple' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      '&:hover': {
                        bgcolor: workspaceMode === 'simple' ? '#ffffff' : 'rgba(0,0,0,0.02)',
                      },
                      transition: 'all 0.2s'
                    }}
                  >
                    简洁模式
                  </Button>
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => {
                      manualSectionRef.current = true;
                      setWorkspaceMode('advanced');
                    }}
                    sx={{
                      py: 0.5,
                      px: 1.5,
                      fontSize: '11px',
                      fontWeight: 800,
                      borderRadius: '6px',
                      textTransform: 'none',
                      color: workspaceMode === 'advanced' ? '#4f46e5' : 'text.secondary',
                      bgcolor: workspaceMode === 'advanced' ? '#ffffff' : 'transparent',
                      boxShadow: workspaceMode === 'advanced' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      '&:hover': {
                        bgcolor: workspaceMode === 'advanced' ? '#ffffff' : 'rgba(0,0,0,0.02)',
                      },
                      transition: 'all 0.2s'
                    }}
                  >
                    高级模式
                  </Button>
                </Box>
              </Stack>
            </Stack>

            {isSimpleMode ? (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip size="small" label={`${activeInterfaceCount} 个有效接口`} sx={{ fontSize: '10px', fontWeight: 800, bgcolor: activeInterfaceCount ? 'rgba(16, 185, 129, 0.04)' : 'rgba(0,0,0,0.02)', color: activeInterfaceCount ? '#10b981' : 'text.secondary', border: activeInterfaceCount ? '1px solid rgba(16, 185, 129, 0.12)' : 'none', borderRadius: '5px' }} />
                <Chip size="small" label={`${changedInterfaceCount} 个变更`} sx={{ fontSize: '10px', fontWeight: 800, bgcolor: changedInterfaceCount ? 'rgba(245, 158, 11, 0.04)' : 'rgba(0,0,0,0.02)', color: changedInterfaceCount ? '#f59e0b' : 'text.secondary', border: changedInterfaceCount ? '1px solid rgba(245, 158, 11, 0.12)' : 'none', borderRadius: '5px' }} />
                <Chip size="small" label={dslText ? '计划已生成' : '计划未生成'} sx={{ fontSize: '10px', fontWeight: 800, bgcolor: dslText ? 'rgba(79, 70, 229, 0.04)' : 'rgba(0,0,0,0.02)', color: dslText ? '#4f46e5' : 'text.secondary', border: dslText ? '1px solid rgba(79, 70, 229, 0.12)' : 'none', borderRadius: '5px' }} />
                <Chip size="small" label={hasExecutionResult ? '已有结果' : '暂无结果'} sx={{ fontSize: '10px', fontWeight: 800, bgcolor: hasExecutionResult ? 'rgba(2, 132, 199, 0.04)' : 'rgba(0,0,0,0.02)', color: hasExecutionResult ? '#0284c7' : 'text.secondary', border: hasExecutionResult ? '1px solid rgba(2, 132, 199, 0.12)' : 'none', borderRadius: '5px' }} />
              </Stack>
            ) : (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip size="small" label={`${modules.length} 个模块`} sx={{ fontSize: '10px', fontWeight: 700, borderRadius: '5px' }} />
                <Chip size="small" label={`${activeInterfaceCount} 个有效接口`} sx={{ fontSize: '10px', fontWeight: 800, bgcolor: activeInterfaceCount ? 'rgba(16, 185, 129, 0.04)' : 'rgba(0,0,0,0.02)', color: activeInterfaceCount ? '#10b981' : 'text.secondary', border: activeInterfaceCount ? '1px solid rgba(16, 185, 129, 0.12)' : 'none', borderRadius: '5px' }} />
                <Chip size="small" label={`${changedInterfaceCount} 个变更接口`} sx={{ fontSize: '10px', fontWeight: 800, bgcolor: changedInterfaceCount ? 'rgba(245, 158, 11, 0.04)' : 'rgba(0,0,0,0.02)', color: changedInterfaceCount ? '#f59e0b' : 'text.secondary', border: changedInterfaceCount ? '1px solid rgba(245, 158, 11, 0.12)' : 'none', borderRadius: '5px' }} />
                <Chip size="small" label={spec?.spec_id ? `OpenAPI：${spec.operation_count || spec.operations?.length || 0} 个接口` : 'OpenAPI：未加载'} sx={{ fontSize: '10px', fontWeight: 700, borderRadius: '5px' }} />
                <Chip size="small" label={dslText ? 'DSL：已生成' : 'DSL：未生成'} sx={{ fontSize: '10px', fontWeight: 800, bgcolor: dslText ? 'rgba(79, 70, 229, 0.04)' : 'rgba(0,0,0,0.02)', color: dslText ? '#4f46e5' : 'text.secondary', border: dslText ? '1px solid rgba(79, 70, 229, 0.12)' : 'none', borderRadius: '5px' }} />
                <Chip size="small" label={hasExecutionResult ? '报告：已有结果' : '报告：暂无结果'} sx={{ fontSize: '10px', fontWeight: 800, bgcolor: hasExecutionResult ? 'rgba(2, 132, 199, 0.04)' : 'rgba(0,0,0,0.02)', color: hasExecutionResult ? '#0284c7' : 'text.secondary', border: hasExecutionResult ? '1px solid rgba(2, 132, 199, 0.12)' : 'none', borderRadius: '5px' }} />
              </Stack>
            )}
          </Stack>
        </Box>

        <Box sx={{ px: { xs: 1, md: 3 }, bgcolor: 'rgba(255, 255, 255, 0.35)', backdropFilter: 'blur(10px)', borderBottom: '1px solid', borderColor: 'rgba(15, 23, 42, 0.06)' }}>
          <Tabs
            value={activeSection}
            onChange={handleSectionChange}
            variant="scrollable"
            scrollButtons="auto"
            aria-label="API 自动化工作区"
            sx={{
              minHeight: 48,
              '& .MuiTabs-indicator': {
                height: 3,
                borderRadius: '3px 3px 0 0',
                background: 'linear-gradient(90deg, #4f46e5 0%, #8b5cf6 100%)',
              },
              '& .MuiTab-root': {
                minHeight: 48,
                px: { xs: 1.5, md: 2.25 },
                fontWeight: 800,
                fontSize: '12px',
                textTransform: 'none',
                color: 'text.secondary',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                '&.Mui-selected': {
                  color: '#4f46e5',
                },
                '&:hover': {
                  color: 'text.primary',
                },
              },
            }}
          >
            {visibleSections.map((section) => (
              <Tab
                key={section.id}
                value={section.id}
                icon={section.icon}
                iconPosition="start"
                label={section.label}
              />
            ))}
          </Tabs>
        </Box>

        <Box sx={{ flex: 1, overflow: 'auto', px: { xs: 2, md: 3 }, py: { xs: 2, md: 3 } }}>
          <Box
            sx={{
              width: '100%',
              maxWidth: '100%',
              mx: 'auto',
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 240px', xl: 'minmax(0, 1fr) 260px' },
              gap: 2.5,
              alignItems: 'start',
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <WorkbenchActivityNotice active={loading} message={loadingMessage} />
              {showGuidancePanel && (
                <Box sx={{ mb: 2 }}>
                  <AgentGuidancePanel
                    onNavigate={handleAgentNavigate}
                    onOpenAdvanced={() => setWorkspaceMode('advanced')}
                  />
                </Box>
              )}
              {isSimpleMode && (
                <SimpleNextActionNotice
                  steps={workflowSteps}
                  activeSection={activeSection}
                  onNavigate={(sectionId) => handleAgentNavigate(sectionId, { userInitiated: true })}
                />
              )}
              {isSimpleMode && activeSection === 'config' ? (
                <SimplePrepareSection
                  onOpenAdvanced={() => {
                    manualSectionRef.current = true;
                    setWorkspaceMode('advanced');
                    handleSectionChange(null, 'config', { userInitiated: true });
                  }}
                  onOpenAssets={() => {
                    manualSectionRef.current = true;
                    setWorkspaceMode('advanced');
                    handleSectionChange(null, 'assets', { userInitiated: true });
                  }}
                />
              ) : isSimpleMode && activeSection === 'agent' ? (
                <SimpleAgentSection
                  onNavigate={handleAgentNavigate}
                  onOpenAdvanced={() => {
                    manualSectionRef.current = true;
                    setWorkspaceMode('advanced');
                    handleSectionChange(null, 'agent', { userInitiated: true });
                  }}
                  onOpenAssets={() => {
                    manualSectionRef.current = true;
                    setWorkspaceMode('advanced');
                    handleSectionChange(null, 'assets', { userInitiated: true });
                  }}
                />
              ) : isSimpleMode && activeSection === 'orchestrate' ? (
                <SimpleExecutionSection
                  onOpenAdvanced={() => {
                    manualSectionRef.current = true;
                    setWorkspaceMode('advanced');
                    handleSectionChange(null, 'orchestrate', { userInitiated: true });
                  }}
                  onBackToScope={() => handleSectionChange(null, 'agent', { userInitiated: true })}
                />
              ) : isSimpleMode && activeSection === 'reports' ? (
                <SimpleResultSection
                  onOpenAdvanced={() => {
                    manualSectionRef.current = true;
                    setWorkspaceMode('advanced');
                    handleSectionChange(null, 'reports', { userInitiated: true });
                  }}
                  onBackToExecute={() => handleSectionChange(null, 'orchestrate', { userInitiated: true })}
                />
              ) : (
                <LoadedWorkbenchSection />
              )}
            </Box>

            <WorkflowProgressRail
              steps={workflowSteps}
              activeSection={activeSection}
              onNavigate={handleAgentNavigate}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default function APIExecutionPage() {
  return (
    <APIExecutionProvider>
      <APIExecutionContent />
    </APIExecutionProvider>
  );
}
