import React from 'react';
import { Stack, Box, Typography, Button, TextField, FormControl, InputLabel, Select, MenuItem, Checkbox, Paper, Alert } from '@mui/material';
import { AutoAwesomeOutlined, PlayCircleOutlineOutlined } from '@mui/icons-material';
import { useAPIExecution } from '../context';
import SectionCard from './SectionCard';
import { ASSERTION_TYPES, EXTRACTION_SOURCES } from '../constants';

export default function StepOrchestrate() {
  const {
    dslText, setDslText, enhanceDslWithAi, globalHeadersText, setGlobalHeadersText,
    bearerToken, setBearerToken, parsedScript, runStepId, setRunStepId, assertionStepId,
    setAssertionStepId, assertionType, setAssertionType, assertionExpected, setAssertionExpected,
    insertAssertion, runSelectedStep, runAllSteps, runAllStepsInBackground, loading,
    baseUrl, setBaseUrl, exportPytestScript, exportPostmanCollection, aiPatch, applyAiPatch
  } = useAPIExecution();

  return (
    <>
    <Stack spacing={3}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="h5" fontWeight={800}>步骤 3: 编排与执行</Typography>
                  <Stack direction="row" spacing={2}>
                    <Button variant="outlined" startIcon={<PlayCircleOutlineOutlined />} disabled={!dslText || loading} onClick={runSelectedStep}>
                      单步执行选中步骤
                    </Button>
                    <Button variant="contained" color="success" disabled={!dslText || loading} onClick={runAllSteps}>
                      执行全部步骤
                    </Button>
                    <Button variant="outlined" color="secondary" disabled={!dslText || loading} onClick={runAllStepsInBackground}>
                      后台执行全部
                    </Button>
                  </Stack>
                </Box>
                
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                    <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>添加断言</Typography>
                    <Stack spacing={2}>
                      <FormControl size="small" fullWidth>
                        <InputLabel>目标步骤</InputLabel>
                        <Select value={assertionStepId || parsedScript?.steps?.[0]?.id || ''} onChange={e => setAssertionStepId(e.target.value)}>
                          {(parsedScript?.steps || []).map(step => <MenuItem key={step.id} value={step.id}>{step.method} {step.path}</MenuItem>)}
                        </Select>
                      </FormControl>
                      <FormControl size="small" fullWidth>
                        <InputLabel>断言类型</InputLabel>
                        <Select value={assertionType} onChange={e => setAssertionType(e.target.value)}>
                          {ASSERTION_TYPES.map(item => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
                        </Select>
                      </FormControl>
                      <TextField size="small" label="期望值" value={assertionExpected} onChange={e => setAssertionExpected(e.target.value)} />
                      <Button variant="outlined" onClick={insertAssertion}>插入断言</Button>
                    </Stack>
                  </Paper>

                  <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                     <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>运行参数</Typography>
                     <Stack spacing={2}>
                       <TextField size="small" label="Base URL" placeholder="如 http://localhost:8000" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
                       <FormControl size="small" disabled={!parsedScript}>
                         <InputLabel>单步执行</InputLabel>
                         <Select label="单步执行" value={runStepId || parsedScript?.steps?.[0]?.id || ''} onChange={e => setRunStepId(e.target.value)}>
                           {(parsedScript?.steps || []).map(step => <MenuItem key={step.id} value={step.id}>{step.method} {step.path}</MenuItem>)}
                         </Select>
                       </FormControl>
                       <TextField size="small" label="Bearer Token" type="password" value={bearerToken} onChange={e => setBearerToken(e.target.value)} />
                       <TextField size="small" label="全局请求头 (JSON)" multiline minRows={3} value={globalHeadersText} onChange={e => setGlobalHeadersText(e.target.value)} sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace' } }} />
                     </Stack>
                  </Paper>
                </Box>

                <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="subtitle1" fontWeight={700}>脚本 JSON</Typography>
                    <Stack direction="row" spacing={1}>
                       <Button size="small" variant="contained" color="secondary" disabled={!parsedScript || loading} onClick={enhanceDslWithAi}>AI 补全</Button>
                       <Button size="small" variant="outlined" onClick={exportPytestScript}>导出 Pytest</Button>
                       <Button size="small" variant="outlined" onClick={exportPostmanCollection}>导出 Postman</Button>
                    </Stack>
                  </Box>
                  <TextField fullWidth multiline minRows={8} maxRows={15} value={dslText} onChange={e => setDslText(e.target.value)} sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: 13 } }} />
                </Paper>

                {aiPatch?.patch_operations?.length > 0 && (
                  <Alert severity={aiPatch.automatic_applicable ? 'success' : 'warning'}>
                    <Stack spacing={1}>
                      <Typography variant="body2" fontWeight={700}>{aiPatch.summary}</Typography>
                      {aiPatch.patch_operations.map((operation, index) => (
                        <Typography key={`${operation.step_id}-${operation.field}-${index}`} variant="caption">
                          {operation.step_id} · {operation.field}：{operation.reason}
                        </Typography>
                      ))}
                      <Button size="small" variant="contained" sx={{ alignSelf: 'flex-start' }} onClick={applyAiPatch}>应用补丁到脚本</Button>
                    </Stack>
                  </Alert>
                )}
              </Stack>
  </>
  );
}
