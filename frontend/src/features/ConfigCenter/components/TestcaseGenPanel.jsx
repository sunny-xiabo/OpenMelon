import { Box, Chip, Stack, Typography, alpha, Alert, TextField, Button, FormControl, InputLabel, Select, MenuItem, Switch } from '@mui/material';
import SaveOutlined from '@mui/icons-material/SaveOutlined';
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined';

function llmSourceColor(source) {
  if (source === 'custom' || source === 'qwen' || source === 'deepseek') return 'success';
  if (source === 'main') return 'info';
  return 'warning';
}

function TestcaseLLMSummary({ summary }) {
  if (!summary) return null;
  return (
    <Box sx={{ p: 2, borderRadius: 2, bgcolor: alpha('#f0f9ff', 0.5), border: '1px solid', borderColor: 'primary.light', mb: 2 }}>
      <Stack spacing={1.5}>
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Testcase Generation 状态</Typography>
          <Typography variant="caption" color="text.secondary">当前实际生效的 LLM 模型配置</Typography>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
          {[
            ['视觉分析', summary.vision],
            ['文本生成/评审', summary.text],
          ].map(([label, item]) => (
            <Box key={label} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'white', border: '1px solid rgba(0,0,0,0.05)' }}>
              <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{label}</Typography>
                  <Chip label={item?.source_label || '未配置'} color={llmSourceColor(item?.source)} size="small" variant="soft" />
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>模型: {item?.model_name || '未配置'}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-all' }}>URL: {item?.base_url || '未配置'}</Typography>
              </Stack>
            </Box>
          ))}
        </Box>
      </Stack>
    </Box>
  );
}

function SecretFieldEditor({ field, value, hasDraft, onChange }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <TextField
        size="small"
        fullWidth
        disabled
        label={field.key}
        value={hasDraft ? (value ? '待保存 · ••••••••' : '将清空') : (field.configured ? '已配置 · ••••••••' : '未配置')}
        InputProps={{ startAdornment: <VisibilityOffOutlined fontSize="small" /> }}
      />
      <Button 
        variant="text" 
        size="small"
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

const baseUrlDefaults = {
  CUSTOM_BASE_URL: { label: 'OpenAI-compatible 默认地址', value: 'https://one-api.miotech.com/v1' },
  QWEN_BASE_URL: { label: 'DashScope 官方默认地址', value: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  DEEPSEEK_BASE_URL: { label: 'DeepSeek 官方默认地址', value: 'https://api.deepseek.com/v1' },
};

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
          placeholder={preset?.value}
          value={value}
          onChange={(event) => onChange(field.key, event.target.value)}
        />
      )}
    </Stack>
  );
}

function ModelNameEditor({ field, value, presets, onChange }) {
  return (
    <Stack spacing={1}>
      <TextField
        size="small"
        fullWidth
        label={field.key}
        value={value}
        onChange={(event) => onChange(field.key, event.target.value)}
      />
      <Stack direction="row" spacing={0.5} flexWrap="wrap">
        {presets.map((preset) => (
          <Chip
            key={preset}
            label={preset}
            size="small"
            onClick={() => onChange(field.key, preset)}
            color={value === preset ? 'primary' : 'default'}
            variant={value === preset ? 'filled' : 'outlined'}
            sx={{ fontSize: '0.7rem' }}
          />
        ))}
      </Stack>
    </Stack>
  );
}

const modelPresets = {
  custom: ['deepseek-ai/DeepSeek-V3', 'qwen-plus', 'gpt-4o-mini'],
  vision: ['qwen-vl-max', 'qwen3-vl-32b-siliconflow', 'qwen2.5-vl-72b-instruct'],
  text: ['deepseek-chat', 'deepseek-v3.2', 'qwen-plus'],
};

function TestcaseLLMCard({ title, caption, tone = 'default', fields, values, draft, onChange, modelPresetsForCard }) {
  const borderColor = tone === 'custom' ? 'primary.light' : 'divider';
  return (
    <Box sx={{ border: '1px solid', borderColor, borderRadius: 2, p: 2, bgcolor: 'white' }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{title}</Typography>
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

export default function TestcaseGenPanel({ fieldMap, draft, onChange, summary }) {
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
    <Stack spacing={2}>
      <TestcaseLLMSummary summary={summary} />
      <Alert severity="info" sx={{ borderRadius: 2 }}>
        优先级: CUSTOM &gt; QWEN/DEEPSEEK &gt; 主模块。填 CUSTOM_API_KEY 后会同时接管视觉和文本。
      </Alert>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'repeat(2, 1fr)' }, gap: 2 }}>
        <TestcaseLLMCard
          title="统一自定义模型 (Custom)"
          caption="适用于同一个网关承载所有测试用例生成需求。"
          tone="custom"
          fields={{ apiKey: fieldMap.CUSTOM_API_KEY, baseUrl: fieldMap.CUSTOM_BASE_URL, modelName: fieldMap.CUSTOM_MODEL_NAME }}
          values={values} draft={draft} onChange={onChange} modelPresetsForCard={modelPresets.custom}
        />
        <TestcaseLLMCard
          title="视觉分析模型 (Qwen)"
          caption="专门用于图片、截图和视觉类需求理解。"
          fields={{ apiKey: fieldMap.QWEN_API_KEY, baseUrl: fieldMap.QWEN_BASE_URL, modelName: fieldMap.QWEN_MODEL_NAME }}
          values={values} draft={draft} onChange={onChange} modelPresetsForCard={modelPresets.vision}
        />
        <TestcaseLLMCard
          title="文本生成/评审模型 (DeepSeek)"
          caption="专门用于需求分析、用例生成和评审。"
          fields={{ apiKey: fieldMap.DEEPSEEK_API_KEY, baseUrl: fieldMap.DEEPSEEK_BASE_URL, modelName: fieldMap.DEEPSEEK_MODEL_NAME }}
          values={values} draft={draft} onChange={onChange} modelPresetsForCard={modelPresets.text}
        />
      </Box>
    </Stack>
  );
}
