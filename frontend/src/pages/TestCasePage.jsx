import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Chip,
  LinearProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Menu,
  Tooltip,
  IconButton,
  Autocomplete,
  Stack,
  useMediaQuery,
  Switch,
  FormControlLabel,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { AutoFixHigh, UploadFile, Schema, SaveAlt, AccountTree, DescriptionOutlined } from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { testCaseAPI, vectorAPI, graphAPI, promptHubAPI } from '../services/api';
import { useSnackbar } from '../components/SnackbarProvider';
import StageOutput from '../components/StageOutput';
import TestCaseListView from '../components/TestCaseListView';
import TestCaseMindMap from '../components/TestCaseMindMap';
import { PROMPT_HUB_UPDATED_EVENT } from '../constants/promptHub';
import { parseTestCasesFromMarkdown } from '../utils/parseTestCases';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';

const FILE_CATEGORIES = [
  { label: '图像', exts: ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'], icon: 'IMG' },
  { label: 'PDF', exts: ['.pdf'], icon: 'PDF' },
  { label: 'OpenAPI', exts: ['.json', '.yaml', '.yml'], icon: 'API' },
];

const ALL_EXTS = FILE_CATEGORIES.flatMap(c => c.exts);
const ACCEPT_STR = ALL_EXTS.join(',');

const FALLBACK_TEMPLATE_OPTIONS = [
  { id: 'default-detailed', name: '详细版', description: '强调完整性、覆盖度和可执行性。' },
  { id: 'default-compact', name: '精简版', description: '强调去冗余和高信息密度。' },
  { id: 'default-bdd-enhanced', name: 'BDD增强版', description: '用 Given/When/Then 思维强化场景表达。' },
];

const FALLBACK_SKILL_OPTIONS = [
  { id: 'boundary-basic', name: '边界值测试', description: '补充边界值、临界值、空值和格式边界覆盖。' },
  { id: 'security-auth', name: '认证与权限', description: '补充登录态、鉴权、越权和角色差异覆盖。' },
  { id: 'exception-handling', name: '异常与错误处理', description: '补充失败分支、报错和恢复路径覆盖。' },
  { id: 'compatibility-basic', name: '兼容性基础覆盖', description: '补充浏览器、设备和格式兼容覆盖。' },
  { id: 'concurrency-idempotency', name: '并发与幂等', description: '补充重复提交、并发竞争和状态一致性覆盖。' },
];

const DEFAULT_TEMPLATE_ID = FALLBACK_TEMPLATE_OPTIONS[0].id;

const fmtSize = (b) => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB';

function getFileCategory(name) {
  const ext = '.' + name.split('.').pop().toLowerCase();
  return FILE_CATEGORIES.find(c => c.exts.includes(ext));
}

function isImage(name) {
  const ext = '.' + name.split('.').pop().toLowerCase();
  return FILE_CATEGORIES[0].exts.includes(ext);
}

export default function TestCasePage({ isActive = true }) {
  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down('lg'));
  const [mode, setMode] = useState('file');
  const [context, setContext] = useState('');
  const [requirements, setRequirements] = useState('');
  const [moduleName, setModuleName] = useState('');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [useVector, setUseVector] = useState(true);
  const [styleId, setStyleId] = useState(DEFAULT_TEMPLATE_ID);
  const [selectedSkillIds, setSelectedSkillIds] = useState([]);
  const [templateOptions, setTemplateOptions] = useState(FALLBACK_TEMPLATE_OPTIONS);
  const [skillOptions, setSkillOptions] = useState(FALLBACK_SKILL_OPTIONS);
  const [defaultTemplateId, setDefaultTemplateId] = useState(DEFAULT_TEMPLATE_ID);

  const [generating, setGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [parsedTestCases, setParsedTestCases] = useState([]);
  const [viewMode, setViewMode] = useState('list');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');

  const [vectorStatus, setVectorStatus] = useState(null);
  const [storingVector, setStoringVector] = useState(false);
  const [availableModules, setAvailableModules] = useState([]);
  const [exportAnchorEl, setExportAnchorEl] = useState(null);

  const fileRef = useRef(null);
  const styleIdRef = useRef(styleId);
  const selectedSkillIdsRef = useRef(selectedSkillIds);
  const showSnackbar = useSnackbar();

  useEffect(() => {
    styleIdRef.current = styleId;
  }, [styleId]);

  useEffect(() => {
    selectedSkillIdsRef.current = selectedSkillIds;
  }, [selectedSkillIds]);

  useEffect(() => {
    if (isActive) {
      checkVectorStatus();
      loadFilters();
      loadPromptHubOptions(false);
    }
  }, [isActive]);

  useEffect(() => {
    const handlePromptHubUpdated = () => {
      loadPromptHubOptions(true);
    };
    window.addEventListener(PROMPT_HUB_UPDATED_EVENT, handlePromptHubUpdated);
    return () => {
      window.removeEventListener(PROMPT_HUB_UPDATED_EVENT, handlePromptHubUpdated);
    };
  }, []);

  const handleReset = () => {
    setContext('');
    setRequirements('');
    setModuleName('');
    setStyleId(defaultTemplateId);
    setSelectedSkillIds([]);
    clearFile();
    setStreamingContent('');
    setParsedTestCases([]);
    setViewMode('list');
  };

  const loadFilters = async () => {
    try {
      const filters = await graphAPI.getFilters();
      setAvailableModules(filters.modules || []);
    } catch { }
  };

  const reconcilePromptHubSelection = (nextTemplates, nextSkills, nextDefaultTemplateId, notify) => {
    const previousStyleId = styleIdRef.current;
    const previousSkillIds = selectedSkillIdsRef.current;
    const resolvedStyleId = nextTemplates.some((item) => item.id === previousStyleId)
      ? previousStyleId
      : nextDefaultTemplateId;
    const resolvedSkillIds = previousSkillIds.filter((skillId) =>
      nextSkills.some((item) => item.id === skillId)
    );

    setTemplateOptions(nextTemplates);
    setSkillOptions(nextSkills);
    setDefaultTemplateId(nextDefaultTemplateId);
    setStyleId(resolvedStyleId);
    setSelectedSkillIds(resolvedSkillIds);

    if (notify && previousStyleId && previousStyleId !== resolvedStyleId) {
      showSnackbar('当前模板已失效，已自动回退为默认模板', 'info');
    }
    if (notify && previousSkillIds.length !== resolvedSkillIds.length) {
      showSnackbar('部分已选技能已失效，系统已自动移除', 'info');
    }
  };

  const loadPromptHubOptions = async (notifyOnFallback = false) => {
    try {
      const data = await promptHubAPI.getOptions();
      const nextTemplates = data.templates?.length ? data.templates : FALLBACK_TEMPLATE_OPTIONS;
      const nextSkills = data.skills?.length ? data.skills : FALLBACK_SKILL_OPTIONS;
      const nextDefaultTemplateId = data.default_style_id || nextTemplates[0]?.id || DEFAULT_TEMPLATE_ID;
      reconcilePromptHubSelection(
        nextTemplates,
        nextSkills,
        nextDefaultTemplateId,
        notifyOnFallback,
      );
    } catch {
      reconcilePromptHubSelection(
        FALLBACK_TEMPLATE_OPTIONS,
        FALLBACK_SKILL_OPTIONS,
        DEFAULT_TEMPLATE_ID,
        notifyOnFallback,
      );
    }
  };

  const checkVectorStatus = async () => {
    try {
      const status = await vectorAPI.checkStatus();
      setVectorStatus(status);
    } catch {
      setVectorStatus({ available: false, message: '检查失败' });
    }
  };

  const storeToVector = async () => {
    if (!filteredTestCases?.length) {
      showSnackbar('没有可存入的最终测试用例，请等待生成完成', 'warning');
      return;
    }
    setStoringVector(true);
    try {
      const result = await vectorAPI.storeTestCases(filteredTestCases, moduleName);
      if (result.success) {
        showSnackbar(result.message, 'success');
        checkVectorStatus();
      } else {
        showSnackbar(result.message || '存储失败', 'error');
      }
    } catch (e) {
      showSnackbar('存储失败: ' + e.message, 'error');
    } finally {
      setStoringVector(false);
    }
  };

  const handleFileSelect = useCallback((f) => {
    if (!f) return;
    const ext = '.' + f.name.split('.').pop().toLowerCase();
    if (!ALL_EXTS.includes(ext)) {
      showSnackbar('不支持的文件格式: ' + ext, 'error');
      return;
    }
    setFile(f);
    setPreviewUrl(isImage(f.name) ? URL.createObjectURL(f) : null);
  }, [showSnackbar]);

  const clearFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
  };

  const generate = async () => {
    if (!context.trim() || !requirements.trim()) return;
    if (mode === 'file' && !file) return;
    setGenerating(true);
    setStreamingContent('');
    setParsedTestCases([]);
    setPriorityFilter('all');
    setModuleFilter('all');

    try {
      let fullText = '';
      const resp = mode === 'file' && file
        ? await testCaseAPI.generateFromFile(file, context, requirements, moduleName, useVector, styleId, selectedSkillIds)
        : await testCaseAPI.generateFromContext(context, requirements, moduleName, useVector, styleId, selectedSkillIds);
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += dec.decode(value, { stream: true });
        setStreamingContent(fullText);
      }

      const parsed = parseTestCasesFromMarkdown(fullText).map((item) => ({
        ...item,
        module: item.module || moduleName.trim() || '未分组',
      }));
      if (parsed.length > 0) {
        setParsedTestCases(parsed);
        showSnackbar(`成功解析 ${parsed.length} 个测试用例`, 'success');
      } else {
        showSnackbar('生成完成，但未能解析出标准格式用例', 'warning');
      }
    } catch (e) {
      showSnackbar('生成失败: ' + e.message, 'error');
      setStreamingContent(prev => prev || `生成失败: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const exportExcel = async () => {
    setExportAnchorEl(null);
    try {
      let blob;
      if (parsedTestCases.length > 0) {
        blob = await testCaseAPI.exportToExcel(filteredTestCases);
      } else if (streamingContent.trim()) {
        blob = await testCaseAPI.exportMarkdown(streamingContent);
      } else {
        return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '测试用例.xlsx';
      a.click();
      URL.revokeObjectURL(a.href);
      showSnackbar('导出 Excel 成功', 'success');
    } catch (e) {
      showSnackbar('导出失败: ' + e.message, 'error');
    }
  };

  const exportXMind = async () => {
    setExportAnchorEl(null);
    if (!filteredTestCases?.length) {
      showSnackbar('当前未解析出用例，请等待解析完成或确保内容包含受支持的格式', 'warning');
      return;
    }
    try {
      const blob = await testCaseAPI.exportXMind(filteredTestCases);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `test-cases-${Date.now()}.xmind`;
      a.click();
      URL.revokeObjectURL(a.href);
      showSnackbar('导出 XMind 成功', 'success');
    } catch (e) {
      showSnackbar('导出失败: ' + e.message, 'error');
    }
  };

  const cat = file ? getFileCategory(file.name) : null;
  const hasResult = streamingContent.length > 0;
  const priorityOptions = useMemo(() => {
    const set = new Set();
    parsedTestCases.forEach((testCase) => {
      if (testCase.priority?.trim()) {
        set.add(testCase.priority.trim());
      }
    });
    return Array.from(set);
  }, [parsedTestCases]);

  const moduleOptions = useMemo(() => {
    const set = new Set();
    parsedTestCases.forEach((testCase) => {
      if (testCase.module?.trim()) {
        set.add(testCase.module.trim());
      }
    });
    return Array.from(set);
  }, [parsedTestCases]);

  const filteredTestCases = useMemo(() => (
    parsedTestCases.filter((testCase) => {
      const matchesPriority = priorityFilter === 'all' || testCase.priority === priorityFilter;
      const matchesModule = moduleFilter === 'all' || testCase.module === moduleFilter;
      return matchesPriority && matchesModule;
    })
  ), [moduleFilter, parsedTestCases, priorityFilter]);

  const totalStepCount = useMemo(() => (
    filteredTestCases.reduce((sum, testCase) => sum + (testCase.steps?.length || 0), 0)
  ), [filteredTestCases]);

  return (
    <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', p: 1.5, gap: 1.5, bgcolor: 'background.default', flexDirection: isNarrow ? 'column' : 'row' }}>
      <Paper elevation={0} sx={{ width: isNarrow ? '100%' : '35%', minWidth: 280, maxWidth: isNarrow ? 'none' : 480, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
        <PageHeader title="测试用例生成" subtitle="基于文件或文本上下文生成测试用例，并可保存到向量库。">
          <Box sx={{ display: 'flex', bgcolor: 'rgba(0,0,0,0.04)', borderRadius: 1.5, p: 0.5 }}>
            <Button
              disableElevation
              size="small"
              variant={mode === 'file' ? 'contained' : 'text'}
              onClick={() => setMode('file')}
              sx={{
                borderRadius: 1,
                py: 0.6,
                px: 2,
                color: mode === 'file' ? '#fff' : 'text.secondary',
                bgcolor: mode === 'file' ? 'primary.main' : 'transparent',
                fontWeight: mode === 'file' ? 600 : 500,
                boxShadow: 'none',
                whiteSpace: 'nowrap',
                minWidth: 88,
                transition: 'all 0.2s',
                '&:hover': {
                  bgcolor: mode === 'file' ? 'primary.dark' : 'rgba(0,0,0,0.04)'
                }
              }}
            >
              文件生成
            </Button>
            <Button
              disableElevation
              size="small"
              variant={mode === 'text' ? 'contained' : 'text'}
              onClick={() => setMode('text')}
              sx={{
                borderRadius: 1,
                py: 0.6,
                px: 2,
                color: mode === 'text' ? '#fff' : 'text.secondary',
                bgcolor: mode === 'text' ? 'primary.main' : 'transparent',
                fontWeight: mode === 'text' ? 600 : 500,
                boxShadow: 'none',
                whiteSpace: 'nowrap',
                minWidth: 88,
                transition: 'all 0.2s',
                '&:hover': {
                  bgcolor: mode === 'text' ? 'primary.dark' : 'rgba(0,0,0,0.04)'
                }
              }}
            >
              文本描述
            </Button>
          </Box>
        </PageHeader>

        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, overflowY: 'auto', bgcolor: 'background.paper' }}>
          <Paper elevation={0} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2.5, background: 'linear-gradient(180deg, rgba(26,115,232,0.06) 0%, #ffffff 100%)' }}>
            <Stack direction="row" spacing={1.25} alignItems="center">
              <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: 'primary.light', color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {mode === 'file' ? <UploadFile fontSize="small" /> : <DescriptionOutlined fontSize="small" />}
              </Box>
              <Box>
                <Typography variant="body2" fontWeight={600}>
                  {mode === 'file' ? '文件驱动生成' : '文本驱动生成'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {mode === 'file' ? '适合 PDF、OpenAPI、图片等输入，自动结合上下文生成用例。' : '适合快速描述模块、场景和测试诉求。'}
                </Typography>
              </Box>
            </Stack>
          </Paper>

          {mode === 'file' && (
            <Box>
              <Box
                sx={{
                  border: '2px dashed',
                  borderColor: dragOver ? '#6366f1' : file ? '#6366f1' : 'rgba(99,102,241,0.3)',
                  borderRadius: 2.5,
                  p: file ? 1.5 : 4,
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: file ? 'rgba(99,102,241,0.06)' : dragOver ? 'rgba(99,102,241,0.04)' : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                  boxShadow: (dragOver || file) ? 'inset 0 0 0 2px rgba(99,102,241,0.05)' : 'none',
                  transition: 'all 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 160,
                  '&:hover': { borderColor: '#6366f1', background: 'rgba(99,102,241,0.02)' },
                }}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFileSelect(e.dataTransfer.files[0]); }}
                onClick={() => !file && fileRef.current?.click()}
              >
                {file ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                    {previewUrl && (
                      <Box
                        component="img"
                        src={previewUrl}
                        sx={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 0.75, border: '1px solid', borderColor: 'divider' }}
                        alt="preview"
                      />
                    )}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      {cat && <Chip label={cat.icon} size="small" color="primary" sx={{ mb: 0.5, height: 18, fontSize: 10 }} />}
                      <Typography variant="body2" fontWeight={500} noWrap>{file.name}</Typography>
                      <Typography variant="caption" color="text.disabled">{fmtSize(file.size)}</Typography>
                    </Box>
                    <IconButton size="small" onClick={e => { e.stopPropagation(); clearFile(); }}>
                      <Typography variant="body2">X</Typography>
                    </IconButton>
                  </Box>
                ) : (
                  <>
                    <Box sx={{ width: 44, height: 44, borderRadius: '50%', bgcolor: 'primary.light', color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}>
                      <UploadFile fontSize="small" />
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      拖拽文件到此处，或 <Typography component="span" color="primary" fontWeight={500}>点击选择文件</Typography>
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'center', mt: 1, flexWrap: 'wrap' }}>
                      {FILE_CATEGORIES.map(c => (
                        <Chip key={c.label} label={`${c.icon} ${c.label}`} size="small" variant="outlined" />
                      ))}
                    </Box>
                  </>
                )}
              </Box>
              <input
                ref={fileRef}
                type="file"
                hidden
                accept={ACCEPT_STR}
                onChange={e => { handleFileSelect(e.target.files[0]); e.target.value = ''; }}
              />
            </Box>
          )}

          <TextField
            label="上下文信息"
            multiline
            rows={3}
            fullWidth
            placeholder={mode === 'file' ? '描述被测试系统的基本信息，或补充文件未覆盖的背景' : '描述被测试的系统、功能或模块的基本信息'}
            value={context}
            onChange={e => setContext(e.target.value)}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5, bgcolor: '#f8fafc' } }}
          />
          <TextField
            label="测试需求"
            multiline
            rows={3}
            fullWidth
            placeholder="描述希望生成的测试用例类型和重点关注的测试场景"
            value={requirements}
            onChange={e => setRequirements(e.target.value)}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5, bgcolor: '#f8fafc' } }}
          />
          <Autocomplete
            freeSolo
            options={availableModules}
            value={moduleName}
            onChange={(e, newValue) => setModuleName(newValue || '')}
            onInputChange={(e, newInputValue) => setModuleName(newInputValue)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="所属模块（可选）"
                placeholder="选择或输入模块名"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5, bgcolor: '#f8fafc' } }}
              />
            )}
            size="small"
          />

          <FormControl fullWidth size="small">
            <InputLabel>生成模板</InputLabel>
            <Select
              value={styleId}
              label="生成模板"
              onChange={(e) => setStyleId(e.target.value)}
              sx={{ borderRadius: 1.5, bgcolor: '#f8fafc' }}
            >
              {templateOptions.map((option) => (
                <MenuItem key={option.id} value={option.id}>
                  {option.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Autocomplete
            multiple
            options={skillOptions}
            getOptionLabel={(option) => option.name}
            value={skillOptions.filter((option) => selectedSkillIds.includes(option.id))}
            onChange={(e, newValue) => setSelectedSkillIds(newValue.map((item) => item.id))}
            renderInput={(params) => (
              <TextField
                {...params}
                label="专项技能"
                placeholder="选择需要强化的测试覆盖维度"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5, bgcolor: '#f8fafc' } }}
              />
            )}
            renderTags={(value, getTagProps) => value.map((option, index) => (
              <Chip {...getTagProps({ index })} key={option.id} label={option.name} size="small" />
            ))}
            isOptionEqualToValue={(option, value) => option.id === value.id}
          />

          <Paper elevation={0} sx={{ p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: '#fbfcff' }}>
            <Typography variant="body2" fontWeight={700} sx={{ mb: 0.75 }}>
              当前生成策略
            </Typography>
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
              <Chip
                size="small"
                color="primary"
                label={`模板：${templateOptions.find((option) => option.id === styleId)?.name || '默认模板'}`}
              />
              <Chip
                size="small"
                variant="outlined"
                label={selectedSkillIds.length ? `技能：${selectedSkillIds.length}项` : '技能：未选择'}
              />
              {selectedSkillIds.map((skillId) => {
                const skill = skillOptions.find((option) => option.id === skillId);
                return skill ? <Chip key={skillId} size="small" variant="outlined" label={skill.name} /> : null;
              })}
            </Stack>
          </Paper>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              fullWidth={isNarrow}
              onClick={generate}
              disabled={generating || !context.trim() || !requirements.trim() || (mode === 'file' && !file)}
              sx={{
                mt: 0.5,
                minWidth: isNarrow ? '100%' : 180,
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
              startIcon={generating ? <Box sx={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 1s linear infinite' }} /> : <AutoFixHigh />}
            >
              {generating ? '正在生成...' : mode === 'file' ? '基于文件生成' : '生成测试用例'}
            </Button>
            <Button
              variant="outlined"
              onClick={handleReset}
              disabled={generating}
              sx={{
                mt: 0.5,
                minWidth: 100,
                color: 'text.secondary',
                borderColor: 'divider',
                '&:hover': {
                  borderColor: 'text.secondary',
                  bgcolor: 'rgba(0,0,0,0.04)'
                }
              }}
            >
              清空重置
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
              生成会流式输出，完成后可切换列表/导图并导出。
            </Typography>
          </Box>
        </Box>
      </Paper>

      <Paper elevation={0} sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
        <PageHeader title="生成结果" subtitle="支持列表、导图和向量库存储。">
          <Tooltip title={!vectorStatus?.available ? "向量库未就绪，无法使用该功能" : "开启后，生成用例时将进行全库语义搜索参考"}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
                whiteSpace: 'nowrap',
                bgcolor: (vectorStatus?.available && useVector) ? 'rgba(59,130,246,0.05)' : '#ffffff',
                border: '1px solid',
                borderColor: (vectorStatus?.available && useVector) ? 'rgba(59,130,246,0.4)' : 'divider',
                borderRadius: 2.5,
                p: 0.5,
                boxShadow: (vectorStatus?.available && useVector) ? '0 0 0 3px rgba(59,130,246,0.1)' : '0 1px 3px rgba(15,23,42,0.05)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover': {
                  bgcolor: (vectorStatus?.available && useVector) ? 'rgba(59,130,246,0.08)' : '#f8fafc',
                  borderColor: (vectorStatus?.available && useVector) ? 'rgba(59,130,246,0.6)' : 'rgba(99,102,241,0.3)',
                }
              }}
            >
              {/* Status Indicator Badge */}
              <Box
                onClick={checkVectorStatus}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  cursor: 'pointer',
                  py: 0.5,
                  px: 1.25,
                  borderRadius: 2,
                  bgcolor: vectorStatus?.available ? 'rgba(16,185,129,0.1)' : 'rgba(148,163,184,0.1)',
                  transition: 'background 0.2s',
                  '&:hover': { bgcolor: vectorStatus?.available ? 'rgba(16,185,129,0.15)' : 'rgba(148,163,184,0.15)' }
                }}
                title="点击刷新连接状态"
              >
                <Box sx={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, bgcolor: vectorStatus?.available ? '#10b981' : '#94a3b8', boxShadow: vectorStatus?.available ? '0 0 6px rgba(16,185,129,0.5)' : 'none' }} />
                <Typography variant="caption" sx={{ color: vectorStatus?.available ? '#059669' : '#64748b', fontWeight: 800, whiteSpace: 'nowrap' }}>
                  {vectorStatus?.available ? '向量库就绪' : '向量库异常'}
                </Typography>
              </Box>

              {/* Decorative Divider */}
              <Box sx={{ width: '1px', height: '18px', bgcolor: 'divider', mx: 1.25, flexShrink: 0 }} />

              {/* Premium Switch */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1.5, pl: 0.25 }}>
                <Switch
                  checked={vectorStatus?.available && useVector}
                  onChange={(e) => setUseVector(e.target.checked)}
                  disabled={!vectorStatus?.available || generating}
                  disableRipple
                  sx={{
                    width: 38,
                    height: 22,
                    padding: 0,
                    margin: 0,
                    display: 'flex',
                    flexShrink: 0,
                    '&:active': {
                      '& .MuiSwitch-thumb': { width: 18 },
                      '& .MuiSwitch-switchBase.Mui-checked': { transform: 'translateX(9px)' },
                    },
                    '& .MuiSwitch-switchBase': {
                      padding: 2,
                      '&.Mui-checked': {
                        transform: 'translateX(16px)',
                        color: '#fff',
                        '& + .MuiSwitch-track': {
                          opacity: 1,
                          backgroundColor: '#3b82f6',
                          backgroundImage: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                        },
                      },
                    },
                    '& .MuiSwitch-thumb': {
                      boxShadow: '0 2px 4px 0 rgb(0 0 0 / 20%)',
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      transition: 'width 200ms cubic-bezier(0.4, 0, 0.2, 1) 0ms, transform 200ms cubic-bezier(0.4, 0, 0.2, 1) 0ms',
                    },
                    '& .MuiSwitch-track': {
                      borderRadius: 11,
                      opacity: 1,
                      backgroundColor: 'rgba(0,0,0,.15)',
                      boxSizing: 'border-box',
                    },
                  }}
                />
                <Typography variant="body2" sx={{ fontWeight: 700, color: (vectorStatus?.available && useVector) ? '#1e40af' : (vectorStatus?.available ? '#475569' : 'text.disabled'), userSelect: 'none', whiteSpace: 'nowrap' }}>
                  参考检索
                </Typography>
              </Box>
            </Box>
          </Tooltip>
        </PageHeader>
        <Box sx={{ flex: 1, p: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.paper' }}>
          {(hasResult || generating) && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, gap: 1.25, flexWrap: 'wrap' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                <Typography variant="subtitle1" fontWeight={600}>
                  {generating ? 'AI正在生成测试用例...' : '当前结果看板'}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                {!generating && hasResult && (
                  <Box sx={{ display: 'flex', bgcolor: 'rgba(0,0,0,0.04)', borderRadius: 1.5, p: 0.5 }}>
                    <Button disableElevation size="small" variant={viewMode === 'stages' ? 'contained' : 'text'} onClick={() => setViewMode('stages')} sx={{ borderRadius: 1, py: 0.5, px: 1.5, minWidth: 60, whiteSpace: 'nowrap', color: viewMode === 'stages' ? '#fff' : 'text.secondary', bgcolor: viewMode === 'stages' ? 'primary.main' : 'transparent', fontWeight: viewMode === 'stages' ? 600 : 500, boxShadow: 'none', transition: 'all 0.2s', '&:hover': { bgcolor: viewMode === 'stages' ? 'primary.dark' : 'rgba(0,0,0,0.04)' } }}>阶段</Button>
                    {parsedTestCases.length > 0 && (
                      <>
                        <Button disableElevation size="small" variant={viewMode === 'list' ? 'contained' : 'text'} onClick={() => setViewMode('list')} sx={{ borderRadius: 1, py: 0.5, px: 1.5, minWidth: 60, whiteSpace: 'nowrap', color: viewMode === 'list' ? '#fff' : 'text.secondary', bgcolor: viewMode === 'list' ? 'primary.main' : 'transparent', fontWeight: viewMode === 'list' ? 600 : 500, boxShadow: 'none', transition: 'all 0.2s', '&:hover': { bgcolor: viewMode === 'list' ? 'primary.dark' : 'rgba(0,0,0,0.04)' } }}>列表</Button>
                        <Button disableElevation size="small" variant={viewMode === 'mindmap' ? 'contained' : 'text'} onClick={() => setViewMode('mindmap')} sx={{ borderRadius: 1, py: 0.5, px: 1.5, minWidth: 60, whiteSpace: 'nowrap', color: viewMode === 'mindmap' ? '#fff' : 'text.secondary', bgcolor: viewMode === 'mindmap' ? 'primary.main' : 'transparent', fontWeight: viewMode === 'mindmap' ? 600 : 500, boxShadow: 'none', transition: 'all 0.2s', '&:hover': { bgcolor: viewMode === 'mindmap' ? 'primary.dark' : 'rgba(0,0,0,0.04)' } }}>导图</Button>
                      </>
                    )}
                  </Box>
                )}
                <Tooltip title={generating ? '正在生成中，请稍候...' : !hasResult ? '请先生成测试用例' : !vectorStatus?.available ? '向量库连接异常，暂时无法入库' : '将用例存储至向量库，供后续 RAG 时作为相似案例检索提取'}>
                  <span>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={storeToVector}
                      disabled={storingVector || !hasResult || generating || !vectorStatus?.available}
                      startIcon={<Schema fontSize="small" />}
                      sx={{
                        borderColor: 'rgba(226,232,240,0.8)',
                        '&:hover': { background: 'rgba(59,130,246,0.04)' }
                      }}
                    >
                      {storingVector ? '存储中...' : '存入向量库'}
                    </Button>
                  </span>
                </Tooltip>
                {hasResult && !generating && (
                  <>
                    <Button variant="outlined" size="small" onClick={(e) => setExportAnchorEl(e.currentTarget)} startIcon={<SaveAlt fontSize="small" />}>用例导出</Button>
                    <Menu anchorEl={exportAnchorEl} open={Boolean(exportAnchorEl)} onClose={() => setExportAnchorEl(null)}>
                      <MenuItem onClick={exportExcel} sx={{ minWidth: 150 }}>导出为 Excel</MenuItem>
                      <MenuItem onClick={exportXMind} sx={{ minWidth: 150 }}>导出为 XMind</MenuItem>
                    </Menu>
                  </>
                )}
              </Box>
            </Box>
          )}

          {hasResult && !generating && (
            <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
              <Paper elevation={0} sx={{ flex: '1 1 180px', p: 2, border: '1px solid rgba(226,232,240,0.8)', borderRadius: 3, background: 'linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(255,255,255,0.8) 100%)', boxShadow: '0 4px 16px rgba(15,23,42,0.03)' }}>
                <Typography variant="body2" sx={{ color: '#475569', fontWeight: 600 }}>当前显示用例</Typography>
                <Typography sx={{ mt: 1.5, fontSize: 28, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
                  {parsedTestCases.length > 0 ? `${filteredTestCases.length} / ${parsedTestCases.length}` : '-'}
                </Typography>
              </Paper>
              <Paper elevation={0} sx={{ flex: '1 1 180px', p: 2, border: '1px solid rgba(226,232,240,0.8)', borderRadius: 3, background: 'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(255,255,255,0.8) 100%)', boxShadow: '0 4px 16px rgba(15,23,42,0.03)' }}>
                <Typography variant="body2" sx={{ color: '#475569', fontWeight: 600 }}>输出视图</Typography>
                <Typography sx={{ mt: 1.5, fontSize: 28, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{viewMode === 'stages' ? '阶段' : parsedTestCases.length > 0 ? (viewMode === 'list' ? '列表' : '导图') : 'Markdown'}</Typography>
              </Paper>
              <Paper elevation={0} sx={{ flex: '1 1 220px', p: 2, border: '1px solid rgba(226,232,240,0.8)', borderRadius: 3, background: 'linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(255,255,255,0.8) 100%)', boxShadow: '0 4px 16px rgba(15,23,42,0.03)' }}>
                <Typography variant="body2" sx={{ color: '#475569', fontWeight: 600 }}>步骤总数</Typography>
                <Typography sx={{ mt: 1.5, fontSize: 28, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{parsedTestCases.length > 0 ? totalStepCount : '-'}</Typography>
              </Paper>
              <Paper elevation={0} sx={{ flex: '1 1 220px', p: 2, border: '1px solid rgba(226,232,240,0.8)', borderRadius: 3, background: 'linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(255,255,255,0.8) 100%)', boxShadow: '0 4px 16px rgba(15,23,42,0.03)' }}>
                <Typography variant="body2" sx={{ color: '#475569', fontWeight: 600 }}>向量库状态</Typography>
                <Typography sx={{ mt: 1.5, fontSize: 28, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{vectorStatus?.available ? '可存储' : '不可用'}</Typography>
              </Paper>
            </Box>
          )}

          {!generating && parsedTestCases.length > 0 && (
            <Paper
              elevation={0}
              sx={{
                mb: 1.5,
                p: 1.5,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2.5,
                bgcolor: '#fbfcff',
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.25, flexWrap: 'wrap', mb: 1 }}>
                <Box>
                  <Typography variant="body2" fontWeight={700}>
                    结果快速筛选
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    按模块和优先级快速定位要查看或导出的测试用例。
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  当前导出与导图均基于筛选结果
                </Typography>
              </Box>

              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25}>
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel>模块</InputLabel>
                  <Select
                    value={moduleFilter}
                    label="模块"
                    onChange={(e) => setModuleFilter(e.target.value)}
                    sx={{ borderRadius: 2, bgcolor: '#ffffff' }}
                  >
                    <MenuItem value="all">全部模块</MenuItem>
                    {moduleOptions.map((option) => (
                      <MenuItem key={option} value={option}>{option}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel>优先级</InputLabel>
                  <Select
                    value={priorityFilter}
                    label="优先级"
                    onChange={(e) => setPriorityFilter(e.target.value)}
                    sx={{ borderRadius: 2, bgcolor: '#ffffff' }}
                  >
                    <MenuItem value="all">全部优先级</MenuItem>
                    {priorityOptions.map((option) => (
                      <MenuItem key={option} value={option}>{option}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                  {moduleFilter !== 'all' && <Chip size="small" label={`模块: ${moduleFilter}`} onDelete={() => setModuleFilter('all')} />}
                  {priorityFilter !== 'all' && <Chip size="small" label={`优先级: ${priorityFilter}`} onDelete={() => setPriorityFilter('all')} />}
                  {(moduleFilter !== 'all' || priorityFilter !== 'all') && (
                    <Button size="small" onClick={() => { setModuleFilter('all'); setPriorityFilter('all'); }}>
                      清空筛选
                    </Button>
                  )}
                </Box>
              </Stack>
            </Paper>
          )}

          {generating ? (
            <StageOutput content={streamingContent} />
          ) : hasResult ? (
            viewMode === 'stages' ? (
              <StageOutput content={streamingContent} isComplete />
            ) : viewMode === 'mindmap' && parsedTestCases.length > 0 ? (
              <TestCaseMindMap testCases={filteredTestCases} />
            ) : parsedTestCases.length > 0 ? (
              <TestCaseListView testCases={filteredTestCases} />
            ) : (
              <Paper variant="outlined" sx={{ flex: 1, p: 1.75, overflow: 'auto', borderRadius: 2.5, bgcolor: '#fbfcff' }}>
                <Box className="chat-markdown" sx={{ fontSize: 13, lineHeight: 1.6, '& pre': { whiteSpace: 'pre-wrap' } }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown>
                </Box>
              </Paper>
            )
          ) : (
            <EmptyState
              title="暂无生成结果"
              description={mode === 'file' ? '上传文件并填写上下文与测试需求后，即可开始生成测试用例。' : '填写上下文和测试需求后，即可开始生成测试用例。'}
            />
          )}
        </Box>
      </Paper>
    </Box>
  );
}
