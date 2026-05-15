import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { promptHubAPI } from '../../../services/api';
import { useSnackbar } from '../../../components/SnackbarProvider';
import { buildPromptHubSummary } from '../utils';

export const PROMPT_HUB_KEYS = {
  templates: ['prompt-hub', 'templates'],
  skills: ['prompt-hub', 'skills'],
  categories: ['prompt-hub', 'categories'],
};

/**
 * 获取所有模板
 */
export function usePromptTemplates() {
  return useQuery({
    queryKey: PROMPT_HUB_KEYS.templates,
    queryFn: async () => {
      const data = await promptHubAPI.getTemplates();
      return data.templates || [];
    },
  });
}

/**
 * 获取所有技能
 */
export function usePromptSkills() {
  return useQuery({
    queryKey: PROMPT_HUB_KEYS.skills,
    queryFn: async () => {
      const data = await promptHubAPI.getSkills();
      return data.skills || [];
    },
  });
}

/**
 * 获取所有技能分类
 */
export function useSkillCategories() {
  return useQuery({
    queryKey: PROMPT_HUB_KEYS.categories,
    queryFn: async () => {
      const data = await promptHubAPI.getSkillCategories();
      return data.skill_categories || [];
    },
  });
}

/**
 * 获取 Prompt Hub 摘要统计
 */
export function usePromptHubSummary() {
  const templatesQuery = usePromptTemplates();
  const skillsQuery = usePromptSkills();

  return {
    isLoading: templatesQuery.isLoading || skillsQuery.isLoading,
    data: buildPromptHubSummary(templatesQuery.data || [], skillsQuery.data || []),
  };
}

/**
 * 基础 Mutation 封装
 */
function usePromptMutation(mutationFn, successMessage, invalidateKeys = []) {
  const queryClient = useQueryClient();
  const showSnackbar = useSnackbar();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      invalidateKeys.forEach(key => queryClient.invalidateQueries({ queryKey: key }));
      showSnackbar(successMessage, { severity: 'success' });
    },
    onError: (error) => {
      showSnackbar(error.message || '操作失败', { severity: 'error' });
    }
  });
}

/**
 * 保存记录（模板或技能）
 */
export function useSavePromptRecord(type, mode) {
  return usePromptMutation(
    ({ id, payload }) => {
      if (type === 'template') {
        return mode === 'create' ? promptHubAPI.createTemplate(payload) : promptHubAPI.updateTemplate(id, payload);
      } else {
        return mode === 'create' ? promptHubAPI.createSkill(payload) : promptHubAPI.updateSkill(id, payload);
      }
    },
    mode === 'create' ? '配置已创建' : '配置已更新',
    [PROMPT_HUB_KEYS.templates, PROMPT_HUB_KEYS.skills]
  );
}

/**
 * 删除记录
 */
export function useDeletePromptRecord(type) {
  return usePromptMutation(
    (id) => type === 'template' ? promptHubAPI.deleteTemplate(id) : promptHubAPI.deleteSkill(id),
    '配置已删除',
    [PROMPT_HUB_KEYS.templates, PROMPT_HUB_KEYS.skills]
  );
}

/**
 * 分类操作
 */
export function useSaveCategory() {
  return usePromptMutation(
    (payload) => promptHubAPI.createSkillCategory(payload),
    '技能分类已创建',
    [PROMPT_HUB_KEYS.categories]
  );
}

export function useDeleteCategory() {
  return usePromptMutation(
    (id) => promptHubAPI.deleteSkillCategory(id),
    '技能分类已删除',
    [PROMPT_HUB_KEYS.categories]
  );
}
