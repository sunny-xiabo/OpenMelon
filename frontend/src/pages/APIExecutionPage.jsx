import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  ButtonBase,
  Chip,
  Divider,
  LinearProgress,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import {
  AccountTreeOutlined,
  AssessmentOutlined,
  CheckCircleOutline,
  ExpandMoreOutlined,
  HistoryOutlined,
  RadioButtonUnchecked,
  PlayCircleOutlineOutlined,
  ScienceOutlined,
  SettingsOutlined,
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { APIExecutionProvider, useAPIExecution } from '../features/APIExecution/context';
import LoadingOverlay from '../components/LoadingOverlay';

import StepImport from '../features/APIExecution/components/StepImport';
import StepScope from '../features/APIExecution/components/StepScope';
import StepOrchestrate from '../features/APIExecution/components/StepOrchestrate';
import StepResult from '../features/APIExecution/components/StepResult';
import RunHistory from '../features/APIExecution/components/RunHistory';
import AssetAgentWorkbench from '../features/APIExecution/components/AssetAgentWorkbench';
import SavedTestTasksPanel from '../features/APIExecution/components/SavedTestTasksPanel';
import { useProjectAssets } from '../features/APIExecution/hooks/useAPIExecutionQueries';

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

const ACTIVE_STATUSES = new Set(['active', 'changed']);
const ACTIVE_RUN_STATUSES = new Set(['queued', 'running']);

const RUN_STATUS_LABELS = {
  passed: '通过',
  failed: '失败',
  queued: '排队中',
  running: '执行中',
  cancelled: '已取消',
};

const FLOW_STATUS_META = {
  done: { label: '已完成', color: 'success.main', bg: 'success.light' },
  active: { label: '进行中', color: 'primary.main', bg: 'primary.light' },
  pending: { label: '待处理', color: 'text.disabled', bg: 'action.hover' },
  warning: { label: '待诊断', color: 'error.main', bg: 'error.light' },
};

function WorkflowProgressRail({ steps, activeSection, onNavigate }) {
  const completedCount = steps.filter((step) => step.complete).length;
  const percent = Math.round((completedCount / steps.length) * 100);
  const nextStep = steps.find((step) => !step.complete) || steps[steps.length - 1];

  return (
    <Paper
      elevation={0}
      sx={{
        display: { xs: 'block', xl: 'block' },
        position: { xl: 'sticky' },
        top: { xl: 16 },
        p: 2,
        borderRadius: 1,
        border: '1px solid rgba(15, 23, 42, 0.08)',
        bgcolor: '#ffffff',
        alignSelf: 'start',
      }}
    >
      <Stack spacing={1.5}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Box>
            <Typography variant="subtitle2" fontWeight={850}>流程进度</Typography>
            <Typography variant="caption" color="text.secondary">API 自动化主链路</Typography>
          </Box>
          <Chip size="small" color="primary" variant="outlined" label={`${completedCount}/${steps.length}`} />
        </Stack>
        <LinearProgress
          variant="determinate"
          value={percent}
          sx={{ height: 6, borderRadius: 1, bgcolor: 'rgba(15, 23, 42, 0.08)' }}
        />

        <Box sx={{ pt: 0.5 }}>
          {steps.map((step, index) => {
            const meta = FLOW_STATUS_META[step.status] || FLOW_STATUS_META.pending;
            const selected = activeSection === step.section;
            const isDone = step.status === 'done';
            const isWarning = step.status === 'warning';
            const isActive = step.status === 'active';
            const color = meta.color;

            return (
              <Box
                key={step.id}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '32px minmax(0, 1fr)',
                  gap: 1,
                  position: 'relative',
                  pb: index === steps.length - 1 ? 0 : 1.25,
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
                  {index < steps.length - 1 && (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 30,
                        bottom: -10,
                        width: 2,
                        borderRadius: 1,
                        bgcolor: isDone ? 'success.main' : 'rgba(148, 163, 184, 0.35)',
                      }}
                    />
                  )}
                  <Box
                    sx={(theme) => ({
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 1,
                      color,
                      bgcolor: isDone || isWarning || isActive
                        ? alpha(theme.palette[isWarning ? 'error' : isDone ? 'success' : 'primary'].main, 0.1)
                        : '#ffffff',
                      border: '2px solid',
                      borderColor: color,
                    })}
                  >
                    {isDone ? <CheckCircleOutline sx={{ fontSize: 18 }} /> : <RadioButtonUnchecked sx={{ fontSize: 16 }} />}
                  </Box>
                </Box>

                <ButtonBase
                  onClick={() => onNavigate(step.section)}
                  sx={(theme) => ({
                    width: '100%',
                    justifyContent: 'stretch',
                    textAlign: 'left',
                    borderRadius: 1,
                    p: 1,
                    mt: -0.25,
                    bgcolor: selected ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
                    border: '1px solid',
                    borderColor: selected ? alpha(theme.palette.primary.main, 0.28) : 'transparent',
                    '&:hover': {
                      bgcolor: selected ? alpha(theme.palette.primary.main, 0.1) : 'rgba(15, 23, 42, 0.04)',
                    },
                  })}
                >
                  <Box sx={{ minWidth: 0, width: '100%' }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                      <Typography variant="caption" color="text.secondary" fontWeight={800}>
                        Stage {index + 1}
                      </Typography>
                      <Typography variant="caption" sx={{ color, fontWeight: 800 }}>
                        {meta.label}
                      </Typography>
                    </Stack>
                    <Typography variant="body2" fontWeight={850} sx={{ mt: 0.25 }}>
                      {step.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.45 }}>
                      {step.description}
                    </Typography>
                  </Box>
                </ButtonBase>
              </Box>
            );
          })}
        </Box>

        <Divider />
        <Box sx={{ p: 1.25, borderRadius: 1, bgcolor: '#f8fafc', border: '1px solid rgba(15, 23, 42, 0.06)' }}>
          <Typography variant="caption" color="text.secondary" fontWeight={800}>下一步</Typography>
          <Typography variant="body2" fontWeight={850}>{nextStep.title}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {nextStep.nextHint}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}

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
  const [activeSection, setActiveSection] = React.useState(SECTION_BY_STEP[activeStep] || 'config');
  const { data: projectAssets } = useProjectAssets(selectedProjectId);
  const modules = projectAssets?.modules || [];
  const interfaces = projectAssets?.interfaces || [];
  const activeInterfaceCount = interfaces.filter((item) => ACTIVE_STATUSES.has(item.status)).length;
  const changedInterfaceCount = interfaces.filter((item) => item.status === 'changed').length;
  const hasExecutionResult = Boolean(runReport || runResult);
  const runStatus = runReport?.status || backgroundRunStatus || '';
  const isRunActive = ACTIVE_RUN_STATUSES.has(runStatus);
  const hasProjectConfig = Boolean(selectedProjectId && baseUrl);
  const hasDsl = Boolean(dslText);
  const scriptStepCount = parsedScript?.steps?.length || 0;
  const hasRunFailure = runReport?.status === 'failed';

  React.useEffect(() => {
    const nextSection = SECTION_BY_STEP[activeStep];
    if (nextSection) setActiveSection(nextSection);
  }, [activeStep]);

  const handleSectionChange = (_event, sectionId) => {
    const section = WORKBENCH_SECTIONS.find((item) => item.id === sectionId);
    setActiveSection(sectionId);
    if (section?.step !== null && section?.step !== undefined) {
      setActiveStep(section.step);
    }
  };

  const activeSectionMeta = WORKBENCH_SECTIONS.find((item) => item.id === activeSection) || WORKBENCH_SECTIONS[0];
  const workflowSteps = React.useMemo(() => {
    const baseSteps = [
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
  }, [activeInterfaceCount, activeSection, hasDsl, hasExecutionResult, hasProjectConfig, hasRunFailure, isRunActive, modules.length, runStatus, scriptStepCount]);

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
                  API 自动化工作台
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {activeSectionMeta.description}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip size="small" label={`项目：${projectName || '未选择'}`} color={selectedProjectId ? 'primary' : 'default'} variant="outlined" />
                <Chip size="small" label={`环境：${environmentName || '未选择'}`} variant="outlined" />
                <Chip size="small" label={`Base URL：${baseUrl || '未配置'}`} variant="outlined" />
              </Stack>
            </Stack>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip size="small" label={`${modules.length} 个模块`} />
              <Chip size="small" label={`${activeInterfaceCount} 个有效接口`} color={activeInterfaceCount ? 'success' : 'default'} variant="outlined" />
              <Chip size="small" label={`${changedInterfaceCount} 个变更接口`} color={changedInterfaceCount ? 'warning' : 'default'} variant="outlined" />
              <Chip size="small" label={spec?.spec_id ? `OpenAPI：${spec.operation_count || spec.operations?.length || 0} 个接口` : 'OpenAPI：未加载'} variant="outlined" />
              <Chip size="small" label={dslText ? 'DSL：已生成' : 'DSL：未生成'} color={dslText ? 'success' : 'default'} variant="outlined" />
              <Chip size="small" label={hasExecutionResult ? '报告：已有结果' : '报告：暂无结果'} color={hasExecutionResult ? 'info' : 'default'} variant="outlined" />
            </Stack>
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
            {WORKBENCH_SECTIONS.map((section) => (
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
              {activeSection === 'config' && <StepImport />}
              {activeSection === 'assets' && <AssetAgentWorkbench focus="assets" />}
              {activeSection === 'agent' && (
                <Stack spacing={2.5}>
                  <SavedTestTasksPanel />
                  <AssetAgentWorkbench focus="agent" />
                  <Accordion disableGutters elevation={0} sx={{ border: '1px solid rgba(15, 23, 42, 0.08)', borderRadius: 1, '&:before': { display: 'none' } }}>
                    <AccordionSummary expandIcon={<ExpandMoreOutlined />}>
                      <Box>
                        <Typography variant="subtitle2" fontWeight={800}>
                          高级：按 OpenAPI 规范挑选接口
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          保留旧的规范范围选择和业务目标草稿能力，需要时再展开。
                        </Typography>
                      </Box>
                    </AccordionSummary>
                    <Divider />
                    <AccordionDetails sx={{ p: { xs: 2, md: 3 }, bgcolor: '#f8fafc' }}>
                      <StepScope showAssetWorkbench={false} title="规范范围与 AI 流程草稿" />
                    </AccordionDetails>
                  </Accordion>
                </Stack>
              )}
              {activeSection === 'orchestrate' && <StepOrchestrate />}
              {activeSection === 'reports' && <StepResult />}
              {activeSection === 'history' && <RunHistory />}
            </Box>

            <WorkflowProgressRail
              steps={workflowSteps}
              activeSection={activeSection}
              onNavigate={(sectionId) => handleSectionChange(null, sectionId)}
            />
          </Box>
        </Box>
      </Box>

      {loading && loadingMessage && <LoadingOverlay message={loadingMessage} />}
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
