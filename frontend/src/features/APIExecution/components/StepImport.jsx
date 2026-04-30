import React from 'react';
import { Stack, Typography, Paper, Box, Button, TextField, FormControl, InputLabel, Select, MenuItem, Checkbox, Alert } from '@mui/material';
import { CloudUploadOutlined, ContentPasteOutlined } from '@mui/icons-material';
import { useAPIExecution } from '../context';
import { NEW_PROJECT_VALUE, NEW_ENVIRONMENT_VALUE, ENVIRONMENT_TYPE_OPTIONS } from '../constants';
import StageHeader from './StageHeader';

const ENVIRONMENT_VARIABLES_EXAMPLE = JSON.stringify({
  user_id: '10001',
  tenant_id: 'demo-tenant',
  access_token: 'paste-token-here',
}, null, 2);

const RISK_OVERRIDES_EXAMPLE = JSON.stringify({
  'DELETE /users/{id}': 'high',
  'POST /payments': 'high',
  'GET /admin/audit': 'medium',
}, null, 2);

const AI_BOUNDARY_OPTIONS = [
  {
    checkedKey: 'allowAiGenerateDsl',
    label: '允许 AI 生成 DSL',
    description: '允许根据 OpenAPI 自动生成测试脚本草稿。',
  },
  {
    checkedKey: 'allowAiExecution',
    label: '允许 AI 自动执行',
    description: '开启后，AI/自动化任务可以直接提交执行。生产环境建议关闭。',
  },
  {
    checkedKey: 'allowAiRepair',
    label: '允许 AI 自动修复',
    description: '允许根据失败结果生成修复补丁或受控重跑。',
  },
  {
    checkedKey: 'allowScheduledExecution',
    label: '允许定时执行',
    description: '允许该项目被定时任务触发执行。',
  },
  {
    checkedKey: 'allowOverwriteHistory',
    label: '允许覆盖原记录',
    description: '重跑失败步骤时可合并更新原执行记录。',
  },
];

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
                <StageHeader title="步骤 1: 导入 API 规范" />
                
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
                     <TextField size="small" label="Base URL" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="http://localhost:8000" helperText="执行时会和步骤 path 拼成完整请求地址。" />
                     <TextField
                       size="small"
                       label="环境变量 JSON"
                       multiline
                       minRows={5}
                       value={environmentVariablesText}
                       onChange={e => setEnvironmentVariablesText(e.target.value)}
                       placeholder={ENVIRONMENT_VARIABLES_EXAMPLE}
                       helperText="可在脚本中用 {{user_id}}、{{access_token}} 这类变量引用。敏感字段在报告中会自动掩码。"
                       sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace' } }}
                     />
                     <Button
                       size="small"
                       variant="text"
                       startIcon={<ContentPasteOutlined fontSize="small" />}
                       onClick={() => setEnvironmentVariablesText(ENVIRONMENT_VARIABLES_EXAMPLE)}
                       sx={{ alignSelf: 'flex-start' }}
                     >
                       填入环境变量示例
                     </Button>
                     <Paper elevation={0} sx={{ p: 2, bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                       <Stack direction="row" spacing={1.5} alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                         <Box>
                           <Typography variant="subtitle2" fontWeight={700}>项目 AI 自动化边界</Typography>
                           <Typography variant="caption" color="text.secondary">
                             这里控制 AI 能做到哪一步：只生成、可执行、可修复、可定时。生产或高风险接口建议收紧。
                           </Typography>
                         </Box>
                       </Stack>
                       <Alert severity="info" sx={{ mb: 2 }}>
                         推荐默认：允许生成 DSL、允许修复；自动执行和定时执行按项目风险再开启。
                       </Alert>
                       <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 1.25 }}>
                         {AI_BOUNDARY_OPTIONS.map((item) => {
                           const valueMap = {
                             allowAiGenerateDsl,
                             allowAiExecution,
                             allowAiRepair,
                             allowScheduledExecution,
                             allowOverwriteHistory,
                           };
                           const setterMap = {
                             allowAiGenerateDsl: setAllowAiGenerateDsl,
                             allowAiExecution: setAllowAiExecution,
                             allowAiRepair: setAllowAiRepair,
                             allowScheduledExecution: setAllowScheduledExecution,
                             allowOverwriteHistory: setAllowOverwriteHistory,
                           };
                           return (
                             <Box key={item.checkedKey} sx={{ display: 'flex', alignItems: 'flex-start', p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, bgcolor: '#fff' }}>
                               <Checkbox size="small" checked={Boolean(valueMap[item.checkedKey])} onChange={e => setterMap[item.checkedKey](e.target.checked)} sx={{ mt: -0.5 }} />
                               <Box>
                                 <Typography variant="body2" fontWeight={700}>{item.label}</Typography>
                                 <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>{item.description}</Typography>
                               </Box>
                             </Box>
                           );
                         })}
                       </Box>
                       <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2, mt: 1 }}>
                         <TextField size="small" label="最大自动修复次数" type="number" value={maxAutoRepairs} onChange={e => setMaxAutoRepairs(e.target.value)} helperText="建议 1-3；0 表示不限。" />
                         <TextField size="small" label="最大重跑次数" type="number" value={maxReruns} onChange={e => setMaxReruns(e.target.value)} helperText="建议 1-2；0 表示不限。" />
                         <TextField size="small" label="单次最大请求数" type="number" value={maxRequestsPerRun} onChange={e => setMaxRequestsPerRun(e.target.value)} helperText="限制批量执行规模，0 表示不限。" />
                       </Box>
                       <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mt: 1 }}>
                         <TextField size="small" label="接口白名单" multiline minRows={2} value={operationAllowlistText} onChange={e => setOperationAllowlistText(e.target.value)} placeholder={'GET /health\nGET /users'} helperText="填写后只允许这些接口被 AI 自动化覆盖，每行一个 METHOD path。" />
                         <TextField size="small" label="接口黑名单" multiline minRows={2} value={operationBlocklistText} onChange={e => setOperationBlocklistText(e.target.value)} placeholder={'DELETE /users/{id}\nPOST /payments'} helperText="这些接口会被策略拦截，每行一个 METHOD path。" />
                       </Box>
                       <TextField
                         size="small"
                         label="接口风险覆盖 JSON"
                         multiline
                         minRows={4}
                         value={riskOverridesText}
                         onChange={e => setRiskOverridesText(e.target.value)}
                         placeholder={RISK_OVERRIDES_EXAMPLE}
                         helperText="用于人工指定接口风险等级：low / medium / high / blocked。"
                         sx={{ mt: 2, width: '100%', '& .MuiInputBase-input': { fontFamily: 'monospace' } }}
                       />
                       <Button
                         size="small"
                         variant="text"
                         startIcon={<ContentPasteOutlined fontSize="small" />}
                         onClick={() => setRiskOverridesText(RISK_OVERRIDES_EXAMPLE)}
                         sx={{ mt: 1 }}
                       >
                         填入风险覆盖示例
                       </Button>
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
