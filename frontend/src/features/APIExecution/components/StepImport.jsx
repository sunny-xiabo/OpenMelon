import React from 'react';
import { Stack, Typography, Paper, Box, Button, TextField, FormControl, InputLabel, Select, MenuItem, Checkbox } from '@mui/material';
import { CloudUploadOutlined } from '@mui/icons-material';
import { useAPIExecution } from '../context';
import { NEW_PROJECT_VALUE, NEW_ENVIRONMENT_VALUE, ENVIRONMENT_TYPE_OPTIONS } from '../constants';

export default function StepImport() {
  const {
    fileInputRef, setSelectedFile, selectedFile, parseFile, sourceUrl, setSourceUrl, parseUrl,
    projects, selectedProjectId, applyProjectValues, loadEnvironments, setProjectName,
    environments, selectedEnvironmentId, applyEnvironmentValues,
    projectName, environmentName, environmentType, setEnvironmentType,
    environmentTimeoutMs, setEnvironmentTimeoutMs, baseUrl, setBaseUrl,
    environmentVariablesText, setEnvironmentVariablesText,
    allowAiGenerateDsl, setAllowAiGenerateDsl, allowAiExecution, setAllowAiExecution,
    allowAiRepair, setAllowAiRepair, allowScheduledExecution, setAllowScheduledExecution,
    allowOverwriteHistory, setAllowOverwriteHistory, maxAutoRepairs, setMaxAutoRepairs,
    maxReruns, setMaxReruns, maxRequestsPerRun, setMaxRequestsPerRun,
    operationAllowlistText, setOperationAllowlistText, operationBlocklistText, setOperationBlocklistText,
    riskOverridesText, setRiskOverridesText, saveCurrentEnvironment, handleDeleteEnvironment, handleDeleteProject,
    setSelectedProjectId, setSelectedEnvironmentId, setEnvironments, setEnvironmentName, spec
  } = useAPIExecution();

  return (
    <>
    <Stack spacing={3}>
                <Typography variant="h5" fontWeight={800}>步骤 1: 导入 API 规范</Typography>
                
                <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>拖拽上传 OpenAPI/Swagger 文件</Typography>
                  <Box sx={{ border: '2px dashed', borderColor: 'divider', borderRadius: 2, p: 4, textAlign: 'center', mb: 3, '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' }, cursor: 'pointer' }} onClick={() => fileInputRef.current?.click()}>
                    <CloudUploadOutlined color="primary" sx={{ fontSize: 48, mb: 1 }} />
                    <Typography variant="body1">将文件拖拽至此处，或 <Typography component="span" color="primary">浏览文件</Typography></Typography>
                    <input ref={fileInputRef} type="file" accept=".json,.yaml,.yml,.har,.md,.txt,.csv,.html,.htm,.docx,.xlsx,.xls" hidden onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} />
                  </Box>

                  {selectedFile && (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, bgcolor: 'success.light', borderRadius: 2, border: '1px solid', borderColor: 'success.main', mb: 3 }}>
                      <Typography variant="body2" sx={{ color: 'success.contrastText', fontWeight: 700 }}>{selectedFile.name}</Typography>
                      <Button variant="contained" color="success" size="small" onClick={parseFile}>解析文件</Button>
                    </Box>
                  )}

                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>或从 URL 导入</Typography>
                  <Stack direction="row" spacing={1}>
                    <TextField fullWidth size="small" placeholder="https://api.example.com/openapi.json" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} />
                    <Button variant="outlined" onClick={() => parseUrl(false)}>拉取</Button>
                  </Stack>
                </Paper>

                <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>项目与环境设置</Typography>
                  <Stack spacing={2}>
                     <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                       <FormControl size="small">
                         <InputLabel>选择项目</InputLabel>
                         <Select
                           label="选择项目"
                           value={selectedProjectId || NEW_PROJECT_VALUE}
                           onChange={(event) => {
                             const projectId = event.target.value;
                             if (projectId === NEW_PROJECT_VALUE) {
                               setSelectedProjectId('');
                               setSelectedEnvironmentId('');
                               setEnvironments([]);
                               setProjectName(spec?.info?.title || 'OpenMelon');
                               setEnvironmentName('本地测试');
                               setEnvironmentType('test');
                               setEnvironmentVariablesText('{}');
                               setEnvironmentTimeoutMs('30000');
                               setAllowAiExecution(false);
                               setAllowAiRepair(false);
                               setAllowScheduledExecution(false);
                               setAllowAiGenerateDsl(true);
                               setAllowOverwriteHistory(true);
                               setMaxAutoRepairs('0');
                               setMaxReruns('0');
                               setMaxRequestsPerRun('0');
                               setRiskOverridesText('{}');
                               setOperationAllowlistText('');
                               setOperationBlocklistText('');
                               return;
                             }
                             const project = projects.find((item) => item.project_id === projectId);
                             if (project) applyProjectValues(project);
                             loadEnvironments(projectId);
                           }}
                         >
                           <MenuItem value={NEW_PROJECT_VALUE}>新建项目</MenuItem>
                           {projects.map((project) => (
                             <MenuItem key={project.project_id} value={project.project_id}>{project.name}</MenuItem>
                           ))}
                         </Select>
                       </FormControl>
                       <FormControl size="small" disabled={!selectedProjectId}>
                         <InputLabel>选择环境</InputLabel>
                         <Select
                           label="选择环境"
                           value={selectedEnvironmentId || NEW_ENVIRONMENT_VALUE}
                           onChange={(event) => {
                             const environmentId = event.target.value;
                             if (environmentId === NEW_ENVIRONMENT_VALUE) {
                               setSelectedEnvironmentId('');
                               setEnvironmentName('本地测试');
                               setEnvironmentType('test');
                               setEnvironmentVariablesText('{}');
                               setEnvironmentTimeoutMs('30000');
                               return;
                             }
                             const environment = environments.find((item) => item.environment_id === environmentId);
                             if (environment) applyEnvironmentValues(environment);
                           }}
                         >
                           <MenuItem value={NEW_ENVIRONMENT_VALUE}>新建环境</MenuItem>
                           {environments.map((environment) => (
                             <MenuItem key={environment.environment_id} value={environment.environment_id}>{environment.name}</MenuItem>
                           ))}
                         </Select>
                       </FormControl>
                     </Box>
                     <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                       <TextField size="small" label="项目名称" value={projectName} onChange={e => setProjectName(e.target.value)} />
                       <TextField size="small" label="环境名称" value={environmentName} onChange={e => setEnvironmentName(e.target.value)} />
                     </Box>
                     <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                       <FormControl size="small">
                         <InputLabel>环境类型</InputLabel>
                         <Select label="环境类型" value={environmentType} onChange={e => setEnvironmentType(e.target.value)}>
                           {ENVIRONMENT_TYPE_OPTIONS.map((item) => (
                             <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
                           ))}
                         </Select>
                       </FormControl>
                       <TextField size="small" label="超时(ms)" type="number" value={environmentTimeoutMs} onChange={e => setEnvironmentTimeoutMs(e.target.value)} />
                     </Box>
                     <TextField size="small" label="Base URL" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
                     <TextField size="small" label="环境变量 JSON" multiline minRows={3} value={environmentVariablesText} onChange={e => setEnvironmentVariablesText(e.target.value)} sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace' } }} />
                     <Paper elevation={0} sx={{ p: 2, bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                       <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>项目 AI 自动化边界</Typography>
                       <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1 }}>
                         <Box sx={{ display: 'flex', alignItems: 'center' }}>
                           <Checkbox size="small" checked={allowAiGenerateDsl} onChange={e => setAllowAiGenerateDsl(e.target.checked)} />
                           <Typography variant="body2">允许 AI 生成 DSL</Typography>
                         </Box>
                         <Box sx={{ display: 'flex', alignItems: 'center' }}>
                           <Checkbox size="small" checked={allowAiExecution} onChange={e => setAllowAiExecution(e.target.checked)} />
                           <Typography variant="body2">允许 AI 自动执行</Typography>
                         </Box>
                         <Box sx={{ display: 'flex', alignItems: 'center' }}>
                           <Checkbox size="small" checked={allowAiRepair} onChange={e => setAllowAiRepair(e.target.checked)} />
                           <Typography variant="body2">允许 AI 自动修复</Typography>
                         </Box>
                         <Box sx={{ display: 'flex', alignItems: 'center' }}>
                           <Checkbox size="small" checked={allowScheduledExecution} onChange={e => setAllowScheduledExecution(e.target.checked)} />
                           <Typography variant="body2">允许定时执行</Typography>
                         </Box>
                         <Box sx={{ display: 'flex', alignItems: 'center' }}>
                           <Checkbox size="small" checked={allowOverwriteHistory} onChange={e => setAllowOverwriteHistory(e.target.checked)} />
                           <Typography variant="body2">允许覆盖原记录</Typography>
                         </Box>
                       </Box>
                       <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2, mt: 1 }}>
                         <TextField size="small" label="最大自动修复次数" type="number" value={maxAutoRepairs} onChange={e => setMaxAutoRepairs(e.target.value)} helperText="0 表示不限" />
                         <TextField size="small" label="最大重跑次数" type="number" value={maxReruns} onChange={e => setMaxReruns(e.target.value)} helperText="0 表示不限" />
                         <TextField size="small" label="单次最大请求数" type="number" value={maxRequestsPerRun} onChange={e => setMaxRequestsPerRun(e.target.value)} helperText="0 表示不限" />
                       </Box>
                       <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mt: 1 }}>
                         <TextField size="small" label="接口白名单" multiline minRows={2} value={operationAllowlistText} onChange={e => setOperationAllowlistText(e.target.value)} placeholder={'GET /health\nGET /users'} />
                         <TextField size="small" label="接口黑名单" multiline minRows={2} value={operationBlocklistText} onChange={e => setOperationBlocklistText(e.target.value)} placeholder={'DELETE /users/{id}\nPOST /payments'} />
                       </Box>
                       <TextField
                         size="small"
                         label="接口风险覆盖 JSON"
                         multiline
                         minRows={2}
                         value={riskOverridesText}
                         onChange={e => setRiskOverridesText(e.target.value)}
                         placeholder={'{\n  "DELETE /demo/{id}": "high",\n  "GET /admin/audit": "medium"\n}'}
                         sx={{ mt: 2, width: '100%', '& .MuiInputBase-input': { fontFamily: 'monospace' } }}
                       />
                     </Paper>
                     <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                       <Button variant="outlined" onClick={saveCurrentEnvironment}>保存环境配置</Button>
                       <Button variant="outlined" color="error" disabled={!selectedEnvironmentId} onClick={handleDeleteEnvironment}>删除当前环境</Button>
                       <Button variant="text" color="error" disabled={!selectedProjectId} onClick={handleDeleteProject}>删除当前项目</Button>
                     </Stack>
                  </Stack>
                </Paper>
              </Stack>
  </>
  );
}
