import { useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Divider,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
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
  usePromptTemplates,
  usePromptSkills,
  useSkillCategories,
  usePromptHubSummary,
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
