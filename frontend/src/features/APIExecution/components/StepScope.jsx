import React from 'react';
import {
  Stack,
  Box,
  Typography,
  Button,
  Checkbox,
  Chip,
  Paper,
  TextField,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
} from '@mui/material';
import { AutoAwesome } from '@mui/icons-material';
import { useAPIExecution } from '../context';
import { apiExecutionAPI } from '../../../api/execution';
import EmptyState from '../../../components/EmptyState';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { METHOD_COLORS } from '../constants';
import StageHeader from './StageHeader';
import AIFlowDraftDialog from './AIFlowDraftDialog';
import AssetAgentWorkbench from './AssetAgentWorkbench';

const getOperationKey = (operation) => operation.id || `${operation.method}-${operation.path}-${operation.operation_id}`;

const getOperationRisk = (method = '') => {
  const normalized = method.toUpperCase();
  if (normalized === 'GET') return { value: 'readonly', label: '只读', color: 'success' };
  if (normalized === 'DELETE') return { value: 'high', label: '高风险', color: 'error' };
  if (['POST', 'PUT', 'PATCH'].includes(normalized)) return { value: 'write', label: '写入', color: 'warning' };
  return { value: 'normal', label: '接口', color: 'default' };
};

const methodMatches = (operation, filter) => {
  const method = operation.method?.toUpperCase();
  if (!filter || filter === 'all') return true;
  if (filter === 'WRITE') return ['POST', 'PUT', 'PATCH'].includes(method);
  return method === filter;
};

const riskMatches = (operation, filter) => {
  if (!filter || filter === 'all') return true;
  return getOperationRisk(operation.method).value === filter;
};

const formatTag = (tag) => (typeof tag === 'string' ? tag : JSON.stringify(tag));

export default function StepScope({ showAssetWorkbench = true, title = '挑选范围工作台' } = {}) {
  const {
    spec,
    selectedOperationIds,
    setSelectedOperationIds,
    generateDsl,
    filteredOperations,
    toggleOperation,
    searchText,
    setSearchText,
    tagOptions,
    setDslText,
    setRunStepId,
    setActiveStep,
    projectName,
    environmentName,
    baseUrl,
    buildProjectPolicySnapshot,
    loading,
    setLoading,
  } = useAPIExecution();

  const [tagFilter, setTagFilter] = React.useState('all');
  const [methodFilter, setMethodFilter] = React.useState('all');
  const [riskFilter, setRiskFilter] = React.useState('all');
  const [businessGoal, setBusinessGoal] = React.useState('');
  const [flowDraft, setFlowDraft] = React.useState(null);
  const [draftDialogOpen, setDraftDialogOpen] = React.useState(false);
  const [confirmDialog, setConfirmDialog] = React.useState({ open: false, message: '', onConfirm: null });

  const scopedOperations = React.useMemo(() => (
    filteredOperations.filter((operation) => {
      const tags = (operation.tags || []).map(formatTag);
      const tagMatched = tagFilter === 'all' || (tagFilter === '__untagged__' ? !tags.length : tags.includes(tagFilter));
      return tagMatched && methodMatches(operation, methodFilter) && riskMatches(operation, riskFilter);
    })
  ), [filteredOperations, tagFilter, methodFilter, riskFilter]);

  const selectedOperations = React.useMemo(() => (
    (spec?.operations || []).filter((operation) => selectedOperationIds.has(getOperationKey(operation)))
  ), [spec, selectedOperationIds]);

  const selectedSummary = React.useMemo(() => {
    const summary = { total: spec?.operations?.length || 0, selected: selectedOperations.length, get: 0, write: 0, high: 0 };
    selectedOperations.forEach((operation) => {
      const method = operation.method?.toUpperCase();
      const risk = getOperationRisk(method);
      if (method === 'GET') summary.get += 1;
      if (risk.value === 'write') summary.write += 1;
      if (risk.value === 'high') summary.high += 1;
    });
    return summary;
  }, [spec, selectedOperations]);

  const dynamicSuggestions = React.useMemo(() => {
    if (!spec?.operations || spec.operations.length === 0) {
      return ['测试主要接口的鉴权拦截机制', '构建核心链路流转', '批量查询数据的基本验证'];
    }
    
    const ops = spec.operations;
    const paths = ops.map(op => op.path.toLowerCase());
    const suggestions = [];

    // Rule 1: Auth / Login
    if (paths.some(p => p.includes('/login') || p.includes('/auth') || p.includes('/token'))) {
      suggestions.push('测试用户登录鉴权及 Token 刷新机制');
    }

    // Rule 2: Core Business Entities (e.g., Orders, Payments, Users)
    const entities = ['order', 'payment', 'user', 'product', 'cart'];
    let foundEntity = null;
    for (const entity of entities) {
      if (paths.some(p => p.includes(`/${entity}`))) {
        foundEntity = entity === 'user' ? '用户' : 
                      entity === 'order' ? '订单' : 
                      entity === 'payment' ? '支付' : 
                      entity === 'product' ? '商品' : '购物车';
        break;
      }
    }
    if (foundEntity) {
      suggestions.push(`构建${foundEntity}业务的完整创建与查询链路`);
    }

    // Rule 3: CRUD Lifecycle Detection
    const hasPost = ops.some(op => op.method.toUpperCase() === 'POST');
    const hasGet = ops.some(op => op.method.toUpperCase() === 'GET');
    const hasDelete = ops.some(op => op.method.toUpperCase() === 'DELETE');
    if (hasPost && hasGet && hasDelete) {
      suggestions.push('测试核心资源的新增、查询、修改与删除全生命周期');
    }

    // Rule 4: Validation boundary
    suggestions.push('遍历并测试主要接口的必填字段与边界异常');

    // Return top 3 unique suggestions
    return Array.from(new Set(suggestions)).slice(0, 3);
  }, [spec?.operations]);

  const currentOperationIds = scopedOperations.map(getOperationKey);
  const selectedInCurrent = currentOperationIds.filter((id) => selectedOperationIds.has(id)).length;
  const hasActiveFilter = Boolean(searchText.trim()) || tagFilter !== 'all' || methodFilter !== 'all' || riskFilter !== 'all';

  const selectCurrentOperations = () => {
    setSelectedOperationIds((prev) => {
      const next = new Set(prev);
      currentOperationIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const unselectCurrentOperations = () => {
    setSelectedOperationIds((prev) => {
      const next = new Set(prev);
      currentOperationIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  const clearFilters = () => {
    setSearchText('');
    setTagFilter('all');
    setMethodFilter('all');
    setRiskFilter('all');
  };

  const handleGenerateDsl = () => {
    if (selectedSummary.high > 0) {
      setConfirmDialog({
        open: true,
        message: `当前选择包含 ${selectedSummary.high} 个高风险接口，确认继续生成测试脚本？`,
        onConfirm: () => { setConfirmDialog({ open: false, message: '', onConfirm: null }); generateDsl(); },
      });
      return;
    }
    generateDsl();
  };

  const handleGenerateFlowDraft = async () => {
    if (!spec?.spec_id) return;
    const goal = businessGoal.trim();
    if (!goal) return;
    setLoading(true);
    try {
      const data = await apiExecutionAPI.generateFlowDraft({
        specId: spec.spec_id,
        businessGoal: goal,
        operationIds: Array.from(selectedOperationIds),
        projectName,
        environmentName,
        baseUrl,
        projectPolicySnapshot: buildProjectPolicySnapshot(),
      });
      setFlowDraft(data);
      setDraftDialogOpen(true);
    } catch (error) {
      setConfirmDialog({
        open: true,
        message: error.message || 'AI 流程草稿生成失败，请调整业务目标或接口范围后重试。',
        onConfirm: () => setConfirmDialog({ open: false, message: '', onConfirm: null }),
      });
    } finally {
      setLoading(false);
    }
  };

  const applyFlowDraft = () => {
    if (!flowDraft?.draft_script) return;
    setDslText(JSON.stringify(flowDraft.draft_script, null, 2));
    setRunStepId(flowDraft.draft_script.steps?.[0]?.id || '');
    setDraftDialogOpen(false);
    setActiveStep(2);
  };

  const applyTemplateRecommendation = (template) => {
    if (!template?.script?.steps?.length) return;
    setDslText(JSON.stringify(template.script, null, 2));
    setRunStepId(template.script.steps?.[0]?.id || '');
    setDraftDialogOpen(false);
    setActiveStep(2);
  };

  const mergeTemplateRecommendation = (template) => {
    if (!flowDraft?.draft_script || !template?.script?.steps?.length) return;
    const draftSteps = flowDraft.draft_script.steps || [];
    const idMap = new Map((template.script.steps || []).map((step, index) => [step.id, `tpl_${index + 1}_${step.id || index + 1}`]));
    const remappedSteps = (template.script.steps || []).map((step, index) => {
      const remappedDeps = (step.depends_on || []).map((dep) => idMap.get(dep)).filter(Boolean);
      return {
        ...step,
        id: idMap.get(step.id) || `tpl_${index + 1}`,
        depends_on: index === 0 && draftSteps.length ? [draftSteps[draftSteps.length - 1].id] : remappedDeps,
      };
    });
    const mergedScript = {
      ...flowDraft.draft_script,
      name: `${flowDraft.draft_script.name || 'AI 流程草稿'} + ${template.name || '模板片段'}`,
      steps: [...draftSteps, ...remappedSteps],
    };
    setFlowDraft((prev) => ({
      ...prev,
      draft_script: mergedScript,
      step_summaries: [
        ...(prev?.step_summaries || []),
        ...remappedSteps.map((step) => ({
          step_id: step.id,
          name: step.name,
          method: step.method,
          path: step.path,
          depends_on: step.depends_on || [],
          extractions: step.extractions || [],
          variable_references: [],
          assertion_recommendations: step.assertions || [],
          assertion_count: (step.assertions || []).length,
        })),
      ],
      summary: `已合并推荐模板「${template.name || template.template_id}」，请确认步骤顺序、变量引用和断言。`,
    }));
  };

  return (
    <>
    <Stack spacing={3}>
                <StageHeader
                  title={title}
                  action={(
                    <Button variant="contained" color="primary" disabled={!selectedOperationIds.size} onClick={handleGenerateDsl}>
                      生成测试脚本 ({selectedOperationIds.size})
                    </Button>
                  )}
                />

                {showAssetWorkbench && <AssetAgentWorkbench />}
                
                <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid rgba(255, 255, 255, 0.6)', background: 'rgba(255, 255, 255, 0.4)', backdropFilter: 'blur(10px)', boxShadow: '0 8px 32px rgba(15, 23, 42, 0.04)' }}>
                  <Stack spacing={2.5}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' }, gap: 1.5 }}>
                      <Paper elevation={0} sx={{ p: 1.5, border: '1px solid rgba(255, 255, 255, 0.8)', borderRadius: 2, bgcolor: 'rgba(255, 255, 255, 0.6)' }}>
                        <Typography variant="caption" color="text.secondary">接口总数</Typography>
                        <Typography variant="h6" fontWeight={800}>{selectedSummary.total}</Typography>
                      </Paper>
                      <Paper elevation={0} sx={{ p: 1.5, border: '1px solid', borderColor: selectedSummary.selected ? 'primary.light' : 'rgba(255, 255, 255, 0.8)', borderRadius: 2, bgcolor: selectedSummary.selected ? 'rgba(99, 102, 241, 0.08)' : 'rgba(255, 255, 255, 0.6)' }}>
                        <Typography variant="caption" color="text.secondary">已选范围</Typography>
                        <Typography variant="h6" fontWeight={800}>{selectedSummary.selected}</Typography>
                      </Paper>
                      <Paper elevation={0} sx={{ p: 1.5, border: '1px solid rgba(255, 255, 255, 0.8)', borderRadius: 2, bgcolor: 'rgba(255, 255, 255, 0.6)' }}>
                        <Typography variant="caption" color="text.secondary">只读 GET</Typography>
                        <Typography variant="h6" fontWeight={800} color="success.main">{selectedSummary.get}</Typography>
                      </Paper>
                      <Paper elevation={0} sx={{ p: 1.5, border: '1px solid rgba(255, 255, 255, 0.8)', borderRadius: 2, bgcolor: 'rgba(255, 255, 255, 0.6)' }}>
                        <Typography variant="caption" color="text.secondary">写入接口</Typography>
                        <Typography variant="h6" fontWeight={800} color="warning.main">{selectedSummary.write}</Typography>
                      </Paper>
                      <Paper elevation={0} sx={{ p: 1.5, border: '1px solid', borderColor: selectedSummary.high ? 'error.light' : 'rgba(255, 255, 255, 0.8)', borderRadius: 2, bgcolor: selectedSummary.high ? 'rgba(211, 47, 47, 0.06)' : 'rgba(255, 255, 255, 0.6)' }}>
                        <Typography variant="caption" color="text.secondary">高风险</Typography>
                        <Typography variant="h6" fontWeight={800} color="error.main">{selectedSummary.high}</Typography>
                      </Paper>
                    </Box>

                    {selectedSummary.high > 0 && (
                      <Alert severity="warning">
                        已选范围包含 DELETE 或高风险接口，生成脚本前请确认目标环境和数据隔离策略。
                      </Alert>
                    )}

                    <Box sx={{ 
                      p: 3, borderRadius: 4, 
                      bgcolor: 'rgba(255, 255, 255, 0.7)',
                      border: '1px solid',
                      borderColor: 'primary.light',
                      boxShadow: '0 4px 20px -4px rgba(99, 102, 241, 0.15)',
                      position: 'relative',
                      overflow: 'hidden',
                      mb: 2
                    }}>
                      <Box sx={{ 
                        position: 'absolute', top: 0, left: 0, right: 0, height: '4px',
                        background: 'linear-gradient(90deg, #6366f1, #a855f7, #ec4899)'
                      }} />
                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'flex-start' }}>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="subtitle1" fontWeight={800} color="primary.main" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                            <AutoAwesome fontSize="small" /> AI 智能编排
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                            输入您的测试目标或业务场景，AI 将基于当前分析的接口资产，自动为您推演出完整的流转步骤与断言逻辑。
                          </Typography>
                          
                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 1 }}>
                            <TextField
                              size="medium"
                              fullWidth
                              value={businessGoal}
                              onChange={(event) => setBusinessGoal(event.target.value)}
                              placeholder="例如：模拟一个新用户注册、登录、下单并最终支付成功的完整链路..."
                              sx={{ 
                                '& .MuiOutlinedInput-root': {
                                  bgcolor: '#fff',
                                  borderRadius: 2,
                                  height: '56px', // Explicit height matching default medium TextField
                                  transition: 'all 0.3s',
                                  '&:hover fieldset': { borderColor: 'primary.main' },
                                  '&.Mui-focused fieldset': {
                                    borderColor: 'secondary.main',
                                    borderWidth: '2px',
                                  }
                                }
                              }}
                            />
                            <Button
                              variant="contained"
                              sx={{ 
                                borderRadius: 2, px: 4, fontWeight: 800, whiteSpace: 'nowrap',
                                height: '56px', // Explicitly match TextField height for perfect symmetry
                                background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                                '&:hover': { background: 'linear-gradient(135deg, #4f46e5 0%, #9333ea 100%)', boxShadow: '0 4px 12px rgba(168, 85, 247, 0.4)' }
                              }}
                              disabled={!spec?.spec_id || !businessGoal.trim() || loading}
                              onClick={handleGenerateFlowDraft}
                            >
                              <AutoAwesome fontSize="small" sx={{ mr: 1 }} /> 生成流程草稿
                            </Button>
                          </Stack>
                          
                          <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
                            <Typography variant="caption" color="text.secondary" sx={{ py: 0.5, mr: 1 }}>灵感推荐:</Typography>
                            {dynamicSuggestions.map(tip => (
                              <Chip 
                                key={tip} 
                                label={tip} 
                                size="small" 
                                variant="outlined" 
                                onClick={() => setBusinessGoal(tip)}
                                sx={{ 
                                  bgcolor: 'rgba(255,255,255,0.5)', 
                                  cursor: 'pointer',
                                  '&:hover': { bgcolor: 'primary.50', borderColor: 'primary.main', color: 'primary.main' }
                                }} 
                              />
                            ))}
                          </Stack>
                        </Box>
                      </Stack>
                    </Box>

                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr 1fr' }, gap: 1.5 }}>
                      <TextField fullWidth size="small" placeholder="搜索接口 / 路径 / 方法 / operationId" value={searchText} onChange={e => setSearchText(e.target.value)} />
                      <FormControl size="small">
                        <InputLabel>Tag</InputLabel>
                        <Select label="Tag" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
                          <MenuItem value="all">全部 Tag</MenuItem>
                          {tagOptions.map((tag) => <MenuItem key={formatTag(tag)} value={formatTag(tag)}>{formatTag(tag)}</MenuItem>)}
                          <MenuItem value="__untagged__">未分组</MenuItem>
                        </Select>
                      </FormControl>
                      <FormControl size="small">
                        <InputLabel>方法</InputLabel>
                        <Select label="方法" value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)}>
                          <MenuItem value="all">全部方法</MenuItem>
                          <MenuItem value="GET">GET</MenuItem>
                          <MenuItem value="WRITE">POST/PUT/PATCH</MenuItem>
                          <MenuItem value="DELETE">DELETE</MenuItem>
                        </Select>
                      </FormControl>
                      <FormControl size="small">
                        <InputLabel>风险</InputLabel>
                        <Select label="风险" value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
                          <MenuItem value="all">全部风险</MenuItem>
                          <MenuItem value="readonly">只读</MenuItem>
                          <MenuItem value="write">写入</MenuItem>
                          <MenuItem value="high">高风险</MenuItem>
                        </Select>
                      </FormControl>
                    </Box>

                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Button variant="outlined" disabled={!scopedOperations.length} onClick={selectCurrentOperations}>选择当前筛选结果</Button>
                      <Button variant="outlined" disabled={!selectedInCurrent} onClick={unselectCurrentOperations}>取消当前筛选结果</Button>
                      <Button variant="text" color="error" disabled={!selectedOperationIds.size} onClick={() => setSelectedOperationIds(new Set())}>清空已选</Button>
                      {hasActiveFilter && <Button variant="text" onClick={clearFilters}>清除筛选</Button>}
                      <Typography variant="caption" color="text.secondary">
                        当前显示 {scopedOperations.length} 个，已选 {selectedInCurrent} 个
                      </Typography>
                    </Stack>

                  <TableContainer sx={{ maxHeight: 500, borderRadius: 2, border: '1px solid rgba(255, 255, 255, 0.6)', bgcolor: 'rgba(255, 255, 255, 0.5)' }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell padding="checkbox"></TableCell>
                          <TableCell>方法</TableCell>
                          <TableCell>风险</TableCell>
                          <TableCell>路径</TableCell>
                          <TableCell>描述</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {scopedOperations.map((op, index) => {
                          const opKey = getOperationKey(op);
                          const isSelected = selectedOperationIds.has(opKey);
                          const risk = getOperationRisk(op.method);
                          return (
                            <TableRow 
                              key={opKey} 
                              hover 
                              onClick={() => toggleOperation(opKey)} 
                              sx={{ 
                                cursor: 'pointer',
                                opacity: 0,
                                animation: 'fadeSlideUp 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
                                animationDelay: `${Math.min(index * 0.03, 1.5)}s`,
                                '@keyframes fadeSlideUp': {
                                  '0%': { opacity: 0, transform: 'translateY(12px)' },
                                  '100%': { opacity: 1, transform: 'translateY(0)' },
                                },
                                '&:hover': {
                                  bgcolor: 'rgba(99, 102, 241, 0.04) !important',
                                }
                              }}
                            >
                              <TableCell padding="checkbox"><Checkbox size="small" checked={isSelected} /></TableCell>
                              <TableCell><Chip size="small" label={op.method} color={METHOD_COLORS[op.method] || 'default'} variant="outlined" sx={{ fontWeight: 800 }} /></TableCell>
                              <TableCell><Chip size="small" label={risk.label} color={risk.color} variant={risk.value === 'high' ? 'filled' : 'outlined'} /></TableCell>
                              <TableCell sx={{ fontFamily: 'monospace' }}>{op.path}</TableCell>
                              <TableCell color="text.secondary">{op.summary}</TableCell>
                            </TableRow>
                          );
                        })}
                        {!scopedOperations.length && (
                          <TableRow>
                            <TableCell colSpan={5}>
                              <EmptyState compact title="没有匹配接口" description="请调整搜索词或筛选条件。" />
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  </Stack>
                </Paper>
              </Stack>
      <ConfirmDialog
        open={confirmDialog.open}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ open: false, message: '', onConfirm: null })}
        danger
      />
      <AIFlowDraftDialog
        open={draftDialogOpen}
        draft={flowDraft}
        onClose={() => setDraftDialogOpen(false)}
        onApply={applyFlowDraft}
        onApplyTemplate={applyTemplateRecommendation}
        onMergeTemplate={mergeTemplateRecommendation}
      />
  </>
  );
}
