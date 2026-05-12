import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { ExpandMoreOutlined } from '@mui/icons-material';
import { METHOD_COLORS } from '../constants';

export default function AIFlowDraftDialog({
  open,
  draft,
  onClose,
  onApply,
  onApplyLowRisk,
  onApplyLowRiskAndRerun,
  onApplyTemplate,
  onMergeTemplate,
}) {
  const steps = draft?.step_summaries || [];
  const script = draft?.draft_script || {};
  const quality = draft?.quality_score || {};
  const isRepairDraft = draft?.source === 'repair_patch';
  const repairOperations = draft?.patch_operations || [];
  const suggestionGroups = buildRepairSuggestionGroups(draft, repairOperations);
  const suggestionTotal = Object.values(suggestionGroups).reduce((total, items) => total + items.length, 0);
  const lowRiskCount = suggestionGroups.low_risk_apply.length;
  const repairEffect = draft?.repair_effect_score || {};

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>{isRepairDraft ? 'AI 修复草稿预览' : 'AI 流程草稿预览'}</DialogTitle>
      <DialogContent dividers>
        {!draft ? (
          <Typography variant="body2" color="text.secondary">暂无草稿。</Typography>
        ) : (
          <Stack spacing={2}>
            <Alert severity="info">
              {draft.summary || 'AI 已生成流程草稿，应用前请确认步骤、变量和断言。'}
            </Alert>

            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
                <Box>
                  <Typography variant="subtitle2" fontWeight={800}>{script.name || 'AI 流程草稿'}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {script.target_project || '未指定项目'} / {script.environment || '未指定环境'} / {script.base_url || '未指定 Base URL'}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip size="small" label={`${steps.length} 步`} color="primary" variant="outlined" />
                  <Chip size="small" label={draft.ai_mode === 'llm' ? 'LLM' : '规则辅助'} variant="outlined" />
                  {draft.requires_approval && <Chip size="small" label="需人工确认" color="warning" variant="outlined" />}
                </Stack>
              </Stack>
            </Paper>

            {Number.isFinite(Number(quality.score)) && (
              <Paper variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight={800}>编排质量评分</Typography>
                    <Typography variant="caption" color="text.secondary">{quality.label || '待评估'}</Typography>
                  </Box>
                  <Chip
                    label={`${quality.score}/100`}
                    color={quality.level === 'good' ? 'success' : quality.level === 'medium' ? 'warning' : 'error'}
                    variant="outlined"
                    sx={{ fontWeight: 800, alignSelf: { xs: 'flex-start', md: 'center' } }}
                  />
                </Stack>
                {!!quality.items?.length && (
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                    {quality.items.map((item) => (
                      <Chip
                        key={`${item.label}-${item.detail}`}
                        size="small"
                        label={`${item.label}: ${item.detail}`}
                        color={item.level === 'error' ? 'error' : item.level === 'warning' ? 'warning' : 'default'}
                        variant="outlined"
                      />
                    ))}
                  </Stack>
                )}
              </Paper>
            )}

            {isRepairDraft && (
              <Accordion defaultExpanded disableGutters>
                <AccordionSummary expandIcon={<ExpandMoreOutlined />}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="subtitle2" fontWeight={800}>修复诊断台</Typography>
                    <Chip size="small" label={`${suggestionTotal} 条建议`} color={suggestionTotal ? 'secondary' : 'default'} variant="outlined" />
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  {Number.isFinite(Number(repairEffect.score)) && (
                    <Paper variant="outlined" sx={{ p: 1.25, mb: 1.25, bgcolor: 'rgba(255,255,255,0.58)' }}>
                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
                        <Box>
                          <Typography variant="body2" fontWeight={900}>修复效果评分</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {repairEffect.safe_operation_count || 0} 个低风险项 / {repairEffect.review_operation_count || 0} 个需确认项 / {repairEffect.historical_solution_count || 0} 个历史方案
                          </Typography>
                        </Box>
                        <Chip
                          label={`${repairEffect.label || '待评估'} ${repairEffect.score}/100`}
                          color={repairEffect.level === 'good' ? 'success' : repairEffect.level === 'medium' ? 'warning' : 'default'}
                          variant="outlined"
                          sx={{ fontWeight: 900, alignSelf: { xs: 'flex-start', md: 'center' } }}
                        />
                      </Stack>
                    </Paper>
                  )}
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
                    <SuggestionGroup
                      title="低风险可应用"
                      description="字段级改动明确，通常可直接应用后再回到工作台确认。"
                      color="success"
                      empty="暂无低风险自动补丁"
                      items={suggestionGroups.low_risk_apply}
                    />
                    <SuggestionGroup
                      title="需要人工确认"
                      description="可能影响断言口径、请求数据或性能阈值，建议先看对比。"
                      color="warning"
                      empty="暂无需人工确认的补丁"
                      items={suggestionGroups.needs_review}
                    />
                    <SuggestionGroup
                      title="只作为排查建议"
                      description="更像环境、数据、服务或鉴权问题，不应直接改脚本。"
                      color="info"
                      empty="暂无额外排查建议"
                      items={suggestionGroups.investigation}
                    />
                  </Box>
                </AccordionDetails>
              </Accordion>
            )}

            {isRepairDraft && !!draft.historical_repair_solutions?.length && (
              <Accordion disableGutters>
                <AccordionSummary expandIcon={<ExpandMoreOutlined />}>
                  <Typography variant="subtitle2" fontWeight={800}>历史已验证修复</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={1}>
                    {draft.historical_repair_solutions.map((solution) => (
                      <Paper key={solution.knowledge_id || solution.source_run_id} variant="outlined" sx={{ p: 1.25, bgcolor: 'rgba(255,255,255,0.58)' }}>
                        <Stack spacing={0.75}>
                          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                            <Chip size="small" label={`${solution.effect_score || 0}/100`} color="success" variant="outlined" />
                            <Typography variant="body2" fontWeight={900}>{solution.source_label || '历史修复'}</Typography>
                          </Stack>
                          <Typography variant="caption" color="text.secondary">{solution.summary || solution.applicable_when}</Typography>
                          <Typography variant="caption" color="text.secondary">{solution.applicable_when}</Typography>
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            )}

            {isRepairDraft && !!draft.repair_options?.length && (
              <Accordion disableGutters>
                <AccordionSummary expandIcon={<ExpandMoreOutlined />}>
                  <Typography variant="subtitle2" fontWeight={800}>AI 多方案修复</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
                    {draft.repair_options.map((option) => (
                      <Paper key={option.option_id} variant="outlined" sx={{ p: 1.25, bgcolor: option.enabled ? 'rgba(255,255,255,0.58)' : 'rgba(15,23,42,0.035)', opacity: option.enabled ? 1 : 0.7 }}>
                        <Stack spacing={0.75}>
                          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                            <Typography variant="body2" fontWeight={900}>{option.title}</Typography>
                            <Chip
                              size="small"
                              label={option.risk_level === 'low' ? '低风险' : option.risk_level === 'medium' ? '需确认' : '排查建议'}
                              color={option.risk_level === 'low' ? 'success' : option.risk_level === 'medium' ? 'warning' : 'error'}
                              variant="outlined"
                            />
                          </Stack>
                          <Typography variant="caption" color="text.secondary">{option.description}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            置信度 {option.confidence || 0}% · 修改项 {(option.operations || []).length}
                          </Typography>
                        </Stack>
                      </Paper>
                    ))}
                  </Box>
                </AccordionDetails>
              </Accordion>
            )}

            <Accordion defaultExpanded disableGutters>
              <AccordionSummary expandIcon={<ExpandMoreOutlined />}>
                <Typography variant="subtitle2" fontWeight={800}>流程步骤</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1}>
                  {steps.map((step, index) => (
                    <StepPreviewCard key={step.step_id || index} step={step} index={index} />
                  ))}
                </Stack>
              </AccordionDetails>
            </Accordion>

            {!isRepairDraft && !!draft.template_recommendations?.length && (
              <Accordion disableGutters>
                <AccordionSummary expandIcon={<ExpandMoreOutlined />}>
                  <Typography variant="subtitle2" fontWeight={800}>可复用模板推荐</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                    {draft.template_recommendations.map((template) => (
                      <Paper key={template.template_id} variant="outlined" sx={{ p: 1, minWidth: 220, bgcolor: 'rgba(255,255,255,0.55)' }}>
                        <Typography variant="body2" fontWeight={800}>{template.name || template.template_id}</Typography>
                        <Typography variant="caption" color="text.secondary">{template.step_count || 0} 步 · 匹配 {template.match_score || 0}</Typography>
                        {template.recommendation_reason && (
                          <Typography variant="caption" display="block" color="text.secondary">
                            {template.recommendation_reason}
                          </Typography>
                        )}
                        {!!template.performance?.run_count && (
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                            <Chip size="small" label={`执行 ${template.performance.run_count}`} variant="outlined" />
                            <Chip size="small" label={`通过率 ${Math.round((template.performance.pass_rate || 0) * 100)}%`} color="success" variant="outlined" />
                            <Chip size="small" label={`失败率 ${Math.round((template.performance.failure_rate || 0) * 100)}%`} color="warning" variant="outlined" />
                          </Stack>
                        )}
                        {!!template.tags?.length && (
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                            {template.tags.slice(0, 3).map((tag) => <Chip key={tag} size="small" label={tag} variant="outlined" />)}
                          </Stack>
                        )}
                        <Stack direction="row" spacing={0.75} sx={{ mt: 1 }}>
                          <Button size="small" variant="outlined" onClick={() => onApplyTemplate?.(template)}>套用</Button>
                          <Button size="small" variant="text" onClick={() => onMergeTemplate?.(template)}>合并片段</Button>
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            )}

            {!!draft.uncertainties?.length && (
              <Alert severity="warning">
                <Stack spacing={0.5}>
                  {draft.uncertainties.map((item) => (
                    <Typography key={item} variant="caption">{item}</Typography>
                  ))}
                </Stack>
              </Alert>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>关闭</Button>
        {isRepairDraft && (
          <Button variant="outlined" disabled={!lowRiskCount || !onApplyLowRisk} onClick={onApplyLowRisk}>
            仅应用低风险项{lowRiskCount ? ` (${lowRiskCount})` : ''}
          </Button>
        )}
        {isRepairDraft && onApplyLowRiskAndRerun && (
          <Button variant="contained" color="success" disabled={!lowRiskCount} onClick={onApplyLowRiskAndRerun}>
            应用低风险并重跑受影响步骤
          </Button>
        )}
        <Button variant="contained" disabled={!draft?.draft_script} onClick={onApply}>{isRepairDraft ? '应用修复草稿' : '应用草稿到工作台'}</Button>
      </DialogActions>
    </Dialog>
  );
}

function buildRepairSuggestionGroups(draft, repairOperations) {
  const groups = draft?.repair_suggestion_groups || {};
  if (groups.low_risk_apply || groups.needs_review || groups.investigation) {
    return {
      low_risk_apply: groups.low_risk_apply || [],
      needs_review: groups.needs_review || [],
      investigation: groups.investigation || [],
    };
  }
  return {
    low_risk_apply: repairOperations.filter((operation) => operation.safe_to_apply).map((operation) => ({
      type: 'patch_operation',
      title: operation.field || '脚本调整',
      description: operation.reason || '',
      operation,
    })),
    needs_review: repairOperations.filter((operation) => !operation.safe_to_apply).map((operation) => ({
      type: 'patch_operation',
      title: operation.field || '脚本调整',
      description: operation.reason || '',
      operation,
    })),
    investigation: repairOperations.length ? [] : [{
      type: 'diagnostic',
      title: '暂无自动补丁',
      description: '当前失败未匹配到可直接应用的字段级补丁。',
      suggestions: ['检查接口服务、测试数据、Base URL 或鉴权配置。'],
    }],
  };
}

function SuggestionGroup({ title, description, color, empty, items }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.25, bgcolor: 'rgba(255,255,255,0.58)' }}>
      <Stack spacing={1}>
        <Box>
          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="body2" fontWeight={900}>{title}</Typography>
            <Chip size="small" label={items.length} color={color} variant="outlined" />
          </Stack>
          <Typography variant="caption" color="text.secondary">{description}</Typography>
        </Box>
        {items.length ? (
          <Stack spacing={1}>
            {items.map((item, index) => (
              <SuggestionCard key={`${item.type}-${item.step_id || ''}-${item.category || ''}-${index}`} item={item} color={color} />
            ))}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">{empty}</Typography>
        )}
      </Stack>
    </Paper>
  );
}

function SuggestionCard({ item, color }) {
  const operation = item.operation;
  return (
    <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'rgba(15,23,42,0.035)', border: '1px solid', borderColor: 'divider' }}>
      <Stack spacing={0.75}>
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip size="small" label={item.step_id || operation?.step_id || '全局'} color={color} variant="outlined" />
          <Typography variant="caption" fontWeight={900} color="text.primary">{item.title || operation?.field || '修复建议'}</Typography>
        </Stack>
        {(item.description || operation?.reason) && (
          <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
            {item.description || operation.reason}
          </Typography>
        )}
        {operation && <RepairOperationDiff operation={operation} />}
        {!!item.suggestions?.length && (
          <Stack spacing={0.25}>
            {item.suggestions.map((suggestion) => (
              <Typography key={suggestion} variant="caption" color="text.secondary">- {suggestion}</Typography>
            ))}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

function RepairOperationDiff({ operation }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1 }}>
      <DiffValue title="调整前" value={operation.before} />
      <DiffValue title="调整后" value={operation.after} highlight />
    </Box>
  );
}

function DiffValue({ title, value, highlight }) {
  return (
    <Box sx={{ p: 1, borderRadius: 1, bgcolor: highlight ? 'rgba(46,125,50,0.06)' : 'rgba(15,23,42,0.035)', border: '1px solid', borderColor: highlight ? 'success.light' : 'divider' }}>
      <Typography variant="caption" fontWeight={800} color="text.primary">{title}</Typography>
      <Typography variant="caption" component="pre" sx={{ mt: 0.5, m: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace', color: 'text.secondary' }}>
        {formatDiffValue(value)}
      </Typography>
    </Box>
  );
}

function formatDiffValue(value) {
  if (value === undefined || value === null || value === '') return '未记录';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function StepPreviewCard({ step, index }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.25 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
            <Chip size="small" label={step.method} color={METHOD_COLORS[step.method] || 'default'} variant="outlined" sx={{ fontWeight: 800 }} />
            <Typography variant="body2" fontWeight={800}>{index + 1}. {step.name || step.step_id}</Typography>
            {step.changed && <Chip size="small" label="已调整" color="secondary" variant="outlined" />}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {step.path}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
          {!!step.depends_on?.length && <Chip size="small" label={`依赖 ${step.depends_on.join(', ')}`} variant="outlined" />}
          {!!step.extractions?.length && <Chip size="small" label={`${step.extractions.length} 个变量提取`} color="success" variant="outlined" />}
          {!!step.variable_references?.length && <Chip size="small" label={`${step.variable_references.length} 个变量引用`} color="warning" variant="outlined" />}
          <Chip size="small" label={`${step.assertion_count || 0} 个断言`} variant="outlined" />
        </Stack>
      </Stack>
      {(!!step.extractions?.length || !!step.variable_references?.length) && (
        <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1 }}>
          {!!step.extractions?.length && (
            <PreviewGroup title="变量提取">
            {step.extractions.map((item) => (
              <Typography key={`${step.step_id}-${item.name}`} variant="caption" color="text.secondary" display="block">
                {`${item.name} <- ${item.source}.${item.path}`}
              </Typography>
            ))}
            </PreviewGroup>
          )}
          {!!step.variable_references?.length && (
            <PreviewGroup title="变量引用">
            {step.variable_references.map((item) => (
              <Typography key={`${step.step_id}-${item.name}-${item.location}`} variant="caption" color="text.secondary" display="block">
                {`${item.name} -> ${item.location}`}
              </Typography>
            ))}
            </PreviewGroup>
          )}
        </Box>
      )}
      {!!step.assertion_recommendations?.length && (
        <PreviewGroup title="断言推荐" sx={{ mt: 1 }}>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {step.assertion_recommendations.slice(0, 6).map((item, itemIndex) => (
              <Chip
                key={`${step.step_id}-${item.type}-${item.path || itemIndex}`}
                size="small"
                label={`${item.label || item.type}${item.path ? ` ${item.path}` : item.expected ? ` ${Array.isArray(item.expected) ? item.expected.join('/') : item.expected}` : ''}`}
                variant="outlined"
              />
            ))}
          </Stack>
        </PreviewGroup>
      )}
    </Paper>
  );
}

function PreviewGroup({ title, children, sx }) {
  return (
    <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'rgba(15,23,42,0.035)', ...sx }}>
      <Typography variant="caption" fontWeight={800} color="text.primary">{title}</Typography>
      <Box sx={{ mt: 0.5 }}>{children}</Box>
    </Box>
  );
}
