/**
 * Custom node types for the workflow canvas.
 * Each node type renders via BaseNodeWrapper with type-specific content.
 */
import React from 'react';
import BaseNodeWrapper from './BaseNodeWrapper';
import { Typography, Chip, Box } from '@mui/material';

// ── Start Node ────────────────────────────────────────────────────
function StartNode({ data, selected }) {
  const vars = data.config?.variables || [];
  return (
    <BaseNodeWrapper data={data} selected={selected}>
      {vars.length > 0 ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {vars.map((v, i) => (
            <Chip key={i} label={v.name} size="small" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
          ))}
        </Box>
      ) : (
        <Typography variant="caption" color="text.secondary">输入变量</Typography>
      )}
    </BaseNodeWrapper>
  );
}

// ── End Node ──────────────────────────────────────────────────────
function EndNode({ data, selected }) {
  return (
    <BaseNodeWrapper data={data} selected={selected}>
      <Typography variant="caption" color="text.secondary">收集最终输出</Typography>
    </BaseNodeWrapper>
  );
}

// ── LLM Node ──────────────────────────────────────────────────────
function LLMNode({ data, selected }) {
  const model = data.config?.model || '未配置';
  const prompt = data.config?.prompt_template || '';
  return (
    <BaseNodeWrapper data={data} selected={selected}>
      <Typography variant="caption" display="block" sx={{ fontWeight: 500 }}>
        {model}
      </Typography>
      {prompt && (
        <Typography variant="caption" color="text.secondary" sx={{
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          fontSize: 10,
        }}>
          {prompt}
        </Typography>
      )}
    </BaseNodeWrapper>
  );
}

// ── HTTP Request Node ─────────────────────────────────────────────
function HTTPNode({ data, selected }) {
  const method = data.config?.method || 'GET';
  const url = data.config?.url || '';
  const methodColors = {
    GET: '#4caf50', POST: '#2196f3', PUT: '#ff9800',
    PATCH: '#9c27b0', DELETE: '#f44336',
  };
  return (
    <BaseNodeWrapper data={data} selected={selected}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Chip
          label={method}
          size="small"
          sx={{
            bgcolor: methodColors[method] || '#9e9e9e',
            color: '#fff',
            fontSize: 10,
            height: 18,
            fontWeight: 700,
          }}
        />
        <Typography variant="caption" sx={{
          fontFamily: 'monospace',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}>
          {url || '未配置'}
        </Typography>
      </Box>
    </BaseNodeWrapper>
  );
}

// ── Code Node ─────────────────────────────────────────────────────
function CodeNode({ data, selected }) {
  const lang = data.config?.language || 'python';
  return (
    <BaseNodeWrapper data={data} selected={selected}>
      <Chip label={lang} size="small" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
    </BaseNodeWrapper>
  );
}

// ── Condition Node ────────────────────────────────────────────────
function ConditionNode({ data, selected }) {
  const conditions = data.config?.conditions || [];
  return (
    <BaseNodeWrapper data={data} selected={selected}>
      <Typography variant="caption" color="text.secondary">
        {conditions.length} 个条件 ({data.config?.logical_operator || 'and'})
      </Typography>
    </BaseNodeWrapper>
  );
}

// ── Knowledge Retrieval Node ──────────────────────────────────────
function KnowledgeNode({ data, selected }) {
  const mode = data.config?.retrieval_mode || 'hybrid';
  const topK = data.config?.top_k || 5;
  return (
    <BaseNodeWrapper data={data} selected={selected}>
      <Typography variant="caption" color="text.secondary">
        {mode} / top {topK}
      </Typography>
    </BaseNodeWrapper>
  );
}

// ── Template Node ─────────────────────────────────────────────────
function TemplateNode({ data, selected }) {
  const tmpl = data.config?.template || '';
  return (
    <BaseNodeWrapper data={data} selected={selected}>
      <Typography variant="caption" color="text.secondary" sx={{
        fontFamily: 'monospace',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        fontSize: 10,
      }}>
        {tmpl || '未配置模板'}
      </Typography>
    </BaseNodeWrapper>
  );
}

// ── Variable Aggregator Node ──────────────────────────────────────
function AggregatorNode({ data, selected }) {
  return (
    <BaseNodeWrapper data={data} selected={selected}>
      <Typography variant="caption" color="text.secondary">合并分支变量</Typography>
    </BaseNodeWrapper>
  );
}

// ── Iteration Node ────────────────────────────────────────────────
function IterationNode({ data, selected }) {
  const maxIter = data.config?.max_iterations || 100;
  const parallel = data.config?.parallel || false;
  return (
    <BaseNodeWrapper data={data} selected={selected}>
      <Typography variant="caption" color="text.secondary">
        {parallel ? '并行' : '顺序'} / 最多 {maxIter} 次
      </Typography>
    </BaseNodeWrapper>
  );
}

// ── Tool Node ─────────────────────────────────────────────────────
function ToolNode({ data, selected }) {
  const toolType = data.config?.tool_type || '';
  return (
    <BaseNodeWrapper data={data} selected={selected}>
      <Chip label={toolType} size="small" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
    </BaseNodeWrapper>
  );
}

// ── Parameter Extractor Node ──────────────────────────────────────
function ParameterExtractorNode({ data, selected }) {
  const params = data.config?.parameters || [];
  return (
    <BaseNodeWrapper data={data} selected={selected}>
      <Typography variant="caption" color="text.secondary">
        提取 {params.length} 个参数
      </Typography>
    </BaseNodeWrapper>
  );
}

// ── Question Classifier Node ──────────────────────────────────────
function QuestionClassifierNode({ data, selected }) {
  const cats = data.config?.categories || [];
  return (
    <BaseNodeWrapper data={data} selected={selected}>
      <Typography variant="caption" color="text.secondary">
        {cats.length} 个类别
      </Typography>
    </BaseNodeWrapper>
  );
}

// ── Export all node types ─────────────────────────────────────────
export const workflowNodeTypes = {
  start: StartNode,
  end: EndNode,
  llm: LLMNode,
  http_request: HTTPNode,
  code: CodeNode,
  if_else: ConditionNode,
  knowledge_retrieval: KnowledgeNode,
  template: TemplateNode,
  variable_aggregator: AggregatorNode,
  iteration: IterationNode,
  tool: ToolNode,
  parameter_extractor: ParameterExtractorNode,
  question_classifier: QuestionClassifierNode,
};
