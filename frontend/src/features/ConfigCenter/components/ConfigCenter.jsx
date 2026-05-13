import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import SaveOutlined from '@mui/icons-material/SaveOutlined';
import RestartAltOutlined from '@mui/icons-material/RestartAltOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined';
import { configCenterAPI } from '../../../api/configCenter';
import EmptyState from '../../../components/EmptyState';
import { useSnackbar } from '../../../components/SnackbarProvider';

const initSecrets = {
  API_KEY: '',
  NEO4J_PASSWORD: '',
};

const providerGroupTitle = 'Provider 管理';

const emptyProviderDraft = {
  key: '',
  label: '',
  api_base_url: '',
  chat_model: '',
  embedding_model: '',
  embedding_dim: '1024',
  aliases_text: '',
  recommended_chat_models_text: '',
  recommended_embedding_models_text: '',
  default_base_url_label: '默认 Base URL',
  template_description: '',
  supports_embedding: true,
  is_openai_compatible: true,
};

function joinProviderList(items) {
  return Array.isArray(items) ? items.join(', ') : '';
}

function buildProviderDraft(provider) {
  if (!provider) return emptyProviderDraft;
  return {
    key: provider.key || '',
    label: provider.label || '',
    api_base_url: provider.api_base_url || '',
    chat_model: provider.chat_model || '',
    embedding_model: provider.embedding_model || '',
    embedding_dim: String(provider.embedding_dim || 1024),
    aliases_text: joinProviderList(provider.aliases),
    recommended_chat_models_text: joinProviderList(provider.recommended_chat_models),
    recommended_embedding_models_text: joinProviderList(provider.recommended_embedding_models),
    default_base_url_label: provider.default_base_url_label || '默认 Base URL',
    template_description: provider.template_description || '',
    supports_embedding: provider.supports_embedding !== false,
    is_openai_compatible: provider.is_openai_compatible !== false,
  };
}

function splitProviderList(text) {
  return String(text || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function fieldDisplayValue(field, draftValue, hasDraft) {
  if (hasDraft) {
    return draftValue ? '待保存 ·••••••••' : '将清空';
  }
  if (field.sensitive) return field.configured ? '已配置 ·••••••••' : '未配置';
  return draftValue ?? field.value ?? '';
}

function sourceChipProps(field) {
  if (field.source === 'env') {
    return { label: '已生效 .env', color: 'success' };
  }
  if (field.source === 'default') {
    return { label: '程序默认', color: 'info' };
  }
  if (field.source === 'example') {
    return { label: '模板示例', color: 'default' };
  }
  return { label: '未设置', color: 'warning' };
}

function llmSourceColor(source) {
  if (source === 'custom' || source === 'qwen' || source === 'deepseek') return 'success';
  if (source === 'main') return 'info';
  return 'warning';
}

function testcaseBaseUrlHint(key) {
  if (key === 'CUSTOM_BASE_URL') return '未填写时复用主模块 API_BASE_URL；主模块也为空时使用 OpenAI-compatible 默认地址。';
  if (key === 'QWEN_BASE_URL') return '未填写时复用主模块 API_BASE_URL；主模块也为空时使用 DashScope 默认地址。';
  if (key === 'DEEPSEEK_BASE_URL') return '未填写时复用主模块 API_BASE_URL；主模块也为空时使用 DeepSeek 默认地址。';
  return '';
}

function TestcaseLLMSummary({ summary }) {
  if (!summary) return null;
  return (
    <Alert severity="info" sx={{ alignItems: 'flex-start' }}>
      <Stack spacing={1.25} sx={{ width: '100%' }}>
        <Box>
          <Typography variant="subtitle2">testcase_gen 最终生效 LLM</Typography>
          <Typography variant="caption" color="text.secondary">
            先看这里判断实际调用。下面字段为空不一定代表不可用，BASE_URL 可能会复用主模块。
          </Typography>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1 }}>
          {[
            ['视觉分析', summary.vision],
            ['文本生成/评审', summary.text],
          ].map(([label, item]) => (
            <Box key={label} sx={{ border: '1px solid rgba(14, 165, 233, 0.24)', borderRadius: 1, p: 1.25, bgcolor: 'rgba(255,255,255,0.55)' }}>
              <Stack spacing={0.75}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{label}</Typography>
                  <Chip label={item?.source_label || '未配置'} color={llmSourceColor(item?.source)} size="small" />
                </Stack>
                <Typography variant="caption" color="text.secondary">模型: {item?.model_name || '未配置'}</Typography>
                <Typography variant="caption" color="text.secondary">Base URL: {item?.base_url || '未配置'}（{item?.base_url_label || '未配置'}）</Typography>
              </Stack>
            </Box>
          ))}
        </Box>
      </Stack>
    </Alert>
  );
}

const modelPresets = {
  custom: ['deepseek-ai/DeepSeek-V3', 'qwen-plus', 'gpt-4o-mini'],
  vision: ['qwen-vl-max', 'qwen3-vl-32b-siliconflow', 'qwen2.5-vl-72b-instruct', 'qwen2.5-vl-32b-instruct'],
  text: ['deepseek-chat', 'deepseek-v3.2', 'deepseek-coder', 'qwen-plus'],
};

const baseUrlDefaults = {
  CUSTOM_BASE_URL: { label: 'OpenAI-compatible 默认地址', value: 'https://one-api.miotech.com/v1' },
  QWEN_BASE_URL: { label: 'DashScope 官方默认地址', value: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  DEEPSEEK_BASE_URL: { label: 'DeepSeek 官方默认地址', value: 'https://api.deepseek.com/v1' },
};

function SecretFieldEditor({ field, value, hasDraft, onChange }) {
  if (!field) return null;
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <TextField
        size="small"
        fullWidth
        disabled
        label={field.key}
        value={fieldDisplayValue(field, value, hasDraft)}
        InputProps={{ startAdornment: <VisibilityOffOutlined fontSize="small" /> }}
      />
      <Button
        onClick={() => {
          const next = window.prompt(`替换 ${field.key}，留空并确认会清空该配置`);
          if (next !== null) onChange(field.key, next);
        }}
      >
        替换
      </Button>
    </Stack>
  );
}

function BaseUrlEditor({ field, value, onChange }) {
  if (!field) return null;
  const preset = baseUrlDefaults[field.key];
  const strategy = value ? (value === preset?.value ? 'official' : 'custom') : 'main';
  return (
    <Stack spacing={1}>
      <FormControl size="small" fullWidth>
        <InputLabel>{field.key}</InputLabel>
        <Select
          label={field.key}
          value={strategy}
          onChange={(event) => {
            if (event.target.value === 'main') onChange(field.key, '');
            if (event.target.value === 'official') onChange(field.key, preset?.value || '');
            if (event.target.value === 'custom') onChange(field.key, value || preset?.value || '');
          }}
        >
          <MenuItem value="main">复用主模块 API_BASE_URL</MenuItem>
          <MenuItem value="official">{preset?.label || '官方默认地址'}</MenuItem>
          <MenuItem value="custom">自定义地址</MenuItem>
        </Select>
      </FormControl>
      {strategy === 'custom' && (
        <TextField
          size="small"
          fullWidth
          placeholder={preset?.value || field.example_value}
          value={value}
          onChange={(event) => onChange(field.key, event.target.value)}
        />
      )}
      {strategy !== 'custom' && (
        <Typography variant="caption" color="text.secondary">
          实际地址会在保存并重启后按该策略生效。
        </Typography>
      )}
    </Stack>
  );
}

function ModelNameEditor({ field, value, presets, onChange }) {
  if (!field) return null;
  return (
    <Stack spacing={1}>
      <TextField
        size="small"
        fullWidth
        label={field.key}
        placeholder={field.example_value || '输入模型名'}
        value={value}
        onChange={(event) => onChange(field.key, event.target.value)}
      />
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        {presets.map((preset) => (
          <Chip
            key={preset}
            label={preset}
            size="small"
            color={value === preset ? 'primary' : 'default'}
            onClick={() => onChange(field.key, preset)}
          />
        ))}
      </Stack>
    </Stack>
  );
}

function TestcaseLLMCard({ title, caption, tone = 'default', fields, values, draft, onChange, modelPresetsForCard }) {
  const borderColor = tone === 'custom' ? 'rgba(14, 165, 233, 0.32)' : 'rgba(148, 163, 184, 0.35)';
  return (
    <Box sx={{ border: '1px solid', borderColor, borderRadius: 1.5, p: 1.5, bgcolor: 'rgba(255,255,255,0.6)' }}>
      <Stack spacing={1.25}>
        <Box>
          <Typography variant="subtitle2">{title}</Typography>
          <Typography variant="caption" color="text.secondary">{caption}</Typography>
        </Box>
        <SecretFieldEditor
          field={fields.apiKey}
          value={values[fields.apiKey?.key] ?? ''}
          hasDraft={Object.prototype.hasOwnProperty.call(draft, fields.apiKey?.key || '')}
          onChange={onChange}
        />
        <BaseUrlEditor field={fields.baseUrl} value={values[fields.baseUrl?.key] ?? ''} onChange={onChange} />
        <ModelNameEditor
          field={fields.modelName}
          value={values[fields.modelName?.key] ?? ''}
          presets={modelPresetsForCard}
          onChange={onChange}
        />
      </Stack>
    </Box>
  );
}

function TestcaseLLMEditor({ fieldMap, draft, onChange, summary }) {
  const valueFor = (key) => draft[key] ?? fieldMap[key]?.value ?? '';
  const values = {
    CUSTOM_API_KEY: valueFor('CUSTOM_API_KEY'),
    CUSTOM_BASE_URL: valueFor('CUSTOM_BASE_URL'),
    CUSTOM_MODEL_NAME: valueFor('CUSTOM_MODEL_NAME'),
    QWEN_API_KEY: valueFor('QWEN_API_KEY'),
    QWEN_BASE_URL: valueFor('QWEN_BASE_URL'),
    QWEN_MODEL_NAME: valueFor('QWEN_MODEL_NAME'),
    DEEPSEEK_API_KEY: valueFor('DEEPSEEK_API_KEY'),
    DEEPSEEK_BASE_URL: valueFor('DEEPSEEK_BASE_URL'),
    DEEPSEEK_MODEL_NAME: valueFor('DEEPSEEK_MODEL_NAME'),
  };

  return (
    <Stack spacing={1.5}>
      <TestcaseLLMSummary summary={summary} />
      <Alert severity="warning">
        <Typography variant="body2">
          优先级: 统一自定义模型会同时接管视觉和文本；否则视觉走 Qwen，文本走 DeepSeek；独立 Key 未配置时回退主模块。
        </Typography>
      </Alert>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1fr 1fr' }, gap: 1.5 }}>
        <TestcaseLLMCard
          title="统一自定义模型"
          caption="填 CUSTOM_API_KEY 后会同时用于视觉分析和文本生成。适合同一个兼容网关承接所有测试用例生成调用。"
          tone="custom"
          fields={{
            apiKey: fieldMap.CUSTOM_API_KEY,
            baseUrl: fieldMap.CUSTOM_BASE_URL,
            modelName: fieldMap.CUSTOM_MODEL_NAME,
          }}
          values={values}
          draft={draft}
          onChange={onChange}
          modelPresetsForCard={modelPresets.custom}
        />
        <TestcaseLLMCard
          title="视觉分析模型"
          caption="用于图片、截图和视觉类需求理解。BASE_URL 可复用主模块，也可切到 DashScope 官方或自定义地址。"
          fields={{
            apiKey: fieldMap.QWEN_API_KEY,
            baseUrl: fieldMap.QWEN_BASE_URL,
            modelName: fieldMap.QWEN_MODEL_NAME,
          }}
          values={values}
          draft={draft}
          onChange={onChange}
          modelPresetsForCard={modelPresets.vision}
        />
        <TestcaseLLMCard
          title="文本生成/评审模型"
          caption="用于需求分析、测试用例生成和评审。BASE_URL 可复用主模块，也可切到 DeepSeek 官方或自定义地址。"
          fields={{
            apiKey: fieldMap.DEEPSEEK_API_KEY,
            baseUrl: fieldMap.DEEPSEEK_BASE_URL,
            modelName: fieldMap.DEEPSEEK_MODEL_NAME,
          }}
          values={values}
          draft={draft}
          onChange={onChange}
          modelPresetsForCard={modelPresets.text}
        />
      </Box>
    </Stack>
  );
}

function ConfigFieldCard({ field, value, hasDraft, onChange }) {
  const hint = [
    field.description || '暂无说明',
    field.source === 'example' && field.example_value ? `示例: ${field.example_value}` : '',
    field.source === 'default' && field.default_value ? `默认: ${field.default_value}` : '',
    testcaseBaseUrlHint(field.key),
  ].filter(Boolean).join(' · ');

  return (
    <Box
      sx={{
        border: '1px solid rgba(148, 163, 184, 0.35)',
        borderRadius: 1.5,
        p: 1.5,
        bgcolor: 'rgba(255,255,255,0.62)',
        minHeight: 176,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
      }}
    >
      <Stack spacing={0.75} sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="subtitle2" sx={{ lineHeight: 1.3 }}>{field.key}</Typography>
          <Chip {...sourceChipProps(field)} size="small" />
          <Chip label={field.apply_mode === 'hot' ? '热更新' : '需重启'} size="small" color={field.apply_mode === 'hot' ? 'info' : 'warning'} />
          {field.sensitive && <Chip icon={<LockOutlined />} label="敏感" size="small" />}
          {!field.editable && <Chip label="只读" size="small" />}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.55 }}>
          {hint}
        </Typography>
      </Stack>

      <Box>
        {field.sensitive ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              size="small"
              fullWidth
              disabled
              value={fieldDisplayValue(field, value, hasDraft)}
              InputProps={{ startAdornment: <VisibilityOffOutlined fontSize="small" /> }}
            />
            {field.editable && (
              <Button
                sx={{ minWidth: 64 }}
                onClick={() => {
                  const next = window.prompt(`替换 ${field.key}，输入内容不会回显在页面上`);
                  if (next !== null) onChange(field.key, next);
                }}
              >
                替换
              </Button>
            )}
          </Stack>
        ) : field.value_type === 'bool' ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <Switch
              checked={String(value).toLowerCase() === 'true'}
              disabled={!field.editable}
              onChange={(event) => onChange(field.key, event.target.checked ? 'true' : 'false')}
            />
            <Typography variant="body2" color="text.secondary">
              {String(value).toLowerCase() === 'true' ? '开启' : '关闭'}
            </Typography>
          </Stack>
        ) : field.value_type === 'enum' && field.options?.length ? (
          <Select size="small" fullWidth disabled={!field.editable} value={value} onChange={(event) => onChange(field.key, event.target.value)}>
            <MenuItem value="">未设置</MenuItem>
            {value && !field.options.includes(value) && <MenuItem value={value}>{value}（未登记）</MenuItem>}
            {field.options.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
          </Select>
        ) : (
          <TextField
            size="small"
            fullWidth
            disabled={!field.editable}
            value={value}
            type={field.value_type === 'int' || field.value_type === 'float' ? 'number' : 'text'}
            placeholder={field.example_value || field.default_value}
            onChange={(event) => onChange(field.key, event.target.value)}
          />
        )}
      </Box>
    </Box>
  );
}

function ConfigGroupCards({ fields, draft, onChange }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
      {fields.map((field) => {
        const hasDraft = Object.prototype.hasOwnProperty.call(draft, field.key);
        const value = draft[field.key] ?? field.value ?? '';
        return (
          <ConfigFieldCard
            key={field.key}
            field={field}
            value={value}
            hasDraft={hasDraft}
            onChange={onChange}
          />
        );
      })}
    </Box>
  );
}

function ConfigWarnings({ warnings }) {
  const entries = Object.entries(warnings || {});
  if (!entries.length) return null;
  return (
    <Alert severity="warning" sx={{ alignItems: 'flex-start' }}>
      <Stack spacing={0.75}>
        <Typography variant="subtitle2">配置提示不阻断保存</Typography>
        {entries.map(([key, message]) => (
          <Typography key={key} variant="body2">
            {key}: {message}
          </Typography>
        ))}
      </Stack>
    </Alert>
  );
}

function RuntimeConfigGuide({ activeTitle }) {
  const isProviderPanel = activeTitle === providerGroupTitle;
  return (
    <Alert severity="info" sx={{ alignItems: 'flex-start' }}>
      <Stack spacing={0.75}>
        <Typography variant="subtitle2">生效说明</Typography>
        <Typography variant="body2">
          `热更新` 表示保存后会刷新进程内运行参数，后续新请求会使用新配置；正在执行中的任务不会被中途切换。
        </Typography>
        <Typography variant="body2">
          `需重启` 表示配置已经写入 `.env`，但只有服务重启后才会完全生效，通常涉及路径、数据库、向量库主连接或启动期初始化资源。
        </Typography>
        {!isProviderPanel && (
          <Typography variant="body2">
            当前阶段已接入热更新的重点范围包括主模块 LLM、检索 / Embedding / Reranker / 生成参数，以及日志生命周期策略。
          </Typography>
        )}
        {isProviderPanel && (
          <Typography variant="body2">
            `Provider 管理` 维护的是可选 Provider 模板库，不会直接修改当前运行中的主模块配置；真正切换运行参数仍需回到主模块 LLM 分组保存 `.env`。
          </Typography>
        )}
      </Stack>
    </Alert>
  );
}

function SectionGuide({ activeTitle }) {
  if (activeTitle?.includes('OpenMelon 主模块 LLM')) {
    return (
      <Alert severity="info" sx={{ alignItems: 'flex-start' }}>
        <Typography variant="body2">
          这里改的是主模块默认 LLM、Embedding 和生成参数。标记为 `热更新` 的字段保存后会影响后续新请求；如果 testcase_gen 没有配置独立 Key，它也会回退使用这里的主模块配置。
        </Typography>
      </Alert>
    );
  }
  if (activeTitle?.includes('testcase_gen 独立 LLM')) {
    return (
      <Alert severity="warning" sx={{ alignItems: 'flex-start' }}>
        <Typography variant="body2">
          这里管理 testcase_gen 的独立模型优先级：`CUSTOM > QWEN/DEEPSEEK > 主模块`。独立 Key 已配置时会优先走独立模型；未配置时才回退主模块。
        </Typography>
      </Alert>
    );
  }
  if (activeTitle === providerGroupTitle) {
    return (
      <Alert severity="info" sx={{ alignItems: 'flex-start' }}>
        <Typography variant="body2">
          这里维护的是 Provider 模板库，适合沉淀不同厂商或网关的推荐参数。保存后会立即出现在主模块 LLM 的可选模板里，但不会自动改动当前 `.env`。
        </Typography>
      </Alert>
    );
  }
  return null;
}

function EffectivePreview({ preview }) {
  if (!preview?.main_llm) return null;
  const main = preview.main_llm;
  const rows = [
    ['Provider', `${main.provider_label || main.provider}${main.known_provider ? '' : '（兼容回退）'}`],
    ['Base URL', `${main.base_url || '未配置'} · ${main.base_url_source === 'env' ? '.env/待保存' : 'provider 默认'}`],
    ['Chat', `${main.chat_model || '未配置'} · ${main.chat_model_source === 'env' ? '.env/待保存' : 'provider 默认'}`],
    ['Embedding', `${main.embedding_model || '未配置'} · ${main.embedding_model_source === 'env' ? '.env/待保存' : 'provider 默认'}`],
  ];
  return (
    <Alert severity="info" sx={{ alignItems: 'flex-start' }}>
      <Stack spacing={1.25} sx={{ width: '100%' }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="subtitle2">重启后生效预览</Typography>
          <Chip label="不写入敏感值" size="small" />
          <Chip label={main.restart_required ? '需重启生效' : '即时生效'} color="warning" size="small" />
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
          {rows.map(([label, value]) => (
            <Box key={label} sx={{ border: '1px solid rgba(59, 130, 246, 0.18)', borderRadius: 1, p: 1, bgcolor: 'rgba(255,255,255,0.54)' }}>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
              <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>{value}</Typography>
            </Box>
          ))}
        </Box>
      </Stack>
    </Alert>
  );
}

function MainLLMProviderPanel({ fieldMap, draft, providers, onChange, onApplyTemplate }) {
  const providerKey = draft.LLM_PROVIDER ?? fieldMap.LLM_PROVIDER?.value ?? fieldMap.LLM_PROVIDER?.default_value ?? 'openai_compat';
  const provider = providers?.[providerKey] || providers?.openai_compat;
  if (!provider) return null;
  const chatValue = draft.CHAT_MODEL ?? fieldMap.CHAT_MODEL?.value ?? '';
  const embeddingValue = draft.EMBEDDING_MODEL ?? fieldMap.EMBEDDING_MODEL?.value ?? '';
  const providerList = Object.values(providers || {});

  return (
    <Alert severity={provider.supports_embedding ? 'info' : 'warning'} sx={{ alignItems: 'flex-start' }}>
      <Stack spacing={1.25} sx={{ width: '100%' }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="subtitle2">{provider.label || provider.key}</Typography>
          <Chip label={provider.is_openai_compatible ? 'OpenAI-compatible' : '原生接口'} size="small" />
          <Chip label={provider.supports_chat ? '支持 Chat' : '不支持 Chat'} color={provider.supports_chat ? 'success' : 'warning'} size="small" />
          <Chip label={provider.supports_embedding ? '支持默认 Embedding' : '需单独配置 Embedding'} color={provider.supports_embedding ? 'success' : 'warning'} size="small" />
        </Stack>
        <Typography variant="caption" color="text.secondary">
          默认地址: {provider.api_base_url}（{provider.default_base_url_label || '默认 Base URL'}）
        </Typography>
        <Stack spacing={0.75}>
          <Typography variant="caption" color="text.secondary">Provider 配置模板</Typography>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            {providerList.map((item) => (
              <Chip
                key={item.key}
                label={`应用 ${item.label || item.key}`}
                size="small"
                color={providerKey === item.key ? 'primary' : 'default'}
                onClick={() => onApplyTemplate(item.template || {})}
              />
            ))}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            模板只填 provider、Base URL、模型名和 Embedding 维度，不覆盖 API_KEY。
          </Typography>
        </Stack>
        <Stack spacing={0.75}>
          <Typography variant="caption" color="text.secondary">推荐聊天模型</Typography>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            {(provider.recommended_chat_models || []).map((model) => (
              <Chip
                key={model}
                label={model}
                size="small"
                color={chatValue === model ? 'primary' : 'default'}
                onClick={() => onChange('CHAT_MODEL', model)}
              />
            ))}
          </Stack>
        </Stack>
        {provider.supports_embedding ? (
          <Stack spacing={0.75}>
            <Typography variant="caption" color="text.secondary">推荐 Embedding 模型</Typography>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              {(provider.recommended_embedding_models || []).map((model) => (
                <Chip
                  key={model}
                  label={model}
                  size="small"
                  color={embeddingValue === model ? 'primary' : 'default'}
                  onClick={() => onChange('EMBEDDING_MODEL', model)}
                />
              ))}
            </Stack>
          </Stack>
        ) : (
          <Typography variant="caption" color="text.secondary">
            该 provider 不提供默认 Embedding。主模块问答可用，但知识库索引需要手动配置兼容的 EMBEDDING_MODEL。
          </Typography>
        )}
      </Stack>
    </Alert>
  );
}

function ProviderRegistryManager({ providers, draft, onDraftChange, onEdit, onSave, onDelete, onApplyTemplate, saving }) {
  const items = Object.values(providers || {});
  const embeddingRequired = draft.supports_embedding;
  return (
    <Stack spacing={1.5}>
      <Alert severity="info" sx={{ alignItems: 'flex-start' }}>
        <Stack spacing={0.75}>
          <Typography variant="subtitle2">Provider 管理</Typography>
          <Typography variant="body2">
            这里管理“可选 provider 模板”，不是当前 `.env` 生效值。保存后会写入运行时 provider 注册表，主模块 LLM 分组可立即选用，真正运行仍需保存 `.env` 并重启。
          </Typography>
        </Stack>
      </Alert>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1.2fr 0.8fr' }, gap: 1.5 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
          {items.map((provider) => (
            <Box
              key={provider.key}
              sx={{
                border: '1px solid rgba(148, 163, 184, 0.32)',
                borderRadius: 1.5,
                p: 1.5,
                bgcolor: 'rgba(255,255,255,0.62)',
              }}
            >
              <Stack spacing={1}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography variant="subtitle2">{provider.label || provider.key}</Typography>
                  <Chip label={provider.scope === 'builtin' ? '内置' : '自定义'} size="small" color={provider.scope === 'builtin' ? 'info' : 'success'} />
                  <Chip label={provider.supports_embedding ? '带 Embedding' : '仅 Chat'} size="small" />
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.55 }}>
                  {provider.template_description || provider.default_base_url_label || '暂无说明'}
                </Typography>
                <Typography variant="caption" color="text.secondary">Key: {provider.key}</Typography>
                <Typography variant="caption" color="text.secondary">Base URL: {provider.api_base_url}</Typography>
                <Typography variant="caption" color="text.secondary">Chat: {provider.chat_model}</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Button size="small" onClick={() => onApplyTemplate(provider.template || {})}>应用到主模块</Button>
                  {provider.editable && <Button size="small" onClick={() => onEdit(provider)}>编辑</Button>}
                  {provider.editable && <Button size="small" color="error" onClick={() => onDelete(provider)}>删除</Button>}
                </Stack>
              </Stack>
            </Box>
          ))}
        </Box>

        <Box sx={{ border: '1px solid rgba(59, 130, 246, 0.24)', borderRadius: 1.5, p: 1.5, bgcolor: 'rgba(255,255,255,0.68)' }}>
          <Stack spacing={1.25}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
              <Typography variant="subtitle2">{draft.key ? `编辑 ${draft.key}` : '新增自定义 Provider'}</Typography>
              <Button size="small" onClick={() => onDraftChange(emptyProviderDraft)}>新建</Button>
            </Stack>
            <Alert severity="warning" sx={{ alignItems: 'flex-start' }}>
              <Typography variant="body2">
                必填: `Provider Key`、`展示名称`、`Base URL`、`Chat 模型`
                {embeddingRequired ? '、`Embedding 模型`、`Embedding 维度`' : ''}
              </Typography>
            </Alert>
            <TextField
              size="small"
              required
              label="Provider Key *"
              value={draft.key}
              onChange={(event) => onDraftChange({ ...draft, key: event.target.value })}
              helperText="必填，例如 claude_gateway、corp_openai"
            />
            <TextField
              size="small"
              required
              label="展示名称 *"
              value={draft.label}
              onChange={(event) => onDraftChange({ ...draft, label: event.target.value })}
            />
            <TextField
              size="small"
              required
              label="Base URL *"
              value={draft.api_base_url}
              onChange={(event) => onDraftChange({ ...draft, api_base_url: event.target.value })}
            />
            <TextField
              size="small"
              required
              label="Chat 模型 *"
              value={draft.chat_model}
              onChange={(event) => onDraftChange({ ...draft, chat_model: event.target.value })}
            />
            <TextField
              size="small"
              required={embeddingRequired}
              label={embeddingRequired ? 'Embedding 模型 *' : 'Embedding 模型'}
              value={draft.embedding_model}
              disabled={!draft.supports_embedding}
              helperText={embeddingRequired ? '开启 Embedding 时必填' : '关闭 Embedding 时可留空'}
              onChange={(event) => onDraftChange({ ...draft, embedding_model: event.target.value })}
            />
            <TextField
              size="small"
              required={embeddingRequired}
              label={embeddingRequired ? 'Embedding 维度 *' : 'Embedding 维度'}
              type="number"
              value={draft.embedding_dim}
              helperText={embeddingRequired ? '开启 Embedding 时必填' : '默认 1024'}
              onChange={(event) => onDraftChange({ ...draft, embedding_dim: event.target.value })}
            />
            <TextField size="small" label="别名" value={draft.aliases_text} onChange={(event) => onDraftChange({ ...draft, aliases_text: event.target.value })} helperText="用英文逗号分隔，可用于兼容旧写法" />
            <TextField size="small" label="推荐聊天模型" value={draft.recommended_chat_models_text} onChange={(event) => onDraftChange({ ...draft, recommended_chat_models_text: event.target.value })} />
            <TextField size="small" label="推荐 Embedding 模型" value={draft.recommended_embedding_models_text} onChange={(event) => onDraftChange({ ...draft, recommended_embedding_models_text: event.target.value })} />
            <TextField size="small" label="默认地址说明" value={draft.default_base_url_label} onChange={(event) => onDraftChange({ ...draft, default_base_url_label: event.target.value })} />
            <TextField size="small" multiline minRows={3} label="模板说明" value={draft.template_description} onChange={(event) => onDraftChange({ ...draft, template_description: event.target.value })} />
            <Stack direction="row" spacing={2}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Switch checked={draft.supports_embedding} onChange={(event) => onDraftChange({ ...draft, supports_embedding: event.target.checked, embedding_model: event.target.checked ? draft.embedding_model : '' })} />
                <Typography variant="body2">支持 Embedding</Typography>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Switch checked={draft.is_openai_compatible} onChange={(event) => onDraftChange({ ...draft, is_openai_compatible: event.target.checked })} />
                <Typography variant="body2">OpenAI-compatible</Typography>
              </Stack>
            </Stack>
            <Button variant="contained" startIcon={<SaveOutlined />} disabled={saving} onClick={onSave}>
              保存 Provider
            </Button>
          </Stack>
        </Box>
      </Box>
    </Stack>
  );
}

export default function ConfigCenter() {
  const snackbar = useSnackbar();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schema, setSchema] = useState(null);
  const [activeGroup, setActiveGroup] = useState('');
  const [draft, setDraft] = useState({});
  const [warnings, setWarnings] = useState({});
  const [preview, setPreview] = useState(null);
  const [providerDraft, setProviderDraft] = useState(emptyProviderDraft);
  const [initMode, setInitMode] = useState('minimal');
  const [initValues, setInitValues] = useState(initSecrets);

  const groups = [...(schema?.groups || []), { title: providerGroupTitle, fields: [] }];
  const status = schema?.status || {};
  const fieldMap = useMemo(() => {
    const next = {};
    groups.forEach((group) => group.fields.forEach((field) => { next[field.key] = field; }));
    return next;
  }, [groups]);
  const active = groups.find((group) => group.title === activeGroup) || groups[0];
  const changedKeys = Object.keys(draft);

  const loadSchema = async () => {
    setLoading(true);
    try {
      const data = await configCenterAPI.getSchema();
      setSchema(data);
      setActiveGroup((current) => current || data.groups?.[0]?.title || '');
      setDraft({});
      setWarnings({});
      setPreview(null);
      setProviderDraft(emptyProviderDraft);
    } catch (error) {
      snackbar(error.message || '加载运行配置失败', { severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchema();
  }, []);

  useEffect(() => {
    if (!schema || !status.env_exists) return undefined;
    let cancelled = false;
    configCenterAPI.previewValues(draft)
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [schema, status.env_exists, draft]);

  const setDraftValue = (key, value) => {
    const original = fieldMap[key]?.value ?? '';
    setDraft((prev) => {
      const next = { ...prev };
      if (String(value) === String(original)) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  };

  const applyDraftValues = (values) => {
    setDraft((prev) => {
      const next = { ...prev };
      Object.entries(values || {}).forEach(([key, value]) => {
        if (!fieldMap[key]?.editable) return;
        const normalized = String(value ?? '');
        const original = fieldMap[key]?.value ?? '';
        if (normalized === String(original)) {
          delete next[key];
        } else {
          next[key] = normalized;
        }
      });
      return next;
    });
  };

  const saveProvider = async () => {
    setSaving(true);
    try {
      const payload = {
        key: providerDraft.key,
        label: providerDraft.label,
        api_base_url: providerDraft.api_base_url,
        chat_model: providerDraft.chat_model,
        embedding_model: providerDraft.supports_embedding ? providerDraft.embedding_model : '',
        embedding_dim: Number(providerDraft.embedding_dim || 1024),
        aliases: splitProviderList(providerDraft.aliases_text),
        supports_chat: true,
        supports_embedding: providerDraft.supports_embedding,
        supports_default_embedding: providerDraft.supports_embedding,
        recommended_chat_models: splitProviderList(providerDraft.recommended_chat_models_text),
        recommended_embedding_models: providerDraft.supports_embedding ? splitProviderList(providerDraft.recommended_embedding_models_text) : [],
        default_base_url_label: providerDraft.default_base_url_label,
        is_openai_compatible: providerDraft.is_openai_compatible,
        template_description: providerDraft.template_description,
      };
      await configCenterAPI.saveProvider(payload);
      snackbar(`Provider ${payload.key} 已保存`, { severity: 'success' });
      await loadSchema();
      setActiveGroup(providerGroupTitle);
    } catch (error) {
      snackbar(error.message || '保存 Provider 失败', { severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const deleteProvider = async (provider) => {
    if (!provider?.editable) return;
    if (!window.confirm(`确认删除自定义 Provider ${provider.key}？`)) return;
    setSaving(true);
    try {
      await configCenterAPI.deleteProvider(provider.key);
      snackbar(`Provider ${provider.key} 已删除`, { severity: 'success' });
      await loadSchema();
      setActiveGroup(providerGroupTitle);
    } catch (error) {
      snackbar(error.message || '删除 Provider 失败', { severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const validation = await configCenterAPI.validateValues(draft);
      const nextWarnings = validation.warnings || {};
      const nextErrors = validation.errors || {};
      setWarnings(nextWarnings);
      if (Object.keys(nextErrors).length > 0) {
        snackbar(`运行配置校验失败: ${Object.keys(nextErrors).join(', ')}`, { severity: 'error' });
        return;
      }
      if (Object.keys(nextWarnings).length > 0) {
        snackbar(`发现 ${Object.keys(nextWarnings).length} 条配置提示，仍会继续保存`, { severity: 'warning' });
      }
      const result = await configCenterAPI.saveValues(draft);
      snackbar(
        result.restart_required
          ? `已写入 .env，变更 ${result.changed_keys.length} 项；部分配置需重启生效`
          : `已写入 .env，变更 ${result.changed_keys.length} 项；热更新配置已对新请求生效`,
        { severity: 'success' },
      );
      await loadSchema();
    } catch (error) {
      snackbar(error.message || '保存运行配置失败', { severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const initialize = async () => {
    setSaving(true);
    try {
      await configCenterAPI.initialize({ mode: initMode, values: initValues });
      snackbar('已创建 .env，重启后生效', { severity: 'success' });
      await loadSchema();
    } catch (error) {
      snackbar(error.message || '初始化 .env 失败', { severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <EmptyState variant="loading" title="加载运行配置" />;
  if (!schema) return <EmptyState variant="error" title="运行配置不可用" actionLabel="重试" onAction={loadSchema} />;

  if (!status.env_exists) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="h6">运行配置初始化</Typography>
            <Typography variant="body2" color="text.secondary">
              当前项目还没有 .env。可以从 .env.example 创建完整配置，或创建最小启动配置。
            </Typography>
          </Box>
          <Alert severity={status.example_exists ? 'warning' : 'error'}>
            {status.example_exists ? `检测到模板: ${status.example_path}` : '缺少 .env.example，无法初始化配置。'}
          </Alert>
          <FormControl size="small" sx={{ maxWidth: 360 }}>
            <InputLabel>初始化方式</InputLabel>
            <Select label="初始化方式" value={initMode} onChange={(event) => setInitMode(event.target.value)}>
              <MenuItem value="minimal">创建最小 .env</MenuItem>
              <MenuItem value="from_example">从 .env.example 创建完整 .env</MenuItem>
            </Select>
          </FormControl>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              label="API_KEY"
              type="password"
              size="small"
              value={initValues.API_KEY}
              onChange={(event) => setInitValues((prev) => ({ ...prev, API_KEY: event.target.value }))}
              sx={{ maxWidth: 420 }}
            />
            <TextField
              label="NEO4J_PASSWORD"
              type="password"
              size="small"
              value={initValues.NEO4J_PASSWORD}
              onChange={(event) => setInitValues((prev) => ({ ...prev, NEO4J_PASSWORD: event.target.value }))}
              sx={{ maxWidth: 280 }}
            />
          </Stack>
          <Box>
            <Button variant="contained" startIcon={<SaveOutlined />} disabled={!status.example_exists || saving} onClick={initialize}>
              创建 .env
            </Button>
          </Box>
        </Stack>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h6">运行配置</Typography>
          <Typography variant="body2" color="text.secondary">
            按 .env.example 的章节管理当前 .env。只有“已生效 .env”的配置来自未注释的 .env 行，保存前会自动备份。
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip label=".env 已存在" color="success" size="small" />
          <Chip label={`模板: ${status.example_exists ? '.env.example' : '缺失'}`} color={status.example_exists ? 'default' : 'error'} size="small" />
          <Chip label={`备份 ${status.backup_count || 0} 个`} size="small" />
          <Chip icon={<RestartAltOutlined />} label="保存后需重启" color="warning" size="small" />
          {changedKeys.length > 0 && <Chip label={`未保存 ${changedKeys.length} 项`} color="primary" size="small" />}
        </Stack>

        {!active?.title?.includes('testcase_gen 独立 LLM') && active?.title !== providerGroupTitle && (
          <TestcaseLLMSummary summary={preview?.testcase_gen_llm || status.testcase_gen_llm} />
        )}

        <RuntimeConfigGuide activeTitle={active?.title} />
        <SectionGuide activeTitle={active?.title} />

        <ConfigWarnings warnings={warnings} />

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '240px 1fr' }, gap: 2 }}>
          <Stack spacing={0.75}>
            {groups.map((group) => (
              <Button
                key={group.title}
                variant={group.title === active?.title ? 'contained' : 'text'}
                onClick={() => setActiveGroup(group.title)}
                sx={{
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  textTransform: 'none',
                  minHeight: 48,
                  borderRadius: 1.5,
                  px: 1.25,
                  py: 1,
                  border: '1px solid',
                  borderColor: group.title === active?.title ? 'primary.main' : 'rgba(148, 163, 184, 0.22)',
                  bgcolor: group.title === active?.title ? 'primary.main' : 'rgba(255,255,255,0.52)',
                  color: group.title === active?.title ? 'primary.contrastText' : 'primary.main',
                  boxShadow: group.title === active?.title ? '0 8px 18px rgba(37, 99, 235, 0.18)' : 'none',
                  '&:hover': {
                    bgcolor: group.title === active?.title ? 'primary.dark' : 'rgba(239,246,255,0.86)',
                    borderColor: group.title === active?.title ? 'primary.dark' : 'rgba(59, 130, 246, 0.32)',
                  },
                }}
              >
                {group.title}
              </Button>
            ))}
          </Stack>

          <Stack spacing={1.25}>
            <Typography variant="subtitle1">{active?.title}</Typography>
            {active?.title === providerGroupTitle ? (
              <ProviderRegistryManager
                providers={status.llm_providers}
                draft={providerDraft}
                onDraftChange={setProviderDraft}
                onEdit={(provider) => setProviderDraft(buildProviderDraft(provider))}
                onSave={saveProvider}
                onDelete={deleteProvider}
                onApplyTemplate={applyDraftValues}
                saving={saving}
              />
            ) : active?.title?.includes('testcase_gen 独立 LLM') ? (
              <TestcaseLLMEditor
                fieldMap={fieldMap}
                draft={draft}
                onChange={setDraftValue}
                summary={preview?.testcase_gen_llm || status.testcase_gen_llm}
              />
            ) : (
              <Stack spacing={1.5}>
                {active?.title?.includes('OpenMelon 主模块 LLM') && (
                  <MainLLMProviderPanel
                    fieldMap={fieldMap}
                    draft={draft}
                    providers={status.llm_providers}
                    onChange={setDraftValue}
                    onApplyTemplate={applyDraftValues}
                  />
                )}
                {active?.title?.includes('OpenMelon 主模块 LLM') && <EffectivePreview preview={preview} />}
                <ConfigGroupCards fields={active?.fields || []} draft={draft} onChange={setDraftValue} />
              </Stack>
            )}
          </Stack>
        </Box>

        <Divider />
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button disabled={!changedKeys.length || saving} onClick={() => { setDraft({}); setWarnings({}); }}>放弃修改</Button>
          <Button variant="contained" startIcon={<SaveOutlined />} disabled={!changedKeys.length || saving} onClick={save}>
            保存到 .env
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
