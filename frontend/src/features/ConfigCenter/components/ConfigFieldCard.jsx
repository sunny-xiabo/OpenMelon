import { Box, Button, Chip, Stack, Switch, TextField, Typography, Select, MenuItem, InputAdornment, IconButton, alpha } from '@mui/material';
import LockOutlined from '@mui/icons-material/LockOutlined';
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import CheckOutlined from '@mui/icons-material/CheckOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import LanguageOutlined from '@mui/icons-material/LanguageOutlined';
import SettingsInputComponentOutlined from '@mui/icons-material/SettingsInputComponentOutlined';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import { useState } from 'react';

function getFieldIcon(key, sensitive) {
  if (sensitive) return <ShieldOutlined sx={{ fontSize: 16 }} />;
  if (key.includes('URL') || key.includes('BASE')) return <LanguageOutlined sx={{ fontSize: 16 }} />;
  return <SettingsInputComponentOutlined sx={{ fontSize: 16 }} />;
}

function getFieldTone(key, sensitive) {
  if (sensitive) return { light: '#fff7ed', main: '#f97316' }; // Orange
  if (key.includes('URL') || key.includes('BASE')) return { light: '#f0f9ff', main: '#0ea5e9' }; // Sky
  return { light: '#f5f3ff', main: '#8b5cf6' }; // Violet
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

  return (
    <Box
      className="magnetic-card"
      sx={{
        position: 'relative',
        borderRadius: 4,
        p: 2.5,
        bgcolor: 'rgba(255, 255, 255, 0.6)',
        backdropFilter: 'blur(20px)',
        border: '1px solid',
        borderColor: hasDraft ? 'primary.main' : 'rgba(255, 255, 255, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        height: '100%',
        transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        overflow: 'hidden',
        boxShadow: hasDraft 
          ? `0 0 20px ${alpha('#3b82f6', 0.15)}, inset 0 0 0 1px ${alpha('#3b82f6', 0.2)}`
          : '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
        '&:hover': {
          transform: 'translateY(-5px) scale(1.01)',
          bgcolor: 'rgba(255, 255, 255, 0.85)',
          borderColor: hasDraft ? 'primary.main' : alpha(tone.main, 0.3),
          boxShadow: `0 20px 25px -5px ${alpha(tone.main, 0.1)}, 0 10px 10px -5px ${alpha(tone.main, 0.04)}`,
          '& .icon-bg': { transform: 'scale(1.1) rotate(5deg)', bgcolor: alpha(tone.main, 0.15) }
        }
      }}
    >
      <Box sx={{ 
        position: 'absolute', top: -40, right: -40, width: 100, height: 100, 
        background: `radial-gradient(circle, ${alpha(tone.main, 0.1)} 0%, transparent 70%)`,
        zIndex: 0
      }} />

      <Stack spacing={1.5} sx={{ position: 'relative', zIndex: 1, flex: 1 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box className="icon-bg" sx={{ 
            width: 32, height: 32, borderRadius: '10px', 
            bgcolor: alpha(tone.main, 0.08), color: tone.main,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.3s ease'
          }}>
            {getFieldIcon(field.key, field.sensitive)}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.primary', letterSpacing: -0.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {field.key}
            </Typography>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Chip 
                label={field.apply_mode === 'hot' ? '热更新' : '需重启'} 
                size="small" 
                sx={{ 
                  height: 16, fontSize: '0.65rem', fontWeight: 900, 
                  bgcolor: field.apply_mode === 'hot' ? alpha('#0ea5e9', 0.1) : alpha('#f59e0b', 0.1),
                  color: field.apply_mode === 'hot' ? '#0284c7' : '#d97706',
                  border: 'none'
                }} 
              />
              {field.source === 'env' && <Typography variant="caption" sx={{ color: 'success.main', fontSize: '0.65rem', fontWeight: 700, ml: 0.5 }}>已生效</Typography>}
            </Stack>
          </Box>
        </Stack>
        
        <Typography variant="caption" color="text.secondary" sx={{ 
          lineHeight: 1.5, 
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden', height: 36
        }}>
          {field.description || '暂无该配置项的详细说明。'}
        </Typography>
      </Stack>

      <Box sx={{ position: 'relative', zIndex: 1, mt: 'auto' }}>
        {field.sensitive ? (
          editingSecret ? (
            <Stack direction="row" spacing={1}>
              <TextField
                size="small" fullWidth autoFocus placeholder="输入新配置值..."
                value={secretValue} type="password"
                onChange={(e) => setSecretValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSecretSave()}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.5 } }}
              />
              <IconButton size="small" color="primary" onClick={handleSecretSave} sx={{ bgcolor: alpha('#3b82f6', 0.1) }}>
                <CheckOutlined fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={() => setEditingSecret(false)}>
                <CloseOutlined fontSize="small" />
              </IconButton>
            </Stack>
          ) : (
            <Stack direction="row" spacing={1} alignItems="center">
              <Box sx={{ 
                flex: 1, height: 40, borderRadius: 2.5, px: 1.5, 
                bgcolor: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.05)',
                display: 'flex', alignItems: 'center', gap: 1
              }}>
                <VisibilityOffOutlined sx={{ fontSize: 16, color: 'text.disabled' }} />
                <Typography variant="body2" color="text.disabled" sx={{ letterSpacing: 2, fontWeight: 700 }}>
                  {hasDraft ? '待保存' : (field.configured ? '已配置' : '未设置')}
                </Typography>
              </Box>
              {field.editable && (
                <IconButton size="small" onClick={() => setEditingSecret(true)} sx={{ bgcolor: alpha(tone.main, 0.1), color: tone.main }}>
                  <EditOutlined fontSize="small" />
                </IconButton>
              )}
            </Stack>
          )
        ) : field.value_type === 'bool' ? (
          <Box sx={{ 
            height: 40, borderRadius: 2.5, px: 1.5, 
            bgcolor: alpha(value === 'true' ? '#10b981' : '#64748b', 0.05),
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: value === 'true' ? '#059669' : '#475569' }}>
              {value === 'true' ? '已开启' : '已关闭'}
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
            size="small" fullWidth disabled={!field.editable} value={value}
            type={field.value_type === 'int' || field.value_type === 'float' ? 'number' : 'text'}
            placeholder={field.example_value || field.default_value || '输入配置值...'}
            onChange={(event) => onChange(field.key, event.target.value)}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.5, bgcolor: 'rgba(255,255,255,0.3)' } }}
          />
        )}
      </Box>
    </Box>
  );
}
