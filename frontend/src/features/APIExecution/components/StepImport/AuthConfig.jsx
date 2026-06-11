import React from 'react';
import { Stack, Typography, Box, Button, TextField, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { ContentPasteOutlined } from '@mui/icons-material';
import { AUTH_TYPE_OPTIONS, OUTLINED_BLOCK_SX, AUTH_CONFIG_EXAMPLE } from './constants';

export default function AuthConfig({
  authWizard, setAuthWizard, applyAuthWizard,
  authConfigText, setAuthConfigText,
}) {
  return (
    <Stack spacing={2}>
      <Box sx={OUTLINED_BLOCK_SX}>
        <Stack spacing={1.25}>
          <Typography variant="body2" fontWeight={800}>认证向导</Typography>
          <FormControl size="small">
            <InputLabel>认证方式</InputLabel>
            <Select
              label="认证方式"
              value={authWizard.type}
              onChange={(event) => setAuthWizard((current) => ({ ...current, type: event.target.value }))}
            >
              {AUTH_TYPE_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {authWizard.type === 'bearer' && (
            <>
              <TextField size="small" label="Token 变量名" value={authWizard.tokenVariable} onChange={(event) => setAuthWizard((current) => ({ ...current, tokenVariable: event.target.value }))} />
              <TextField size="small" label="Header 名称" value={authWizard.headerName} onChange={(event) => setAuthWizard((current) => ({ ...current, headerName: event.target.value }))} />
            </>
          )}
          {authWizard.type.startsWith('api_key') && (
            <>
              <TextField size="small" label="Key 名称" value={authWizard.apiKeyName} onChange={(event) => setAuthWizard((current) => ({ ...current, apiKeyName: event.target.value }))} />
              <TextField size="small" label="值变量名" value={authWizard.apiKeyVariable} onChange={(event) => setAuthWizard((current) => ({ ...current, apiKeyVariable: event.target.value }))} />
            </>
          )}
          {authWizard.type === 'basic' && (
            <TextField size="small" label="Basic 编码变量名" value={authWizard.basicVariable} onChange={(event) => setAuthWizard((current) => ({ ...current, basicVariable: event.target.value }))} />
          )}
          <Button size="small" variant="contained" onClick={applyAuthWizard}>应用认证配置</Button>
        </Stack>
      </Box>
      <Box>
        <Typography variant="body2" fontWeight={850} sx={{ color: 'text.primary', mb: 0.5 }}>认证配置 JSON</Typography>
        <Box sx={{
          borderRadius: 3.5,
          border: '1px solid #1e293b',
          overflow: 'hidden',
          boxShadow: '0 20px 40px rgba(15,23,42,0.18)',
        }}>
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 1.25,
            bgcolor: '#1e293b',
            borderBottom: '1px solid #0f172a',
          }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#ef4444', opacity: 0.95 }} />
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#f59e0b', opacity: 0.95 }} />
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#10b981', opacity: 0.95 }} />
            <Typography variant="caption" sx={{ ml: 1.5, fontWeight: 800, color: '#94a3b8', fontFamily: 'monospace', fontSize: '10px' }}>terminal - auth_config.json</Typography>
          </Box>
          <TextField
            fullWidth
            multiline
            minRows={10}
            value={authConfigText}
            onChange={e => setAuthConfigText(e.target.value)}
            placeholder={AUTH_CONFIG_EXAMPLE}
            sx={{
              '& .MuiInputBase-root': {
                borderRadius: 0,
                bgcolor: '#090d16',
                color: '#fbbf24',
                fontFamily: `'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace`,
                fontSize: '12.5px',
                p: 2,
                boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.65)',
                '& fieldset': { border: 'none' },
                '&:hover fieldset': { border: 'none' },
                '&.Mui-focused fieldset': { border: 'none' },
              },
              '& .MuiInputBase-input': {
                color: '#fbbf24',
                fontFamily: `'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace`,
                lineHeight: 1.6,
              }
            }}
          />
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 0.5, mt: 0.5 }}>
          支持 none / bearer / api_key / basic。
        </Typography>
      </Box>
      <Button
        size="small"
        variant="text"
        startIcon={<ContentPasteOutlined fontSize="small" />}
        onClick={() => setAuthConfigText(AUTH_CONFIG_EXAMPLE)}
      >
        填入认证示例
      </Button>
    </Stack>
  );
}
