import React from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AutoAwesomeOutlined,
  DeleteOutline,
  EditOutlined,
  HistoryOutlined,
  ManageSearchOutlined,
  RefreshOutlined,
  SearchOutlined,
} from '@mui/icons-material';
import { SWITCH_TAB_EVENT, SETTINGS_SECTION_EVENT } from '../../../constants/events';
import { useAPIExecution } from '../context';
import {
  formatDuration,
  formatRunTime,
  getRunModeLabel,
  getRunStatusMeta,
} from '../utils';

export default function RunHistory() {
  const {
    projects,
    runHistoryProjectId,
    setRunHistoryProjectId,
    runHistoryStatus,
    setRunHistoryStatus,
    runHistoryKeyword,
    setRunHistoryKeyword,
    fetchHistory,
    backgroundRunId,
    backgroundRunStatus,
    refreshBackgroundRun,
    cancelBackgroundRun,
    runHistory,
    handleDeleteRun,
    handleBatchDeleteRuns,
    handleClearAllRuns,
    loadRunIntoEditor,
    handleReplayRun,
    handleAutoRepairRun,
    automationTasks,
  } = useAPIExecution();

  const [clearAllDialogOpen, setClearAllDialogOpen] = React.useState(false);

  const openGovernanceCenter = () => {
    sessionStorage.setItem('openmelon_settings_section', 'governance');
    window.dispatchEvent(new CustomEvent(SETTINGS_SECTION_EVENT, { detail: { section: 'governance' } }));
    window.dispatchEvent(new CustomEvent(SWITCH_TAB_EVENT, { detail: { tabIndex: 6 } }));
  };

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        border: '1px solid rgba(255, 255, 255, 0.62)',
        bgcolor: 'rgba(255,255,255,0.62)',
        backdropFilter: 'blur(12px)',
        borderRadius: 3,
      }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} gap={1.5} sx={{ mb: 2 }}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <HistoryOutlined color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>执行历史</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">这里只保留 API 执行记录；知识、任务和模板治理已移到设置里的治理中心。</Typography>
        </Box>
        <Button variant="outlined" startIcon={<ManageSearchOutlined />} onClick={openGovernanceCenter}>
          前往治理中心{automationTasks?.length ? `（${automationTasks.length}）` : ''}
        </Button>
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>项目</InputLabel>
          <Select label="项目" value={runHistoryProjectId} onChange={(event) => setRunHistoryProjectId(event.target.value)}>
            <MenuItem value="">全部项目</MenuItem>
            {projects.map((project) => (
              <MenuItem key={project.project_id} value={project.project_id}>{project.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>执行状态</InputLabel>
          <Select label="执行状态" value={runHistoryStatus} onChange={(event) => setRunHistoryStatus(event.target.value)}>
            <MenuItem value="">全部状态</MenuItem>
            <MenuItem value="passed">通过</MenuItem>
            <MenuItem value="failed">失败</MenuItem>
            <MenuItem value="running">执行中</MenuItem>
            <MenuItem value="queued">排队中</MenuItem>
            <MenuItem value="cancelled">已取消</MenuItem>
          </Select>
        </FormControl>
        <TextField
          size="small"
          label="搜索执行记录"
          value={runHistoryKeyword}
          onChange={(event) => setRunHistoryKeyword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') fetchHistory();
          }}
          InputProps={{ endAdornment: <SearchOutlined fontSize="small" color="action" /> }}
          sx={{ minWidth: 220, flex: 1 }}
        />
        <Button variant="outlined" startIcon={<RefreshOutlined />} onClick={fetchHistory}>刷新</Button>
        <Button variant="outlined" color="error" startIcon={<DeleteOutline />} onClick={() => setClearAllDialogOpen(true)}>清空全部</Button>
      </Stack>

      <Dialog
        open={clearAllDialogOpen}
        onClose={() => setClearAllDialogOpen(false)}
        PaperProps={{ sx: { borderRadius: 3, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: 'error.main' }}>危险操作：清空全部</DialogTitle>
        <DialogContent>
          <DialogContentText>
            您确定要清空<strong>所有</strong>的执行历史记录吗？这将会删除库中保存的所有历史，且该操作不可撤销。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearAllDialogOpen(false)} color="inherit" sx={{ borderRadius: 2 }}>取消</Button>
          <Button 
            onClick={() => { 
              handleClearAllRuns(); 
              setClearAllDialogOpen(false); 
            }} 
            color="error" 
            variant="contained" 
            disableElevation 
            sx={{ borderRadius: 2 }}
          >
            确定清空
          </Button>
        </DialogActions>
      </Dialog>

      {backgroundRunId && (
        <Alert
          severity="info"
          action={(
            <Stack direction="row" spacing={1}>
              <Button size="small" onClick={refreshBackgroundRun}>刷新</Button>
              <Button size="small" color="warning" onClick={cancelBackgroundRun}>取消</Button>
            </Stack>
          )}
          sx={{ mb: 2 }}
        >
          后台任务：{backgroundRunId} · {getRunStatusMeta(backgroundRunStatus).label}
        </Alert>
      )}

      <RunHistoryTable
        runHistory={runHistory}
        loadRunIntoEditor={loadRunIntoEditor}
        handleReplayRun={handleReplayRun}
        handleAutoRepairRun={handleAutoRepairRun}
        handleDeleteRun={handleDeleteRun}
        handleBatchDeleteRuns={handleBatchDeleteRuns}
      />
    </Paper>
  );
}

function RunHistoryTable({ runHistory, loadRunIntoEditor, handleReplayRun, handleAutoRepairRun, handleDeleteRun, handleBatchDeleteRuns }) {
  const [selectedIds, setSelectedIds] = React.useState([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState(null); // 'batch' or run_id string

  React.useEffect(() => {
    setSelectedIds([]);
  }, [runHistory]);

  const handleSelectAll = (event) => {
    if (event.target.checked) {
      setSelectedIds(runHistory.map((run) => run.run_id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (event, id) => {
    if (event.target.checked) {
      setSelectedIds((prev) => [...prev, id]);
    } else {
      setSelectedIds((prev) => prev.filter((item) => item !== id));
    }
  };

  const confirmDelete = () => {
    if (deleteTarget === 'batch') {
      handleBatchDeleteRuns(selectedIds);
      setSelectedIds([]);
    } else if (deleteTarget) {
      handleDeleteRun(deleteTarget);
      setSelectedIds((prev) => prev.filter(id => id !== deleteTarget));
    }
    setDeleteDialogOpen(false);
    setDeleteTarget(null);
  };

  if (!runHistory.length) {
    return <Alert severity="info">暂无执行历史。完成一次 API 自动化执行后，这里会展示最近记录。</Alert>;
  }

  const isAllSelected = runHistory.length > 0 && selectedIds.length === runHistory.length;
  const isIndeterminate = selectedIds.length > 0 && selectedIds.length < runHistory.length;

  return (
    <Box>
      {selectedIds.length > 0 && (
        <Stack direction="row" spacing={2} sx={{ mb: 2, px: 2, py: 1, bgcolor: 'error.50', borderRadius: 2, alignItems: 'center' }}>
          <Typography variant="body2" sx={{ color: 'error.main', fontWeight: 600 }}>已选择 {selectedIds.length} 项</Typography>
          <Button 
            size="small" 
            variant="contained" 
            color="error" 
            disableElevation 
            onClick={() => { setDeleteTarget('batch'); setDeleteDialogOpen(true); }} 
            startIcon={<DeleteOutline />}
            sx={{ borderRadius: 2 }}
          >
            批量删除
          </Button>
        </Stack>
      )}
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  color="primary"
                  indeterminate={isIndeterminate}
                  checked={isAllSelected}
                  onChange={handleSelectAll}
                />
              </TableCell>
              <TableCell>执行记录</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>模式</TableCell>
              <TableCell>耗时</TableCell>
              <TableCell>时间</TableCell>
              <TableCell align="right">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {runHistory.map((run) => {
              const statusMeta = getRunStatusMeta(run.status);
              const isSelected = selectedIds.includes(run.run_id);
              return (
                <TableRow key={run.run_id} hover selected={isSelected}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      color="primary"
                      checked={isSelected}
                      onChange={(event) => handleSelectOne(event, run.run_id)}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{run.case_name || run.case_id || run.run_id}</Typography>
                    <Typography variant="caption" color="text.secondary">{run.run_id}</Typography>
                  </TableCell>
                  <TableCell><Chip size="small" color={statusMeta.color} label={statusMeta.label} variant="outlined" /></TableCell>
                  <TableCell>{getRunModeLabel(run.mode)}</TableCell>
                  <TableCell>{formatDuration(run.duration_ms)}</TableCell>
                  <TableCell>{formatRunTime(run.run_at) || '未记录'}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip title="载入到编辑器"><IconButton size="small" onClick={() => loadRunIntoEditor(run.run_id)}><EditOutlined fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="重跑"><IconButton size="small" onClick={() => handleReplayRun(run)}><RefreshOutlined fontSize="small" /></IconButton></Tooltip>
                      {run.status === 'failed' && (
                        <Tooltip title="受控修复"><IconButton size="small" onClick={() => handleAutoRepairRun(run.run_id)}><AutoAwesomeOutlined fontSize="small" /></IconButton></Tooltip>
                      )}
                      <Tooltip title="删除记录">
                        <IconButton size="small" color="error" onClick={() => { setDeleteTarget(run.run_id); setDeleteDialogOpen(true); }}>
                          <DeleteOutline fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog 
        open={deleteDialogOpen} 
        onClose={() => setDeleteDialogOpen(false)}
        PaperProps={{ sx: { borderRadius: 3, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 800 }}>确认删除</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deleteTarget === 'batch' 
              ? `您确定要删除选中的 ${selectedIds.length} 条执行记录吗？` 
              : '您确定要删除这条执行记录吗？'}
            此操作不可撤销。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} color="inherit" sx={{ borderRadius: 2 }}>取消</Button>
          <Button onClick={confirmDelete} color="error" variant="contained" disableElevation sx={{ borderRadius: 2 }}>
            确定删除
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
