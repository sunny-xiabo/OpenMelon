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
  Typography,
} from '@mui/material';
import { ASSERTION_TYPES } from '../../APIExecution/constants';

export default function AssertionQuickEditor({ assertions, onUpdate, onRemove }) {
  if (!assertions.length) return null;
  return (
    <Paper variant="outlined" sx={{ p: 1.25, bgcolor: 'rgba(255,255,255,0.55)' }}>
      <Typography variant="caption" color="text.secondary" fontWeight={800}>断言快速编辑</Typography>
      <Stack spacing={1} sx={{ mt: 1 }}>
        {assertions.map((assertion, index) => (
          <Box key={`${assertion.type}-${index}`} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.1fr 1fr 1fr auto' }, gap: 1 }}>
            <FormControl size="small">
              <InputLabel>类型</InputLabel>
              <Select label="类型" value={assertion.type || 'status_code_in'} onChange={(event) => onUpdate(index, { type: event.target.value })}>
                {ASSERTION_TYPES.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField size="small" label="Path / Header" value={assertion.path || ''} onChange={(event) => onUpdate(index, { path: event.target.value || undefined })} />
            <TextField size="small" label="Expected" value={Array.isArray(assertion.expected) ? assertion.expected.join(',') : assertion.expected ?? ''} onChange={(event) => onUpdate(index, { expected: event.target.value })} />
            <Button size="small" color="error" onClick={() => onRemove(index)}>删除</Button>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}
