import { Box, Chip, Stack, Typography, alpha, Alert, TextField, Button, FormControl, InputLabel, Select, MenuItem, Paper, IconButton, ToggleButton, ToggleButtonGroup } from '@mui/material';
import SaveOutlined from '@mui/icons-material/SaveOutlined';
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined';
import CheckOutlined from '@mui/icons-material/CheckOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import PsychologyOutlined from '@mui/icons-material/PsychologyOutlined';
import EyeOutlined from '@mui/icons-material/RemoveRedEyeOutlined';
import DataObjectOutlined from '@mui/icons-material/DataObjectOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import LinkOutlined from '@mui/icons-material/LinkOutlined';
import PublicOutlined from '@mui/icons-material/PublicOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSlotConfig, useSaveSlotConfig } from '../hooks/useSlotConfig';

// ─── Presets management ──────────────────────────────────────

const DEFAULT_PRESETS = {
  custom: ['deepseek-ai/DeepSeek-V3', 'qwen-plus', 'gpt-4o-mini'],
  vision: ['qwen-vl-max', 'qwen3-vl-32b-siliconflow', 'qwen2.5-vl-72b-instruct'],
  text: ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-reasoner', 'deepseek-chat', 'deepseek-v3.2', 'qwen-plus'],
  embedding: ['text-embedding-v3', 'text-embedding-3-small', 'bge-large-zh-v1.5'],
};

const DEFAULT_DEPRECATED = new Set(['deepseek-chat', 'deepseek-reasoner']);

let _remotePresets = null;
let _remoteDeprecated = null;
let _fetchPromise = null;

function fetchModelPresets() {
  if (_fetchPromise) return _fetchPromise;
  _fetchPromise = fetch('/api/model-presets')
    .then((r) => (r.ok ? r.json() : Promise.reject(r)))
    .then((data) => {
      _remotePresets = data.presets || DEFAULT_PRESETS;
      _remoteDeprecated = new Set(data.deprecated || []);
      return { presets: _remotePresets, deprecated: _remoteDeprecated };
    })
    .catch(() => {
      _remotePresets = DEFAULT_PRESETS;
      _remoteDeprecated = DEFAULT_DEPRECATED;
      return { presets: DEFAULT_PRESETS, deprecated: DEFAULT_DEPRECATED };
    });
  return _fetchPromise;
}

function getModelPresets() { return _remotePresets || DEFAULT_PRESETS; }
function getDeprecatedModels() { return _remoteDeprecated || DEFAULT_DEPRECATED; }

// ─── Helpers ─────────────────────────────────────────────────

function slotSourceColor(source) {
  if (source?.startsWith('slot_')) return 'primary';
  if (source === 'custom' || source === 'qwen' || source === 'deepseek') return 'success';
  if (source === 'main') return 'info';
  return 'warning';
}

const SLOT_META = {
  text: { title: '文本生成', subtitle: '用例生成及评审 (Text Gen & Review)', icon: PsychologyOutlined, color: '#1a73e8', presetsKey: 'text' },
  vision: { title: '视觉分析', subtitle: '视觉场景理解 (Vision Analysis)', icon: EyeOutlined, color: '#9334e6', presetsKey: 'vision' },
  embedding: { title: '向量嵌入', subtitle: '文档向量化 (Embedding)', icon: DataObjectOutlined, color: '#10b981', presetsKey: 'embedding' },
};

const MODE_OPTIONS = {
  text: [
    { value: 'global', label: '跟随全局' },
    { value: 'independent', label: '独立配置' },
  ],
  vision: [
    { value: 'same_as_text', label: '同文本模型' },
    { value: 'global', label: '跟随全局' },
    { value: 'independent', label: '独立配置' },
  ],
  embedding: [
    { value: 'global', label: '跟随全局' },
    { value: 'independent', label: '独立配置' },
  ],
};

// ─── Sub-components ──────────────────────────────────────────

function TestcaseLLMSummary({ summary }) {
  if (!summary) return null;
  const items = [
    ['视觉场景理解 (Vision)', summary.vision, EyeOutlined],
    ['用例生成及评审 (Text)', summary.text, PsychologyOutlined],
    ['向量嵌入 (Embedding)', summary.embedding, DataObjectOutlined],
  ];
  return (
    <Box sx={{ p: 2.2, borderRadius: 3, bgcolor: alpha('#f0f9ff', 0.5), border: '1px solid', borderColor: 'primary.light', mb: 2.5 }}>
      <Stack spacing={1.5}>
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: '13px' }}>
            用例生成引擎 (Testcase Generation) 生效状态
          </Typography>
          <Typography variant="caption" color="text.secondary">
            当前测试执行引擎实际加载的模型参数（三槽位路由）
          </Typography>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
          {items.map(([label, item, Icon]) => (
            <Box key={label} sx={{ p: 1.8, borderRadius: 2.5, bgcolor: 'white', border: '1px solid rgba(0,0,0,0.04)', boxShadow: '0 2px 8px rgba(0,0,0,0.01)' }}>
              <Stack spacing={1.25}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <Icon sx={{ fontSize: 16, color: 'primary.main' }} />
                    <Typography variant="body2" sx={{ fontWeight: 800, fontSize: '12px' }}>{label}</Typography>
                  </Stack>
                  <Chip
                    label={item?.source_label || item?.source || '未激活'}
                    color={slotSourceColor(item?.source)}
                    size="small"
                    variant="soft"
                    sx={{ height: 16, fontSize: '9.5px', fontWeight: 800, borderRadius: 1 }}
                  />
                </Stack>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 500 }}>
                    模型: <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{item?.model_name || item?.model || '未指定'}</Box>
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '10px', mt: 0.25, opacity: 0.8 }}>
                    {item?.base_url ? `端点: ${item.base_url}` : item?.dimension ? `维度: ${item.dimension}` : ''}
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

function SecretFieldEditor({ field, value, hasDraft, onChange }) {
  const [editing, setEditing] = useState(false);
  const [tempValue, setTempValue] = useState('');

  const handleSave = () => { onChange(field.key, tempValue); setEditing(false); setTempValue(''); };
  const handleClear = () => { onChange(field.key, ''); setEditing(false); setTempValue(''); };

  if (!field) return null;
  return (
    <Box sx={{ mt: 0.5 }}>
      {editing ? (
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            size="small" fullWidth autoFocus type="password"
            label={`输入 ${field.key}...`} placeholder="留空以清除该配置"
            value={tempValue} onChange={(e) => setTempValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.2, fontSize: '12px', bgcolor: 'rgba(255,255,255,0.7)' } }}
          />
          <IconButton size="small" color="primary" onClick={handleSave} sx={{ bgcolor: alpha('#1a73e8', 0.08), borderRadius: 1.5, width: 36, height: 36 }}>
            <CheckOutlined fontSize="small" />
          </IconButton>
          {field.configured && <Button size="small" color="error" onClick={handleClear} sx={{ fontSize: '11px', fontWeight: 700 }}>清除</Button>}
          <IconButton size="small" onClick={() => setEditing(false)} sx={{ borderRadius: 1.5, width: 36, height: 36 }}>
            <CloseOutlined fontSize="small" />
          </IconButton>
        </Stack>
      ) : (
        <Stack direction="row" spacing={1} alignItems="center">
          <Box sx={{ flex: 1, height: 38, borderRadius: 2.2, px: 1.5, bgcolor: 'rgba(0,0,0,0.025)', border: '1px solid rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 1 }}>
            <VisibilityOffOutlined sx={{ fontSize: 15, color: 'text.disabled' }} />
            <Typography variant="caption" color="text.disabled" sx={{ letterSpacing: 2, fontWeight: 800, fontSize: '11px' }}>
              {hasDraft ? (value ? '待保存 · ••••••••' : '将清空') : (field.configured ? '已配置 · ••••••••' : '未设置密钥')}
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => { setEditing(true); setTempValue(''); }} sx={{ bgcolor: 'rgba(26, 115, 232, 0.08)', color: 'primary.main', borderRadius: 2.2, width: 38, height: 38, '&:hover': { bgcolor: 'rgba(26, 115, 232, 0.15)' } }}>
            <EditOutlined sx={{ fontSize: 16 }} />
          </IconButton>
        </Stack>
      )}
    </Box>
  );
}

function SlotModeSelector({ slotKey, mode, onChange }) {
  const options = MODE_OPTIONS[slotKey] || MODE_OPTIONS.text;
  return (
    <ToggleButtonGroup
      value={mode}
      exclusive
      onChange={(e, v) => v && onChange(v)}
      size="small"
      sx={{ width: '100%', '& .MuiToggleButton-root': { flex: 1, py: 0.6, fontSize: '11.5px', fontWeight: 700, borderRadius: '10px !important', textTransform: 'none', border: '1px solid rgba(0,0,0,0.08)', '&.Mui-selected': { bgcolor: 'primary.main', color: 'white', '&:hover': { bgcolor: 'primary.dark' } } } }}
    >
      {options.map((opt) => (
        <ToggleButton key={opt.value} value={opt.value}>{opt.label}</ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

function ModelPresetChips({ value, presets, onChange }) {
  const deprecated = getDeprecatedModels();
  return (
    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
      {presets.map((preset) => {
        const isActive = value === preset;
        const isDep = deprecated.has(preset);
        return (
          <Chip
            key={preset}
            label={isDep ? `${preset} (弃用)` : preset}
            size="small"
            onClick={() => onChange(preset)}
            color={isActive ? 'primary' : 'default'}
            variant={isActive ? 'filled' : 'outlined'}
            sx={{
              fontSize: '10px', fontWeight: isActive ? 800 : 500, borderRadius: 1.5, cursor: 'pointer',
              textDecoration: isDep ? 'line-through' : 'none',
              borderColor: isDep ? 'warning.main' : isActive ? 'primary.main' : 'rgba(0,0,0,0.06)',
              bgcolor: isActive ? 'primary.main' : isDep ? 'rgba(245,158,11,0.06)' : 'rgba(255,255,255,0.4)',
              color: isActive ? undefined : isDep ? 'warning.main' : undefined,
              '&:hover': { bgcolor: isActive ? 'primary.main' : isDep ? 'rgba(245,158,11,0.12)' : 'white' },
            }}
          />
        );
      })}
    </Stack>
  );
}

function SlotConfigCard({ slotKey, slotConfig, providers, onChange }) {
  const meta = SLOT_META[slotKey];
  const mode = slotConfig?.mode || 'global';
  const isIndependent = mode === 'independent';
  const presets = getModelPresets();
  const presetsForSlot = presets[meta.presetsKey] || presets.text || [];

  const handleModeChange = (newMode) => onChange({ ...slotConfig, mode: newMode });
  const handleField = (field, value) => onChange({ ...slotConfig, [field]: value });

  return (
    <Box
      className="magnetic-card"
      sx={{
        border: '1px solid',
        borderColor: isIndependent ? alpha(meta.color, 0.25) : 'rgba(0,0,0,0.06)',
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: isIndependent ? alpha(meta.color, 0.02) : 'white',
        boxShadow: isIndependent ? `0 4px 16px ${alpha(meta.color, 0.06)}` : '0 2px 8px rgba(0,0,0,0.01)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        '&:hover': {
          transform: 'translateY(-3px)',
          borderColor: alpha(meta.color, 0.4),
          boxShadow: isIndependent ? `0 8px 24px ${alpha(meta.color, 0.12)}` : '0 6px 20px rgba(0,0,0,0.03)',
        },
      }}
    >
      {/* Accent bar */}
      <Box sx={{ height: 3, background: `linear-gradient(90deg, ${meta.color}, ${alpha(meta.color, 0.4)})` }} />

      <Box sx={{ p: 2.5 }}>
        <Stack spacing={2.25}>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: '14px', color: 'text.primary' }}>
              {meta.title}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, fontWeight: 500 }}>
              {meta.subtitle}
            </Typography>
          </Box>

          <SlotModeSelector slotKey={slotKey} mode={mode} onChange={handleModeChange} />

          {mode === 'same_as_text' && (
            <Alert severity="info" sx={{ py: 0.5, borderRadius: 2.5, fontSize: '11.5px' }} icon={<LinkOutlined sx={{ fontSize: 16 }} />}>
              视觉分析将复用文本槽位的 Provider 和模型配置
            </Alert>
          )}

          {mode === 'global' && (
            <Alert severity="info" sx={{ py: 0.5, borderRadius: 2.5, fontSize: '11.5px' }} icon={<PublicOutlined sx={{ fontSize: 16 }} />}>
              跟随 OpenMelon 主模块 LLM 配置
            </Alert>
          )}

          {isIndependent && (
            <Stack spacing={2}>
              {/* Provider */}
              <FormControl fullWidth size="small">
                <InputLabel>Provider</InputLabel>
                <Select
                  value={slotConfig?.provider || ''}
                  label="Provider"
                  onChange={(e) => handleField('provider', e.target.value)}
                  sx={{ borderRadius: 2.2, fontSize: '12px', fontWeight: 600 }}
                >
                  <MenuItem value="" sx={{ fontSize: '12px' }}><em>跟随全局 Provider</em></MenuItem>
                  {(providers || []).map((p) => (
                    <MenuItem key={p.key} value={p.key} sx={{ fontSize: '12px' }}>
                      {p.label || p.key}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Model */}
              <Stack spacing={1.25}>
                <TextField
                  size="small" fullWidth
                  label="模型名称"
                  value={slotConfig?.model || ''}
                  onChange={(e) => handleField('model', e.target.value)}
                  placeholder="留空跟随全局模型"
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.2, fontSize: '12px', fontWeight: 600 } }}
                />
                <ModelPresetChips
                  value={slotConfig?.model || ''}
                  presets={presetsForSlot}
                  onChange={(v) => handleField('model', v)}
                />
              </Stack>

              {/* Embedding-specific: dimension */}
              {slotKey === 'embedding' && (
                <Stack spacing={1}>
                  <TextField
                    size="small" fullWidth type="number"
                    label="嵌入维度 (Dimension)"
                    value={slotConfig?.dim || ''}
                    onChange={(e) => handleField('dim', e.target.value ? Number(e.target.value) : null)}
                    placeholder="默认 1024"
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.2, fontSize: '12px', fontWeight: 600 } }}
                  />
                  <Alert
                    severity="warning"
                    sx={{ py: 0.5, borderRadius: 2.5, fontSize: '11px' }}
                    icon={<WarningAmberOutlined sx={{ fontSize: 16 }} />}
                  >
                    修改嵌入维度后，已有的向量库数据可能不兼容，需要重建索引。
                  </Alert>
                </Stack>
              )}
            </Stack>
          )}
        </Stack>
      </Box>
    </Box>
  );
}

// ─── Credential Section ──────────────────────────────────────

function CredentialPair({ label, apiKeyField, baseUrlField, fieldMap, draft, onChange }) {
  const apiKeyMeta = fieldMap[apiKeyField];
  const baseUrlMeta = fieldMap[baseUrlField];
  if (!apiKeyMeta && !baseUrlMeta) return null;

  const baseUrlValue = draft[baseUrlField] ?? baseUrlMeta?.value ?? '';
  const hasDraftBaseUrl = Object.prototype.hasOwnProperty.call(draft, baseUrlField);

  return (
    <Box sx={{ p: 2, borderRadius: 3, border: '1px solid rgba(0,0,0,0.04)', bgcolor: 'rgba(0,0,0,0.008)' }}>
      <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '12px', mb: 1.5 }}>
        {label}
      </Typography>
      <Stack spacing={1.5}>
        {apiKeyMeta && (
          <SecretFieldEditor
            field={apiKeyMeta}
            value={draft[apiKeyField] ?? ''}
            hasDraft={Object.prototype.hasOwnProperty.call(draft, apiKeyField)}
            onChange={onChange}
          />
        )}
        {baseUrlMeta && (
          <TextField
            size="small" fullWidth
            label="API Base URL"
            value={baseUrlValue}
            onChange={(e) => onChange(baseUrlField, e.target.value)}
            placeholder="留空复用主模块 API_BASE_URL"
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2.2, fontSize: '12px', fontWeight: 600,
                bgcolor: hasDraftBaseUrl ? 'rgba(26, 115, 232, 0.04)' : 'rgba(255,255,255,0.7)',
              },
            }}
          />
        )}
      </Stack>
    </Box>
  );
}

// ─── Main Panel ──────────────────────────────────────────────

export default function TestcaseGenPanel({ fieldMap, draft, onChange, summary }) {
  const { data: slotData, isLoading } = useSlotConfig();
  const saveSlotMutation = useSaveSlotConfig();

  const [localSlots, setLocalSlots] = useState(null);
  const [, setPresetVersion] = useState(0);

  useEffect(() => { fetchModelPresets().then(() => setPresetVersion((v) => v + 1)); }, []);

  // Sync remote → local on load
  useEffect(() => {
    if (slotData?.slots && !localSlots) {
      setLocalSlots(JSON.parse(JSON.stringify(slotData.slots)));
    }
  }, [slotData, localSlots]);

  const providers = slotData?.providers || [];
  const serverSlots = slotData?.slots || {};

  const isDirty = useMemo(() => {
    if (!localSlots || !serverSlots) return false;
    return JSON.stringify(localSlots) !== JSON.stringify(serverSlots);
  }, [localSlots, serverSlots]);

  const handleSlotChange = useCallback((slotKey, config) => {
    setLocalSlots((prev) => ({ ...prev, [slotKey]: config }));
  }, []);

  const handleSaveSlots = async () => {
    if (!localSlots) return;
    await saveSlotMutation.mutateAsync(localSlots);
    setLocalSlots(null); // Will re-sync from server via query invalidation
  };

  const handleResetSlots = () => {
    if (slotData?.slots) {
      setLocalSlots(JSON.parse(JSON.stringify(slotData.slots)));
    }
  };

  const slots = localSlots || serverSlots;

  return (
    <Stack spacing={2.5}>
      <TestcaseLLMSummary summary={summary} />

      {/* ─── Three Slot Cards ─── */}
      <Box>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <SettingsOutlined sx={{ fontSize: 18, color: 'primary.main' }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: '13px' }}>
            三槽位路由配置 (SLOT ROUTING)
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
            每个槽位可独立选择 Provider 和模型，或跟随全局配置
          </Typography>
        </Stack>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
          {['text', 'vision', 'embedding'].map((key) => (
            <SlotConfigCard
              key={key}
              slotKey={key}
              slotConfig={slots[key] || {}}
              providers={providers}
              onChange={(config) => handleSlotChange(key, config)}
            />
          ))}
        </Box>

        {/* Save bar for slot config */}
        {isDirty && (
          <Paper
            elevation={0}
            sx={{
              mt: 2, p: 2, borderRadius: 3.5,
              bgcolor: alpha('#0f172a', 0.04),
              border: '1px solid',
              borderColor: 'primary.light',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <SaveOutlined sx={{ fontSize: 18, color: 'primary.main' }} />
              <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '12px' }}>
                槽位配置已修改，点击保存即时生效（无需重启）
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1}>
              <Button
                size="small" variant="text"
                onClick={handleResetSlots}
                sx={{ fontSize: '12px', color: 'text.secondary' }}
              >
                放弃
              </Button>
              <Button
                size="small" variant="contained"
                onClick={handleSaveSlots}
                disabled={saveSlotMutation.isPending}
                sx={{
                  borderRadius: 2.5, px: 3, fontWeight: 700, fontSize: '12px',
                  background: (theme) => theme.palette.gradients?.primary || '#1a73e8',
                  '&:hover': { background: (theme) => theme.palette.gradients?.primaryHover || '#1557b0' },
                }}
              >
                {saveSlotMutation.isPending ? '保存中...' : '保存槽位配置'}
              </Button>
            </Stack>
          </Paper>
        )}
      </Box>

      {/* ─── Credential Section ─── */}
      <Box>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
          <VisibilityOffOutlined sx={{ fontSize: 18, color: 'text.secondary' }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: '13px' }}>
            凭证配置 (Credentials)
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          独立槽位的 API Key 和端点通过 .env 配置，修改后需点击页面底部「应用并同步」保存。
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
          <CredentialPair
            label="文本槽位凭证"
            apiKeyField="TC_TEXT_API_KEY"
            baseUrlField="TC_TEXT_API_BASE_URL"
            fieldMap={fieldMap} draft={draft} onChange={onChange}
          />
          <CredentialPair
            label="视觉槽位凭证"
            apiKeyField="TC_VISION_API_KEY"
            baseUrlField="TC_VISION_API_BASE_URL"
            fieldMap={fieldMap} draft={draft} onChange={onChange}
          />
          <CredentialPair
            label="嵌入槽位凭证"
            apiKeyField="TC_EMBEDDING_API_KEY"
            baseUrlField="TC_EMBEDDING_API_BASE_URL"
            fieldMap={fieldMap} draft={draft} onChange={onChange}
          />
        </Box>
      </Box>
    </Stack>
  );
}
