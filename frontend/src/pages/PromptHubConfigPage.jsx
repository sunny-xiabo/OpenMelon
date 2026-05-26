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
  RefreshOutlined as RefreshIcon,
  SecurityOutlined,
  Add as AddIcon,
  AutoAwesomeOutlined,
} from '@mui/icons-material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
      message: `确认要永久删除「${record.name}」吗？此操作不可撤销。`,
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
      message: `确认删除分类「${record.name}」吗？该操作不会清空已归属的技能，但会解除其绑定。`,
      onConfirm: async () => {
        setConfirmDialog({ open: false });
        await deleteCategoryMutation.mutateAsync(record.id);
      },
    });
  };

  const content = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3.5 }}>
      {/* Non-embedded Premium Header Deck */}
      {!embedded && (
        <Box 
          sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            px: 3, 
            py: 2, 
            borderBottom: '1px solid rgba(255, 255, 255, 0.4)', 
            bgcolor: 'rgba(255, 255, 255, 0.2)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <AutoAwesomeOutlined sx={{ fontSize: 20, color: 'primary.main' }} />
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 900, color: 'text.primary', letterSpacing: '-0.01em' }}>
                Prompt & Skill Hub
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                管理测试用例生成策略模板、大语言模型专项覆盖技能与兜底默认策略
              </Typography>
            </Box>
          </Box>
          <Stack direction="row" spacing={1.5}>
            <Button 
              size="small" 
              variant="contained" 
              startIcon={<AddIcon />} 
              onClick={() => openCreate('template')}
              sx={{ borderRadius: 2.2, fontSize: '11px', fontWeight: 800 }}
            >
              新增模板
            </Button>
            <Button 
              size="small" 
              variant="outlined" 
              startIcon={<RefreshIcon />} 
              onClick={loadData}
              sx={{
                borderRadius: 2.2, fontSize: '11px', fontWeight: 800, bgcolor: 'white', borderColor: 'rgba(0,0,0,0.06)',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.03)' }
              }}
            >
              同步刷新
            </Button>
          </Stack>
        </Box>
      )}

      <Box sx={{ p: embedded ? 2 : 3.5, display: 'flex', flexDirection: 'column', gap: 3.5 }}>
        {/* Embedded styled header */}
        {embedded && (
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, pb: 1.5, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AutoAwesomeOutlined sx={{ fontSize: 16, color: 'primary.main' }} />
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 900, color: 'text.primary' }}>Prompt & Skill Hub</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '10px' }}>配置 AI 生成的核心策略。</Typography>
              </Box>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button 
                variant="contained" 
                size="small" 
                onClick={() => openCreate('template')}
                sx={{ borderRadius: 1.8, fontSize: '10px', fontWeight: 800 }}
              >
                新增模板
              </Button>
              <Button 
                variant="outlined" 
                size="small" 
                onClick={loadData}
                sx={{ borderRadius: 1.8, fontSize: '10px', fontWeight: 800, bgcolor: 'white', borderColor: 'rgba(0,0,0,0.06)' }}
              >
                刷新
              </Button>
            </Stack>
          </Box>
        )}

        {/* 1. Numerical indicators */}
        <PromptHubSummaryCards summary={summary} />

        {/* 2. Security scanner panel */}
        <PromptHubSafetyPanel
          templates={templates}
          skills={skills}
          onOpenRecord={(type, record) => {
            setActivePanel(type === 'template' ? 'templates' : 'skills');
            openEdit(type, record);
          }}
        />

        {/* 3. Blueprint guidelines */}
        <PromptHubWritingGuide />

        {/* 4. Tab segment workspace */}
        <Paper 
          variant="outlined" 
          sx={{ 
            borderRadius: 4.5, 
            bgcolor: 'rgba(255, 255, 255, 0.3)', 
            overflow: 'hidden', 
            border: '1px solid rgba(255, 255, 255, 0.45)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.01)',
          }}
        >
          <Tabs 
            value={activePanel} 
            onChange={(_, v) => setActivePanel(v)} 
            variant="fullWidth" 
            sx={{ 
              bgcolor: 'rgba(255, 255, 255, 0.5)',
              borderBottom: '1px solid rgba(0,0,0,0.06)',
              '& .MuiTab-root': {
                fontSize: '12px',
                fontWeight: 800,
                textTransform: 'none',
                minHeight: 48,
              }
            }}
          >
            <Tab value="templates" label={`用例风格模板管理 (${templates.length})`} />
            <Tab value="skills" label={`大模型覆盖专项技能 (${skills.length})`} />
          </Tabs>

          {activePanel === 'templates' && (
            <Box sx={{ p: 2.5 }}>
              <Stack direction="row" spacing={2} justifyContent="space-between" sx={{ mb: 2.5 }} alignItems="center">
                <TextField 
                  size="small" 
                  placeholder="搜索全局风格模板..." 
                  value={templateKeyword} 
                  onChange={(e) => setTemplateKeyword(e.target.value)} 
                  sx={{ 
                    width: 320,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2.2,
                      fontSize: '12px',
                      fontWeight: 700,
                      bgcolor: 'white',
                    }
                  }} 
                />
                <Button 
                  variant="contained" 
                  size="small" 
                  startIcon={<AddIcon />}
                  onClick={() => openCreate('template')}
                  sx={{ borderRadius: 2, fontSize: '11px', fontWeight: 800, px: 2 }}
                >
                  新增模板
                </Button>
              </Stack>
              <RecordTable rows={visibleTemplates} type="template" onEdit={(i) => openEdit('template', i)} onDelete={(i) => requestDelete('template', i)} />
            </Box>
          )}

          {activePanel === 'skills' && (
            <Box sx={{ p: 2.5 }}>
              <Stack direction="row" spacing={2} justifyContent="space-between" sx={{ mb: 2.5 }} alignItems="center">
                <TextField 
                  size="small" 
                  placeholder="检索大模型专项技能..." 
                  value={skillKeyword} 
                  onChange={(e) => setSkillKeyword(e.target.value)} 
                  sx={{ 
                    flex: 1,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2.2,
                      fontSize: '12px',
                      fontWeight: 700,
                      bgcolor: 'white',
                    }
                  }} 
                />
                <Autocomplete
                  size="small"
                  options={[{ id: 'all', name: '全部分类' }, ...skillCategories]}
                  getOptionLabel={(o) => o.name}
                  value={[{ id: 'all', name: '全部分类' }, ...skillCategories].find(i => i.id === skillCategoryFilter)}
                  onChange={(_, v) => setSkillCategoryFilter(v?.id || 'all')}
                  sx={{ 
                    width: 220,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2.2,
                      fontSize: '12px',
                      fontWeight: 700,
                      bgcolor: 'white',
                    }
                  }}
                  renderInput={(params) => <TextField {...params} placeholder="按技能分类" />}
                />
                <Button 
                  variant="outlined" 
                  size="small" 
                  color="success" 
                  startIcon={<AddIcon />}
                  onClick={() => openCreate('skill')}
                  sx={{
                    borderRadius: 2, fontSize: '11px', fontWeight: 800, px: 2,
                    borderColor: 'rgba(76, 175, 80, 0.25)',
                    bgcolor: 'white',
                    '&:hover': { bgcolor: 'rgba(76, 175, 80, 0.04)', borderColor: 'success.main' }
                  }}
                >
                  新增技能
                </Button>
              </Stack>
              <RecordTable rows={visibleSkills} type="skill" skillCategories={skillCategories} onEdit={(i) => openEdit('skill', i)} onDelete={(i) => requestDelete('skill', i)} />
              
              <Divider sx={{ my: 3, borderColor: 'rgba(0,0,0,0.05)' }} />
              
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', mr: 1, letterSpacing: '0.04em' }}>
                  已部署技能分类库：
                </Typography>
                {skillCategories.map((i) => (
                  <Chip 
                    key={i.id} 
                    label={i.name} 
                    variant={i.is_default ? 'outlined' : 'filled'} 
                    color={i.is_default ? 'default' : 'success'} 
                    onDelete={i.is_default ? undefined : () => requestDeleteCategory(i)} 
                    sx={{
                      height: 22,
                      fontSize: '10px',
                      fontWeight: 800,
                      borderRadius: 1.5,
                      bgcolor: i.is_default ? 'rgba(0,0,0,0.04)' : 'rgba(76, 175, 80, 0.08)',
                      color: i.is_default ? 'text.secondary' : '#2e7d32',
                      border: 'none',
                      '& .MuiChip-deleteIcon': {
                        fontSize: 12,
                        color: '#2e7d32',
                        '&:hover': { color: '#ef4444' }
                      }
                    }}
                  />
                ))}
                <Button 
                  size="small" 
                  variant="text" 
                  onClick={() => setCategoryDialog({ open: true, form: { ...CATEGORY_FORM } })}
                  sx={{ fontSize: '11px', fontWeight: 800, color: 'success.main', ml: 1 }}
                >
                  + 新增业务分类
                </Button>
              </Stack>
            </Box>
          )}
        </Paper>
      </Box>

      {/* Editor & Category creation Dialogs */}
      <PromptHubEditorDialog
        open={editor.open} 
        title={`${editor.mode === 'create' ? '新增' : '编辑'}${editor.type === 'template' ? '用例风格模板' : '大模型专项技能'}`}
        form={editor.form} 
        skillCategories={skillCategories} 
        type={editor.type} 
        saving={saving}
        onChange={(patch) => setEditor(prev => ({ ...prev, form: { ...prev.form, ...patch } }))}
        onClose={() => setEditor({ ...editor, open: false })}
        onSubmit={handleSaveRecord}
      />
      <SkillCategoryDialog
        open={categoryDialog.open} 
        form={categoryDialog.form} 
        saving={saving}
        onChange={(patch) => setCategoryDialog(prev => ({ ...prev, form: { ...prev.form, ...patch } }))}
        onClose={() => setCategoryDialog({ ...categoryDialog, open: false })}
        onSubmit={() => saveCategoryMutation.mutate(categoryDialog.form)}
      />
      <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog({ open: false })} danger confirmText="安全删除" />
    </Box>
  );

  return embedded ? content : <Box sx={{ flex: 1, overflow: 'auto', p: 0, bgcolor: 'transparent' }}>{content}</Box>;
}

const safetySeverityMeta = {
  error: { label: '严重风险', color: 'error' },
  warning: { label: '中度警示', color: 'warning' },
  info: { label: '安全建议', color: 'info' },
};

const safetyRiskLabels = {
  low: '低危',
  medium: '中危',
  high: '高危风险',
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
      title: '确认安全隔离 Prompt 策略',
      message: `将执行「${action.label}」动作。\n\n来源安全建议：${recommendation.title}\n原因：${recommendation.reason}`,
      confirmText: action.label,
      danger: true,
      onConfirm: async () => {
        setConfirmDialog({ open: false });
        await executeAction(recommendation, action, true);
      },
    });
  };

  return (
    <Paper 
      variant="outlined" 
      sx={{ 
        borderRadius: 4.5, 
        overflow: 'hidden', 
        bgcolor: 'rgba(255,255,255,0.35)', 
        border: '1px solid rgba(99, 102, 241, 0.15)',
        boxShadow: '0 8px 32px rgba(99, 102, 241, 0.02), inset 0 1px 0 rgba(255,255,255,0.6)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <Box sx={{ p: 2, borderBottom: '1px solid rgba(0,0,0,0.06)', bgcolor: 'rgba(255, 255, 255, 0.3)' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} gap={2}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 2, bgcolor: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
              <SecurityOutlined />
            </Box>
            <Box>
              <Typography variant="subtitle2" fontWeight={900}>LLM 策略安全防御舱 (Prompt Hub Shield)</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>智能扫描分析提示词策略，诊断潜在注入泄漏风险并生成隔离动作</Typography>
            </Box>
          </Stack>
          <Button 
            size="small" 
            variant="outlined" 
            startIcon={<RefreshIcon />} 
            onClick={() => safetyQuery.refetch()} 
            disabled={safetyQuery.isFetching}
            sx={{
              borderRadius: 2.2, fontSize: '11px', fontWeight: 800, bgcolor: 'white', borderColor: 'rgba(0,0,0,0.06)',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.03)' }
            }}
          >
            同步安全扫描
          </Button>
        </Stack>
      </Box>
      
      {safetyQuery.isFetching && <LinearProgress />}
      
      <Box sx={{ p: 2.5 }}>
        {safetyQuery.isError ? (
          <Alert severity="error" sx={{ borderRadius: 2.5 }}>
            {safetyQuery.error?.message || 'Prompt Hub 安全建议加载失败'}
          </Alert>
        ) : !recommendations.length && !safetyQuery.isLoading ? (
          <Alert severity="success" sx={{ borderRadius: 2.5, fontWeight: 700, border: '1px solid rgba(16, 185, 129, 0.12)', bgcolor: 'rgba(16, 185, 129, 0.02)' }}>
            ✓ 策略扫描通过：当前用例风格模板与专项技能未发现明显的注入泄漏风险信号。
          </Alert>
        ) : (
          <Stack spacing={2}>
            {visibleItems.map((recommendation) => {
              const meta = safetySeverityMeta[recommendation.severity] || safetySeverityMeta.info;
              
              // Pulsing glow animation styles per severity
              let pulseStyles = {};
              if (recommendation.severity === 'error') {
                pulseStyles = {
                  border: '1px solid rgba(239, 68, 68, 0.15)',
                  bgcolor: 'rgba(239, 68, 68, 0.01)',
                  animation: 'errorGlow 3s infinite ease-in-out',
                  '@keyframes errorGlow': {
                    '0%, 100%': { borderColor: 'rgba(239, 68, 68, 0.15)', boxShadow: '0 0 8px rgba(239, 68, 68, 0.02)' },
                    '50%': { borderColor: 'rgba(239, 68, 68, 0.45)', boxShadow: '0 0 16px rgba(239, 68, 68, 0.08)' }
                  }
                };
              } else if (recommendation.severity === 'warning') {
                pulseStyles = {
                  border: '1px solid rgba(245, 158, 11, 0.15)',
                  bgcolor: 'rgba(245, 158, 11, 0.01)',
                  animation: 'warningGlow 3s infinite ease-in-out',
                  '@keyframes warningGlow': {
                    '0%, 100%': { borderColor: 'rgba(245, 158, 11, 0.15)', boxShadow: '0 0 8px rgba(245, 158, 11, 0.02)' },
                    '50%': { borderColor: 'rgba(245, 158, 11, 0.45)', boxShadow: '0 0 16px rgba(245, 158, 11, 0.08)' }
                  }
                };
              } else {
                pulseStyles = {
                  border: '1px solid rgba(14, 165, 233, 0.15)',
                  bgcolor: 'rgba(14, 165, 233, 0.01)',
                  animation: 'infoGlow 3s infinite ease-in-out',
                  '@keyframes infoGlow': {
                    '0%, 100%': { borderColor: 'rgba(14, 165, 233, 0.15)', boxShadow: '0 0 8px rgba(14, 165, 233, 0.02)' },
                    '50%': { borderColor: 'rgba(14, 165, 233, 0.45)', boxShadow: '0 0 16px rgba(14, 165, 233, 0.08)' }
                  }
                };
              }

              return (
                <Box 
                  key={recommendation.id} 
                  sx={{ 
                    p: 2, 
                    borderRadius: 3.5, 
                    transition: 'all 0.3s',
                    ...pulseStyles
                  }}
                >
                  <Stack spacing={1.5}>
                    <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Chip 
                        size="small" 
                        color={meta.color} 
                        label={meta.label} 
                        sx={{
                          height: 18,
                          fontSize: '10px',
                          fontWeight: 800,
                          borderRadius: 1.5,
                        }} 
                      />
                      <Typography variant="body2" sx={{ fontWeight: 800, color: 'text.primary' }}>
                        {recommendation.title}
                      </Typography>
                      <Chip 
                        size="small" 
                        label={safetyRiskLabels[recommendation.risk_level] || recommendation.risk_level} 
                        sx={{
                          height: 18,
                          fontSize: '10px',
                          fontWeight: 800,
                          borderRadius: 1.5,
                          bgcolor: 'rgba(0,0,0,0.04)',
                          color: 'text.secondary',
                        }} 
                      />
                    </Stack>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500, lineHeight: 1.5 }}>
                      {recommendation.reason}
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {(recommendation.evidence || []).slice(0, 3).map((item) => (
                        <Chip 
                          key={`${recommendation.id}-${item.label}`} 
                          size="small" 
                          label={`${item.label}: ${item.value}`} 
                          sx={{ 
                            height: 18,
                            fontSize: '9px',
                            fontWeight: 700,
                            borderRadius: 1.2,
                            bgcolor: 'rgba(0,0,0,0.03)',
                            color: 'text.secondary',
                          }} 
                        />
                      ))}
                    </Stack>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ pt: 0.5 }}>
                      {(recommendation.actions || []).map((action) => (
                        <Button
                          key={`${recommendation.id}-${action.id}`}
                          size="small"
                          variant="outlined"
                          color={action.risk_level === 'high' ? 'warning' : 'primary'}
                          startIcon={<AutoFixHighOutlined sx={{ fontSize: 12 }} />}
                          disabled={actionMutation.isPending}
                          onClick={() => requestAction(recommendation, action)}
                          sx={{
                            borderRadius: 1.8,
                            fontSize: '11px',
                            fontWeight: 800,
                            height: 26,
                            px: 1.5,
                            borderColor: action.risk_level === 'high' ? 'rgba(245, 158, 11, 0.45)' : 'rgba(14, 165, 233, 0.45)',
                            bgcolor: 'white',
                            '&:hover': {
                              transform: 'translateY(-1px)',
                              bgcolor: action.risk_level === 'high' ? 'rgba(245, 158, 11, 0.04)' : 'rgba(14, 165, 233, 0.04)',
                              borderColor: action.risk_level === 'high' ? 'warning.main' : 'primary.main',
                            }
                          }}
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
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1, fontWeight: 500 }}>
                • 提示：系统仍有 {recommendations.length - visibleItems.length} 条防御漏洞扫描项，请在控制台优先维护中高风险指标。
              </Typography>
            )}
          </Stack>
        )}
      </Box>
      <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog({ open: false })} />
    </Paper>
  );
}
