import React from 'react';
import { Stack, Typography, Box, Button, TextField, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { ContentPasteOutlined } from '@mui/icons-material';
import { OUTLINED_BLOCK_SX, SETUP_STEPS_EXAMPLE, CLEANUP_STEPS_EXAMPLE } from './constants';

export default function SetupStepsConfig({
  setupWizard, setSetupWizard, applyLoginSetupWizard,
  cleanupWizard, setCleanupWizard, applyCleanupWizard,
  setupStepsText, setSetupStepsText,
  cleanupStepsText, setCleanupStepsText,
}) {
  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 1.5 }}>
        <Box sx={OUTLINED_BLOCK_SX}>
          <Stack spacing={1.25}>
            <Typography variant="body2" fontWeight={800}>登录前置模板</Typography>
            <TextField size="small" label="登录接口 Path" value={setupWizard.path} onChange={(event) => setSetupWizard((current) => ({ ...current, path: event.target.value }))} />
            <TextField size="small" label="Token JSON 路径" value={setupWizard.tokenPath} onChange={(event) => setSetupWizard((current) => ({ ...current, tokenPath: event.target.value }))} />
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              <TextField size="small" label="用户名变量" value={setupWizard.usernameVariable} onChange={(event) => setSetupWizard((current) => ({ ...current, usernameVariable: event.target.value }))} />
              <TextField size="small" label="密码变量" value={setupWizard.passwordVariable} onChange={(event) => setSetupWizard((current) => ({ ...current, passwordVariable: event.target.value }))} />
            </Box>
            <Button size="small" variant="contained" onClick={applyLoginSetupWizard}>生成登录前置</Button>
          </Stack>
        </Box>
        <Box sx={OUTLINED_BLOCK_SX}>
          <Stack spacing={1.25}>
            <Typography variant="body2" fontWeight={800}>清理步骤模板</Typography>
            <TextField size="small" label="步骤名称" value={cleanupWizard.name} onChange={(event) => setCleanupWizard((current) => ({ ...current, name: event.target.value }))} />
            <Box sx={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 1 }}>
              <FormControl size="small">
                <InputLabel>方法</InputLabel>
                <Select
                  label="方法"
                  value={cleanupWizard.method}
                  onChange={(event) => setCleanupWizard((current) => ({ ...current, method: event.target.value }))}
                >
                  {['DELETE', 'POST', 'PATCH', 'PUT'].map((method) => <MenuItem key={method} value={method}>{method}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField size="small" label="清理 Path" value={cleanupWizard.path} onChange={(event) => setCleanupWizard((current) => ({ ...current, path: event.target.value }))} />
            </Box>
            <Button size="small" variant="contained" onClick={applyCleanupWizard}>生成清理步骤</Button>
          </Stack>
        </Box>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        <Box>
          <Typography variant="body2" fontWeight={850} sx={{ color: 'text.primary', mb: 0.5 }}>前置步骤 JSON</Typography>
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
              <Typography variant="caption" sx={{ ml: 1.5, fontWeight: 800, color: '#94a3b8', fontFamily: 'monospace', fontSize: '10px' }}>terminal - setup_steps.json</Typography>
            </Box>
            <TextField
              fullWidth
              multiline
              minRows={10}
              value={setupStepsText}
              onChange={e => setSetupStepsText(e.target.value)}
              placeholder={SETUP_STEPS_EXAMPLE}
              sx={{
                '& .MuiInputBase-root': {
                  borderRadius: 0,
                  bgcolor: '#090d16',
                  color: '#34d399',
                  fontFamily: `'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace`,
                  fontSize: '12.5px',
                  p: 2,
                  boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.65)',
                  '& fieldset': { border: 'none' },
                  '&:hover fieldset': { border: 'none' },
                  '&.Mui-focused fieldset': { border: 'none' },
                },
                '& .MuiInputBase-input': {
                  color: '#34d399',
                  fontFamily: `'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace`,
                  lineHeight: 1.6,
                }
              }}
            />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 0.5, mt: 0.5 }}>
            用于登录、初始化数据、变量提取。
          </Typography>
        </Box>
        <Box>
          <Typography variant="body2" fontWeight={850} sx={{ color: 'text.primary', mb: 0.5 }}>清理步骤 JSON</Typography>
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
              <Typography variant="caption" sx={{ ml: 1.5, fontWeight: 800, color: '#94a3b8', fontFamily: 'monospace', fontSize: '10px' }}>terminal - cleanup_steps.json</Typography>
            </Box>
            <TextField
              fullWidth
              multiline
              minRows={7}
              value={cleanupStepsText}
              onChange={e => setCleanupStepsText(e.target.value)}
              placeholder={CLEANUP_STEPS_EXAMPLE}
              sx={{
                '& .MuiInputBase-root': {
                  borderRadius: 0,
                  bgcolor: '#090d16',
                  color: '#22d3ee',
                  fontFamily: `'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace`,
                  fontSize: '12.5px',
                  p: 2,
                  boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.65)',
                  '& fieldset': { border: 'none' },
                  '&:hover fieldset': { border: 'none' },
                  '&.Mui-focused fieldset': { border: 'none' },
                },
                '& .MuiInputBase-input': {
                  color: '#22d3ee',
                  fontFamily: `'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace`,
                  lineHeight: 1.6,
                }
              }}
            />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 0.5, mt: 0.5 }}>
            用于测试后清理数据；主流程失败时仍会尽量执行。
          </Typography>
        </Box>
      </Box>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Button
          size="small"
          variant="text"
          startIcon={<ContentPasteOutlined fontSize="small" />}
          onClick={() => setSetupStepsText(SETUP_STEPS_EXAMPLE)}
        >
          填入前置步骤示例
        </Button>
        <Button
          size="small"
          variant="text"
          startIcon={<ContentPasteOutlined fontSize="small" />}
          onClick={() => setCleanupStepsText(CLEANUP_STEPS_EXAMPLE)}
        >
          填入清理步骤示例
        </Button>
      </Stack>
    </Stack>
  );
}
