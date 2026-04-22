import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Button,
  TextField,
  Autocomplete,
  Select,
  MenuItem,
  FormControl,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Chip,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  LinearProgress,
  Stack,
  useMediaQuery,
} from '@mui/material';
import { Delete as DeleteIcon, Refresh as RefreshIcon, CloudUploadOutlined, FolderOpenOutlined, DescriptionOutlined, LayersOutlined } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { fileAPI, uploadAPI, graphAPI } from '../services/api';
import { useSnackbar } from '../components/SnackbarProvider';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';

const PAGE_SIZE = 10;
const ACCEPTED_EXTENSIONS = '.pdf,.docx,.doc,.xlsx,.xls,.xmind,.pptx,.md,.txt,.csv,.html,.htm,.json,.yaml,.yml,.xml,.epub';
const GRAPH_DATA_UPDATED_EVENT = 'graph-data-updated';

export default function ManagePage() {
  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down('lg'));
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [dateFilter, setDateFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [stats, setStats] = useState({ total: 0, chunks: 0, modules: 0 });
  const [confirmDialog, setConfirmDialog] = useState({ open: false, message: '', onConfirm: null });
  const [page, setPage] = useState(1);
  const showSnackbar = useSnackbar();

  const [filters, setFilters] = useState({ doc_types: [], modules: [] });

  const [uploadMode, setUploadMode] = useState('single');
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const pollRef = useRef(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadDocType, setUploadDocType] = useState('');
  const [uploadModule, setUploadModule] = useState('');

  useEffect(() => { loadFiles(); }, []);
  useEffect(() => {
    graphAPI.getFilters().then(setFilters).catch(() => { });
  }, []);
  useEffect(() => { setPage(1); }, [searchText, dateFilter, statusFilter]);

  const notifyGraphDataUpdated = () => {
    const version = String(Date.now());
    window.localStorage.setItem('graphDataVersion', version);
    window.dispatchEvent(new Event(GRAPH_DATA_UPDATED_EVENT));
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const pollTask = (taskId) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const t = await uploadAPI.getStatus(taskId);
        const pct = 30 + Math.round((t.processed / Math.max(t.total_files, 1)) * 70);
        setUploadProgress({ pct, text: `处理中... (${t.processed}/${t.total_files})` });
        if (t.status === 'completed') {
          stopPolling();
          setUploadProgress({ pct: 100, text: t.message });
          notifyGraphDataUpdated();
          showSnackbar(t.message, 'success');
          setTimeout(() => {
            setUploadProgress(null);
            setSelectedFiles([]);
            setUploadDocType('');
            setUploadModule('');
            loadFiles();
          }, 3000);
        } else if (t.status === 'failed') {
          stopPolling();
          setUploadProgress({ pct, text: '处理失败' });
          showSnackbar('处理失败', 'error');
          setTimeout(() => setUploadProgress(null), 3000);
        }
      } catch { }
    }, 2000);
  };

  const handleDrop = (fileList) => {
    const files = Array.from(fileList);
    setSelectedFiles((prev) => {
      const s = new Set(prev.map((f) => f.name + f.size));
      return [...prev, ...files.filter((f) => !s.has(f.name + f.size))];
    });
  };

  const doUpload = async () => {
    if (!selectedFiles.length) return;
    setUploadProgress({ pct: 10, text: '保存文件中...' });
    try {
      const d = await uploadAPI.uploadAsync(selectedFiles, uploadDocType, uploadModule);
      setUploadProgress({ pct: 30, text: '文件已保存，后台处理中...' });
      pollTask(d.task_id);
    } catch (err) {
      showSnackbar('上传失败', 'error');
      setUploadProgress(null);
    }
  };

  const fmtSize = (b) =>
    b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB';

  const loadFiles = async () => {
    try {
      const data = await fileAPI.list();
      let f = data.files || [];
      if (searchText) {
        const q = searchText.toLowerCase();
        f = f.filter((x) => x.filename?.toLowerCase().includes(q));
      }
      if (statusFilter !== 'all') f = f.filter((x) => x.status === statusFilter);
      if (dateFilter !== 'all') {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        let c;
        if (dateFilter === 'today') c = today;
        else if (dateFilter === 'week') {
          c = new Date(today);
          c.setDate(c.getDate() - 7);
        } else if (dateFilter === 'month') {
          c = new Date(today);
          c.setMonth(c.getMonth() - 1);
        }
        if (c) f = f.filter((x) => new Date(x.indexed_at) >= c);
      }
      setFiles(f);
      const all = data.files || [];
      setStats({
        total: all.length,
        chunks: all.reduce((s, x) => s + (x.chunk_count || 0), 0),
        modules: new Set(all.map((x) => x.module).filter(Boolean)).size,
      });
    } catch {
      showSnackbar('加载文件列表失败', 'error');
    }
  };

  const toggleAll = (e) =>
    setSelected(e.target.checked ? new Set(files.map((f) => f.id)) : new Set());
  const toggleOne = (id) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const doDelete = (id, name) =>
    setConfirmDialog({
      open: true,
      message: `确认删除「${name}」的索引？\n此操作不可撤销。`,
      onConfirm: async () => {
        setConfirmDialog({ open: false, message: '', onConfirm: null });
        try {
          await fileAPI.delete(id);
          showSnackbar('删除成功', 'success');
          setSelected((p) => {
            const n = new Set(p);
            n.delete(id);
            return n;
          });
          loadFiles();
        } catch {
          showSnackbar('删除失败', 'error');
        }
      },
    });

  const doReindex = (id, name) =>
    setConfirmDialog({
      open: true,
      message: `确认重新索引「${name}」？\n将重新解析文件并更新索引，可能需要较长时间。`,
      onConfirm: async () => {
        setConfirmDialog({ open: false, message: '', onConfirm: null });
        setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'reindexing' } : f));
        showSnackbar('开始重新索引，请稍候...', 'info');
        try {
          const res = await fileAPI.reindex(id);
          if (res.success === false) {
             throw new Error(res.message || '重新索引失败');
          }
          showSnackbar('重新索引完成！', 'success');
        } catch (err) {
          showSnackbar(err.message || '重新索引失败', 'error');
        } finally {
          loadFiles();
        }
      },
    });

  const doBatchDelete = () =>
    setConfirmDialog({
      open: true,
      message: `确认删除选中的 ${selected.size} 个文件索引？`,
      onConfirm: async () => {
        setConfirmDialog({ open: false, message: '', onConfirm: null });
        try {
          for (const id of selected) await fileAPI.delete(id);
          showSnackbar(`已删除 ${selected.size} 个文件`, 'success');
          setSelected(new Set());
          loadFiles();
        } catch {
          showSnackbar('批量删除失败', 'error');
        }
      },
    });

  const fmtTime = (s) => {
    if (!s) return '-';
    try {
      const d = new Date(s);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return s;
    }
  };

  const totalPages = Math.max(1, Math.ceil(files.length / PAGE_SIZE));
  const paginatedFiles = files.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const goToPage = (p) => {
    if (p < 1 || p > totalPages) return;
    setPage(p);
    setSelected(new Set());
  };

  const statCards = [
    {
      label: '索引文件',
      value: stats.total,
      helper: '当前已纳入索引的文档数量',
      accent: 'rgba(26,115,232,0.08)',
      icon: <DescriptionOutlined fontSize="small" />,
    },
    {
      label: '文档分块',
      value: stats.chunks,
      helper: '写入向量索引的 chunk 总数',
      accent: 'rgba(16,185,129,0.08)',
      icon: <LayersOutlined fontSize="small" />,
    },
    {
      label: '覆盖模块',
      value: stats.modules,
      helper: '已识别并归档的模块数量',
      accent: 'rgba(245,158,11,0.08)',
      icon: <FolderOpenOutlined fontSize="small" />,
    },
  ];

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', p: 1.5, gap: 1.5, bgcolor: 'background.default' }}>
      <PageHeader title="导入管理" subtitle="上传文档、跟踪索引结果，管理知识库内容。" />

      <Box sx={{ display: 'flex', gap: 1.5, flexDirection: isNarrow ? 'column' : 'row', minHeight: 0, flex: 1 }}>
        <Paper elevation={0} sx={{ width: isNarrow ? '100%' : 360, minWidth: 0, display: 'flex', flexDirection: 'column', border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
          <Box sx={{ px: 2.5, py: 1.75, borderBottom: '1px solid', borderColor: 'divider', background: 'linear-gradient(90deg, rgba(59,130,246,0.06) 0%, rgba(99,102,241,0.04) 100%)' }}>
            <Typography variant="subtitle2" sx={{ color: '#1e293b', fontWeight: 600 }}>导入工作台</Typography>
            <Typography variant="caption" sx={{ color: '#64748b' }}>
              选择单文件或整个文件夹，补充文档类型和模块信息后开始索引。
            </Typography>
          </Box>

          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, bgcolor: 'background.paper' }}>
            <Box sx={{ display: 'flex', bgcolor: 'rgba(0,0,0,0.04)', borderRadius: 1.5, p: 0.5, alignSelf: 'flex-start' }}>
              <Button
                disableElevation
                size="small"
                variant={uploadMode === 'single' ? 'contained' : 'text'}
                onClick={() => setUploadMode('single')}
                startIcon={<DescriptionOutlined fontSize="small" />}
                sx={{
                  borderRadius: 1,
                  py: 0.5,
                  px: 1.5,
                  color: uploadMode === 'single' ? '#fff' : 'text.secondary',
                  bgcolor: uploadMode === 'single' ? 'primary.main' : 'transparent',
                  fontWeight: uploadMode === 'single' ? 600 : 500,
                  boxShadow: 'none',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s',
                  '&:hover': {
                    bgcolor: uploadMode === 'single' ? 'primary.dark' : 'rgba(0,0,0,0.04)'
                  }
                }}
              >
                单文件
              </Button>
              <Button
                disableElevation
                size="small"
                variant={uploadMode === 'folder' ? 'contained' : 'text'}
                onClick={() => setUploadMode('folder')}
                startIcon={<FolderOpenOutlined fontSize="small" />}
                sx={{
                  borderRadius: 1,
                  py: 0.5,
                  px: 1.5,
                  color: uploadMode === 'folder' ? '#fff' : 'text.secondary',
                  bgcolor: uploadMode === 'folder' ? 'primary.main' : 'transparent',
                  fontWeight: uploadMode === 'folder' ? 600 : 500,
                  boxShadow: 'none',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s',
                  '&:hover': {
                    bgcolor: uploadMode === 'folder' ? 'primary.dark' : 'rgba(0,0,0,0.04)'
                  }
                }}
              >
                文件夹
              </Button>
            </Box>

            <Box
              sx={{
                border: '2px dashed',
                borderColor: dragOver ? '#6366f1' : 'rgba(99,102,241,0.3)',
                borderRadius: 3,
                p: 2.5,
                textAlign: 'center',
                cursor: uploadProgress ? 'default' : 'pointer',
                background: dragOver ? 'rgba(99,102,241,0.04)' : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                minHeight: 160,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                transition: 'all 0.2s',
                boxShadow: dragOver ? 'inset 0 0 0 2px rgba(99,102,241,0.05)' : 'none',
                '&:hover': uploadProgress ? {} : { borderColor: '#6366f1', background: 'rgba(99,102,241,0.02)' },
              }}
              onDragOver={(e) => { e.preventDefault(); if (!uploadProgress) setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (!uploadProgress) handleDrop(e.dataTransfer.files);
              }}
              onClick={() => { if (!uploadProgress) document.getElementById('manage-file-input').click(); }}
            >
              <Box sx={{ width: 48, height: 48, borderRadius: '50%', bgcolor: 'primary.light', color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CloudUploadOutlined />
              </Box>
              <Typography variant="body2" color="text.secondary">
                {uploadMode === 'folder' ? '点击选择文件夹，或拖拽文件夹到这里' : '拖拽文件到这里，或点击选择'}
              </Typography>
              <Typography variant="caption" color="text.disabled">
                支持 PDF / Word / Excel / XMind / PPT / Markdown / TXT / JSON / XML
              </Typography>
            </Box>

            <input
              id="manage-file-input"
              type="file"
              multiple
              style={{ display: 'none' }}
              {...(uploadMode === 'folder' ? { webkitdirectory: '' } : { accept: ACCEPTED_EXTENSIONS })}
              onChange={(e) => { handleDrop(e.target.files); e.target.value = ''; }}
            />

            {uploadProgress ? (
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                  上传进度
                </Typography>
                <LinearProgress variant="determinate" value={uploadProgress.pct} sx={{ height: 8, borderRadius: 999 }} />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
                  {uploadProgress.text}
                </Typography>
              </Paper>
            ) : null}

            <Autocomplete
              freeSolo
              size="small"
              options={filters.doc_types || []}
              value={uploadDocType}
              inputValue={uploadDocType}
              onChange={(e, newValue) => setUploadDocType(newValue || '')}
              onInputChange={(e, newInputValue) => setUploadDocType(newInputValue)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="文档类型"
                  placeholder="可选，便于后续筛选"
                  fullWidth
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5, bgcolor: '#f8fafc' } }}
                />
              )}
            />
            <Autocomplete
              freeSolo
              size="small"
              options={filters.modules || []}
              value={uploadModule}
              inputValue={uploadModule}
              onChange={(e, newValue) => setUploadModule(newValue || '')}
              onInputChange={(e, newInputValue) => setUploadModule(newInputValue)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="所属模块"
                  placeholder="可选，便于图谱和覆盖率统计"
                  fullWidth
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5, bgcolor: '#f8fafc' } }}
                />
              )}
            />

            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                fullWidth
                onClick={doUpload}
                disabled={selectedFiles.length === 0 || uploadProgress}
                startIcon={uploadProgress ? <Box sx={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 1s linear infinite' }} /> : <CloudUploadOutlined />}
                sx={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                  boxShadow: '0 4px 12px rgba(99,102,241,0.25)',
                  fontWeight: 600,
                  '&:hover': {
                    background: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)',
                    boxShadow: '0 6px 16px rgba(99,102,241,0.3)',
                  },
                  '&.Mui-disabled': {
                    background: '#e2e8f0',
                    color: '#94a3b8',
                    boxShadow: 'none'
                  }
                }}
              >
                {uploadProgress ? '处理中...' : `开始导入${selectedFiles.length > 0 ? ` (${selectedFiles.length})` : ''}`}
              </Button>
              <Button
                variant="outlined"
                disabled={selectedFiles.length === 0 || uploadProgress}
                onClick={() => {
                  setSelectedFiles([]);
                  setUploadDocType('');
                  setUploadModule('');
                }}
              >
                清空
              </Button>
            </Box>

            {selectedFiles.length > 0 && !uploadProgress && (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                  待导入文件
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, maxHeight: 120, overflow: 'auto' }}>
                  {selectedFiles.map((f, i) => (
                    <Chip
                      key={i}
                      label={f.name}
                      size="small"
                      onDelete={() => setSelectedFiles((prev) => prev.filter((_, j) => j !== i))}
                    />
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </Paper>

        <Paper elevation={0} sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
          <Box sx={{ px: 2.5, py: 1.75, borderBottom: '1px solid', borderColor: 'divider', background: 'linear-gradient(90deg, rgba(16,185,129,0.06) 0%, rgba(52,211,153,0.03) 100%)' }}>
            <Typography variant="subtitle2" sx={{ color: '#1e293b', fontWeight: 600 }}>索引清单</Typography>
            <Typography variant="caption" sx={{ color: '#64748b' }}>
              查看导入结果、筛选文件状态，并按文件执行重新索引或删除操作。
            </Typography>
          </Box>

          <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
            <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
              {statCards.map((item) => (
                <Paper
                  key={item.label}
                  elevation={0}
                  sx={{
                    flex: '1 1 180px',
                    minWidth: 0,
                    p: 2,
                    border: '1px solid',
                    borderColor: 'rgba(226,232,240,0.8)',
                    borderRadius: 3,
                    background: `linear-gradient(135deg, ${item.accent.replace('0.08', '0.12')} 0%, rgba(255,255,255,0.8) 100%)`,
                    boxShadow: '0 4px 16px rgba(15,23,42,0.03)',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <Box sx={{ position: 'absolute', top: -10, right: -10, p: 2, color: item.accent.replace('rgba', 'rgb').replace(',0.08)', ')'), opacity: 0.15, transform: 'scale(1.5)' }}>
                    {item.icon}
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, position: 'relative', zIndex: 1 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: item.accent.replace('0.08', '0.8') }} />
                    <Typography variant="body2" sx={{ color: '#475569', fontWeight: 600 }}>{item.label}</Typography>
                  </Box>
                  <Typography sx={{ mt: 1.25, fontSize: 32, fontWeight: 800, lineHeight: 1, color: '#0f172a', position: 'relative', zIndex: 1, letterSpacing: '-0.5px' }}>{item.value}</Typography>
                  <Typography variant="caption" sx={{ color: '#64748b', mt: 1, display: 'block', position: 'relative', zIndex: 1 }}>
                    {item.helper}
                  </Typography>
                </Paper>
              ))}
            </Box>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, py: 1.25, bgcolor: '#f8fafc', borderBottom: '1px solid rgba(226,232,240,0.8)', gap: 1.25, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <Select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} sx={{ borderRadius: 2, bgcolor: '#ffffff', fontSize: 13 }}>
                  <MenuItem value="all">全部时间</MenuItem>
                  <MenuItem value="today">今日导入</MenuItem>
                  <MenuItem value="week">本周导入</MenuItem>
                  <MenuItem value="month">本月导入</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} sx={{ borderRadius: 2, bgcolor: '#ffffff', fontSize: 13 }}>
                  <MenuItem value="all">全部状态</MenuItem>
                  <MenuItem value="indexed">已索引</MenuItem>
                  <MenuItem value="failed">失败</MenuItem>
                </Select>
              </FormControl>
              <TextField
                size="small"
                placeholder="搜索文件名..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadFiles()}
                sx={{ width: 220, '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#ffffff' }, '& .MuiInputBase-input': { fontSize: 13 } }}
              />
            </Box>
            <Tooltip title="刷新列表">
              <IconButton size="small" onClick={loadFiles}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>

          <TableContainer sx={{ flex: 1, overflow: 'auto', bgcolor: 'background.paper' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selected.size > 0 && selected.size === paginatedFiles.length}
                      onChange={toggleAll}
                    />
                  </TableCell>
                  <TableCell>文件名</TableCell>
                  <TableCell>文档类型</TableCell>
                  <TableCell>模块</TableCell>
                  <TableCell align="center">分块数</TableCell>
                  <TableCell>导入时间</TableCell>
                  <TableCell align="center">状态</TableCell>
                  <TableCell align="center">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedFiles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                      <EmptyState
                        title="暂无已导入文件"
                        description="上传文档后，这里会展示索引状态、分块数量和后续操作入口。"
                        compact
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedFiles.map((f) => (
                    <TableRow
                      key={f.id}
                      selected={selected.has(f.id)}
                      hover
                    >
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selected.has(f.id)}
                          onChange={() => toggleOne(f.id)}
                        />
                      </TableCell>
                      <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: '#1e293b' }}>
                        <Tooltip title={f.filename} placement="top-start" arrow>
                          <span>{f.filename}</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#475569' }}>
                        <Tooltip title={f.doc_type || '-'} placement="top" arrow>
                          <span>{f.doc_type || '-'}</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 130 }}>
                        {f.module ? (
                          <Tooltip title={f.module} placement="top" arrow>
                            <Chip size="small" label={f.module} sx={{ maxWidth: 120, borderRadius: 1.5, bgcolor: 'rgba(245,158,11,0.1)', color: '#d97706', fontWeight: 500, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }} />
                          </Tooltip>
                        ) : '-'}
                      </TableCell>
                      <TableCell align="center">{f.chunk_count}</TableCell>
                      <TableCell sx={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <Tooltip title={fmtTime(f.indexed_at)} placement="top" arrow>
                          <span>{fmtTime(f.indexed_at)}</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="center">
                        <StatusBadge status={f.status} />
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title="重新索引">
                          <IconButton size="small" color="warning" onClick={() => doReindex(f.id, f.filename)}>
                            <RefreshIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="删除">
                          <IconButton size="small" color="error" onClick={() => doDelete(f.id, f.filename)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1,
            px: 2,
            py: 1,
            bgcolor: 'rgba(248,250,252,0.95)',
            borderTop: '1px solid',
            borderColor: 'rgba(226,232,240,0.6)',
            backdropFilter: 'blur(6px)',
          }}>
            {/* 左侧：信息 */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 12 }}>
                共 <b>{files.length}</b> 条
                {files.length > 0 && (<>
                  ，第 {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, files.length)} 条
                </>)}
              </Typography>
              {selected.size > 0 && (
                <Chip
                  label={`已选 ${selected.size} 项`}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ height: 22, fontSize: 11, borderRadius: 1.5 }}
                />
              )}
            </Box>

            {/* 中间：分页 */}
            {totalPages > 1 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Button
                  size="small"
                  disabled={page === 1}
                  onClick={() => goToPage(page - 1)}
                  sx={{ minWidth: 32, px: 0.5, fontSize: 12, color: 'text.secondary' }}
                >
                  ‹
                </Button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let p;
                  if (totalPages <= 5) p = i + 1;
                  else if (page <= 3) p = i + 1;
                  else if (page >= totalPages - 2) p = totalPages - 4 + i;
                  else p = page - 2 + i;
                  return (
                    <Button
                      key={p}
                      size="small"
                      onClick={() => goToPage(p)}
                      sx={{
                        minWidth: 30,
                        height: 28,
                        px: 0,
                        fontSize: 12,
                        fontWeight: p === page ? 700 : 400,
                        borderRadius: 1.5,
                        color: p === page ? '#fff' : 'text.secondary',
                        bgcolor: p === page ? 'primary.main' : 'transparent',
                        '&:hover': { bgcolor: p === page ? 'primary.dark' : 'rgba(0,0,0,0.04)' },
                      }}
                    >
                      {p}
                    </Button>
                  );
                })}
                <Button
                  size="small"
                  disabled={page === totalPages}
                  onClick={() => goToPage(page + 1)}
                  sx={{ minWidth: 32, px: 0.5, fontSize: 12, color: 'text.secondary' }}
                >
                  ›
                </Button>
                <Typography variant="caption" sx={{ color: 'text.disabled', ml: 0.5, fontSize: 11 }}>
                  {page}/{totalPages}
                </Typography>
              </Box>
            )}

            {/* 右侧：操作 */}
            <Button
              variant="contained"
              color="error"
              size="small"
              disabled={selected.size === 0}
              onClick={doBatchDelete}
              startIcon={<DeleteIcon sx={{ fontSize: 16 }} />}
              sx={{ height: 30, fontSize: 12, borderRadius: 1.5, textTransform: 'none', boxShadow: 'none' }}
            >
              批量删除
            </Button>
          </Box>

          <ConfirmDialog
            open={confirmDialog.open}
            message={confirmDialog.message}
            onConfirm={confirmDialog.onConfirm}
            onCancel={() => setConfirmDialog({ open: false, message: '', onConfirm: null })}
            danger
          />
        </Paper>
      </Box>
    </Box>
  );
}
