export const buildPromptHubSummary = (templates = [], skills = []) => ({
  enabledTemplates: templates.filter((item) => item.enabled).length,
  enabledSkills: skills.filter((item) => item.enabled).length,
  defaultTemplate: templates.find((item) => item.is_default)?.name || '未配置',
});

export const filterPromptHubRecords = (records = [], keywordValue = '') => {
  const keyword = keywordValue.trim().toLowerCase();
  if (!keyword) return records;
  return records.filter((item) => (
    item.name.toLowerCase().includes(keyword)
    || item.id.toLowerCase().includes(keyword)
    || (item.description || '').toLowerCase().includes(keyword)
  ));
};

export const filterSkills = (skills = [], keywordValue = '', categoryFilter = 'all') => (
  filterPromptHubRecords(skills, keywordValue).filter((item) => (
    categoryFilter === 'all' || item.category === categoryFilter
  ))
);
