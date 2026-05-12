import {
  Box,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { variableInsertTargets } from '../utils/jsonDraft';

export default function FlowVariablePanel({
  flowSummary,
  activeStepId,
  variableInsertTarget,
  setVariableInsertTarget,
  onInsertVariable,
}) {
  return (
    <Paper sx={{ p: 2, borderRadius: 3, border: '1px solid rgba(255,255,255,0.65)', bgcolor: 'rgba(255,255,255,0.52)' }}>
      <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1.5 }}>变量流转</Typography>
      <Stack spacing={1.25}>
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={700}>初始变量</Typography>
          <VariableChips values={Array.from(flowSummary.initialVariables)} empty="暂无初始变量" />
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={700}>步骤产出</Typography>
          {flowSummary.produced.size ? (
            <Stack spacing={0.75} sx={{ mt: 0.75 }}>
              {Array.from(flowSummary.produced.entries()).map(([name, item]) => (
                <Typography key={name} variant="caption" sx={{ display: 'block' }}>
                  <Chip size="small" label={`{{${name}}}`} color="success" variant="outlined" sx={{ mr: 0.75 }} />
                  {item.step.name || item.step.path}
                </Typography>
              ))}
            </Stack>
          ) : <Typography variant="body2" color="text.secondary">暂无变量提取</Typography>}
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={700}>当前步骤引用</Typography>
          <VariableChips values={flowSummary.consumed.get(activeStepId) || []} empty="当前步骤未引用变量" />
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={700}>可插入变量</Typography>
          <FormControl size="small" sx={{ mt: 0.75, minWidth: 160 }}>
            <InputLabel>插入位置</InputLabel>
            <Select label="插入位置" value={variableInsertTarget} onChange={(event) => setVariableInsertTarget(event.target.value)}>
              {variableInsertTargets.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
            </Select>
          </FormControl>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
            {[...flowSummary.initialVariables, ...flowSummary.produced.keys()].map((name) => (
              <Chip key={name} size="small" label={`{{${name}}}`} onClick={() => onInsertVariable(name)} variant="outlined" clickable />
            ))}
          </Stack>
        </Box>
      </Stack>
    </Paper>
  );
}

function VariableChips({ values, empty }) {
  if (!values.length) return <Typography variant="body2" color="text.secondary">{empty}</Typography>;
  return (
    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
      {values.map((value) => <Chip key={value} size="small" label={`{{${value}}}`} variant="outlined" />)}
    </Stack>
  );
}
