import React from 'react';
import { apiExecutionAPI } from '../../../api/execution';
import { useSnackbar } from '../../../components/SnackbarProvider';
import { useProjectEnvContext } from '../contexts/ProjectEnvContext';
import { useDSLContext } from '../contexts/DSLContext';
import { useUIContext } from '../contexts/UIContext';

export function useAgentPlanBuilder({ onNavigate }) {
  const { selectedProjectId } = useProjectEnvContext();
  const { setDslText, setRunStepId } = useDSLContext();
  const { setActiveStep, requestConfirm } = useUIContext();
  const showSnackbar = useSnackbar();
  const [buildingPlan, setBuildingPlan] = React.useState(false);

  const buildAgentPlan = React.useCallback(async (action, includeHighRisk = false) => {
    if (!selectedProjectId) return;
    setBuildingPlan(true);
    try {
      const requestPlan = (approvedHighRisk) => apiExecutionAPI.buildAgentTestPlan(selectedProjectId, {
        intent: action?.intent || 'smoke',
        scope_strategy: action?.scope_strategy || 'auto',
        module_id: action?.module_id || '',
        interface_ids: action?.interface_ids || [],
        include_high_risk: approvedHighRisk,
      });
      let data = await requestPlan(includeHighRisk);
      if (data.requires_high_risk_confirmation && !includeHighRisk) {
        const confirmed = await requestConfirm('Agent 推荐范围包含高风险接口，是否确认纳入本次测试计划？');
        if (!confirmed) return;
        data = await requestPlan(true);
      }
      if (!data.script?.steps?.length) {
        showSnackbar(data.agent_summary || data.summary || '当前范围没有可执行接口', 'warning');
        return;
      }
      setDslText(JSON.stringify(data.script, null, 2));
      setRunStepId(data.script.steps?.[0]?.id || '');
      setActiveStep(2);
      onNavigate('orchestrate');
      showSnackbar(data.agent_summary || `Agent 已生成 ${data.script.steps.length} 个测试步骤`, 'success');
    } catch (error) {
      showSnackbar(error.message || 'Agent 测试计划生成失败', 'error');
    } finally {
      setBuildingPlan(false);
    }
  }, [onNavigate, requestConfirm, selectedProjectId, setActiveStep, setDslText, setRunStepId, showSnackbar]);

  const handleAgentAction = React.useCallback((action, { onOpenAdvanced } = {}) => {
    if (!action) return;
    if (action.action === 'generate_test_plan') {
      buildAgentPlan(action);
      return;
    }
    const section = action.section || 'agent';
    if (section === 'assets') onOpenAdvanced?.();
    onNavigate(section);
  }, [buildAgentPlan, onNavigate]);

  return { buildingPlan, buildAgentPlan, handleAgentAction };
}
