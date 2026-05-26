import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import {
  AccountTreeOutlined,
  ExpandMoreOutlined,
  PlayCircleOutlineOutlined,
  ScienceOutlined,
} from '@mui/icons-material';
import { useProjectEnvContext } from '../contexts/ProjectEnvContext';
import { useDSLContext } from '../contexts/DSLContext';
import { useSpecContext } from '../contexts/SpecContext';
import { useExecutionContext } from '../contexts/ExecutionContext';
import { useUIContext } from '../contexts/UIContext';
import { useAgentContext, useProjectAssets } from '../hooks/useAPIExecutionQueries';
import { useAgentPlanBuilder } from '../hooks/useAgentPlanBuilder';
import AssetAgentWorkbench from './AssetAgentWorkbench';
import SavedTestTasksPanel from './SavedTestTasksPanel';
import StepScope from './StepScope';

const ACTIVE_STATUSES = new Set(['active', 'changed']);

const RUN_STATUS_LABELS = {
  passed: '通过',
  failed: '失败',
  queued: '排队中',
  running: '执行中',
  cancelled: '已取消',
};

const METHOD_ORDER = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const statusTone = (status) => {
  if (status === 'passed') return 'success';
  if (status === 'queued' || status === 'running') return 'info';
  if (status === 'cancelled') return 'warning';
  if (status === 'failed') return 'error';
  return 'default';
};

const isExecutableInterface = (item) => ACTIVE_STATUSES.has(item.status) && !item.hidden;

export function WorkbenchActivityNotice({ active, message }) {
  if (!active) return null;
  return (
    <Paper elevation={0} sx={{ mb: 1.5, borderRadius: 1, border: '1px solid rgba(37, 99, 235, 0.18)', bgcolor: '#ffffff', overflow: 'hidden' }}>
      <LinearProgress sx={{ height: 3 }} />
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={0.75} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between" sx={{ px: 1.5, py: 1 }}>
        <Typography variant="body2" fontWeight={800}>
          {message || '正在处理当前操作'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {'页面不会被锁住，可以继续查看当前信息。'}
        </Typography>
      </Stack>
    </Paper>
  );
}

export function SimpleNextActionNotice({ steps, activeSection, onNavigate }) {
  const nextStep = steps.find((step) => !step.complete) || steps[steps.length - 1];
  if (!nextStep || nextStep.section === activeSection) return null;
  return (
    <Alert
      severity={nextStep.status === 'warning' ? 'warning' : 'info'}
      sx={{ mb: 2 }}
      action={(
        <Button color="inherit" size="small" onClick={() => onNavigate(nextStep.section)}>
          {'转到'}{nextStep.title}
        </Button>
      )}
    >
      {'建议的下一步：'}{nextStep.title}。{nextStep.description}
    </Alert>
  );
}

export function SimplePrepareSection({ onOpenAdvanced, onOpenAssets }) {
  const { selectedProjectId, projectName, environmentName, baseUrl } = useProjectEnvContext();
  const { spec } = useSpecContext();
  const { data: projectAssets } = useProjectAssets(selectedProjectId);
  const modules = projectAssets?.modules || [];
  const interfaces = projectAssets?.interfaces || [];
  const activeInterfaceCount = interfaces.filter(isExecutableInterface).length;
  const missing = [
    !selectedProjectId ? '还没有选择项目' : '',
    !environmentName ? '还没有选择环境' : '',
    !baseUrl ? 'Base URL 未配置' : '',
    !activeInterfaceCount ? '还没有可测试接口资产' : '',
  ].filter(Boolean);

  return (
    <Paper 
      elevation={0} 
      sx={{ 
        p: { xs: 2.5, md: 3 }, 
        borderRadius: 4.5, 
        border: '1px solid rgba(255, 255, 255, 0.45)', 
        bgcolor: 'rgba(255, 255, 255, 0.45)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 32px rgba(15, 23, 42, 0.02), inset 0 1px 0 rgba(255,255,255,0.7)',
      }}
    >
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h6" fontWeight={900} sx={{ letterSpacing: '-0.015em', color: 'text.primary' }}>项目配置</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mt: 0.5 }}>
            只确认 Agent 执行所需的最小前置条件；详细导入、策略和认证配置在高级准备里处理。
          </Typography>
        </Box>

        {missing.length ? (
          <Alert 
            severity="warning"
            sx={{
              borderRadius: 3.5,
              bgcolor: 'rgba(245, 158, 11, 0.03)',
              border: '1px solid rgba(245, 158, 11, 0.1)',
              fontSize: '12px',
              fontWeight: 600,
              color: '#f59e0b',
              '& .MuiAlert-icon': { color: '#f59e0b', opacity: 0.9 }
            }}
          >
            {missing.join('；')}
          </Alert>
        ) : (
          <Alert 
            severity="success"
            sx={{
              borderRadius: 3.5,
              bgcolor: 'rgba(16, 185, 129, 0.03)',
              border: '1px solid rgba(16, 185, 129, 0.1)',
              fontSize: '12px',
              fontWeight: 600,
              color: '#10b981',
              '& .MuiAlert-icon': { color: '#10b981', opacity: 0.9 }
            }}
          >
            项目、环境、Base URL 和接口资产已就绪，可以生成测试计划。
          </Alert>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          {[
            ['项目', projectName || '未选择', '#4f46e5'],
            ['环境', environmentName || '未选择', '#0284c7'],
            ['Base URL', baseUrl || '未配置', '#10b981'],
            ['接口资产', activeInterfaceCount ? `${modules.length} 个模块，${activeInterfaceCount} 个有效接口` : '未准备', '#8b5cf6'],
          ].map(([label, value, color]) => (
            <Box 
              key={label} 
              sx={{ 
                p: 2, 
                borderRadius: 3.5, 
                border: '1px solid rgba(0,0,0,0.03)', 
                bgcolor: 'rgba(255, 255, 255, 0.45)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
                transition: 'all 0.2s',
                '&:hover': {
                  transform: 'translateY(-1px)',
                  borderColor: 'rgba(0,0,0,0.06)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.01), inset 0 1px 0 rgba(255,255,255,0.8)'
                }
              }}
            >
              <Typography variant="caption" color="text.secondary" fontWeight={800} sx={{ letterSpacing: '0.02em' }}>{label}</Typography>
              <Typography variant="body2" fontWeight={850} sx={{ mt: 0.5, wordBreak: 'break-word', color: 'text.primary' }}>{value}</Typography>
            </Box>
          ))}
        </Box>

        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ pt: 1 }}>
          <Button 
            variant="contained" 
            onClick={onOpenAdvanced}
            sx={{
              borderRadius: 2.2,
              fontWeight: 800,
              textTransform: 'none',
              fontSize: '12px',
              px: 3,
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.2)',
              '&:hover': {
                background: 'linear-gradient(135deg, #4338ca 0%, #6d28d9 100%)',
              }
            }}
          >
            配置项目和环境
          </Button>
          <Button 
            variant="outlined" 
            onClick={onOpenAssets}
            sx={{
              borderRadius: 2.2,
              fontWeight: 700,
              textTransform: 'none',
              fontSize: '12px',
              px: 2.5,
              borderColor: 'rgba(0,0,0,0.15)',
              color: 'text.primary',
              bgcolor: '#ffffff',
              '&:hover': {
                borderColor: 'text.primary',
                bgcolor: 'rgba(0,0,0,0.02)',
              }
            }}
          >
            管理接口资产
          </Button>
          <Chip 
            size="small" 
            label={spec?.spec_id ? 'OpenAPI 已绑定' : 'OpenAPI 未加载'} 
            variant="outlined" 
            sx={{ 
              height: 28,
              fontSize: '11px', 
              fontWeight: 700,
              color: spec?.spec_id ? '#10b981' : 'text.secondary',
              borderColor: spec?.spec_id ? 'rgba(16, 185, 129, 0.2)' : 'rgba(0,0,0,0.1)'
            }}
          />
        </Stack>
      </Stack>
    </Paper>
  );
}

export function AgentSection() {
  const [advancedOpen, setAdvancedOpen] = React.useState(false);

  return (
    <Stack spacing={2.5}>
      <SavedTestTasksPanel />
      <AssetAgentWorkbench focus="agent" />
      <Accordion
        disableGutters
        elevation={0}
        expanded={advancedOpen}
        onChange={(_, expanded) => setAdvancedOpen(expanded)}
        sx={{ 
          border: '1px solid rgba(0,0,0,0.05)', 
          borderRadius: 4.5,
          bgcolor: 'rgba(255, 255, 255, 0.25)',
          backdropFilter: 'blur(10px)',
          overflow: 'hidden',
          '&:before': { display: 'none' } 
        }}
      >
        <AccordionSummary expandIcon={<ExpandMoreOutlined />}>
          <Box>
            <Typography variant="subtitle2" fontWeight={850}>
              高级：按 OpenAPI 规范挑选接口
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
              保留旧的规范范围选择和业务目标草稿能力，需要时再展开。
            </Typography>
          </Box>
        </AccordionSummary>
        <Divider sx={{ borderColor: 'rgba(0,0,0,0.04)' }} />
        <AccordionDetails sx={{ p: { xs: 2, md: 3 }, bgcolor: 'rgba(255, 255, 255, 0.4)' }}>
          {advancedOpen && <StepScope showAssetWorkbench={false} title={'规范范围与 AI 流程草稿'} />}
        </AccordionDetails>
      </Accordion>
    </Stack>
  );
}

export function SimpleAgentSection({ onNavigate, onOpenAdvanced, onOpenAssets }) {
  const { selectedProjectId } = useProjectEnvContext();
  const { dslText, parsedScript } = useDSLContext();
  const { data: agentContext, isLoading } = useAgentContext(selectedProjectId);
  const { buildingPlan, handleAgentAction } = useAgentPlanBuilder({ onNavigate });
  const recommendation = agentContext?.recommendation;
  const readiness = agentContext?.readiness || {};
  const assetSummary = agentContext?.asset_summary || {};
  const skippedGroups = agentContext?.skipped_reason_groups || [];
  const quickActions = agentContext?.quick_actions || [];
  const scriptStepCount = parsedScript?.steps?.length || 0;
  const primaryActionLabel = recommendation?.action === 'generate_test_plan'
    ? (dslText ? '重新生成计划' : '按推荐生成计划')
    : '去处理';

  if (!selectedProjectId) {
    return (
      <Alert 
        severity="info" 
        sx={{ borderRadius: 3.5 }}
        action={<Button color="inherit" size="small" onClick={() => onNavigate('config')}>去准备</Button>}
      >
        先创建或选择项目，Agent 会根据项目、环境和接口资产推荐下一步。
      </Alert>
    );
  }

  return (
    <Paper 
      elevation={0} 
      sx={{ 
        p: { xs: 2.5, md: 3 }, 
        borderRadius: 4.5, 
        border: '1px solid rgba(255, 255, 255, 0.45)', 
        bgcolor: 'rgba(255, 255, 255, 0.45)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 32px rgba(15, 23, 42, 0.02), inset 0 1px 0 rgba(255,255,255,0.7)',
      }}
    >
      <Stack spacing={2.5}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
          <Box>
            <Typography variant="h6" fontWeight={900} sx={{ letterSpacing: '-0.015em', color: 'text.primary' }}>Agent 测试范围</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mt: 0.5 }}>
              默认按后端 Agent 推荐选择范围；需要精确勾选接口时再进入高级模式。
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={readiness.base_url_ready ? '环境已就绪' : '环境待配置'} color={readiness.base_url_ready ? 'success' : 'default'} variant="outlined" sx={{ fontWeight: 700 }} />
            <Chip size="small" label={`${assetSummary.active_interface_count || 0} 个有效接口`} color={assetSummary.active_interface_count ? 'success' : 'default'} variant="outlined" sx={{ fontWeight: 700 }} />
            <Chip size="small" label={`${assetSummary.changed_interface_count || 0} 个变更`} color={assetSummary.changed_interface_count ? 'warning' : 'default'} variant="outlined" sx={{ fontWeight: 700 }} />
          </Stack>
        </Stack>

        <Box 
          sx={{ 
            p: 2, 
            borderRadius: 3.5, 
            bgcolor: 'rgba(79, 70, 229, 0.02)', 
            border: '1px solid rgba(79, 70, 229, 0.08)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)',
            position: 'relative'
          }}
        >
          {/* Neon running pulse LED lamp */}
          <Box sx={{ position: 'absolute', top: 18, left: 18, width: 8, height: 8, borderRadius: '50%', bgcolor: '#4f46e5', animation: 'agentPulse 2s infinite ease-in-out', zIndex: 1 }} />
          <style>{`@keyframes agentPulse { 0% { transform: scale(0.9); opacity: 0.4; box-shadow: 0 0 0 0 rgba(79,70,229,0.4); } 50% { transform: scale(1.2); opacity: 0.9; box-shadow: 0 0 8px 4px rgba(79,70,229,0.3); } 100% { transform: scale(0.9); opacity: 0.4; box-shadow: 0 0 0 0 rgba(79,70,229,0); } }`}</style>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} sx={{ pl: 2.2 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={800} sx={{ letterSpacing: '0.02em' }}>
                Agent 推荐
              </Typography>
              <Typography variant="body2" fontWeight={900} sx={{ mt: 0.25, color: 'text.primary' }}>
                {isLoading ? '正在检查当前项目' : recommendation?.label || '等待推荐'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, fontWeight: 500 }}>
                {isLoading ? '会检查环境、资产、变更和最近执行结果。' : recommendation?.description || '准备好项目和接口资产后，Agent 会给出默认范围。'}
              </Typography>
            </Box>
            {recommendation && (
              <Button
                variant="contained"
                disabled={buildingPlan}
                onClick={() => handleAgentAction(recommendation, { onOpenAdvanced })}
                sx={{
                  borderRadius: 2.2,
                  fontWeight: 800,
                  textTransform: 'none',
                  fontSize: '12px',
                  px: 3,
                  background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                  boxShadow: '0 4px 12px rgba(79, 70, 229, 0.15)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #4338ca 0%, #6d28d9 100%)',
                  }
                }}
              >
                {buildingPlan && recommendation.action === 'generate_test_plan' ? '生成中...' : primaryActionLabel}
              </Button>
            )}
          </Stack>
        </Box>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <Box sx={{ flex: 1, p: 2, borderRadius: 3.5, bgcolor: 'rgba(255, 255, 255, 0.4)', border: '1px solid rgba(0,0,0,0.03)' }}>
            <Typography variant="caption" color="text.secondary" fontWeight={800}>Agent 默认范围</Typography>
            <Typography variant="body2" fontWeight={850} sx={{ mt: 0.5, color: 'text.primary' }}>
              {recommendation?.label || '等待 Agent 推荐'}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, fontWeight: 500 }}>
              {recommendation?.description || '选择项目并准备接口资产后，Agent 会给出默认测试范围。'}
            </Typography>
          </Box>
          <Box sx={{ flex: 1, p: 2, borderRadius: 3.5, bgcolor: 'rgba(255, 255, 255, 0.4)', border: '1px solid rgba(0,0,0,0.03)' }}>
            <Typography variant="caption" color="text.secondary" fontWeight={800}>默认跳过</Typography>
            <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 800, color: 'text.primary' }}>
              {skippedGroups.length
                ? skippedGroups.slice(0, 2).map((item) => `${item.reason} ${item.count} 个`).join('；')
                : '暂无需要跳过的接口'}
            </Typography>
          </Box>
          <Box sx={{ flex: 1, p: 2, borderRadius: 3.5, bgcolor: 'rgba(255, 255, 255, 0.4)', border: '1px solid rgba(0,0,0,0.03)' }}>
            <Typography variant="caption" color="text.secondary" fontWeight={800}>当前计划</Typography>
            <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 800, color: 'text.primary' }}>
              {dslText ? `已生成 ${scriptStepCount || 0} 个步骤，下一步进入执行页确认。` : '点击上方推荐按钮后生成 DSL，不会自动执行。'}
            </Typography>
          </Box>
        </Stack>

        {!!quickActions.length && (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ pt: 0.5 }}>
            {quickActions.map((action) => (
              <Button
                key={`${action.action}-${action.label}`}
                size="small"
                variant="outlined"
                disabled={buildingPlan && action.action === 'generate_test_plan'}
                onClick={() => handleAgentAction(action, { onOpenAdvanced })}
                sx={{
                  borderRadius: 2,
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'none',
                  borderColor: 'rgba(0,0,0,0.1)',
                  color: 'text.secondary',
                  bgcolor: '#ffffff',
                  '&:hover': { borderColor: 'text.primary', bgcolor: 'rgba(0,0,0,0.02)' }
                }}
              >
                {action.label}
              </Button>
            ))}
          </Stack>
        )}

        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ pt: 1 }}>
          <Button variant="outlined" onClick={onOpenAdvanced} sx={{ borderRadius: 2.2, textTransform: 'none', fontWeight: 700, fontSize: '12px', borderColor: 'rgba(0,0,0,0.15)', color: 'text.primary', bgcolor: '#ffffff', '&:hover': { borderColor: 'text.primary', bgcolor: 'rgba(0,0,0,0.02)' } }}>高级范围选择</Button>
          <Button variant="text" onClick={onOpenAssets} sx={{ borderRadius: 2.2, textTransform: 'none', fontWeight: 800, fontSize: '12px', color: '#4f46e5', '&:hover': { bgcolor: 'rgba(79, 70, 229, 0.04)' } }}>接口资产治理</Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

export function SimpleExecutionSection({ onOpenAdvanced, onBackToScope }) {
  const { dslText, parsedScript } = useDSLContext();
  const { runAllSteps, backgroundRunStatus } = useExecutionContext();
  const { loading } = useUIContext();
  const { baseUrl } = useProjectEnvContext();
  const executionActive = ['queued', 'running'].includes(backgroundRunStatus);
  const steps = parsedScript?.steps || [];
  const methodCounts = steps.reduce((acc, step) => {
    const method = String(step.method || 'STEP').toUpperCase();
    acc[method] = (acc[method] || 0) + 1;
    return acc;
  }, {});

  return (
    <Paper 
      elevation={0} 
      sx={{ 
        p: { xs: 2.5, md: 3 }, 
        borderRadius: 4.5, 
        border: '1px solid rgba(255, 255, 255, 0.45)', 
        bgcolor: 'rgba(255, 255, 255, 0.45)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 32px rgba(15, 23, 42, 0.02), inset 0 1px 0 rgba(255,255,255,0.7)',
      }}
    >
      <Stack spacing={2.5}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
          <Box>
            <Typography variant="h6" fontWeight={900} sx={{ letterSpacing: '-0.015em', color: 'text.primary' }}>编排与执行</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mt: 0.5 }}>
              简洁模式只执行 Agent 生成的计划；复杂依赖、断言和 JSON 编辑在高级编排里处理。
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<PlayCircleOutlineOutlined />}
            disabled={!parsedScript || !dslText || loading || executionActive}
            onClick={runAllSteps}
            sx={{
              borderRadius: 2.2,
              fontWeight: 800,
              textTransform: 'none',
              fontSize: '12px',
              px: 3.5,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
              '&:hover': {
                background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
              }
            }}
          >
            {executionActive ? '执行中...' : '执行全量链路'}
          </Button>
        </Stack>

        {!parsedScript ? (
          <Alert 
            severity="info" 
            sx={{ borderRadius: 3.5 }}
            action={<Button color="inherit" size="small" onClick={onBackToScope}>去生成计划</Button>}
          >
            还没有测试计划。先让 Agent 生成 DSL，再回来执行。
          </Alert>
        ) : (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
              <Box sx={{ p: 2, borderRadius: 3.5, bgcolor: 'rgba(255, 255, 255, 0.4)', border: '1px solid rgba(0,0,0,0.03)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)' }}>
                <Typography variant="caption" color="text.secondary" fontWeight={800}>步骤数</Typography>
                <Typography variant="h6" fontWeight={900} sx={{ color: 'text.primary', mt: 0.5 }}>{steps.length}</Typography>
              </Box>
              <Box sx={{ p: 2, borderRadius: 3.5, bgcolor: 'rgba(255, 255, 255, 0.4)', border: '1px solid rgba(0,0,0,0.03)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)' }}>
                <Typography variant="caption" color="text.secondary" fontWeight={800}>Base URL</Typography>
                <Typography variant="body2" fontWeight={850} sx={{ mt: 0.75, wordBreak: 'break-word', color: 'text.primary' }}>{baseUrl || parsedScript.base_url || '未配置'}</Typography>
              </Box>
              <Box sx={{ p: 2, borderRadius: 3.5, bgcolor: 'rgba(255, 255, 255, 0.4)', border: '1px solid rgba(0,0,0,0.03)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)' }}>
                <Typography variant="caption" color="text.secondary" fontWeight={800}>方法分布</Typography>
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                  {METHOD_ORDER.filter((method) => methodCounts[method]).map((method) => {
                    const methodColors = {
                      GET: { bg: 'rgba(16, 185, 129, 0.05)', color: '#10b981', border: 'rgba(16, 185, 129, 0.15)' },
                      POST: { bg: 'rgba(59, 130, 246, 0.05)', color: '#3b82f6', border: 'rgba(59, 130, 246, 0.15)' },
                      PUT: { bg: 'rgba(245, 158, 11, 0.05)', color: '#f59e0b', border: 'rgba(245, 158, 11, 0.15)' },
                      PATCH: { bg: 'rgba(168, 85, 247, 0.05)', color: '#a855f7', border: 'rgba(168, 85, 247, 0.15)' },
                      DELETE: { bg: 'rgba(239, 68, 68, 0.05)', color: '#ef4444', border: 'rgba(239, 68, 68, 0.15)' },
                    };
                    const mStyle = methodColors[method] || { bg: 'rgba(0,0,0,0.02)', color: 'text.secondary', border: 'none' };
                    return (
                      <Chip 
                        key={method} 
                        size="small" 
                        label={`${method} ${methodCounts[method]}`} 
                        sx={{
                          height: 20,
                          fontSize: '10px',
                          fontWeight: 800,
                          bgcolor: mStyle.bg,
                          color: mStyle.color,
                          border: `1px solid ${mStyle.border}`,
                          borderRadius: '5px'
                        }} 
                      />
                    );
                  })}
                  {!Object.keys(methodCounts).length && <Chip size="small" label={'暂无步骤'} variant="outlined" />}
                </Stack>
              </Box>
            </Box>

            <Stack spacing={1.25}>
              {steps.slice(0, 5).map((step, index) => (
                <Box 
                  key={step.id || `${step.method}-${step.path}-${index}`} 
                  sx={{ 
                    p: 1.5, 
                    borderRadius: 3.5, 
                    border: '1px solid rgba(0,0,0,0.03)', 
                    bgcolor: 'rgba(255, 255, 255, 0.55)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.005), inset 0 1px 0 rgba(255,255,255,0.7)',
                    transition: 'all 0.2s',
                    '&:hover': {
                      transform: 'translateY(-0.5px)',
                      borderColor: 'rgba(0,0,0,0.05)',
                      bgcolor: '#ffffff'
                    }
                  }}
                >
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                      <Chip 
                        size="small" 
                        label={step.method || 'STEP'} 
                        sx={{ 
                          height: 20, 
                          fontSize: '10px', 
                          fontWeight: 800, 
                          bgcolor: step.method === 'DELETE' ? 'rgba(239, 68, 68, 0.05)' : step.method === 'POST' ? 'rgba(59, 130, 246, 0.05)' : 'rgba(0,0,0,0.03)',
                          color: step.method === 'DELETE' ? '#ef4444' : step.method === 'POST' ? '#3b82f6' : 'text.secondary',
                          borderRadius: '5px'
                        }} 
                      />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={850} noWrap sx={{ color: 'text.primary', fontSize: '13px' }}>{step.name || step.operation_id || step.path}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontWeight: 500 }} noWrap>{step.path || step.operation_id}</Typography>
                      </Box>
                    </Stack>
                    <Chip 
                      size="small" 
                      label={(step.assertions || []).length ? `${step.assertions.length} 个断言` : '默认断言'} 
                      sx={{ 
                        height: 20, 
                        fontSize: '10px', 
                        fontWeight: 700, 
                        bgcolor: 'rgba(0,0,0,0.02)',
                        color: 'text.secondary',
                        border: '1px solid rgba(0,0,0,0.06)'
                      }} 
                    />
                  </Stack>
                </Box>
              ))}
              {steps.length > 5 && (
                <Typography variant="caption" color="text.secondary" sx={{ pl: 0.5, fontWeight: 600 }}>还有 {steps.length - 5} 个步骤，进入高级编排可查看全部。</Typography>
              )}
            </Stack>
          </>
        )}

        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ pt: 1 }}>
          <Button variant="outlined" onClick={onBackToScope} sx={{ borderRadius: 2.2, textTransform: 'none', fontWeight: 700, fontSize: '12px', borderColor: 'rgba(0,0,0,0.15)', color: 'text.primary', bgcolor: '#ffffff', '&:hover': { borderColor: 'text.primary', bgcolor: 'rgba(0,0,0,0.02)' } }}>返回选择范围</Button>
          <Button variant="text" onClick={onOpenAdvanced} sx={{ borderRadius: 2.2, textTransform: 'none', fontWeight: 800, fontSize: '12px', color: '#4f46e5', '&:hover': { bgcolor: 'rgba(79, 70, 229, 0.04)' } }}>高级编排编辑</Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

export function SimpleResultSection({ onOpenAdvanced, onBackToExecute }) {
  const { runReport, runResult, backgroundRunId, backgroundRunStatus, cancellingRunId, refreshBackgroundRun, cancelBackgroundRun } = useExecutionContext();
  const { exportRunReport } = useDSLContext();
  const { loading } = useUIContext();
  const report = runReport || (runResult ? {
    status: runResult.status,
    passed: runResult.status === 'passed' ? 1 : 0,
    failed: runResult.status === 'passed' ? 0 : 1,
    total: 1,
    results: [runResult],
    duration_ms: runResult.duration_ms,
  } : backgroundRunId ? {
    status: backgroundRunStatus || 'queued',
    passed: 0,
    failed: 0,
    total: 0,
    results: [],
  } : null);
  const active = ['queued', 'running'].includes(report?.status || backgroundRunStatus);
  const failedResults = (report?.results || []).filter((item) => item.status !== 'passed');

  return (
    <Paper 
      elevation={0} 
      sx={{ 
        p: { xs: 2.5, md: 3 }, 
        borderRadius: 4.5, 
        border: '1px solid rgba(255, 255, 255, 0.45)', 
        bgcolor: 'rgba(255, 255, 255, 0.45)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 32px rgba(15, 23, 42, 0.02), inset 0 1px 0 rgba(255,255,255,0.7)',
      }}
    >
      <Stack spacing={2.5}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
          <Box>
            <Typography variant="h6" fontWeight={900} sx={{ letterSpacing: '-0.015em', color: 'text.primary' }}>执行结果与诊断</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mt: 0.5 }}>
              先看通过/失败和最关键的失败点；完整断言、修复草稿和知识沉淀在高级报告里处理。
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
            {!!backgroundRunId && <Button size="small" variant="outlined" disabled={loading} onClick={refreshBackgroundRun} sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700, fontSize: '11px', bgcolor: '#fff' }}>刷新</Button>}
            {active && (
              <Button size="small" variant="outlined" color="warning" disabled={loading || cancellingRunId === backgroundRunId} onClick={cancelBackgroundRun} sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700, fontSize: '11px', bgcolor: '#fff' }}>
                {cancellingRunId === backgroundRunId ? '取消中...' : '取消'}
              </Button>
            )}
            {runReport && <Button size="small" variant="outlined" onClick={() => exportRunReport(runReport)} sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700, fontSize: '11px', bgcolor: '#fff' }}>导出报告</Button>}
          </Stack>
        </Stack>

        {!report ? (
          <Alert 
            severity="info" 
            sx={{ borderRadius: 3.5 }}
            action={<Button size="small" color="inherit" onClick={onBackToExecute}>去执行</Button>}
          >
            暂无执行结果。执行 Agent 计划后这里会显示摘要。
          </Alert>
        ) : (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 2 }}>
              <Box sx={{ p: 2, borderRadius: 3.5, bgcolor: 'rgba(255, 255, 255, 0.4)', border: '1px solid rgba(0,0,0,0.03)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)' }}>
                <Typography variant="caption" color="text.secondary" fontWeight={800}>状态</Typography>
                <Box sx={{ mt: 0.5 }}>
                  <Chip 
                    size="small" 
                    color={statusTone(report.status)} 
                    label={RUN_STATUS_LABELS[report.status] || report.status || '未知'} 
                    sx={{ height: 22, fontSize: '10px', fontWeight: 800, borderRadius: '5px' }} 
                  />
                </Box>
              </Box>
              <Box sx={{ p: 2, borderRadius: 3.5, bgcolor: 'rgba(255, 255, 255, 0.4)', border: '1px solid rgba(0,0,0,0.03)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)' }}>
                <Typography variant="caption" color="text.secondary" fontWeight={800}>通过</Typography>
                <Typography variant="h6" fontWeight={900} color="success.main" sx={{ mt: 0.5 }}>{report.passed || 0}</Typography>
              </Box>
              <Box sx={{ p: 2, borderRadius: 3.5, bgcolor: 'rgba(255, 255, 255, 0.4)', border: '1px solid rgba(0,0,0,0.03)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)' }}>
                <Typography variant="caption" color="text.secondary" fontWeight={800}>失败</Typography>
                <Typography variant="h6" fontWeight={900} color={(report.failed || 0) ? 'error.main' : 'text.primary'} sx={{ mt: 0.5 }}>{report.failed || 0}</Typography>
              </Box>
              <Box sx={{ p: 2, borderRadius: 3.5, bgcolor: 'rgba(255, 255, 255, 0.4)', border: '1px solid rgba(0,0,0,0.03)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)' }}>
                <Typography variant="caption" color="text.secondary" fontWeight={800}>耗时</Typography>
                <Typography variant="h6" fontWeight={900} sx={{ color: 'text.primary', mt: 0.5 }}>{report.duration_ms ? `${report.duration_ms}ms` : '-'}</Typography>
              </Box>
            </Box>

            {!!failedResults.length && (
              <Alert 
                severity="warning"
                sx={{
                  borderRadius: 3.5,
                  bgcolor: 'rgba(245, 158, 11, 0.03)',
                  border: '1px solid rgba(245, 158, 11, 0.1)',
                  color: '#f59e0b',
                  '& .MuiAlert-icon': { color: '#f59e0b' }
                }}
              >
                <Stack spacing={0.75}>
                  <Typography variant="body2" fontWeight={850}>失败摘要</Typography>
                  {failedResults.slice(0, 3).map((result, index) => (
                    <Typography key={`${result.step_id || result.url}-${index}`} variant="caption" sx={{ display: 'block', wordBreak: 'break-word', fontWeight: 600 }}>
                      {result.step_id || result.method || '步骤'}：{result.error || result.failure_reason || `${result.status_code || '无状态码'} ${result.url || ''}`}
                    </Typography>
                  ))}
                </Stack>
              </Alert>
            )}
          </>
        )}

        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ pt: 1 }}>
          <Button variant="outlined" onClick={onBackToExecute} sx={{ borderRadius: 2.2, textTransform: 'none', fontWeight: 700, fontSize: '12px', borderColor: 'rgba(0,0,0,0.15)', color: 'text.primary', bgcolor: '#ffffff', '&:hover': { borderColor: 'text.primary', bgcolor: 'rgba(0,0,0,0.02)' } }}>返回执行</Button>
          <Button variant="text" onClick={onOpenAdvanced} sx={{ borderRadius: 2.2, textTransform: 'none', fontWeight: 800, fontSize: '12px', color: '#4f46e5', '&:hover': { bgcolor: 'rgba(79, 70, 229, 0.04)' } }}>高级报告诊断</Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

export function AssetsSection() {
  return <AssetAgentWorkbench focus="assets" />;
}
