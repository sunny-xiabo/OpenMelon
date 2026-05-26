import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  BookmarkAddOutlined,
  ContentCopyOutlined,
  DeleteOutline,
  FilterListOffOutlined,
  PlayCircleOutlineOutlined,
  RefreshOutlined,
  SearchOutlined,
} from '@mui/icons-material';
import { apiExecutionAPI } from '../../../api/execution';
import { useSnackbar } from '../../../components/SnackbarProvider';
import { useAPIExecution } from '../context';
import { EXEC_KEYS, useFlowTemplates } from '../hooks/useAPIExecutionQueries';
import { formatDuration, getRunStatusMeta } from '../utils';

const DEFAULT_TAG = 'agent-task';

const formatTime = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

const formatPercent = (value) => {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return '0%';
  const percent = numericValue <= 1 ? numericValue * 100 : numericValue;
  return `${Math.round(percent)}%`;
};

const getTaskSourceLabel = (script = {}) => {
  if (script.agent_source === 'api_asset_catalog') return 'Agent 资产生成';
  if (script.flow_template_id) return '任务复用';
  return 'DSL 编排';
};

export default function SavedTestTasksPanel() {
  const {
    parsedScript,
    projectName,
    requestConfirm,
    selectedProjectId,
    setActiveStep,
    setDslText,
    setRunStepId,
  } = useAPIExecution();
  const showSnackbar = useSnackbar();
  const queryClient = useQueryClient();
  const { data: templates = [], isLoading, refetch } = useFlowTemplates(selectedProjectId);
  const [saveDialogOpen, setSaveDialogOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({ name: '', description: '', tags: DEFAULT_TAG });
  const [keyword, setKeyword] = React.useState('');
  const [tagFilter, setTagFilter] = React.useState('');

  const projectTasks = React.useMemo(() => (
    templates
      .filter((template) => !template.project_id || template.project_id === selectedProjectId)
      .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
  ), [selectedProjectId, templates]);

  const allTags = React.useMemo(() => (
    Array.from(new Set(projectTasks.flatMap((task) => task.tags || []))).sort()
  ), [projectTasks]);

  const filteredTasks = React.useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return projectTasks.filter((task) => {
      const tags = task.tags || [];
      if (tagFilter && !tags.includes(tagFilter)) return false;
      if (!kw) return true;
      const stepText = (task.script?.steps || [])
        .map((step) => `${step.method || ''} ${step.path || ''} ${step.name || ''}`)
        .join(' ');
      const text = [
        task.name,
        task.description,
        task.version,
        task.scope,
        task.script?.name,
        stepText,
        ...tags,
      ].join(' ').toLowerCase();
      return text.includes(kw);
    });
  }, [keyword, projectTasks, tagFilter]);

  const hasFilter = Boolean(keyword.trim() || tagFilter);

  const openSaveDialog = () => {
    const scriptName = parsedScript?.name || `${projectName || 'API'} 测试任务`;
    setForm({
      name: scriptName,
      description: parsedScript?.agent_source === 'api_asset_catalog'
        ? '由 Agent 基于项目接口资产生成，可复用为项目级测试任务。'
        : '',
      tags: Array.from(new Set([DEFAULT_TAG, ...(parsedScript?.flow_template_tags || [])])).join(', '),
    });
    setSaveDialogOpen(true);
  };

  const invalidateTemplates = () => queryClient.invalidateQueries({ queryKey: EXEC_KEYS.flowTemplates(selectedProjectId || '') });

  const saveCurrentTask = async () => {
    if (!selectedProjectId) {
      showSnackbar('请选择项目后再保存测试任务', 'warning');
      return;
    }
    if (!parsedScript?.steps?.length) return;
    setSaving(true);
    try {
      const tags = form.tags.split(',').map((item) => item.trim()).filter(Boolean);
      const name = form.name.trim() || parsedScript.name || 'API 测试任务';
      const saved = await apiExecutionAPI.saveFlowTemplate({
        project_id: selectedProjectId || '',
        name,
        description: form.description.trim(),
        tags,
        script: {
          ...parsedScript,
          flow_template_id: '',
          flow_template_name: name,
          flow_template_tags: tags,
        },
      });
      if (saved.script) {
        setDslText(JSON.stringify(saved.script, null, 2));
      }
      await invalidateTemplates();
      setSaveDialogOpen(false);
      showSnackbar(`测试任务「${saved.name}」已保存`, 'success');
    } catch (error) {
      showSnackbar(error.message || '测试任务保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const loadTask = async (task) => {
    if (!task?.script?.steps?.length) return;
    const confirmed = await requestConfirm(`载入测试任务「${task.name}」会替换当前 DSL，继续？`);
    if (!confirmed) return;
    const nextScript = {
      ...task.script,
      flow_template_id: task.template_id || '',
      flow_template_name: task.name || task.script.name || '',
      flow_template_tags: task.tags || [],
    };
    setDslText(JSON.stringify(nextScript, null, 2));
    setRunStepId(nextScript.steps?.[0]?.id || '');
    setActiveStep(2);
    showSnackbar(`已载入测试任务「${task.name}」`, 'success');
  };

  const deleteTask = async (task) => {
    const confirmed = await requestConfirm(`确认删除测试任务「${task.name}」？`);
    if (!confirmed) return;
    try {
      await apiExecutionAPI.deleteFlowTemplate(task.template_id);
      await invalidateTemplates();
      showSnackbar('测试任务已删除', 'success');
    } catch (error) {
      showSnackbar(error.message || '测试任务删除失败', 'error');
    }
  };

  const duplicateTask = async (task) => {
    if (!selectedProjectId) {
      showSnackbar('请选择项目后再复制测试任务', 'warning');
      return;
    }
    if (!task?.script?.steps?.length) return;
    try {
      const name = `${task.name || '测试任务'} 副本`;
      const tags = Array.from(new Set([...(task.tags || []), DEFAULT_TAG]));
      const duplicated = await apiExecutionAPI.saveFlowTemplate({
        project_id: selectedProjectId,
        name,
        description: task.description || '',
        tags,
        script: {
          ...task.script,
          flow_template_id: '',
          flow_template_name: name,
          flow_template_tags: tags,
        },
      });
      await invalidateTemplates();
      showSnackbar(`已复制测试任务「${duplicated.name}」`, 'success');
    } catch (error) {
      showSnackbar(error.message || '测试任务复制失败', 'error');
    }
  };

  return (
    <>
      <Paper sx={{ p: 2.5, borderRadius: 1, border: '1px solid rgba(15, 23, 42, 0.08)', bgcolor: '#ffffff', boxShadow: 'none' }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle1" fontWeight={850}>项目测试任务</Typography>
              <Typography variant="caption" color="text.secondary">
                保存 Agent 生成的 DSL，后续可直接载入复用，不必每次重新选择接口。
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button size="small" variant="outlined" startIcon={<RefreshOutlined />} disabled={!selectedProjectId} onClick={() => refetch()}>
                刷新
              </Button>
              <Button
                size="small"
                variant="contained"
                startIcon={<BookmarkAddOutlined />}
                disabled={!selectedProjectId || !parsedScript?.steps?.length}
                onClick={openSaveDialog}
              >
                保存当前 DSL
              </Button>
            </Stack>
          </Stack>

          {!selectedProjectId && (
            <Alert severity="info">请选择项目后查看可复用测试任务。</Alert>
          )}
          {selectedProjectId && !isLoading && !projectTasks.length && (
            <Alert severity="info">暂无测试任务。先按模块或接口生成 DSL，再点击“保存当前 DSL”。</Alert>
          )}

          {selectedProjectId && !!projectTasks.length && (
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', md: 'center' }}>
              <TextField
                size="small"
                label="搜索任务"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchOutlined fontSize="small" />
                    </InputAdornment>
                  ),
                }}
                sx={{ flex: 1, minWidth: { md: 260 } }}
              />
              <TextField
                size="small"
                select
                label="标签"
                value={tagFilter}
                onChange={(event) => setTagFilter(event.target.value)}
                sx={{ minWidth: { md: 160 } }}
              >
                <MenuItem value="">全部标签</MenuItem>
                {allTags.map((tag) => <MenuItem key={tag} value={tag}>{tag}</MenuItem>)}
              </TextField>
              <Button
                size="small"
                variant="text"
                startIcon={<FilterListOffOutlined />}
                disabled={!hasFilter}
                onClick={() => {
                  setKeyword('');
                  setTagFilter('');
                }}
              >
                清空筛选
              </Button>
              <Chip size="small" label={`匹配 ${filteredTasks.length}/${projectTasks.length}`} variant="outlined" />
            </Stack>
          )}

          {selectedProjectId && !!projectTasks.length && !filteredTasks.length && (
            <Alert severity="info">没有匹配的测试任务，请调整搜索词或标签筛选。</Alert>
          )}

          {!!filteredTasks.length && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
              {filteredTasks.map((task) => {
                const performance = task.performance_snapshot || {};
                const runCount = Number(performance.run_count || 0);
                const statusMeta = getRunStatusMeta(performance.last_status);
                return (
                  <Paper key={task.template_id} elevation={0} sx={{ p: 1.5, borderRadius: 1, border: '1px solid rgba(15, 23, 42, 0.08)', bgcolor: '#f8fafc' }}>
                    <Stack spacing={1}>
                      <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={850} noWrap>{task.name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {(task.script?.steps || []).length} 步 · 版本 {task.version || 'v1'} · {task.scope || (task.project_id ? '项目内' : '通用')}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {getTaskSourceLabel(task.script)}{task.updated_at ? ` · 更新 ${formatTime(task.updated_at)}` : ''}
                          </Typography>
                        </Box>
                        <Chip size="small" label={task.project_id ? '项目级' : '通用'} color={task.project_id ? 'primary' : 'default'} variant="outlined" />
                      </Stack>

                      {!!task.description && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {task.description}
                        </Typography>
                      )}

                      <Box sx={{ p: 1, borderRadius: 1, bgcolor: '#ffffff', border: '1px solid rgba(15, 23, 42, 0.06)' }}>
                        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
                          <Chip size="small" label={runCount ? `${runCount} 次执行` : '未执行'} variant="outlined" />
                          {runCount > 0 && (
                            <>
                              <Chip size="small" color={statusMeta.color} label={`最近${statusMeta.label}`} variant="outlined" />
                              <Chip size="small" label={`通过率 ${formatPercent(performance.pass_rate)}`} variant="outlined" />
                            </>
                          )}
                        </Stack>
                        {runCount > 0 && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                            最近执行 {performance.last_case_name ? `${performance.last_case_name} · ` : ''}{formatTime(performance.last_run_at) || '未记录'}
                            {performance.last_duration_ms ? ` · ${formatDuration(performance.last_duration_ms)}` : ''}
                            {performance.last_run_id ? ` · ${performance.last_run_id}` : ''}
                          </Typography>
                        )}
                      </Box>

                      {!!task.tags?.length && (
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                          {task.tags.slice(0, 5).map((tag) => <Chip key={tag} size="small" label={tag} variant="outlined" />)}
                        </Stack>
                      )}
                      <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
                        <Button size="small" variant="contained" startIcon={<PlayCircleOutlineOutlined />} onClick={() => loadTask(task)}>
                          载入
                        </Button>
                        <Button size="small" variant="outlined" startIcon={<ContentCopyOutlined />} onClick={() => duplicateTask(task)}>
                          复制
                        </Button>
                        <Button size="small" color="error" startIcon={<DeleteOutline />} onClick={() => deleteTask(task)}>
                          删除
                        </Button>
                      </Stack>
                    </Stack>
                  </Paper>
                );
              })}
            </Box>
          )}
        </Stack>
      </Paper>

      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>保存为项目测试任务</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              size="small"
              label="任务名称"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              fullWidth
              autoFocus
            />
            <TextField
              size="small"
              label="说明"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              fullWidth
              multiline
              minRows={3}
            />
            <TextField
              size="small"
              label="标签"
              value={form.tags}
              onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
              helperText="多个标签用英文逗号分隔。"
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>取消</Button>
          <Button variant="contained" disabled={saving || !parsedScript?.steps?.length} onClick={saveCurrentTask}>
            保存
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
