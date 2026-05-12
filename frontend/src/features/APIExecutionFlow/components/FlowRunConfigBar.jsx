import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
} from '@mui/material';

export default function FlowRunConfigBar({
  steps,
  runStepId,
  setRunStepId,
  baseUrl,
  setBaseUrl,
  bearerToken,
  setBearerToken,
  globalHeadersText,
  setGlobalHeadersText,
  onOpenTemplateDialog,
}) {
  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
        <TextField size="small" label="Base URL" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} sx={{ flex: 1 }} />
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>单步执行</InputLabel>
          <Select label="单步执行" value={runStepId || steps[0]?.id || ''} onChange={(event) => setRunStepId(event.target.value)}>
            {steps.map((step) => <MenuItem key={step.id} value={step.id}>{step.method} {step.path}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField size="small" label="Bearer Token" type="password" value={bearerToken} onChange={(event) => setBearerToken(event.target.value)} sx={{ minWidth: 220 }} />
      </Stack>
      <TextField size="small" label="全局请求头 (JSON)" multiline minRows={2} value={globalHeadersText} onChange={(event) => setGlobalHeadersText(event.target.value)} sx={{ mt: 1.5, width: '100%', '& .MuiInputBase-input': { fontFamily: 'monospace' } }} />
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
        <Button size="small" variant="outlined" onClick={() => onOpenTemplateDialog('load')} sx={{ borderRadius: 2 }}>载入流程模板</Button>
        <Button size="small" variant="contained" onClick={() => onOpenTemplateDialog('save')} sx={{ borderRadius: 2, bgcolor: '#475569', color: '#fff', '&:hover': { bgcolor: '#334155' } }}>保存为流程模板</Button>
      </Stack>
    </Box>
  );
}
