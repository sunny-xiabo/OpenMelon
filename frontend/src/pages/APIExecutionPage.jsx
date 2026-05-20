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
    spec,
    parsedScript,
    backgroundRunStatus,
  } = useAPIExecution();
  const [workspaceMode, setWorkspaceMode] = React.useState(() => {
    if (typeof window === 'undefined') return 'simple';
    return window.localStorage.getItem(WORKSPACE_MODE_STORAGE_KEY) || 'simple';
  });
  const [activeSection, setActiveSection] = React.useState('agent');
  const ignoredStepSyncRef = React.useRef(null);
  const previousActiveStepRef = React.useRef(activeStep);
  const manualSectionRef = React.useRef(false);
  const { data: projectAssets } = useProjectAssets(selectedProjectId);
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
    if (!isSimpleMode || manualSectionRef.current || activeSection === suggestedSimpleSection) return;
    const section = WORKBENCH_SECTIONS.find((item) => item.id === suggestedSimpleSection);
    setActiveSection(suggestedSimpleSection);
    if (section?.step !== null && section?.step !== undefined && section.step !== activeStep) {
      ignoredStepSyncRef.current = section.step;
      setActiveStep(section.step);
    }
  }, [activeSection, activeStep, isSimpleMode, setActiveStep, suggestedSimpleSection]);

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
    <Box sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', bgcolor: '#f7f9fc', color: 'text.primary' }}>
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Box
          component="header"
          sx={{
            px: { xs: 2, md: 3 },
            py: 2,
            bgcolor: '#ffffff',
            borderBottom: '1px solid',
            borderColor: 'rgba(15, 23, 42, 0.08)',
          }}
        >
          <Stack spacing={1.5}>
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'center' }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h5" fontWeight={850} sx={{ lineHeight: 1.2 }}>
                  {isSimpleMode ? 'API Agent 测试工作台' : 'API 自动化工作台'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {isSimpleMode ? '跟着 Agent 完成准备、选范围、执行和看结果；高级模式保留完整治理与编排能力。' : activeSectionMeta.description}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {isSimpleMode ? (
                  <>
                    <Chip size="small" label={selectedProjectId ? `项目：${projectName || '已选择'}` : '项目待选择'} color={selectedProjectId ? 'primary' : 'default'} variant="outlined" />
                    <Chip size="small" label={baseUrl ? `环境：${environmentName || '已配置'}` : '环境待配置'} color={baseUrl ? 'success' : 'default'} variant="outlined" />
                  </>
                ) : (
                  <>
                    <Chip size="small" label={`项目：${projectName || '未选择'}`} color={selectedProjectId ? 'primary' : 'default'} variant="outlined" />
                    <Chip size="small" label={`环境：${environmentName || '未选择'}`} variant="outlined" />
                    <Chip size="small" label={`Base URL：${baseUrl || '未配置'}`} variant="outlined" />
                  </>
                )}
                <Button
                  size="small"
                  variant={workspaceMode === 'simple' ? 'contained' : 'outlined'}
                  onClick={() => {
                    manualSectionRef.current = false;
                    setWorkspaceMode('simple');
                    handleSectionChange(null, suggestedSimpleSection, { userInitiated: false });
                  }}
                >
                  简洁模式
                </Button>
                <Button
                  size="small"
                  variant={workspaceMode === 'advanced' ? 'contained' : 'outlined'}
                  onClick={() => {
                    manualSectionRef.current = true;
                    setWorkspaceMode('advanced');
                  }}
                >
                  高级模式
                </Button>
              </Stack>
            </Stack>

            {isSimpleMode ? (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip size="small" label={`${activeInterfaceCount} 个有效接口`} color={activeInterfaceCount ? 'success' : 'default'} variant="outlined" />
                <Chip size="small" label={`${changedInterfaceCount} 个变更`} color={changedInterfaceCount ? 'warning' : 'default'} variant="outlined" />
                <Chip size="small" label={dslText ? '计划已生成' : '计划未生成'} color={dslText ? 'success' : 'default'} variant="outlined" />
                <Chip size="small" label={hasExecutionResult ? '已有结果' : '暂无结果'} color={hasExecutionResult ? 'info' : 'default'} variant="outlined" />
              </Stack>
            ) : (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip size="small" label={`${modules.length} 个模块`} />
                <Chip size="small" label={`${activeInterfaceCount} 个有效接口`} color={activeInterfaceCount ? 'success' : 'default'} variant="outlined" />
                <Chip size="small" label={`${changedInterfaceCount} 个变更接口`} color={changedInterfaceCount ? 'warning' : 'default'} variant="outlined" />
                <Chip size="small" label={spec?.spec_id ? `OpenAPI：${spec.operation_count || spec.operations?.length || 0} 个接口` : 'OpenAPI：未加载'} variant="outlined" />
                <Chip size="small" label={dslText ? 'DSL：已生成' : 'DSL：未生成'} color={dslText ? 'success' : 'default'} variant="outlined" />
                <Chip size="small" label={hasExecutionResult ? '报告：已有结果' : '报告：暂无结果'} color={hasExecutionResult ? 'info' : 'default'} variant="outlined" />
              </Stack>
            )}
          </Stack>
        </Box>

        <Box sx={{ px: { xs: 1, md: 3 }, bgcolor: '#ffffff', borderBottom: '1px solid', borderColor: 'rgba(15, 23, 42, 0.08)' }}>
          <Tabs
            value={activeSection}
            onChange={handleSectionChange}
            variant="scrollable"
            scrollButtons="auto"
            aria-label="API 自动化工作区"
            sx={{
              minHeight: 52,
              '& .MuiTab-root': {
                minHeight: 52,
                px: { xs: 1.5, md: 2.25 },
                fontWeight: 750,
                textTransform: 'none',
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
              maxWidth: { xs: 1320, xl: 1600 },
              mx: 'auto',
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) 220px', xl: 'minmax(0, 1320px) 260px' },
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
