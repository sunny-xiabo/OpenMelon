import { API_BASE, fetchJSON } from './client';

export const promptHubAPI = {
  getOptions: () => fetchJSON(`${API_BASE}/prompt-hub/options`),

  getTemplates: () => fetchJSON(`${API_BASE}/prompt-hub/templates`),

  createTemplate: (payload) =>
    fetchJSON(`${API_BASE}/prompt-hub/templates`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateTemplate: (templateId, payload) =>
    fetchJSON(`${API_BASE}/prompt-hub/templates/${encodeURIComponent(templateId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteTemplate: (templateId) =>
    fetchJSON(`${API_BASE}/prompt-hub/templates/${encodeURIComponent(templateId)}`, {
      method: 'DELETE',
    }),

  getSkills: () => fetchJSON(`${API_BASE}/prompt-hub/skills`),

  getSkillCategories: () => fetchJSON(`${API_BASE}/prompt-hub/skill-categories`),

  createSkill: (payload) =>
    fetchJSON(`${API_BASE}/prompt-hub/skills`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateSkill: (skillId, payload) =>
    fetchJSON(`${API_BASE}/prompt-hub/skills/${encodeURIComponent(skillId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteSkill: (skillId) =>
    fetchJSON(`${API_BASE}/prompt-hub/skills/${encodeURIComponent(skillId)}`, {
      method: 'DELETE',
    }),

  createSkillCategory: (payload) =>
    fetchJSON(`${API_BASE}/prompt-hub/skill-categories`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateSkillCategory: (categoryId, payload) =>
    fetchJSON(`${API_BASE}/prompt-hub/skill-categories/${encodeURIComponent(categoryId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteSkillCategory: (categoryId) =>
    fetchJSON(`${API_BASE}/prompt-hub/skill-categories/${encodeURIComponent(categoryId)}`, {
      method: 'DELETE',
    }),
};

