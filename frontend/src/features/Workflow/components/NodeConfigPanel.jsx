import React from 'react';
import {
  Box, Typography, TextField, Select, MenuItem, FormControl,
  InputLabel, IconButton, Divider, Chip, Switch, FormControlLabel,
} from '@mui/material';
import { Close } from '@mui/icons-material';
import { NODE_DEFINITIONS } from '../utils/nodeDefinitions';

/**
 * Right sidebar panel for editing selected node's configuration.
 */
export default function NodeConfigPanel({ node, onChange, onClose }) {
  if (!node) {
    return (
      <Box 
        sx={{ 
          width: 320, 
          p: 2, 
          borderLeft: 1, 
          borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
          bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(17, 24, 39, 0.45)' : 'rgba(255, 255, 255, 0.45)',
          backdropFilter: 'blur(20px)',
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center' 
        }}
      >
        <Typography variant="body2" color="text.secondary">
          点击节点查看配置
        </Typography>
      </Box>
    );
  }

  const def = NODE_DEFINITIONS[node.type] || {};
  const config = node.data?.config || {};

  const updateConfig = (key, value) => {
    onChange?.({
      ...node,
      data: {
        ...node.data,
        config: { ...config, [key]: value },
      },
    });
  };

  return (
    <Box
      sx={{
        width: 320,
        height: '100%',
        borderLeft: 1,
        borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
        bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(17, 24, 39, 0.45)' : 'rgba(255, 255, 255, 0.45)',
        backdropFilter: 'blur(20px)',
        overflow: 'auto',
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: def.color, mr: 1 }} />
        <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 700 }}>
          {def.label || node.type}
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <Close fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Node title */}
        <TextField
          label="节点名称"
          size="small"
          value={node.data?.label || ''}
          onChange={(e) => onChange?.({ ...node, data: { ...node.data, label: e.target.value } })}
          fullWidth
        />

        <Divider />

        {/* Type-specific config */}
        {node.type === 'llm' && <LLMConfig config={config} updateConfig={updateConfig} />}
        {node.type === 'http_request' && <HTTPConfig config={config} updateConfig={updateConfig} />}
        {node.type === 'code' && <CodeConfig config={config} updateConfig={updateConfig} />}
        {node.type === 'if_else' && <ConditionConfig config={config} updateConfig={updateConfig} />}
        {node.type === 'knowledge_retrieval' && <KnowledgeConfig config={config} updateConfig={updateConfig} />}
        {node.type === 'template' && <TemplateConfig config={config} updateConfig={updateConfig} />}
        {node.type === 'iteration' && <IterationConfig config={config} updateConfig={updateConfig} />}
        {node.type === 'tool' && <ToolConfig config={config} updateConfig={updateConfig} />}
        {node.type === 'start' && <StartConfig config={config} updateConfig={updateConfig} />}
      </Box>
    </Box>
  );
}

// ── LLM Config ────────────────────────────────────────────────────
function LLMConfig({ config, updateConfig }) {
  return (
    <>
      <TextField
        label="模型"
        size="small"
        value={config.model || ''}
        onChange={(e) => updateConfig('model', e.target.value)}
        placeholder="gpt-4"
        fullWidth
      />
      <TextField
        label="系统提示词"
        size="small"
        multiline
        minRows={2}
        maxRows={6}
        value={config.system_prompt || ''}
        onChange={(e) => updateConfig('system_prompt', e.target.value)}
        fullWidth
      />
      <TextField
        label="用户提示词模板"
        size="small"
        multiline
        minRows={3}
        maxRows={10}
        value={config.prompt_template || ''}
        onChange={(e) => updateConfig('prompt_template', e.target.value)}
        placeholder="使用 {{node_id.output}} 引用变量"
        fullWidth
      />
      <TextField
        label="Temperature"
        size="small"
        type="number"
        value={config.temperature ?? 0.7}
        onChange={(e) => updateConfig('temperature', parseFloat(e.target.value))}
        inputProps={{ min: 0, max: 2, step: 0.1 }}
        fullWidth
      />
      <TextField
        label="Max Tokens"
        size="small"
        type="number"
        value={config.max_tokens ?? 4096}
        onChange={(e) => updateConfig('max_tokens', parseInt(e.target.value))}
        fullWidth
      />
    </>
  );
}

// ── HTTP Config ───────────────────────────────────────────────────
function HTTPConfig({ config, updateConfig }) {
  return (
    <>
      <FormControl size="small" fullWidth>
        <InputLabel>请求方法</InputLabel>
        <Select
          value={config.method || 'GET'}
          label="请求方法"
          onChange={(e) => updateConfig('method', e.target.value)}
        >
          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => (
            <MenuItem key={m} value={m}>{m}</MenuItem>
          ))}
        </Select>
      </FormControl>
      <TextField
        label="URL"
        size="small"
        value={config.url || ''}
        onChange={(e) => updateConfig('url', e.target.value)}
        placeholder="https://api.example.com/data"
        fullWidth
      />
      <TextField
        label="Headers (JSON)"
        size="small"
        multiline
        minRows={2}
        maxRows={5}
        value={JSON.stringify(config.headers || {}, null, 2)}
        onChange={(e) => {
          try { updateConfig('headers', JSON.parse(e.target.value)); } catch {}
        }}
        fullWidth
      />
      <TextField
        label="请求体 (JSON)"
        size="small"
        multiline
        minRows={3}
        maxRows={8}
        value={JSON.stringify(config.body || {}, null, 2)}
        onChange={(e) => {
          try { updateConfig('body', JSON.parse(e.target.value)); } catch {}
        }}
        fullWidth
      />
      <TextField
        label="超时 (秒)"
        size="small"
        type="number"
        value={config.timeout ?? 30}
        onChange={(e) => updateConfig('timeout', parseInt(e.target.value))}
        fullWidth
      />
    </>
  );
}

// ── Code Config ───────────────────────────────────────────────────
function CodeConfig({ config, updateConfig }) {
  return (
    <>
      <FormControl size="small" fullWidth>
        <InputLabel>语言</InputLabel>
        <Select
          value={config.language || 'python'}
          label="语言"
          onChange={(e) => updateConfig('language', e.target.value)}
        >
          <MenuItem value="python">Python</MenuItem>
        </Select>
      </FormControl>
      <TextField
        label="代码"
        size="small"
        multiline
        minRows={5}
        maxRows={15}
        value={config.code || ''}
        onChange={(e) => updateConfig('code', e.target.value)}
        placeholder="def main(args):&#10;    return {'result': args['input']}"
        fullWidth
        sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: 13 } }}
      />
      <TextField
        label="超时 (秒)"
        size="small"
        type="number"
        value={config.timeout ?? 10}
        onChange={(e) => updateConfig('timeout', parseInt(e.target.value))}
        fullWidth
      />
    </>
  );
}

// ── Condition Config ──────────────────────────────────────────────
function ConditionConfig({ config, updateConfig }) {
  return (
    <>
      <FormControl size="small" fullWidth>
        <InputLabel>逻辑运算</InputLabel>
        <Select
          value={config.logical_operator || 'and'}
          label="逻辑运算"
          onChange={(e) => updateConfig('logical_operator', e.target.value)}
        >
          <MenuItem value="and">AND (全部满足)</MenuItem>
          <MenuItem value="or">OR (任一满足)</MenuItem>
        </Select>
      </FormControl>
      <Typography variant="caption" color="text.secondary">
        条件配置请在右侧 JSON 编辑器中设置
      </Typography>
    </>
  );
}

// ── Knowledge Config ──────────────────────────────────────────────
function KnowledgeConfig({ config, updateConfig }) {
  return (
    <>
      <FormControl size="small" fullWidth>
        <InputLabel>检索模式</InputLabel>
        <Select
          value={config.retrieval_mode || 'hybrid'}
          label="检索模式"
          onChange={(e) => updateConfig('retrieval_mode', e.target.value)}
        >
          <MenuItem value="vector">向量检索</MenuItem>
          <MenuItem value="full_text">全文检索</MenuItem>
          <MenuItem value="hybrid">混合检索</MenuItem>
        </Select>
      </FormControl>
      <TextField
        label="Top K"
        size="small"
        type="number"
        value={config.top_k ?? 5}
        onChange={(e) => updateConfig('top_k', parseInt(e.target.value))}
        fullWidth
      />
      <TextField
        label="分数阈值"
        size="small"
        type="number"
        value={config.score_threshold ?? 0.5}
        onChange={(e) => updateConfig('score_threshold', parseFloat(e.target.value))}
        inputProps={{ min: 0, max: 1, step: 0.1 }}
        fullWidth
      />
    </>
  );
}

// ── Template Config ───────────────────────────────────────────────
function TemplateConfig({ config, updateConfig }) {
  return (
    <TextField
      label="Jinja2 模板"
      size="small"
      multiline
      minRows={4}
      maxRows={12}
      value={config.template || ''}
      onChange={(e) => updateConfig('template', e.target.value)}
      placeholder="使用 {{node_id.output}} 引用变量"
      fullWidth
      sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: 13 } }}
    />
  );
}

// ── Iteration Config ──────────────────────────────────────────────
function IterationConfig({ config, updateConfig }) {
  return (
    <>
      <TextField
        label="迭代变量名"
        size="small"
        value={config.iterator_variable || 'item'}
        onChange={(e) => updateConfig('iterator_variable', e.target.value)}
        fullWidth
      />
      <TextField
        label="最大迭代次数"
        size="small"
        type="number"
        value={config.max_iterations ?? 100}
        onChange={(e) => updateConfig('max_iterations', parseInt(e.target.value))}
        fullWidth
      />
      <FormControlLabel
        control={
          <Switch
            checked={config.parallel || false}
            onChange={(e) => updateConfig('parallel', e.target.checked)}
            size="small"
          />
        }
        label="并行执行"
      />
    </>
  );
}

// ── Tool Config ───────────────────────────────────────────────────
function ToolConfig({ config, updateConfig }) {
  return (
    <FormControl size="small" fullWidth>
      <InputLabel>工具类型</InputLabel>
      <Select
        value={config.tool_type || 'testcase_gen'}
        label="工具类型"
        onChange={(e) => updateConfig('tool_type', e.target.value)}
      >
        <MenuItem value="testcase_gen">测试用例生成</MenuItem>
        <MenuItem value="graph_query">知识图谱查询</MenuItem>
        <MenuItem value="doc_parse">文档解析</MenuItem>
        <MenuItem value="api_execution">API 执行</MenuItem>
        <MenuItem value="coverage_query">覆盖率查询</MenuItem>
      </Select>
    </FormControl>
  );
}

// ── Start Config ──────────────────────────────────────────────────
function StartConfig({ config, updateConfig }) {
  return (
    <Typography variant="caption" color="text.secondary">
      输入变量在工作流属性中配置
    </Typography>
  );
}
