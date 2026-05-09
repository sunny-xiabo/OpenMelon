import { useCallback, useEffect, useRef, useState } from 'react';
import { promptHubAPI } from '../../../services/api';
import { PROMPT_HUB_UPDATED_EVENT } from '../../../constants/events';
import { on } from '../../../utils/eventBus';
import {
  DEFAULT_TEMPLATE_ID,
  FALLBACK_SKILL_OPTIONS,
  FALLBACK_TEMPLATE_OPTIONS,
} from '../constants';

export function usePromptHubOptions({ isActive, showSnackbar }) {
  const [styleId, setStyleId] = useState(DEFAULT_TEMPLATE_ID);
  const [selectedSkillIds, setSelectedSkillIds] = useState([]);
  const [templateOptions, setTemplateOptions] = useState(FALLBACK_TEMPLATE_OPTIONS);
  const [skillOptions, setSkillOptions] = useState(FALLBACK_SKILL_OPTIONS);
  const [defaultTemplateId, setDefaultTemplateId] = useState(DEFAULT_TEMPLATE_ID);

  const styleIdRef = useRef(styleId);
  const selectedSkillIdsRef = useRef(selectedSkillIds);

  useEffect(() => {
    styleIdRef.current = styleId;
  }, [styleId]);

  useEffect(() => {
    selectedSkillIdsRef.current = selectedSkillIds;
  }, [selectedSkillIds]);

  const reconcilePromptHubSelection = useCallback((nextTemplates, nextSkills, nextDefaultTemplateId, notify) => {
    const previousStyleId = styleIdRef.current;
    const previousSkillIds = selectedSkillIdsRef.current;
    const resolvedStyleId = nextTemplates.some((item) => item.id === previousStyleId)
      ? previousStyleId
      : nextDefaultTemplateId;
    const resolvedSkillIds = previousSkillIds.filter((skillId) =>
      nextSkills.some((item) => item.id === skillId)
    );

    setTemplateOptions(nextTemplates);
    setSkillOptions(nextSkills);
    setDefaultTemplateId(nextDefaultTemplateId);
    setStyleId(resolvedStyleId);
    setSelectedSkillIds(resolvedSkillIds);

    if (notify && previousStyleId && previousStyleId !== resolvedStyleId) {
      showSnackbar('当前模板已失效，已自动回退为默认模板', 'info');
    }
    if (notify && previousSkillIds.length !== resolvedSkillIds.length) {
      showSnackbar('部分已选技能已失效，系统已自动移除', 'info');
    }
  }, [showSnackbar]);

  const loadPromptHubOptions = useCallback(async (notifyOnFallback = false) => {
    try {
      const data = await promptHubAPI.getOptions();
      const nextTemplates = data.templates?.length ? data.templates : FALLBACK_TEMPLATE_OPTIONS;
      const nextSkills = data.skills?.length ? data.skills : FALLBACK_SKILL_OPTIONS;
      const nextDefaultTemplateId = data.default_style_id || nextTemplates[0]?.id || DEFAULT_TEMPLATE_ID;
      reconcilePromptHubSelection(
        nextTemplates,
        nextSkills,
        nextDefaultTemplateId,
        notifyOnFallback,
      );
    } catch {
      reconcilePromptHubSelection(
        FALLBACK_TEMPLATE_OPTIONS,
        FALLBACK_SKILL_OPTIONS,
        DEFAULT_TEMPLATE_ID,
        notifyOnFallback,
      );
    }
  }, [reconcilePromptHubSelection]);

  useEffect(() => {
    if (isActive) {
      loadPromptHubOptions(false);
    }
  }, [isActive, loadPromptHubOptions]);

  useEffect(() => {
    const handlePromptHubUpdated = () => {
      loadPromptHubOptions(true);
    };
    return on(PROMPT_HUB_UPDATED_EVENT, handlePromptHubUpdated);
  }, [loadPromptHubOptions]);

  return {
    defaultTemplateId,
    selectedSkillIds,
    setSelectedSkillIds,
    setStyleId,
    skillOptions,
    styleId,
    templateOptions,
  };
}
