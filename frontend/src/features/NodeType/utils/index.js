export function filterNodeTypes(items, categoryFilter, keyword) {
  const q = keyword.trim().toLowerCase();
  return items.filter((item) => {
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    const matchesKeyword = !q || item.type.toLowerCase().includes(q);
    return matchesCategory && matchesKeyword;
  });
}

export function getCategoryChipColor(category) {
  if (category === 'fixed') return 'primary';
  if (category === 'fallback') return 'default';
  return 'warning';
}
