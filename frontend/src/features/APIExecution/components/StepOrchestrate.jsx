import React from 'react';
import { Stack, Box, Typography, Button, TextField, FormControl, InputLabel, Select, MenuItem, Checkbox, Paper, Alert, CircularProgress } from '@mui/material';
import { AutoAwesomeOutlined, ContentCopyOutlined, DataObjectOutlined, FormatAlignLeftOutlined, PlayCircleOutlineOutlined } from '@mui/icons-material';
import CodeMirror from '@uiw/react-codemirror';
import { autocompletion } from '@codemirror/autocomplete';
import { json } from '@codemirror/lang-json';
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { useAPIExecution } from '../context';
import SectionCard from './SectionCard';
import { ASSERTION_TYPES, ASSERTION_TYPES_WITH_PATH, ASSERTION_TYPES_WITHOUT_EXPECTED, EXTRACTION_SOURCES } from '../constants';
import StageHeader from './StageHeader';

const ROOT_FIELDS = ['case_id', 'name', 'target_project', 'environment', 'base_url', 'variables', 'steps'];
const STEP_FIELDS = ['id', 'name', 'method', 'path', 'operation_id', 'headers', 'query', 'path_params', 'body', 'assertions', 'extractions'];
const ASSERTION_FIELDS = ['type', 'expected', 'path', 'value'];
const EXTRACTION_FIELDS = ['name', 'source', 'path'];
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const ASSERTION_TYPE_VALUES = ASSERTION_TYPES.map((item) => item.value);
const EXTRACTION_SOURCE_VALUES = EXTRACTION_SOURCES.map((item) => item.value);

const apiJsonEditorTheme = EditorView.theme({
  '&': {
    backgroundColor: '#ffffff',
    color: '#202124',
  },
  '.cm-content': {
    caretColor: '#1a73e8',
  },
  '.cm-gutters': {
    backgroundColor: '#f8f9fa',
    color: '#9aa0a6',
    borderRight: '1px solid #e8eaed',
  },
  '.cm-activeLine': {
    backgroundColor: '#e8f0fe66',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#e8f0fe',
    color: '#1a73e8',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: '#d2e3fc',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-tooltip': {
    border: '1px solid #e8eaed',
    borderRadius: '6px',
    boxShadow: '0 8px 24px rgba(60,64,67,0.16)',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: '#e8f0fe',
    color: '#202124',
  },
});

const apiJsonHighlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: '#1a73e8', fontWeight: '600' },
  { tag: tags.string, color: '#188038' },
  { tag: tags.number, color: '#b06000' },
  { tag: tags.bool, color: '#9334e6' },
  { tag: tags.null, color: '#5f6368', fontStyle: 'italic' },
  { tag: tags.punctuation, color: '#5f6368' },
]);

const quotedFieldCompletion = (field) => ({ label: field, type: 'property', apply: `${field}": ` });
const quotedValueCompletion = (value) => ({ label: value, type: 'constant', apply: value });

const getDslFieldCompletions = (docBeforeCursor) => {
  if (/"assertions"\s*:\s*\[[\s\S]*$/.test(docBeforeCursor)) return ASSERTION_FIELDS;
  if (/"extractions"\s*:\s*\[[\s\S]*$/.test(docBeforeCursor)) return EXTRACTION_FIELDS;
  if (/"steps"\s*:\s*\[[\s\S]*$/.test(docBeforeCursor)) return STEP_FIELDS;
  return ROOT_FIELDS;
};

const dslCompletionSource = (context) => {
  const line = context.state.doc.lineAt(context.pos);
  const beforeLine = line.text.slice(0, context.pos - line.from);
  const docBeforeCursor = context.state.doc.sliceString(0, context.pos);
  const stringMatch = beforeLine.match(/"([^"]*)$/);
  const keyPrefixMatch = beforeLine.match(/(?:^|[,{]\s*)"([^"]*)$/);
  const valuePrefixMatch = beforeLine.match(/"([^"]+)"\s*:\s*"([^"]*)$/);

  if (valuePrefixMatch) {
    const [, fieldName, prefix] = valuePrefixMatch;
    const valuesByField = {
      method: HTTP_METHODS,
      type: ASSERTION_TYPE_VALUES,
      source: EXTRACTION_SOURCE_VALUES,
    };
    const values = valuesByField[fieldName];
    if (!values) return null;
    return {
      from: context.pos - prefix.length,
      options: values.map(quotedValueCompletion),
    };
  }

  if (keyPrefixMatch || (context.explicit && stringMatch)) {
    const prefix = (keyPrefixMatch || stringMatch)?.[1] || '';
    return {
      from: context.pos - prefix.length,
      options: getDslFieldCompletions(docBeforeCursor).map(quotedFieldCompletion),
    };
  }

  return null;
};

export default function StepOrchestrate() {
  const {
    dslText, setDslText, enhanceDslWithAi, globalHeadersText, setGlobalHeadersText,
    bearerToken, setBearerToken, parsedScript, runStepId, setRunStepId, assertionStepId,
    setAssertionStepId, assertionType, setAssertionType, assertionPath, setAssertionPath,
    assertionExpected, setAssertionExpected,
    insertAssertion, runSelectedStep, runAllSteps, loading,
    baseUrl, setBaseUrl, exportPytestScript, exportPostmanCollection, aiPatch, applyAiPatch,
    backgroundRunStatus, aiEnhancing
  } = useAPIExecution();
  const executionDisabled = loading || ['queued', 'running'].includes(backgroundRunStatus);
  const selectedAssertionType = ASSERTION_TYPES.find((item) => item.value === assertionType);
  const assertionNeedsPath = ASSERTION_TYPES_WITH_PATH.has(assertionType);
  const assertionNeedsExpected = !ASSERTION_TYPES_WITHOUT_EXPECTED.has(assertionType);
  const jsonValidation = React.useMemo(() => {
    if (!dslText.trim()) return { valid: false, message: '暂无脚本' };
    try {
      const parsed = JSON.parse(dslText);
      return { valid: true, message: `${parsed.steps?.length || 0} 个步骤` };
    } catch (error) {
      return { valid: false, message: error.message || 'JSON 格式错误' };
    }
  }, [dslText]);

  const beautifyDslJson = () => {
    try {
      setDslText(JSON.stringify(JSON.parse(dslText), null, 2));
    } catch {
      // Invalid JSON is already surfaced in the editor status.
    }
  };

  const copyDslJson = async () => {
    if (!dslText) return;
    await navigator.clipboard?.writeText(dslText);
  };

  return (
    <>
    <Stack spacing={3}>
                <StageHeader
                  title="步骤 3: 编排与执行"
                  action={(
                    <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                      <Button variant="outlined" startIcon={<PlayCircleOutlineOutlined />} disabled={!dslText || executionDisabled} onClick={runSelectedStep}>
                        单步执行选中步骤
                      </Button>
                      <Button variant="contained" color="success" disabled={!dslText || executionDisabled} onClick={runAllSteps}>
                        执行全部步骤
                      </Button>
                    </Stack>
                  )}
                />
                
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid rgba(255, 255, 255, 0.6)', background: 'rgba(255, 255, 255, 0.4)', backdropFilter: 'blur(10px)', boxShadow: '0 8px 32px rgba(15, 23, 42, 0.04)' }}>
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
                      {assertionNeedsPath && (
                        <TextField
                          size="small"
                          label={assertionType.startsWith('header_') ? 'Header 名称' : 'JSON 路径'}
                          value={assertionPath}
                          onChange={e => setAssertionPath(e.target.value)}
                          placeholder={assertionType.startsWith('header_') ? 'content-type' : '$.data.id'}
                        />
                      )}
                      {assertionNeedsExpected && (
                        <TextField
                          size="small"
                          label="期望值"
                          value={assertionExpected}
                          onChange={e => setAssertionExpected(e.target.value)}
                          placeholder={selectedAssertionType?.placeholder || ''}
                        />
                      )}
                      <Button variant="outlined" onClick={insertAssertion}>插入断言</Button>
                    </Stack>
                  </Paper>

                  <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid rgba(255, 255, 255, 0.6)', background: 'rgba(255, 255, 255, 0.4)', backdropFilter: 'blur(10px)', boxShadow: '0 8px 32px rgba(15, 23, 42, 0.04)' }}>
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

                <Paper sx={{ p: 0, borderRadius: 4, border: '1px solid rgba(255, 255, 255, 0.6)', background: 'rgba(255, 255, 255, 0.4)', backdropFilter: 'blur(10px)', boxShadow: '0 8px 32px rgba(15, 23, 42, 0.04)', overflow: 'hidden' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, py: 1.5, borderBottom: '1px solid rgba(255, 255, 255, 0.6)', bgcolor: 'rgba(255, 255, 255, 0.6)' }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <DataObjectOutlined color="primary" fontSize="small" />
                      <Box>
                        <Typography variant="subtitle1" fontWeight={700}>脚本 JSON</Typography>
                        <Typography variant="caption" color={jsonValidation.valid ? 'success.main' : 'error.main'}>
                          {jsonValidation.valid ? `格式有效 · ${jsonValidation.message}` : jsonValidation.message}
                        </Typography>
                      </Box>
                    </Stack>
                    <Stack direction="row" spacing={1} alignItems="center">
                       <Button size="small" variant="outlined" startIcon={<FormatAlignLeftOutlined />} disabled={!dslText || !jsonValidation.valid} onClick={beautifyDslJson}>
                         一键美化
                       </Button>
                       <Button size="small" variant="outlined" startIcon={<ContentCopyOutlined />} disabled={!dslText} onClick={copyDslJson}>
                         复制
                       </Button>
                       <Button
                         size="small"
                         variant="contained"
                         color="secondary"
                         disabled={!parsedScript || loading}
                         onClick={enhanceDslWithAi}
                         startIcon={aiEnhancing ? <CircularProgress size={14} color="inherit" thickness={5} /> : <AutoAwesomeOutlined fontSize="small" />}
                         sx={{
                           position: 'relative',
                           overflow: 'hidden',
                           boxShadow: aiEnhancing ? '0 0 0 3px rgba(54,81,212,0.16)' : undefined,
                           '& .MuiButton-startIcon': {
                             animation: aiEnhancing ? 'aiSparkSpin 1.2s linear infinite' : 'none',
                           },
                           '&::after': {
                             content: '""',
                             position: 'absolute',
                             inset: 0,
                             transform: aiEnhancing ? 'translateX(100%)' : 'translateX(-120%)',
                             background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.32), transparent)',
                             animation: aiEnhancing ? 'aiSweep 1.15s ease-in-out infinite' : 'none',
                           },
                           '@keyframes aiSweep': {
                             '0%': { transform: 'translateX(-120%)' },
                             '100%': { transform: 'translateX(120%)' },
                           },
                           '@keyframes aiSparkSpin': {
                             '0%': { transform: 'rotate(0deg)' },
                             '100%': { transform: 'rotate(360deg)' },
                           },
                         }}
                       >
                         {aiEnhancing ? 'AI 补全中...' : 'AI 补全'}
                       </Button>
                       <Button size="small" variant="outlined" onClick={exportPytestScript}>导出 Pytest</Button>
                       <Button size="small" variant="outlined" onClick={exportPostmanCollection}>导出 Postman</Button>
                    </Stack>
                  </Box>
                  <Box sx={{ bgcolor: 'rgba(255, 255, 255, 0.6)', px: 2, py: 1, borderBottom: '1px solid rgba(255, 255, 255, 0.6)' }}>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Typography variant="caption" sx={{ color: 'primary.main', fontFamily: 'monospace', fontWeight: 700 }}>JSON</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        可直接编辑，完成后点击一键美化整理缩进
                      </Typography>
                    </Stack>
                  </Box>
                  <Box
                    sx={{
                      borderTop: '1px solid rgba(255, 255, 255, 0.6)',
                      '& .cm-editor': {
                        fontSize: 13,
                        fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
                      },
                      '& .cm-scroller': {
                        lineHeight: 1.65,
                      },
                      '& .cm-tooltip': {
                        zIndex: 20,
                      },
                    }}
                  >
                    <CodeMirror
                      value={dslText}
                      height="360px"
                      theme={apiJsonEditorTheme}
                      basicSetup={{
                        lineNumbers: true,
                        highlightActiveLine: true,
                        highlightActiveLineGutter: true,
                        foldGutter: true,
                        bracketMatching: true,
                        closeBrackets: true,
                        autocompletion: true,
                      }}
                      extensions={[
                        json(),
                        syntaxHighlighting(apiJsonHighlightStyle),
                        autocompletion({
                          override: [dslCompletionSource],
                          activateOnTyping: true,
                        }),
                      ]}
                      onChange={(value) => setDslText(value)}
                    />
                  </Box>
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
