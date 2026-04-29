export function getCoverageTone(pct) {
  if (pct >= 80) return { color: 'success', label: '健康' };
  if (pct >= 50) return { color: 'warning', label: '关注' };
  return { color: 'error', label: '风险' };
}

export function buildCoverageMetrics(modules = [], visibleModules = []) {
  const totalFeatures = modules.reduce((sum, item) => sum + item.feature_count, 0);
  const totalCases = modules.reduce((sum, item) => sum + item.test_case_count, 0);
  const avgCoverage = totalFeatures ? (totalCases / totalFeatures) * 100 : 0;
  const healthyCount = modules.filter((item) => item.coverage_percentage >= 80).length;
  const riskCount = modules.filter((item) => item.coverage_percentage < 50).length;
  const topModules = visibleModules.slice(0, 8);
  return {
    totalFeatures,
    totalCases,
    avgCoverage,
    healthyCount,
    riskCount,
    topModules,
  };
}

export function filterAndSortModules(modules = [], { riskOnly, searchText, sortBy }) {
  let filtered = riskOnly
    ? modules.filter((item) => item.coverage_percentage < 50)
    : modules;

  if (searchText.trim()) {
    const query = searchText.trim().toLowerCase();
    filtered = filtered.filter((item) => item.module_name.toLowerCase().includes(query));
  }

  return [...filtered].sort((a, b) => {
    if (sortBy === 'coverageDesc') return b.coverage_percentage - a.coverage_percentage;
    if (sortBy === 'moduleName') return a.module_name.localeCompare(b.module_name, 'zh-CN');
    if (sortBy === 'featureDesc') return b.feature_count - a.feature_count;
    if (sortBy === 'caseDesc') return b.test_case_count - a.test_case_count;
    return a.coverage_percentage - b.coverage_percentage;
  });
}

export function exportCoverageCSV(modules) {
  const header = '模块名称,功能数,用例数,覆盖率(%),状态\n';
  const rows = modules.map((module) => {
    const tone = getCoverageTone(module.coverage_percentage);
    return `${module.module_name},${module.feature_count},${module.test_case_count},${module.coverage_percentage.toFixed(1)},${tone.label}`;
  }).join('\n');
  const bom = '\uFEFF';
  const blob = new Blob([bom + header + rows], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `覆盖率报告_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}
