import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { AddOutlined, SaveOutlined } from '@mui/icons-material';
import { ASSERTION_TYPES, EXTRACTION_SOURCES } from '../../APIExecution/constants';
import { parseArrayDraft, parseRetryDraft } from '../utils/jsonDraft';
import JsonField from './JsonField';
import AssertionQuickEditor from './AssertionQuickEditor';
import ExtractionQuickEditor from './ExtractionQuickEditor';
import RetryQuickEditor from './RetryQuickEditor';

export default function FlowStepEditor({
  activeStep,
  disabledSet,
  dirty,
  stepDraft,
  saveError,
  onSave,
  onUpdateDraft,
  onToggleDisabled,
  onAddAssertion,
  onAddExtraction,
  onUpdateAssertion,
  onRemoveAssertion,
  onUpdateExtraction,
  onRemoveExtraction,
  onUpdateRetry,
}) {
  return (
    <Box 
      sx={{ 
        p: 2.5, 
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto'
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2, pb: 1, borderBottom: '1px solid', borderColor: 'rgba(0,0,0,0.04)' }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Box sx={{ width: 28, height: 28, borderRadius: 1.5, bgcolor: 'primary.50', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'primary.main' }}>
            <AddOutlined fontSize="small" sx={{ transform: 'rotate(45deg)' }} />
          </Box>
          <Typography variant="subtitle2" fontWeight={800}>步骤精细配置</Typography>
          {dirty && <Chip size="small" label="未保存" color="warning" variant="filled" sx={{ height: 20, fontSize: '0.7rem', fontWeight: 800 }} />}
        </Stack>
        <Button size="small" variant="contained" startIcon={<SaveOutlined />} disabled={!stepDraft} onClick={onSave}>保存步骤</Button>
      </Stack>
      {saveError && <Alert severity="error" sx={{ mb: 1.5 }}>{saveError}</Alert>}
      {stepDraft && (
        <Stack spacing={1.5}>
          <FormControlLabel
            control={<Switch size="small" checked={!disabledSet.has(activeStep.id)} onChange={() => onToggleDisabled(activeStep.id)} />}
            label="本次执行启用该步骤"
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            <TextField size="small" label="步骤 ID" value={stepDraft.id} onChange={(event) => onUpdateDraft({ id: event.target.value })} />
            <TextField size="small" label="步骤名称" value={stepDraft.name} onChange={(event) => onUpdateDraft({ name: event.target.value })} />
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 1 }}>
            <FormControl size="small">
              <InputLabel>方法</InputLabel>
              <Select label="方法" value={stepDraft.method} onChange={(event) => onUpdateDraft({ method: event.target.value })}>
                {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => <MenuItem key={method} value={method}>{method}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField size="small" label="Path" value={stepDraft.path} onChange={(event) => onUpdateDraft({ path: event.target.value })} />
          </Box>
          <TextField size="small" label="operationId" value={stepDraft.operation_id} onChange={(event) => onUpdateDraft({ operation_id: event.target.value })} />
          <JsonField label="Headers" value={stepDraft.headersText} onChange={(value) => onUpdateDraft({ headersText: value })} />
          <JsonField label="Query" value={stepDraft.queryText} onChange={(value) => onUpdateDraft({ queryText: value })} />
          <JsonField label="Path Params" value={stepDraft.pathParamsText} onChange={(value) => onUpdateDraft({ pathParamsText: value })} />
          <JsonField label="Body" value={stepDraft.bodyText} onChange={(value) => onUpdateDraft({ bodyText: value })} minRows={4} helper="可在左侧选择插入位置后点击变量 chip 追加引用" />
          <TextField size="small" label="依赖步骤 ID（每行一个）" multiline minRows={2} value={stepDraft.dependsOnText} onChange={(event) => onUpdateDraft({ dependsOnText: event.target.value })} />
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="outlined" startIcon={<AddOutlined />} onClick={onAddAssertion}>追加断言模板</Button>
            <Button size="small" variant="outlined" color="success" startIcon={<AddOutlined />} onClick={onAddExtraction}>追加提取模板</Button>
          </Stack>
          <AssertionQuickEditor
            assertions={parseArrayDraft(stepDraft.assertionsText)}
            onUpdate={onUpdateAssertion}
            onRemove={onRemoveAssertion}
          />
          <ExtractionQuickEditor
            extractions={parseArrayDraft(stepDraft.extractionsText)}
            onUpdate={onUpdateExtraction}
            onRemove={onRemoveExtraction}
          />
          <RetryQuickEditor
            retry={parseRetryDraft(stepDraft.retryText)}
            onUpdate={onUpdateRetry}
          />
          <JsonField label="Assertions" value={stepDraft.assertionsText} onChange={(value) => onUpdateDraft({ assertionsText: value })} minRows={5} helper={`可用类型：${ASSERTION_TYPES.map((item) => item.value).join(', ')}`} />
          <JsonField label="Extractions" value={stepDraft.extractionsText} onChange={(value) => onUpdateDraft({ extractionsText: value })} minRows={4} helper={`来源：${EXTRACTION_SOURCES.map((item) => item.value).join(', ')}`} />
          <JsonField label="Retry" value={stepDraft.retryText} onChange={(value) => onUpdateDraft({ retryText: value })} minRows={3} />
        </Stack>
      )}
    </Box>
  );
}
