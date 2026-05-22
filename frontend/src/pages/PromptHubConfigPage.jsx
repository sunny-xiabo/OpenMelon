import { useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  Divider,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import {
  AutoFixHighOutlined,
  RefreshOutlined,
  SecurityOutlined,
} from '@mui/icons-material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import { useSnackbar } from '../components/SnackbarProvider';
import { promptHubAPI } from '../services/api';
import { CATEGORY_FORM, SKILL_FORM, TEMPLATE_FORM } from '../features/PromptHub/constants';
import { filterPromptHubRecords, filterSkills } from '../features/PromptHub/utils';
import PromptHubEditorDialog from '../features/PromptHub/components/PromptHubEditorDialog';
import SkillCategoryDialog from '../features/PromptHub/components/SkillCategoryDialog';
import RecordTable from '../features/PromptHub/components/RecordTable';
import PromptHubSummaryCards, { PromptHubWritingGuide } from '../features/PromptHub/components/PromptHubSummaryCards';

// Hooks
import {
  PROMPT_HUB_KEYS,
  usePromptTemplates,
  usePromptSkills,
  useSkillCategories,
  usePromptHubSummary,
  usePromptHubSafetyRecommendations,
  useSavePromptRecord,
  useDeletePromptRecord,
  useSaveCategory,
  useDeleteCategory,
} from '../features/PromptHub/hooks/usePromptHub';

export default function PromptHubConfigPage({ embedded = false }) {
  const showSnackbar = useSnackbar();

  // UI 交互状态
  const [activePanel, setActivePanel] = useState('templates');
  const [templateKeyword, setTemplateKeyword] = useState('');
  const [skillKeyword, setSkillKeyword] = useState('');
  const [skillCategoryFilter, setSkillCategoryFilter] = useState('all');
  const [editor, setEditor] = useState({ open: false, type: 'template', mode: 'create', recordId: '', form: TEMPLATE_FORM });
  const [categoryDialog, setCategoryDialog] = useState({ open: false, form: CATEGORY_FORM });
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });

  // 使用 TanStack Query
  const { data: templates = [], isLoading: isTemplatesLoading, refetch: refetchTemplates } = usePromptTemplates();
  const { data: skills = [], isLoading: isSkillsLoading, refetch: refetchSkills } = usePromptSkills();
  const { data: skillCategories = [], refetch: refetchCategories } = useSkillCategories();
  const { data: summary } = usePromptHubSummary();

  const saveRecordMutation = useSavePromptRecord(editor.type, editor.mode);
  const deleteRecordMutation = useDeletePromptRecord(editor.type);
  const saveCategoryMutation = useSaveCategory();
  const deleteCategoryMutation = useDeleteCategory();

  const loading = isTemplatesLoading || isSkillsLoading;
  const saving = saveRecordMutation.isPending || saveCategoryMutation.isPending;

  const loadData = () => {
    refetchTemplates();
    refetchSkills();
    refetchCategories();
  };

  const visibleTemplates = useMemo(() => filterPromptHubRecords(templates, templateKeyword), [templateKeyword, templates]);
  const visibleSkills = useMemo(() => filterSkills(skills, skillKeyword, skillCategoryFilter), [skillCategoryFilter, skillKeyword, skills]);

  const openCreate = (type) => {
    setEditor({
      open: true,
      type,
      mode: 'create',
      recordId: '',
      form: type === 'template'
        ? { ...TEMPLATE_FORM }
        : { ...SKILL_FORM, category: skillCategories[0]?.name || '覆盖增强' },
    });
  };

  const openEdit = (type, record) => {
    const resolvedCategoryName = type === 'skill'
      ? (skillCategories.find((i) => i.id === record.category)?.name || record.category || '')
      : '';
    setEditor({
      open: true,
      type,
      mode: 'edit',
      recordId: record.id,
      form: { ...record, category: type === 'skill' ? resolvedCategoryName : record.category },
    });
  };

  const resolveSkillCategoryId = async (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return skillCategories[0]?.id || 'coverage';
    const matched = skillCategories.find((i) => i.id === normalized || i.name === normalized);
    if (matched) return matched.id;
    // 如果是新分类，先创建
    const created = await promptHubAPI.createSkillCategory({ name: normalized });
    return created.record.id;
  };

  const handleSaveRecord = async () => {
    try {
      const payload = { ...editor.form, sort_order: Number(editor.form.sort_order || 100) };
      if (editor.type === 'skill') {
        payload.category = await resolveSkillCategoryId(editor.form.category);
      }
      await saveRecordMutation.mutateAsync({ id: editor.recordId, payload });
      setEditor({ ...editor, open: false });
    } catch (err) { /* Hook handles snackbar */ }
  };

  const requestDelete = (type, record) => {
    setConfirmDialog({
      open: true,
      title: `删除${type === 'template' ? '模板' : '技能'}`,
      message: `确认删除「${record.name}」？`,
      onConfirm: async () => {
        setConfirmDialog({ open: false });
        await deleteRecordMutation.mutateAsync(record.id);
      },
    });
  };

  const requestDeleteCategory = (record) => {
    setConfirmDialog({
      open: true,
      title: '删除技能分类',
      message: `确认删除分类「${record.name}」？`,
      onConfirm: async () => {
        setConfirmDialog({ open: false });
        await deleteCategoryMutation.mutateAsync(record.id);
      },
    });
  };

  const content = (
    <>
      {!embedded && (
        <PageHeader title="Prompt & Skill Hub" subtitle="管理测试用例生成模板、专项技能和默认策略。">
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={() => openCreate('template')}>新增模板</Button>
            <Button variant="outlined" onClick={loadData}>刷新</Button>
          </Stack>
        </PageHeader>
      )}

      <Box sx={{ p: embedded ? 2 : 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {embedded && (
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>Prompt & Skill Hub</Typography>
              <Typography variant="caption" color="text.secondary">配置 AI 生成的核心策略。</Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button variant="contained" size="small" onClick={() => openCreate('template')}>新增模板</Button>
              <Button variant="outlined" size="small" onClick={loadData}>刷新</Button>
            </Stack>
          </Box>
        )}

        <PromptHubSummaryCards summary={summary} />
        <PromptHubSafetyPanel
          templates={templates}
          skills={skills}
          onOpenRecord={(type, record) => {
            setActivePanel(type === 'template' ? 'templates' : 'skills');
            openEdit(type, record);
          }}
        />
        <PromptHubWritingGuide />

        <Paper variant="outlined" sx={{ borderRadius: 2.5, bgcolor: 'rgba(255, 255, 255, 0.3)', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.4)' }}>
          <Tabs 
            value={activePanel} 
            onChange={(_, v) => setActivePanel(v)} 
            variant="fullWidth" 
            sx={{ 
              bgcolor: 'rgba(255, 255, 255, 0.5)',
              borderBottom: '1px solid',
              borderColor: 'divider'
            }}
          >
            <Tab value="templates" label={`模板管理 (${templates.length})`} />
            <Tab value="skills" label={`技能管理 (${skills.length})`} />
          </Tabs>

          {activePanel === 'templates' && (
            <Box sx={{ p: 2 }}>
              <Stack direction="row" spacing={1} justifyContent="space-between" sx={{ mb: 2 }}>
                <TextField size="small" placeholder="搜索模板..." value={templateKeyword} onChange={(e) => setTemplateKeyword(e.target.value)} sx={{ width: 300 }} />
                <Button variant="contained" size="small" onClick={() => openCreate('template')}>新增模板</Button>
              </Stack>
              <RecordTable rows={visibleTemplates} type="template" onEdit={(i) => openEdit('template', i)} onDelete={(i) => requestDelete('template', i)} />
            </Box>
          )}

          {activePanel === 'skills' && (
            <Box sx={{ p: 2 }}>
              <Stack direction="row" spacing={1} justifyContent="space-between" sx={{ mb: 2 }}>
                <TextField size="small" placeholder="搜索技能..." value={skillKeyword} onChange={(e) => setSkillKeyword(e.target.value)} sx={{ flex: 1 }} />
                <Autocomplete
                  size="small"
                  options={[{ id: 'all', name: '全部分类' }, ...skillCategories]}
                  getOptionLabel={(o) => o.name}
                  value={[{ id: 'all', name: '全部分类' }, ...skillCategories].find(i => i.id === skillCategoryFilter)}
                  onChange={(_, v) => setSkillCategoryFilter(v?.id || 'all')}
                  sx={{ width: 200 }}
                  renderInput={(params) => <TextField {...params} placeholder="按分类" />}
                />
                <Button variant="outlined" size="small" color="success" onClick={() => openCreate('skill')}>新增技能</Button>
              </Stack>
              <RecordTable rows={visibleSkills} type="skill" skillCategories={skillCategories} onEdit={(i) => openEdit('skill', i)} onDelete={(i) => requestDelete('skill', i)} />
              <Divider sx={{ my: 2 }} />
              <Stack direction="row" spacing={1} flexWrap="wrap">
                {skillCategories.map((i) => (
                  <Chip key={i.id} label={i.name} variant={i.is_default ? 'outlined' : 'filled'} color={i.is_default ? 'default' : 'success'} onDelete={i.is_default ? undefined : () => requestDeleteCategory(i)} />
                ))}
                <Button size="small" variant="text" onClick={() => setCategoryDialog({ open: true, form: { ...CATEGORY_FORM } })}>+ 新增分类</Button>
              </Stack>
            </Box>
          )}
        </Paper>
      </Box>

      <PromptHubEditorDialog
        open={editor.open} title={`${editor.mode === 'create' ? '新增' : '编辑'}${editor.type === 'template' ? '模板' : '技能'}`}
        form={editor.form} skillCategories={skillCategories} type={editor.type} saving={saving}
        onChange={(patch) => setEditor(prev => ({ ...prev, form: { ...prev.form, ...patch } }))}
        onClose={() => setEditor({ ...editor, open: false })}
        onSubmit={handleSaveRecord}
      />
      <SkillCategoryDialog
        open={categoryDialog.open} form={categoryDialog.form} saving={saving}
        onChange={(patch) => setCategoryDialog(prev => ({ ...prev, form: { ...prev.form, ...patch } }))}
        onClose={() => setCategoryDialog({ ...categoryDialog, open: false })}
        onSubmit={() => saveCategoryMutation.mutate(categoryDialog.form)}
      />
      <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog({ open: false })} danger confirmText="删除" />
    </>
  );

  return embedded ? content : <Box sx={{ flex: 1, overflow: 'auto', p: 2, bgcolor: 'transparent' }}>{content}</Box>;
}

const safetySeverityMeta = {
  error: { label: '严重', color: 'error' },
  warning: { label: '警告', color: 'warning' },
  info: { label: '建议', color: 'info' },
};

const safetyRiskLabels = {
  low: '低风险',
  medium: '需复核',
  high: '高风险',
};

function PromptHubSafetyPanel({ templates, skills, onOpenRecord }) {
  const queryClient = useQueryClient();
  const showSnackbar = useSnackbar();
  const [confirmDialog, setConfirmDialog] = useState({ open: false });
  const safetyQuery = usePromptHubSafetyRecommendations();
  const actionMutation = useMutation({
    mutationFn: promptHubAPI.executeSafetyAction,
    onSuccess: async (data) => {
      showSnackbar(data?.message || 'Prompt Hub 安全动作已执行', { severity: 'success' });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: PROMPT_HUB_KEYS.templates }),
        queryClient.invalidateQueries({ queryKey: PROMPT_HUB_KEYS.skills }),
        queryClient.invalidateQueries({ queryKey: PROMPT_HUB_KEYS.safetyRecommendations }),
      ]);
    },
    onError: (error) => {
      showSnackbar(error.message || 'Prompt Hub 安全动作执行失败', { severity: 'error' });
    },
  });
  const recommendations = safetyQuery.data?.items || [];
  const visibleItems = recommendations.slice(0, 3);

  const findRecord = (kind, recordId) => {
    const source = kind === 'template' ? templates : skills;
    return source.find((item) => item.id === recordId);
  };

  const executeAction = async (recommendation, action, confirm = false) => {
    if (action.frontend_only) {
      const record = findRecord(action.kind || recommendation.related_record_kind, action.target_id || recommendation.related_record_id);
      if (record) {
        onOpenRecord?.(action.kind || recommendation.related_record_kind, record);
      } else {
        showSnackbar('未找到对应 Prompt Hub 记录，请刷新后重试', { severity: 'warning' });
      }
      return;
    }
    await actionMutation.mutateAsync({
      action: action.action || action.id,
      recordKind: action.kind || recommendation.related_record_kind,
      recordId: action.target_id || recommendation.related_record_id,
      confirm,
      params: action.params || {},
    });
  };

  const requestAction = (recommendation, action) => {
    if (!action.requires_confirmation) {
      executeAction(recommendation, action, false);
      return;
    }
    setConfirmDialog({
      open: true,
      title: '确认停用 Prompt Hub 配置',
      message: `将执行「${action.label}」。\n\n来源建议：${recommendation.title}\n原因：${recommendation.reason}`,
      confirmText: action.label,
      danger: true,
      onConfirm: async () => {
        setConfirmDialog({ open: false });
        await executeAction(recommendation, action, true);
      },
    });
  };

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden', bgcolor: 'rgba(255,255,255,0.48)' }}>
      <Box sx={{ p: 1.75, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} gap={1}>
          <Stack direction="row" spacing={1} alignItems="center">
            <SecurityOutlined color="primary" />
            <Box>
              <Typography variant="subtitle2" fontWeight={800}>Prompt Hub 安全建议</Typography>
              <Typography variant="caption" color="text.secondary">扫描模板/技能中的注入信号，生成可解释建议和受控停用动作。</Typography>
            </Box>
          </Stack>
          <Button size="small" variant="outlined" startIcon={<RefreshOutlined />} onClick={() => safetyQuery.refetch()} disabled={safetyQuery.isFetching}>
            刷新安全扫描
          </Button>
        </Stack>
      </Box>
      {safetyQuery.isFetching && <LinearProgress />}
      <Box sx={{ p: 1.75 }}>
        {safetyQuery.isError ? (
          <Alert severity="error">{safetyQuery.error?.message || 'Prompt Hub 安全建议加载失败'}</Alert>
        ) : !recommendations.length && !safetyQuery.isLoading ? (
          <Alert severity="success">当前模板和技能未发现明显 Prompt Injection 风险信号。</Alert>
        ) : (
          <Stack spacing={1.25}>
            {visibleItems.map((recommendation) => {
              const meta = safetySeverityMeta[recommendation.severity] || safetySeverityMeta.info;
              return (
                <Box key={recommendation.id} sx={{ p: 1.25, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'rgba(255,255,255,0.62)' }}>
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Chip size="small" color={meta.color} label={meta.label} variant="outlined" />
                      <Typography variant="body2" fontWeight={800}>{recommendation.title}</Typography>
                      <Chip size="small" label={safetyRiskLabels[recommendation.risk_level] || recommendation.risk_level} sx={{ borderRadius: 1.5 }} />
                    </Stack>
                    <Typography variant="caption" color="text.secondary">{recommendation.reason}</Typography>
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                      {(recommendation.evidence || []).slice(0, 3).map((item) => (
                        <Chip key={`${recommendation.id}-${item.label}`} size="small" label={`${item.label}: ${item.value}`} sx={{ borderRadius: 1.5 }} />
                      ))}
                    </Stack>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {(recommendation.actions || []).map((action) => (
                        <Button
                          key={`${recommendation.id}-${action.id}`}
                          size="small"
                          variant={action.risk_level === 'high' ? 'contained' : 'outlined'}
                          color={action.risk_level === 'high' ? 'warning' : 'primary'}
                          startIcon={<AutoFixHighOutlined />}
                          disabled={actionMutation.isPending}
                          onClick={() => requestAction(recommendation, action)}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </Stack>
                  </Stack>
                </Box>
              );
            })}
            {recommendations.length > visibleItems.length && (
              <Typography variant="caption" color="text.secondary">还有 {recommendations.length - visibleItems.length} 条安全建议，请优先处理高风险项。</Typography>
            )}
          </Stack>
        )}
      </Box>
      <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog({ open: false })} />
    </Paper>
  );
}
