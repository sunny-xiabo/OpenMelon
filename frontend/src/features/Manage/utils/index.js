export const formatFileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

export const formatIndexedTime = (value) => {
  if (!value) return '-';
  try {
    const date = new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  } catch {
    return value;
  }
};

export const buildFileStats = (files = []) => ({
  total: files.length,
  chunks: files.reduce((sum, file) => sum + (file.chunk_count || 0), 0),
  modules: new Set(files.map((file) => file.module).filter(Boolean)).size,
});

export const filterFiles = (files = [], { dateFilter, searchText, statusFilter }) => {
  let nextFiles = files;
  if (searchText) {
    const query = searchText.toLowerCase();
    nextFiles = nextFiles.filter((file) => file.filename?.toLowerCase().includes(query));
  }
  if (statusFilter !== 'all') {
    nextFiles = nextFiles.filter((file) => file.status === statusFilter);
  }
  if (dateFilter !== 'all') {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let cutoff;
    if (dateFilter === 'today') cutoff = today;
    else if (dateFilter === 'week') {
      cutoff = new Date(today);
      cutoff.setDate(cutoff.getDate() - 7);
    } else if (dateFilter === 'month') {
      cutoff = new Date(today);
      cutoff.setMonth(cutoff.getMonth() - 1);
    }
    if (cutoff) {
      nextFiles = nextFiles.filter((file) => new Date(file.indexed_at) >= cutoff);
    }
  }
  return nextFiles;
};
