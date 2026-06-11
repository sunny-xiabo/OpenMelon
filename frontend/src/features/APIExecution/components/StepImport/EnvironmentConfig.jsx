import React from 'react';
import { Stack, Typography, Box, Button, TextField, FormControl, InputLabel, Select, MenuItem, Alert, Chip, Divider } from '@mui/material';
import { ContentPasteOutlined } from '@mui/icons-material';
import { NEW_PROJECT_VALUE, NEW_ENVIRONMENT_VALUE } from '../../constants';
import { ENVIRONMENT_VARIABLES_EXAMPLE } from './constants';

export default function EnvironmentConfig({
  projects, selectedProjectId, applyProjectValues, loadProjectSpec,
  environments, selectedEnvironmentId, applyEnvironmentValues,
  projectAssets, activeInterfaceCount, latestDiff,
  baseUrl, setBaseUrl,
  environmentVariablesText, setEnvironmentVariablesText,
  showSnackbar,
}) {
  return (
    <Stack spacing={2}>
      <Typography variant="subtitle1" fontWeight={800}>项目环境</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: 2, minWidth: 0 }}>
        <FormControl size="small" sx={{ minWidth: 0 }}>
          <InputLabel>选择项目</InputLabel>
          <Select
            label="选择项目"
            value={selectedProjectId || ''}
            displayEmpty
            sx={{ minWidth: 0, '& .MuiSelect-select': { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }}
            onChange={(event) => {
              const projectId = event.target.value;
              if (projectId === NEW_PROJECT_VALUE) {
                showSnackbar('请前往"设置"页面创建新项目', 'info');
                return;
              }
              const project = projects.find((item) => item.project_id === projectId);
              if (project) {
                applyProjectValues(project);
                loadProjectSpec(project);
              }
            }}
          >
            <MenuItem value="" disabled>请选择项目</MenuItem>
            <MenuItem value={NEW_PROJECT_VALUE}>新建项目...</MenuItem>
            {projects.map((project) => (
              <MenuItem key={project.project_id} value={project.project_id}>{project.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" disabled={!selectedProjectId} sx={{ minWidth: 0 }}>
          <InputLabel>选择环境</InputLabel>
          <Select
            label="选择环境"
            value={selectedEnvironmentId || ''}
            displayEmpty
            sx={{ minWidth: 0, '& .MuiSelect-select': { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }}
            onChange={(event) => {
              const environmentId = event.target.value;
              if (environmentId === NEW_ENVIRONMENT_VALUE) {
                showSnackbar('请前往"设置"页面创建新环境', 'info');
                return;
              }
              const environment = environments.find((item) => item.environment_id === environmentId);
              if (environment) applyEnvironmentValues(environment);
            }}
          >
            <MenuItem value="" disabled>请选择环境</MenuItem>
            <MenuItem value={NEW_ENVIRONMENT_VALUE}>新建环境...</MenuItem>
            {environments.map((environment) => (
              <MenuItem key={environment.environment_id} value={environment.environment_id}>{environment.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
      {selectedProjectId && (
        <Alert severity={projectAssets?.modules?.length ? 'success' : 'info'}>
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="body2" fontWeight={700}>项目 API 资产台账</Typography>
              <Chip size="small" label={`${projectAssets?.modules?.length || 0} 个模块`} />
              <Chip size="small" label={`${activeInterfaceCount} 个有效接口`} color={activeInterfaceCount ? 'success' : 'default'} variant="outlined" />
              {!!latestDiff.changed && <Chip size="small" label={`${latestDiff.changed} 个变更`} color="warning" />}
              {!!latestDiff.removed && <Chip size="small" label={`${latestDiff.removed} 个移除`} color="error" />}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              已绑定项目会自动加载接口资产；刷新规范后先预览差异，再同步进台账。
            </Typography>
          </Stack>
        </Alert>
      )}
      <Divider />
      <TextField size="small" label="Base URL" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="http://localhost:8000" helperText="执行时会和步骤 path 拼成完整请求地址。" />
      <Typography variant="body2" fontWeight={850} sx={{ color: 'text.primary', mt: 1 }}>环境变量配置</Typography>
      <Box sx={{
        borderRadius: 3.5,
        border: '1px solid #1e293b',
        overflow: 'hidden',
        boxShadow: '0 20px 40px rgba(15,23,42,0.18)',
        mt: 0.5
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
          <Typography variant="caption" sx={{ ml: 1.5, fontWeight: 800, color: '#94a3b8', fontFamily: 'monospace', fontSize: '10px' }}>terminal - env_vars.json</Typography>
        </Box>
        <TextField
          fullWidth
          multiline
          minRows={6}
          value={environmentVariablesText}
          onChange={e => setEnvironmentVariablesText(e.target.value)}
          placeholder={ENVIRONMENT_VARIABLES_EXAMPLE}
          helperText=""
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
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 0.5, fontWeight: 500 }}>
        可在脚本中用 {'{{user_id}}'}、{'{{access_token}}'} 引用；敏感字段在报告中会自动掩码。
      </Typography>
      <Button
        size="small"
        variant="text"
        startIcon={<ContentPasteOutlined fontSize="small" />}
        onClick={() => setEnvironmentVariablesText(ENVIRONMENT_VARIABLES_EXAMPLE)}
        sx={{ alignSelf: 'flex-start', mt: 1, textTransform: 'none', fontWeight: 800, fontSize: '12px', color: '#4f46e5', '&:hover': { bgcolor: 'rgba(79, 70, 229, 0.04)' } }}
      >
        填入环境变量示例
      </Button>
    </Stack>
  );
}
