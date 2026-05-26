import { Box, Chip, Stack, Typography, alpha, Alert, TextField, Button, FormControl, InputLabel, Select, MenuItem, Switch, Paper, IconButton } from '@mui/material';
import SaveOutlined from '@mui/icons-material/SaveOutlined';
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined';
import CheckOutlined from '@mui/icons-material/CheckOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import ArrowForwardOutlined from '@mui/icons-material/ArrowForwardOutlined';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import PsychologyOutlined from '@mui/icons-material/PsychologyOutlined';
import EyeOutlined from '@mui/icons-material/RemoveRedEyeOutlined';
import { useState } from 'react';

function llmSourceColor(source) {
  if (source === 'custom' || source === 'qwen' || source === 'deepseek') return 'success';
  if (source === 'main') return 'info';
  return 'warning';
}

function TestcaseLLMSummary({ summary }) {
  if (!summary) return null;
  return (
    <Box sx={{ p: 2.2, borderRadius: 3, bgcolor: alpha('#f0f9ff', 0.5), border: '1px solid', borderColor: 'primary.light', mb: 2.5 }}>
      <Stack spacing={1.5}>
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: '13px' }}>
            用例生成引擎 (Testcase Generation) 生效状态
          </Typography>
          <Typography variant="caption" color="text.secondary">
            当前测试执行引擎实际加载的语言及多模态视觉模型参数
          </Typography>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          {[
            ['视觉场景理解 (Vision Analysis)', summary.vision, EyeOutlined],
            ['用例生成及评审 (Text Gen & Review)', summary.text, PsychologyOutlined],
          ].map(([label, item, Icon]) => (
            <Box key={label} sx={{ p: 1.8, borderRadius: 2.5, bgcolor: 'white', border: '1px solid rgba(0,0,0,0.04)', boxShadow: '0 2px 8px rgba(0,0,0,0.01)' }}>
              <Stack spacing={1.25}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <Icon sx={{ fontSize: 16, color: 'primary.main' }} />
                    <Typography variant="body2" sx={{ fontWeight: 800, fontSize: '12px' }}>{label}</Typography>
                  </Stack>
                  <Chip 
                    label={item?.source_label || '未激活'} 
                    color={llmSourceColor(item?.source)} 
                    size="small" 
                    variant="soft" 
                    sx={{ height: 16, fontSize: '9.5px', fontWeight: 800, borderRadius: 1 }}
                  />
                </Stack>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 500 }}>
                    模型型号: <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{item?.model_name || '未指定 (Fallback)'}</Box>
                  </Typography>
                  <Typography 
                    variant="caption" 
                    color="text.secondary" 
                    sx={{ 
                      display: 'block', 
                      wordBreak: 'break-all', 
                      fontFamily: 'monospace',
                      fontSize: '10px',
                      mt: 0.25,
                      opacity: 0.8
                    }}
                  >
                    API 端点: {item?.base_url || '未指定 (Fallback)'}
                  </Typography>
                </Box>
              </Stack>
            </Box>
          ))}
        </Box>
      </Stack>
    </Box>
  );
}

// Inline Secret field editor for TestcaseGenPanel (REPLACING window.prompt!)
function SecretFieldEditor({ field, value, hasDraft, onChange }) {
  const [editing, setEditing] = useState(false);
  const [tempValue, setTempValue] = useState('');

  const handleSave = () => {
    onChange(field.key, tempValue);
    setEditing(false);
    setTempValue('');
  };

  const handleClear = () => {
    onChange(field.key, '');
    setEditing(false);
    setTempValue('');
  };

  if (!field) return null;

  return (
    <Box sx={{ mt: 0.5 }}>
      {editing ? (
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            size="small"
            fullWidth
            autoFocus
            type="password"
            label={`输入 ${field.key}...`}
            placeholder="留空以清除该配置"
            value={tempValue}
            onChange={(e) => setTempValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            sx={{ 
              '& .MuiOutlinedInput-root': { 
                borderRadius: 2.2,
                fontSize: '12px',
                bgcolor: 'rgba(255,255,255,0.7)',
              } 
            }}
          />
          <IconButton 
            size="small" 
            color="primary" 
            onClick={handleSave} 
            sx={{ 
              bgcolor: alpha('#1a73e8', 0.08), 
              borderRadius: 1.5,
              width: 36,
              height: 36,
            }}
          >
            <CheckOutlined fontSize="small" />
          </IconButton>
          {field.configured && (
            <Button 
              size="small" 
              color="error" 
              onClick={handleClear} 
              sx={{ fontSize: '11px', fontWeight: 700 }}
            >
              清除
            </Button>
          )}
          <IconButton 
            size="small" 
            onClick={() => setEditing(false)}
            sx={{ 
              borderRadius: 1.5,
              width: 36,
              height: 36,
            }}
          >
            <CloseOutlined fontSize="small" />
          </IconButton>
        </Stack>
      ) : (
        <Stack direction="row" spacing={1} alignItems="center">
          <Box 
            sx={{ 
              flex: 1, 
              height: 38, 
              borderRadius: 2.2, 
              px: 1.5, 
              bgcolor: 'rgba(0,0,0,0.025)', 
              border: '1px solid rgba(0,0,0,0.04)',
              display: 'flex', 
              alignItems: 'center', 
              gap: 1
            }}
          >
            <VisibilityOffOutlined sx={{ fontSize: 15, color: 'text.disabled' }} />
            <Typography variant="caption" color="text.disabled" sx={{ letterSpacing: 2, fontWeight: 800, fontSize: '11px' }}>
              {hasDraft ? (value ? '待保存 · ••••••••' : '将清空') : (field.configured ? '已配置 · ••••••••' : '未设置密钥')}
            </Typography>
          </Box>
          <IconButton 
            size="small" 
            onClick={() => {
              setEditing(true);
              setTempValue('');
            }}
            sx={{ 
              bgcolor: 'rgba(26, 115, 232, 0.08)',
              color: 'primary.main',
              borderRadius: 2.2,
              width: 38,
              height: 38,
              '&:hover': {
                bgcolor: 'rgba(26, 115, 232, 0.15)'
              }
            }}
          >
            <EditOutlined sx={{ fontSize: 16 }} />
          </IconButton>
        </Stack>
      )}
    </Box>
  );
}

const baseUrlDefaults = {
  CUSTOM_BASE_URL: { label: 'OpenAI 兼容网关地址', value: 'https://one-api.miotech.com/v1' },
  QWEN_BASE_URL: { label: '通义千问官方端点', value: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  DEEPSEEK_BASE_URL: { label: 'DeepSeek 官方端点', value: 'https://api.deepseek.com/v1' },
};

function BaseUrlEditor({ field, value, onChange }) {
  if (!field) return null;
  const preset = baseUrlDefaults[field.key];
  const strategy = value ? (value === preset?.value ? 'official' : 'custom') : 'main';
  return (
    <Stack spacing={1}>
      <FormControl size="small" fullWidth>
        <InputLabel id={`${field.key}-label`}>{field.key}</InputLabel>
        <Select
          labelId={`${field.key}-label`}
          label={field.key}
          value={strategy}
          onChange={(event) => {
            if (event.target.value === 'main') onChange(field.key, '');
            if (event.target.value === 'official') onChange(field.key, preset?.value || '');
            if (event.target.value === 'custom') onChange(field.key, value || preset?.value || '');
          }}
          sx={{ borderRadius: 2.2, fontSize: '12px', fontWeight: 600 }}
        >
          <MenuItem value="main" sx={{ fontSize: '12px' }}>复用主模块 LLM_API_BASE</MenuItem>
          <MenuItem value="official" sx={{ fontSize: '12px' }}>{preset?.label || '官方默认地址'}</MenuItem>
          <MenuItem value="custom" sx={{ fontSize: '12px' }}>自定义端点地址</MenuItem>
        </Select>
      </FormControl>
      {strategy === 'custom' && (
        <TextField
          size="small"
          fullWidth
          placeholder={preset?.value}
          value={value}
          onChange={(event) => onChange(field.key, event.target.value)}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.2, fontSize: '12px', fontWeight: 600 } }}
        />
      )}
    </Stack>
  );
}

function ModelNameEditor({ field, value, presets, onChange }) {
  return (
    <Stack spacing={1.25}>
      <TextField
        size="small"
        fullWidth
        label={field.key}
        value={value}
        onChange={(event) => onChange(field.key, event.target.value)}
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.2, fontSize: '12px', fontWeight: 600 } }}
      />
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        {presets.map((preset) => {
          const isActive = value === preset;
          return (
            <Chip
              key={preset}
              label={preset}
              size="small"
              onClick={() => onChange(field.key, preset)}
              color={isActive ? 'primary' : 'default'}
              variant={isActive ? 'filled' : 'outlined'}
              sx={{ 
                fontSize: '10px', 
                fontWeight: isActive ? 800 : 500,
                borderRadius: 1.5,
                cursor: 'pointer',
                borderColor: isActive ? 'primary.main' : 'rgba(0,0,0,0.06)',
                bgcolor: isActive ? 'primary.main' : 'rgba(255,255,255,0.4)',
                '&:hover': {
                  bgcolor: isActive ? 'primary.main' : 'white',
                }
              }}
            />
          );
        })}
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
  const isCustom = tone === 'custom';
  const borderColor = isCustom ? 'rgba(26, 115, 232, 0.25)' : 'rgba(0,0,0,0.06)';
  
  return (
    <Box 
      className="magnetic-card"
      sx={{ 
        border: '1px solid', 
        borderColor, 
        borderRadius: 4, 
        p: 2.5, 
        bgcolor: isCustom ? 'rgba(240, 249, 255, 0.35)' : 'white',
        boxShadow: isCustom ? '0 4px 16px rgba(26, 115, 232, 0.02)' : '0 2px 8px rgba(0,0,0,0.01)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        '&:hover': {
          transform: 'translateY(-3px)',
          borderColor: 'primary.main',
          boxShadow: isCustom ? '0 8px 24px rgba(26, 115, 232, 0.1)' : '0 6px 20px rgba(0,0,0,0.03)',
        }
      }}
    >
      <Stack spacing={2.25}>
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: '13px', color: 'text.primary' }}>{title}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, fontWeight: 500 }}>{caption}</Typography>
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

// Premium visualizer showing how model resolution cascades
function PriorityChainVisualizer() {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 3.5,
        border: '1px dashed rgba(26, 115, 232, 0.18)',
        bgcolor: 'rgba(240, 249, 255, 0.3)',
        backdropFilter: 'blur(8px)',
        mb: 2,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <AutoAwesomeOutlined color="primary" sx={{ fontSize: 16 }} />
        <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.primary', letterSpacing: '0.04em' }}>
          模型生效优先级解析 (MODEL ROUTING RESOLUTION CHAIN)
        </Typography>
      </Stack>

      <Stack 
        direction={{ xs: 'column', sm: 'row' }} 
        spacing={{ xs: 1.5, sm: 1 }} 
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        justifyContent="space-between"
      >
        {[
          { label: 'CUSTOM 独立配置', desc: '优先接管视觉与文本', color: '#1a73e8', active: true },
          { label: 'QWEN / DEEPSEEK 专项', desc: '按模态(图片/文字)分流', color: '#10b981', active: true },
          { label: 'GLOBAL 主大模型', desc: '主模块底座兜底配置', color: '#64748b', active: false },
        ].map((item, index) => (
          <Box key={index} sx={{ display: 'flex', alignItems: 'center', width: { xs: '100%', sm: 'auto' } }}>
            <Box 
              sx={{ 
                p: 1.25, 
                borderRadius: 2, 
                bgcolor: 'white',
                border: '1px solid rgba(0,0,0,0.04)',
                boxShadow: '0 2px 6px rgba(0,0,0,0.01)',
                minWidth: 150,
                textAlign: 'left',
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 800, color: item.color, display: 'block', fontSize: '10.5px' }}>
                {index + 1}. {item.label}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '9px', fontWeight: 500, mt: 0.25 }}>
                {item.desc}
              </Typography>
            </Box>
            
            {index < 2 && (
              <Box sx={{ display: { xs: 'none', sm: 'flex' }, mx: 1.5, color: 'text.disabled' }}>
                <ArrowForwardOutlined sx={{ fontSize: 14 }} />
              </Box>
            )}
          </Box>
        ))}
      </Stack>
    </Paper>
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
    <Stack spacing={2.5}>
      <TestcaseLLMSummary summary={summary} />
      
      {/* Priority visualizer chain */}
      <PriorityChainVisualizer />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'repeat(2, 1fr)' }, gap: 3 }}>
        <TestcaseLLMCard
          title="1. 统一自定义大模型 (Custom Gateway)"
          caption="适用于同一个中转网关/One-API 承载所有测试用例生成需求。"
          tone="custom"
          fields={{ apiKey: fieldMap.CUSTOM_API_KEY, baseUrl: fieldMap.CUSTOM_BASE_URL, modelName: fieldMap.CUSTOM_MODEL_NAME }}
          values={values} draft={draft} onChange={onChange} modelPresetsForCard={modelPresets.custom}
        />
        <TestcaseLLMCard
          title="2-A. 视觉分析大模型 (Qwen VL)"
          caption="通义千问视觉大模型，专门用于前端UI截图和视觉类步骤理解。"
          fields={{ apiKey: fieldMap.QWEN_API_KEY, baseUrl: fieldMap.QWEN_BASE_URL, modelName: fieldMap.QWEN_MODEL_NAME }}
          values={values} draft={draft} onChange={onChange} modelPresetsForCard={modelPresets.vision}
        />
        <TestcaseLLMCard
          title="2-B. 文本生成及评审模型 (DeepSeek)"
          caption="DeepSeek 高性能大模型，专门用于逻辑推理、步骤生成和用例评审。"
          fields={{ apiKey: fieldMap.DEEPSEEK_API_KEY, baseUrl: fieldMap.DEEPSEEK_BASE_URL, modelName: fieldMap.DEEPSEEK_MODEL_NAME }}
          values={values} draft={draft} onChange={onChange} modelPresetsForCard={modelPresets.text}
        />
      </Box>
    </Stack>
  );
}
