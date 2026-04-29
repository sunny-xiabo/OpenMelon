import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { fileAPI, uploadAPI, graphAPI } from '../services/api';
import { useSnackbar } from '../components/SnackbarProvider';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import { GRAPH_DATA_UPDATED_EVENT, PAGE_SIZE } from '../features/Manage/constants';
import { buildFileStats, filterFiles } from '../features/Manage/utils';
import ImportWorkbench from '../features/Manage/components/ImportWorkbench';
import IndexStats from '../features/Manage/components/IndexStats';
import IndexToolbar from '../features/Manage/components/IndexToolbar';
import IndexTable from '../features/Manage/components/IndexTable';
import IndexPagination from '../features/Manage/components/IndexPagination';

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

  const loadFiles = async () => {
    try {
      const data = await fileAPI.list();
      const all = data.files || [];
      setFiles(filterFiles(all, { dateFilter, searchText, statusFilter }));
      setStats(buildFileStats(all));
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

  const totalPages = Math.max(1, Math.ceil(files.length / PAGE_SIZE));
  const paginatedFiles = files.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const goToPage = (p) => {
    if (p < 1 || p > totalPages) return;
    setPage(p);
    setSelected(new Set());
  };

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', p: 1.5, gap: 1.5, bgcolor: 'background.default' }}>
      <PageHeader title="导入管理" subtitle="上传文档、跟踪索引结果，管理知识库内容。" />

      <Box sx={{ display: 'flex', gap: 1.5, flexDirection: isNarrow ? 'column' : 'row', minHeight: 0, flex: 1 }}>
        <Box sx={{ width: isNarrow ? '100%' : 360, minWidth: 0 }}>
          <ImportWorkbench
            dragOver={dragOver}
            filters={filters}
            handleDrop={handleDrop}
            selectedFiles={selectedFiles}
            setDragOver={setDragOver}
            setSelectedFiles={setSelectedFiles}
            setUploadDocType={setUploadDocType}
            setUploadMode={setUploadMode}
            setUploadModule={setUploadModule}
            uploadDocType={uploadDocType}
            uploadMode={uploadMode}
            uploadModule={uploadModule}
            uploadProgress={uploadProgress}
            doUpload={doUpload}
          />
        </Box>

        <Paper elevation={0} sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
          <Box sx={{ px: 2.5, py: 1.75, borderBottom: '1px solid', borderColor: 'divider', background: 'linear-gradient(90deg, rgba(16,185,129,0.06) 0%, rgba(52,211,153,0.03) 100%)' }}>
            <Typography variant="subtitle2" sx={{ color: '#1e293b', fontWeight: 600 }}>索引清单</Typography>
            <Typography variant="caption" sx={{ color: '#64748b' }}>
              查看导入结果、筛选文件状态，并按文件执行重新索引或删除操作。
            </Typography>
          </Box>

          <IndexStats stats={stats} />

          <IndexToolbar
            dateFilter={dateFilter}
            loadFiles={loadFiles}
            searchText={searchText}
            setDateFilter={setDateFilter}
            setSearchText={setSearchText}
            setStatusFilter={setStatusFilter}
            statusFilter={statusFilter}
          />

          <IndexTable
            doDelete={doDelete}
            doReindex={doReindex}
            paginatedFiles={paginatedFiles}
            selected={selected}
            toggleAll={toggleAll}
            toggleOne={toggleOne}
          />

          <IndexPagination
            doBatchDelete={doBatchDelete}
            files={files}
            goToPage={goToPage}
            page={page}
            selected={selected}
            totalPages={totalPages}
          />

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
