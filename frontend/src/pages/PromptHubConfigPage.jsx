import { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import BoltOutlined from '@mui/icons-material/BoltOutlined';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import { useSnackbar } from '../components/SnackbarProvider';
import { PROMPT_HUB_UPDATED_EVENT } from '../constants/promptHub';
import { promptHubAPI } from '../services/api';

const TEMPLATE_FORM = {
  id: '',
  name: '',
  description: '',
  content: '',
  review_summary: '',
  enabled: true,
  is_default: false,
  sort_order: 100,
};

const SKILL_FORM = {
  id: '',
  name: '',
  description: '',
  content: '',
  review_summary: '',
  enabled: true,
  category: '',
  sort_order: 100,
};

const CATEGORY_FORM = {
  id: '',
  name: '',
};

function PromptHubEditorDialog({
  open,
  title,
  form,
  onChange,
  onClose,
  onSubmit,
  saving,
  skillCategories,
  type,
}) {
  const isTemplate = type === 'template';

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            borderRadius: 2.5,
            border: '1px solid',
            borderColor: isTemplate ? 'primary.light' : 'success.light',
            bgcolor: isTemplate ? 'rgba(59,130,246,0.06)' : 'rgba(16,185,129,0.08)',
          }}
        >
          <Typography variant="subtitle2" fontWeight={700}>
            {isTemplate ? '模板用于定义整体生成风格' : '技能用于定义额外覆盖方向'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {isTemplate
              ? '这里更适合写信息密度、表达粒度、场景组织方式和整体写法，不要把它写成专项测试点清单。'
              : '这里更适合写边界、异常、权限、兼容性等专项补充点，不要把它写成整体写作风格模板。'}
          </Typography>
        </Paper>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
          <TextField
            label="名称"
            value={form.name}
            onChange={(e) => onChange({ name: e.target.value })}
            fullWidth
            helperText={isTemplate ? '给用户看的模板名，例如“精简版”。' : '给用户看的技能名，例如“边界值测试”。'}
          />
          <TextField
            label="ID（可选）"
            value={form.id}
            onChange={(e) => onChange({ id: e.target.value })}
            fullWidth
            helperText="稳定标识，建议英文短横线命名；不填时后端自动生成。"
          />
          <TextField
            label="描述"
            value={form.description}
            onChange={(e) => onChange({ description: e.target.value })}
            fullWidth
            helperText={isTemplate ? '一句话说明模板风格，例如“强调去冗余和高信息密度”。' : '一句话说明技能补充的覆盖方向。'}
          />
          {isTemplate ? (
            <TextField
              label="排序权重"
              value={form.sort_order}
              onChange={(e) => onChange({ sort_order: e.target.value })}
              fullWidth
              helperText="数字越小越靠前；默认模板通常排在前面。"
            />
          ) : (
            <Autocomplete
              freeSolo
              options={skillCategories}
              getOptionLabel={(option) => (typeof option === 'string' ? option : option.name)}
              value={form.category || ''}
              onChange={(_, value) => onChange({ category: typeof value === 'string' ? value : value?.name || '' })}
              onInputChange={(_, value) => onChange({ category: value })}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="技能分类"
                  fullWidth
                  helperText="可直接选择中文分类，也可以输入新分类名称；新分类会自动保存。"
                />
              )}
            />
          )}
          {!isTemplate && (
            <TextField
              label="排序权重"
              value={form.sort_order}
              onChange={(e) => onChange({ sort_order: e.target.value })}
              fullWidth
              helperText="数字越小越靠前；同类技能里可用它控制展示顺序。"
            />
          )}
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.2fr 0.8fr' }, gap: 1.5, alignItems: 'start' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            <Paper elevation={0} sx={{ p: 1.25, border: '1px dashed', borderColor: 'divider', borderRadius: 2 }}>
              <Typography variant="body2" fontWeight={700}>
                {isTemplate ? '模板正文建议包含' : '技能正文建议包含'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {isTemplate
                  ? '风格目标、信息取舍规则、场景组织方式，以及保持标准 Markdown 协议不变的约束。'
                  : '需要额外补充的测试类型、重点风险点、典型场景范围，以及专项覆盖的优先级。'}
              </Typography>
            </Paper>

            <TextField
              label={isTemplate ? '评审摘要（风格摘要）' : '评审摘要（覆盖摘要）'}
              value={form.review_summary}
              onChange={(e) => onChange({ review_summary: e.target.value })}
              fullWidth
              helperText={isTemplate
                ? '给评审器看的模板风格摘要，概括意图即可，不要复制正文全文。'
                : '给评审器看的技能覆盖摘要，概括补充方向即可，不要复制正文全文。'}
            />
            <TextField
              label={isTemplate ? '模板正文（决定怎么写）' : '技能正文（决定多覆盖什么）'}
              value={form.content}
              onChange={(e) => onChange({ content: e.target.value })}
              multiline
              minRows={8}
              fullWidth
              helperText={isTemplate
                ? '模板控制“怎么写”：写风格、粒度和场景组织，不要改 Markdown 输出协议。'
                : '技能控制“多覆盖什么”：写需要额外补充的专项场景，不要改输出协议。'}
              placeholder={isTemplate
                ? '例如：请以精简、直接、高信息密度的风格编写测试用例；优先保留关键步骤和最可验证的预期结果；按主流程、异常流程和角色差异组织场景……'
                : '例如：请额外补充边界值和临界条件测试，重点关注最小值、最大值、空值、超长输入、非法格式、集合为空与单项切换等场景……'}
            />
          </Box>

          <Paper
            elevation={0}
            sx={{
              p: 1.5,
              borderRadius: 2.5,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: '#fbfcff',
            }}
          >
            <Typography variant="subtitle2" fontWeight={700}>
              {isTemplate ? '模板写法参考' : '技能写法参考'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              {isTemplate ? '更像一份“写作策略”。' : '更像一份“专项补充清单”。'}
            </Typography>
            <Divider sx={{ my: 1.25 }} />
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
              推荐
            </Typography>
            <Box
              component="pre"
              sx={{
                m: 0,
                mt: 0.5,
                p: 1.25,
                fontSize: 12,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                borderRadius: 2,
                bgcolor: isTemplate ? 'rgba(59,130,246,0.08)' : 'rgba(16,185,129,0.1)',
                color: '#0f172a',
              }}
            >
              {isTemplate
                ? '请以精简、直接、高信息密度的风格编写测试用例；优先保留关键操作与核心断言；按主流程、失败分支和角色差异组织场景。'
                : '请额外补充边界值、空值、超长输入、非法格式和权限不足场景，并优先覆盖最容易漏测的高风险路径。'}
            </Box>
            <Typography variant="caption" sx={{ display: 'block', mt: 1.25, color: 'text.secondary' }}>
              不推荐
            </Typography>
            <Box
              component="pre"
              sx={{
                m: 0,
                mt: 0.5,
                p: 1.25,
                fontSize: 12,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                borderRadius: 2,
                bgcolor: 'rgba(248,113,113,0.1)',
                color: '#7f1d1d',
              }}
            >
              {isTemplate
                ? '请额外补充边界值、SQL 注入、越权访问、网络抖动等专项测试。'
                : '请整体写得简洁一点、信息密度高一点、避免重复描述。'}
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {isTemplate
                ? '上面这种“不推荐”写法会把模板写成技能。'
                : '上面这种“不推荐”写法会把技能写成模板。'}
            </Typography>
          </Paper>
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <FormControlLabel
            control={<Switch checked={Boolean(form.enabled)} onChange={(e) => onChange({ enabled: e.target.checked })} />}
            label="启用"
          />
          {isTemplate && (
            <FormControlLabel
              control={<Switch checked={Boolean(form.is_default)} onChange={(e) => onChange({ is_default: e.target.checked })} />}
              label="设为默认模板"
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">取消</Button>
        <Button onClick={onSubmit} variant="contained" disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function SkillCategoryDialog({
  open,
  form,
  onChange,
  onClose,
  onSubmit,
  saving,
}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>新增技能分类</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <TextField
          label="分类名称"
          value={form.name}
          onChange={(e) => onChange({ name: e.target.value })}
          fullWidth
          helperText="尽量用中文短语，例如“性能效率”“数据质量”。"
        />
        <TextField
          label="分类 ID（可选）"
          value={form.id}
          onChange={(e) => onChange({ id: e.target.value })}
          fullWidth
          helperText="建议英文短横线命名；不填时后端会自动生成。"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">取消</Button>
        <Button onClick={onSubmit} variant="contained" disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function RecordTable({ rows, type, onEdit, onDelete, skillCategories = [] }) {
  const categoryMap = new Map(skillCategories.map((item) => [item.id, item.name]));

  return (
    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>名称</TableCell>
            <TableCell>ID</TableCell>
            {type === 'skill' && <TableCell>分类</TableCell>}
            <TableCell>说明</TableCell>
            <TableCell>状态</TableCell>
            <TableCell align="right">操作</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((item) => (
            <TableRow key={item.id} hover>
              <TableCell>
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <Typography variant="body2" fontWeight={600}>{item.name}</Typography>
                  {item.is_default && <Chip size="small" color="primary" label="默认" />}
                </Stack>
              </TableCell>
              <TableCell sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>{item.id}</TableCell>
              {type === 'skill' && (
                <TableCell>
                  <Chip
                    size="small"
                    color="success"
                    variant="outlined"
                    label={categoryMap.get(item.category) || item.category || '未分类'}
                  />
                </TableCell>
              )}
              <TableCell sx={{ color: 'text.secondary' }}>{item.description || '-'}</TableCell>
              <TableCell>
                <Chip
                  size="small"
                  color={item.enabled ? 'success' : 'default'}
                  variant={item.enabled ? 'filled' : 'outlined'}
                  label={item.enabled ? '启用中' : '已停用'}
                />
              </TableCell>
              <TableCell align="right">
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <Button size="small" onClick={() => onEdit(item)}>编辑</Button>
                  <Button
                    size="small"
                    color="error"
                    onClick={() => onDelete(item)}
                    disabled={type === 'template' && item.is_default}
                  >
                    删除
                  </Button>
                </Stack>
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={type === 'skill' ? 6 : 5}>
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                  暂无配置数据
                </Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

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

  const summary = useMemo(() => ({
    enabledTemplates: templates.filter((item) => item.enabled).length,
    enabledSkills: skills.filter((item) => item.enabled).length,
    defaultTemplate: templates.find((item) => item.is_default)?.name || '未配置',
  }), [skills, templates]);

  const visibleTemplates = useMemo(() => {
    const keyword = templateKeyword.trim().toLowerCase();
    if (!keyword) {
      return templates;
    }
    return templates.filter((item) => (
      item.name.toLowerCase().includes(keyword)
      || item.id.toLowerCase().includes(keyword)
      || (item.description || '').toLowerCase().includes(keyword)
    ));
  }, [templateKeyword, templates]);

  const visibleSkills = useMemo(() => {
    const keyword = skillKeyword.trim().toLowerCase();
    return skills.filter((item) => {
      const matchesKeyword = !keyword || (
        item.name.toLowerCase().includes(keyword)
        || item.id.toLowerCase().includes(keyword)
        || (item.description || '').toLowerCase().includes(keyword)
      );
      const matchesCategory = skillCategoryFilter === 'all' || item.category === skillCategoryFilter;
      return matchesKeyword && matchesCategory;
    });
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
    window.dispatchEvent(new CustomEvent(PROMPT_HUB_UPDATED_EVENT));
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

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
          <Paper elevation={0} sx={{ p: 2, border: '1px solid rgba(226,232,240,0.8)', borderRadius: 3, background: 'linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(255,255,255,0.9) 100%)' }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <AutoAwesomeOutlined fontSize="small" color="primary" />
              <Typography variant="body2" fontWeight={700}>启用模板</Typography>
            </Stack>
            <Typography sx={{ mt: 1.5, fontSize: 28, fontWeight: 800, color: '#0f172a' }}>{summary.enabledTemplates}</Typography>
          </Paper>
          <Paper elevation={0} sx={{ p: 2, border: '1px solid rgba(226,232,240,0.8)', borderRadius: 3, background: 'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(255,255,255,0.9) 100%)' }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <BoltOutlined fontSize="small" sx={{ color: '#059669' }} />
              <Typography variant="body2" fontWeight={700}>启用技能</Typography>
            </Stack>
            <Typography sx={{ mt: 1.5, fontSize: 28, fontWeight: 800, color: '#0f172a' }}>{summary.enabledSkills}</Typography>
          </Paper>
          <Paper elevation={0} sx={{ p: 2, border: '1px solid rgba(226,232,240,0.8)', borderRadius: 3, background: 'linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(255,255,255,0.9) 100%)' }}>
            <Typography variant="body2" fontWeight={700}>默认模板</Typography>
            <Typography sx={{ mt: 1.5, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{summary.defaultTemplate}</Typography>
          </Paper>
        </Box>

        <Paper elevation={0} sx={{ p: 1.75, border: '1px solid', borderColor: 'divider', borderRadius: 2.5, bgcolor: '#fbfcff' }}>
          <Typography variant="subtitle1" fontWeight={700}>填写建议</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            模板负责控制“怎么写”，技能负责补“多覆盖什么”。两者都不能改变标准 Markdown 用例协议。
          </Typography>
        </Paper>

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
