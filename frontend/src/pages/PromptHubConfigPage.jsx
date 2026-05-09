import { useEffect, useMemo, useState } from 'react';
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
import { PROMPT_HUB_UPDATED_EVENT } from '../constants/events';
import { emit } from '../utils/eventBus';
import { promptHubAPI } from '../services/api';
import { CATEGORY_FORM, SKILL_FORM, TEMPLATE_FORM } from '../features/PromptHub/constants';
import { buildPromptHubSummary, filterPromptHubRecords, filterSkills } from '../features/PromptHub/utils';
import PromptHubEditorDialog from '../features/PromptHub/components/PromptHubEditorDialog';
import SkillCategoryDialog from '../features/PromptHub/components/SkillCategoryDialog';
import RecordTable from '../features/PromptHub/components/RecordTable';
import PromptHubSummaryCards, { PromptHubWritingGuide } from '../features/PromptHub/components/PromptHubSummaryCards';

export default function PromptHubConfigPage({ embedded = false }) {
  const [templates, setTemplates] = useState([]);
  const [skills, setSkills] = useState([]);
  const [skillCategories, setSkillCategories] = useState([]);
  const [activePanel, setActivePanel] = useState('templates');
  const [templateKeyword, setTemplateKeyword] = useState('');
  const [skillKeyword, setSkillKeyword] = useState('');
  const [skillCategoryFilter, setSkillCategoryFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState({ open: false, type: 'template', mode: 'create', recordId: '', form: TEMPLATE_FORM });
  const [categoryDialog, setCategoryDialog] = useState({ open: false, form: CATEGORY_FORM });
  const [saving, setSaving] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });
  const showSnackbar = useSnackbar();

  const summary = useMemo(() => buildPromptHubSummary(templates, skills), [skills, templates]);

  const visibleTemplates = useMemo(() => {
    return filterPromptHubRecords(templates, templateKeyword);
  }, [templateKeyword, templates]);

  const visibleSkills = useMemo(() => {
    return filterSkills(skills, skillKeyword, skillCategoryFilter);
  }, [skillCategoryFilter, skillKeyword, skills]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [templateData, skillData, categoryData] = await Promise.all([
        promptHubAPI.getTemplates(),
        promptHubAPI.getSkills(),
        promptHubAPI.getSkillCategories(),
      ]);
      setTemplates(templateData.templates || []);
      setSkills(skillData.skills || []);
      setSkillCategories(categoryData.skill_categories || []);
    } catch (err) {
      showSnackbar(err.message || '加载 Prompt Hub 配置失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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
      ? (skillCategories.find((item) => item.id === record.category)?.name || record.category || '')
      : '';
    setEditor({
      open: true,
      type,
      mode: 'edit',
      recordId: record.id,
      form: { ...record, category: type === 'skill' ? resolvedCategoryName : record.category },
    });
  };

  const closeEditor = () => {
    setEditor({ open: false, type: 'template', mode: 'create', recordId: '', form: TEMPLATE_FORM });
  };

  const notifyPromptHubUpdated = () => {
    emit(PROMPT_HUB_UPDATED_EVENT);
  };

  const updateEditor = (patch) => {
    setEditor((prev) => ({ ...prev, form: { ...prev.form, ...patch } }));
  };

  const updateCategoryDialog = (patch) => {
    setCategoryDialog((prev) => ({ ...prev, form: { ...prev.form, ...patch } }));
  };

  const closeCategoryDialog = () => {
    setCategoryDialog({ open: false, form: CATEGORY_FORM });
  };

  const resolveSkillCategoryId = async (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) {
      return skillCategories[0]?.id || 'coverage';
    }
    const matched = skillCategories.find((item) => item.id === normalized || item.name === normalized);
    if (matched) {
      return matched.id;
    }
    const created = await promptHubAPI.createSkillCategory({ name: normalized });
    return created.record.id;
  };

  const saveRecord = async () => {
    setSaving(true);
    try {
      const payload = {
        ...editor.form,
        sort_order: Number(editor.form.sort_order || 100),
      };
      if (editor.type === 'template') {
        if (editor.mode === 'create') {
          await promptHubAPI.createTemplate(payload);
        } else {
          await promptHubAPI.updateTemplate(editor.recordId, payload);
        }
      } else {
        payload.category = await resolveSkillCategoryId(editor.form.category);
        if (editor.mode === 'create') {
          await promptHubAPI.createSkill(payload);
        } else {
          await promptHubAPI.updateSkill(editor.recordId, payload);
        }
      }

      showSnackbar(editor.mode === 'create' ? '配置已创建' : '配置已更新', 'success');
      notifyPromptHubUpdated();
      closeEditor();
      await loadData();
    } catch (err) {
      showSnackbar(err.message || '保存配置失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveCategory = async () => {
    setSaving(true);
    try {
      await promptHubAPI.createSkillCategory(categoryDialog.form);
      showSnackbar('技能分类已创建', 'success');
      notifyPromptHubUpdated();
      closeCategoryDialog();
      await loadData();
    } catch (err) {
      showSnackbar(err.message || '创建技能分类失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = (type, record) => {
    setConfirmDialog({
      open: true,
      title: `删除${type === 'template' ? '模板' : '技能'}`,
      message: `确认删除「${record.name}」？删除后相关配置将立即从 Prompt Hub 中移除。`,
      onConfirm: async () => {
        setConfirmDialog({ open: false, title: '', message: '', onConfirm: null });
        try {
          if (type === 'template') {
            await promptHubAPI.deleteTemplate(record.id);
          } else {
            await promptHubAPI.deleteSkill(record.id);
          }
          showSnackbar('配置已删除', 'success');
          notifyPromptHubUpdated();
          await loadData();
        } catch (err) {
          showSnackbar(err.message || '删除配置失败', 'error');
        }
      },
    });
  };

  const requestDeleteCategory = (record) => {
    setConfirmDialog({
      open: true,
      title: '删除技能分类',
      message: `确认删除分类「${record.name}」？如果仍有技能使用这个分类，系统会阻止删除。`,
      onConfirm: async () => {
        setConfirmDialog({ open: false, title: '', message: '', onConfirm: null });
        try {
          await promptHubAPI.deleteSkillCategory(record.id);
          showSnackbar('技能分类已删除', 'success');
          notifyPromptHubUpdated();
          await loadData();
        } catch (err) {
          showSnackbar(err.message || '删除技能分类失败', 'error');
        }
      },
    });
  };

  const content = (
    <>
      {!embedded && (
        <PageHeader
          title="Prompt & Skill Hub"
          subtitle="管理测试用例生成模板、专项技能和默认策略。"
        >
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Button variant="contained" onClick={() => openCreate('template')}>新增模板</Button>
            <Button variant="outlined" onClick={() => openCreate('skill')}>新增技能</Button>
            <Button variant="outlined" onClick={loadData}>刷新</Button>
          </Stack>
        </PageHeader>
      )}

      <Box sx={{ p: embedded ? 2 : 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {embedded && (
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 1, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#1e293b' }}>Prompt & Skill Hub</Typography>
              <Typography variant="caption" color="text.secondary">
                管理测试用例模板、专项技能和默认生成策略。
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Button variant="contained" size="small" onClick={() => openCreate('template')}>新增模板</Button>
              <Button variant="outlined" size="small" onClick={() => openCreate('skill')}>新增技能</Button>
              <Button variant="outlined" size="small" onClick={loadData}>刷新</Button>
            </Stack>
          </Box>
        )}

        <PromptHubSummaryCards summary={summary} />

        <PromptHubWritingGuide />

        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, bgcolor: '#fbfcff', overflow: 'hidden' }}>
          <Tabs
            value={activePanel}
            onChange={(_, value) => setActivePanel(value)}
            variant="fullWidth"
            sx={{ borderBottom: '1px solid', borderColor: 'divider', bgcolor: '#f8fafc' }}
          >
            <Tab
              value="templates"
              label={`模板管理 (${templates.length})`}
            />
            <Tab
              value="skills"
              label={`技能管理 (${skills.length})`}
            />
          </Tabs>

          {activePanel === 'templates' && (
            <Box sx={{ p: 1.75, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
                <Box>
                  <Typography variant="subtitle1" fontWeight={700}>模板管理</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                    用来定义整体生成风格，例如精简版、详细版、面向评审版。
                  </Typography>
                </Box>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <TextField
                    size="small"
                    placeholder="搜索模板名称 / ID / 描述"
                    value={templateKeyword}
                    onChange={(e) => setTemplateKeyword(e.target.value)}
                    sx={{ minWidth: { xs: '100%', sm: 260 } }}
                  />
                  <Button variant="contained" size="small" onClick={() => openCreate('template')}>新增模板</Button>
                </Stack>
              </Stack>
              <Box sx={{ maxHeight: 520, overflow: 'auto' }}>
                <RecordTable
                  rows={visibleTemplates}
                  type="template"
                  onEdit={(item) => openEdit('template', item)}
                  onDelete={(item) => requestDelete('template', item)}
                />
              </Box>
            </Box>
          )}

          {activePanel === 'skills' && (
            <Box sx={{ p: 1.75, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
                <Box>
                  <Typography variant="subtitle1" fontWeight={700}>技能管理</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                    用来补专项覆盖方向，例如边界值、权限、安全、异常恢复。
                  </Typography>
                </Box>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <TextField
                    size="small"
                    placeholder="搜索技能名称 / ID / 描述"
                    value={skillKeyword}
                    onChange={(e) => setSkillKeyword(e.target.value)}
                    sx={{ minWidth: { xs: '100%', sm: 240 } }}
                  />
                  <Autocomplete
                    size="small"
                    options={[{ id: 'all', name: '全部分类' }, ...skillCategories]}
                    getOptionLabel={(option) => option.name}
                    value={[{ id: 'all', name: '全部分类' }, ...skillCategories].find((item) => item.id === skillCategoryFilter) || { id: 'all', name: '全部分类' }}
                    onChange={(_, value) => setSkillCategoryFilter(value?.id || 'all')}
                    renderInput={(params) => (
                      <TextField {...params} placeholder="按分类筛选" />
                    )}
                    sx={{ minWidth: { xs: '100%', sm: 180 } }}
                  />
                  <Button variant="outlined" size="small" color="success" onClick={() => openCreate('skill')}>新增技能</Button>
                </Stack>
              </Stack>
              <Box sx={{ maxHeight: 420, overflow: 'auto' }}>
                <RecordTable
                  rows={visibleSkills}
                  type="skill"
                  skillCategories={skillCategories}
                  onEdit={(item) => openEdit('skill', item)}
                  onDelete={(item) => requestDelete('skill', item)}
                />
              </Box>
              <Divider />
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
                <Box>
                  <Typography variant="subtitle2" fontWeight={700}>技能分类</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                    可下拉选择，也支持直接输入新中文分类；默认分类不能删除。
                  </Typography>
                </Box>
                <Button variant="text" size="small" onClick={() => setCategoryDialog({ open: true, form: { ...CATEGORY_FORM } })}>
                  新增分类
                </Button>
              </Stack>
              <Box sx={{ maxHeight: 160, overflow: 'auto' }}>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                  {skillCategories.map((item) => (
                    <Chip
                      key={item.id}
                      label={item.name}
                      color={item.is_default ? 'default' : 'success'}
                      variant={item.is_default ? 'outlined' : 'filled'}
                      onDelete={item.is_default ? undefined : () => requestDeleteCategory(item)}
                    />
                  ))}
                </Stack>
              </Box>
            </Box>
          )}
        </Paper>

        {loading && (
          <Typography variant="body2" color="text.secondary">
            正在加载 Prompt Hub 配置...
          </Typography>
        )}
      </Box>

      <PromptHubEditorDialog
        open={editor.open}
        title={`${editor.mode === 'create' ? '新增' : '编辑'}${editor.type === 'template' ? '模板' : '技能'}`}
        form={editor.form}
        onChange={updateEditor}
        onClose={closeEditor}
        onSubmit={saveRecord}
        saving={saving}
        skillCategories={skillCategories}
        type={editor.type}
      />
      <SkillCategoryDialog
        open={categoryDialog.open}
        form={categoryDialog.form}
        onChange={updateCategoryDialog}
        onClose={closeCategoryDialog}
        onSubmit={saveCategory}
        saving={saving}
      />
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onCancel={() => setConfirmDialog({ open: false, title: '', message: '', onConfirm: null })}
        onConfirm={confirmDialog.onConfirm}
        confirmText="删除"
        danger
      />
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <Box sx={{ flex: 1, overflow: 'auto', bgcolor: 'background.default' }}>
      {content}
    </Box>
  );
}
