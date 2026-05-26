import { Box, Button, Chip, Stack, Switch, TextField, Typography, Select, MenuItem, InputAdornment, IconButton, alpha, Tooltip } from '@mui/material';
import LockOutlined from '@mui/icons-material/LockOutlined';
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import CheckOutlined from '@mui/icons-material/CheckOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import LanguageOutlined from '@mui/icons-material/LanguageOutlined';
import SettingsInputComponentOutlined from '@mui/icons-material/SettingsInputComponentOutlined';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import FlashOnOutlined from '@mui/icons-material/FlashOnOutlined';
import RestartAltOutlined from '@mui/icons-material/RestartAltOutlined';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import { useState } from 'react';

function getFieldIcon(key, sensitive) {
  if (sensitive) return <ShieldOutlined sx={{ fontSize: 15 }} />;
  if (key.includes('URL') || key.includes('BASE')) return <LanguageOutlined sx={{ fontSize: 15 }} />;
  return <SettingsInputComponentOutlined sx={{ fontSize: 15 }} />;
}

function getFieldTone(key, sensitive) {
  if (sensitive) return { light: '#fff7ed', main: '#f97316', glow: 'rgba(249, 115, 22, 0.15)' }; // Orange
  if (key.includes('URL') || key.includes('BASE')) return { light: '#f0f9ff', main: '#0ea5e9', glow: 'rgba(14, 165, 233, 0.15)' }; // Sky
  return { light: '#f5f3ff', main: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.15)' }; // Violet
}

export default function ConfigFieldCard({ field, value, hasDraft, onChange }) {
  const [editingSecret, setEditingSecret] = useState(false);
  const [secretValue, setSecretValue] = useState('');
  const tone = getFieldTone(field.key, field.sensitive);

  const handleSecretSave = () => {
    onChange(field.key, secretValue);
    setEditingSecret(false);
    setSecretValue('');
  };

  const isHot = field.apply_mode === 'hot';

  return (
    <Box
      className="magnetic-card"
      sx={{
        position: 'relative',
        borderRadius: 4.5,
        p: 3,
        bgcolor: hasDraft ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.55)',
        backdropFilter: 'blur(24px)',
        border: '1px solid',
        borderColor: hasDraft ? 'primary.main' : 'rgba(255, 255, 255, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 2.2,
        height: '100%',
        transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        overflow: 'hidden',
        boxShadow: hasDraft 
          ? `0 12px 32px ${alpha('#1a73e8', 0.14)}, inset 0 1px 0 rgba(255,255,255,0.7)`
          : '0 4px 16px rgba(15, 23, 42, 0.02), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
        '&:hover': {
          transform: 'translateY(-4px)',
          bgcolor: 'rgba(255, 255, 255, 0.85)',
          borderColor: hasDraft ? 'primary.main' : alpha(tone.main, 0.32),
          boxShadow: hasDraft
            ? `0 16px 36px ${alpha('#1a73e8', 0.2)}, inset 0 1px 0 rgba(255,255,255,0.9)`
            : `0 16px 32px ${tone.glow}, inset 0 1px 0 rgba(255,255,255,0.9)`,
          '& .icon-bg': { 
            transform: 'scale(1.1) rotate(4deg)', 
            bgcolor: alpha(tone.main, 0.16) 
          }
        }
      }}
    >
      {/* Decorative gradient corner aura */}
      <Box sx={{ 
        position: 'absolute', top: -35, right: -35, width: 90, height: 90, 
        background: `radial-gradient(circle, ${alpha(tone.main, 0.08)} 0%, transparent 70%)`,
        zIndex: 0,
        pointerEvents: 'none',
      }} />

      <Stack spacing={1.75} sx={{ position: 'relative', zIndex: 1, flex: 1 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
            <Box 
              className="icon-bg" 
              sx={{ 
                width: 34, height: 34, borderRadius: 2.2, 
                bgcolor: alpha(tone.main, 0.08), color: tone.main,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.3s ease',
                flexShrink: 0,
                boxShadow: `0 2px 8px ${alpha(tone.main, 0.1)}`,
              }}
            >
              {getFieldIcon(field.key, field.sensitive)}
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography 
                variant="subtitle2" 
                sx={{ 
                  fontWeight: 900, 
                  color: 'text.primary', 
                  letterSpacing: '-0.01em',
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis', 
                  whiteSpace: 'nowrap',
                  fontSize: '13px',
                }}
              >
                {field.key}
              </Typography>
              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.25 }}>
                <Chip 
                  icon={isHot ? <FlashOnOutlined sx={{ fontSize: '10px !important' }} /> : <RestartAltOutlined sx={{ fontSize: '10px !important' }} />}
                  label={isHot ? '热更新' : '需重启'} 
                  size="small" 
                  sx={{ 
                    height: 16, 
                    fontSize: '9px', 
                    fontWeight: 800, 
                    bgcolor: isHot ? alpha('#10b981', 0.08) : alpha('#f59e0b', 0.08),
                    color: isHot ? '#059669' : '#d97706',
                    border: 'none',
                    '& .MuiChip-label': { px: 0.75 },
                    '& .MuiChip-icon': { color: 'inherit', mr: '-3px !important' },
                  }} 
                />
                {field.source === 'env' && (
                  <Typography variant="caption" sx={{ color: 'success.main', fontSize: '9px', fontWeight: 800, ml: 0.5, bgcolor: alpha('#10b981', 0.08), px: 0.6, py: 0.1, borderRadius: 0.5 }}>
                    已生效
                  </Typography>
                )}
              </Stack>
            </Box>
          </Stack>

          {/* Gold Pulse draft modified Badge */}
          {hasDraft && (
            <Chip
              label="待应用"
              size="small"
              sx={{
                height: 18,
                fontSize: '9px',
                fontWeight: 900,
                bgcolor: 'rgba(255, 179, 0, 0.15)',
                color: '#b7791f',
                boxShadow: '0 0 8px rgba(255, 179, 0, 0.15)',
                animation: 'pulse 2s infinite ease-in-out',
                borderRadius: 1.25,
                border: 'none',
              }}
            />
          )}
        </Stack>
        
        <Tooltip title={field.description || '暂无该配置项的详细说明。'} arrow enterDelay={300}>
          <Typography 
            variant="caption" 
            color="text.secondary" 
            style={{ WebkitBoxOrient: 'vertical' }}
            sx={{ 
              lineHeight: 1.45, 
              display: '-webkit-box', 
              WebkitLineClamp: 2, 
              overflow: 'hidden', 
              textOverflow: 'ellipsis',
              height: 34,
              fontWeight: 500,
              fontSize: '11px',
              cursor: 'help'
            }}
          >
            {field.description || '暂无该配置项的详细说明。'}
          </Typography>
        </Tooltip>
      </Stack>

      {/* Input / Control Actions */}
      <Box sx={{ position: 'relative', zIndex: 1, mt: 'auto' }}>
        {field.sensitive ? (
          editingSecret ? (
            <Stack direction="row" spacing={1}>
              <TextField
                size="small" 
                fullWidth 
                autoFocus 
                placeholder="输入新配置值..."
                value={secretValue} 
                type="password"
                onChange={(e) => setSecretValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSecretSave()}
                sx={{ 
                  '& .MuiOutlinedInput-root': { 
                    borderRadius: 2.5,
                    fontSize: '12px',
                    bgcolor: 'rgba(255,255,255,0.6)',
                  } 
                }}
              />
              <IconButton 
                size="small" 
                color="primary" 
                onClick={handleSecretSave} 
                sx={{ 
                  bgcolor: alpha('#1a73e8', 0.08), 
                  color: 'primary.main',
                  borderRadius: 2.2,
                  width: 36,
                  height: 36,
                }}
              >
                <CheckOutlined fontSize="small" />
              </IconButton>
              <IconButton 
                size="small" 
                onClick={() => setEditingSecret(false)}
                sx={{ 
                  borderRadius: 2.2,
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
                  borderRadius: 2.5, 
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
                  {hasDraft ? '待保存 · ••••••••' : (field.configured ? '已配置 · ••••••••' : '未设置')}
                </Typography>
              </Box>
              {field.editable && (
                <IconButton 
                  size="small" 
                  onClick={() => setEditingSecret(true)} 
                  sx={{ 
                    bgcolor: alpha(tone.main, 0.08), 
                    color: tone.main,
                    borderRadius: 2.2,
                    width: 38,
                    height: 38,
                    '&:hover': {
                      bgcolor: alpha(tone.main, 0.16)
                    }
                  }}
                >
                  <EditOutlined sx={{ fontSize: 16 }} />
                </IconButton>
              )}
            </Stack>
          )
        ) : field.value_type === 'bool' ? (
          <Box 
            sx={{ 
              height: 38, 
              borderRadius: 2.5, 
              px: 1.5, 
              bgcolor: alpha(value === 'true' ? '#10b981' : '#64748b', 0.04),
              border: '1px solid',
              borderColor: alpha(value === 'true' ? '#10b981' : '#64748b', 0.08),
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              transition: 'all 0.2s',
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 800, color: value === 'true' ? '#059669' : '#475569', fontSize: '11px' }}>
              {value === 'true' ? '已开启 (ON)' : '已关闭 (OFF)'}
            </Typography>
            <Switch
              size="small"
              checked={String(value).toLowerCase() === 'true'}
              disabled={!field.editable}
              onChange={(event) => onChange(field.key, event.target.checked ? 'true' : 'false')}
            />
          </Box>
        ) : (
          <TextField
            size="small" 
            fullWidth 
            disabled={!field.editable} 
            value={value}
            type={field.value_type === 'int' || field.value_type === 'float' ? 'number' : 'text'}
            placeholder={field.example_value || field.default_value || '输入配置值...'}
            onChange={(event) => onChange(field.key, event.target.value)}
            sx={{ 
              '& .MuiOutlinedInput-root': { 
                borderRadius: 2.5, 
                bgcolor: 'rgba(255,255,255,0.4)',
                fontSize: '12px',
                fontWeight: 600,
                border: '1px solid rgba(0,0,0,0.03)',
                '&:hover': {
                  bgcolor: 'rgba(255,255,255,0.7)',
                }
              } 
            }}
          />
        )}
      </Box>
    </Box>
  );
}
