import { useState, useEffect, useMemo } from 'react';
import { Box, Typography, Paper, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { graphAPI } from '../services/api';
import { useSnackbar } from '../components/SnackbarProvider';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import { GRAPH_DATA_UPDATED_EVENT } from '../constants/events';
import { emit } from '../utils/eventBus';
import { PAGE_SIZE } from '../features/Manage/constants';
import { filterFiles } from '../features/Manage/utils';
import ImportWorkbench from '../features/Manage/components/ImportWorkbench';
import IndexStats from '../features/Manage/components/IndexStats';
import IndexToolbar from '../features/Manage/components/IndexToolbar';
import IndexTable from '../features/Manage/components/IndexTable';
import IndexPagination from '../features/Manage/components/IndexPagination';

// Hooks
import { 
  useFileList, 
  useFileStats, 
  useTaskStatus, 
  useFileActions, 
  useUploadMutation 
} from '../features/Manage/hooks/useManage';

export default function ManagePage() {
  const theme = useTheme();
  const showSnackbar = useSnackbar();
  const isNarrow = useMediaQuery(theme.breakpoints.down('lg'));

  // 1. 基础 UI 状态
  const [selected, setSelected] = useState(new Set());
  const [dateFilter, setDateFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, message: '', onConfirm: null });

  // 2. 上传相关状态
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadDocType, setUploadDocType] = useState('');
  const [uploadModule, setUploadModule] = useState('');
  const [filters, setFilters] = useState({ doc_types: [], modules: [] });

  // 3. 使用 TanStack Query
  const { data: allFiles = [], refetch: refetchFiles, isLoading: isFilesLoading } = useFileList();
  const stats = useFileStats();
  const { data: taskStatus } = useTaskStatus(activeTaskId);
  const { deleteFile, reindexFile } = useFileActions();
  const uploadMutation = useUploadMutation();

  // 过滤逻辑
  const filteredFiles = useMemo(() => {
    return filterFiles(allFiles, { dateFilter, searchText, statusFilter });
  }, [allFiles, dateFilter, searchText, statusFilter]);

  useEffect(() => {
    graphAPI.getFilters().then(setFilters).catch(() => {});
  }, []);

  // 响应式处理任务进度
  useEffect(() => {
    if (!taskStatus) return;

    if (taskStatus.status === 'processing' || taskStatus.status === 'pending') {
      const pct = 30 + Math.round((taskStatus.processed / Math.max(taskStatus.total_files, 1)) * 60);
      setUploadProgress({ pct, text: `解析中... (${taskStatus.processed}/${taskStatus.total_files})` });
    } else if (taskStatus.status === 'completed') {
      setUploadProgress({ pct: 100, text: '导入成功！' });
      emit(GRAPH_DATA_UPDATED_EVENT);
      showSnackbar('文档处理完成', { severity: 'success' });
      setTimeout(() => {
        setUploadProgress(null);
        setActiveTaskId(null);
        setSelectedFiles([]);
        refetchFiles();
      }, 2000);
    } else if (taskStatus.status === 'failed') {
      setUploadProgress({ pct: 100, text: '处理失败' });
      showSnackbar('任务处理异常', { severity: 'error' });
      setTimeout(() => setUploadProgress(null), 3000);
    }
  }, [taskStatus]);

  const handleUpload = async () => {
    if (!selectedFiles.length) return;
    setUploadProgress({ pct: 10, text: '上传中...' });
    try {
      const res = await uploadMutation.mutateAsync({ files: selectedFiles, docType: uploadDocType, module: uploadModule });
      setActiveTaskId(res.task_id);
    } catch (err) {
      setUploadProgress(null);
      showSnackbar('上传失败', { severity: 'error' });
    }
  };

  const requestDelete = (id, name) => {
    setConfirmDialog({
      open: true,
      message: `确认删除「${name}」的索引？`,
      onConfirm: async () => {
        setConfirmDialog({ open: false });
        await deleteFile.mutateAsync(id);
      }
    });
  };

  // 分页计算
  const totalPages = Math.max(1, Math.ceil(filteredFiles.length / PAGE_SIZE));
  const paginatedFiles = filteredFiles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: { xs: 2, md: 3 }, gap: 3 }}>
      <PageHeader title="导入管理" subtitle="管理您的知识资产，支持多格式文档上传与自动语义切片。" />

      <Box sx={{ display: 'flex', gap: 2, flexDirection: isNarrow ? 'column' : 'row', flex: 1, minHeight: 0 }}>
        <Box sx={{ width: isNarrow ? '100%' : 360 }}>
          <ImportWorkbench
            filters={filters}
            selectedFiles={selectedFiles}
            setSelectedFiles={setSelectedFiles}
            uploadDocType={uploadDocType}
            setUploadDocType={setUploadDocType}
            uploadModule={uploadModule}
            setUploadModule={setUploadModule}
            uploadProgress={uploadProgress}
            doUpload={handleUpload}
            handleDrop={(list) => setSelectedFiles(prev => [...prev, ...Array.from(list)])}
          />
        </Box>

        <Paper 
          elevation={0} 
          sx={{ 
            flex: 1, display: 'flex', flexDirection: 'column', borderRadius: 4, overflow: 'hidden',
            background: 'rgba(255, 255, 255, 0.7)', backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.4)',
            boxShadow: '0 8px 32px rgba(15, 23, 42, 0.04)'
          }}
        >
          <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider', background: 'linear-gradient(to right, #f8fafc, #f1f5f9)' }}>
            <Typography variant="subtitle2" fontWeight={700}>资产清单</Typography>
            <Typography variant="caption" color="text.secondary">共索引 {allFiles.length} 个文件，涵盖 {stats.modules} 个模块。</Typography>
          </Box>

          <IndexStats stats={stats} />
          <IndexToolbar
            dateFilter={dateFilter} setDateFilter={setDateFilter}
            statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            searchText={searchText} setSearchText={setSearchText}
            loadFiles={refetchFiles}
          />

          <IndexTable
            paginatedFiles={paginatedFiles}
            selected={selected}
            toggleAll={(e) => setSelected(e.target.checked ? new Set(filteredFiles.map(f => f.id)) : new Set())}
            toggleOne={(id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
            doDelete={requestDelete}
            doReindex={(id) => reindexFile.mutate(id)}
          />

          <IndexPagination
            page={page} totalPages={totalPages}
            goToPage={setPage}
            files={filteredFiles} selected={selected}
            doBatchDelete={async () => {
              for (const id of selected) await deleteFile.mutateAsync(id);
              setSelected(new Set());
            }}
          />
        </Paper>
      </Box>

      <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog({ open: false })} danger confirmText="删除" />
    </Box>
  );
}
