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
import { EXTRACTION_SOURCES } from '../../APIExecution/constants';

export default function ExtractionQuickEditor({ extractions, onUpdate, onRemove }) {
  if (!extractions.length) return null;
  return (
    <Paper variant="outlined" sx={{ p: 1.25, bgcolor: 'rgba(255,255,255,0.55)' }}>
      <Typography variant="caption" color="text.secondary" fontWeight={800}>变量提取快速编辑</Typography>
      <Stack spacing={1} sx={{ mt: 1 }}>
        {extractions.map((extraction, index) => (
          <Box key={`${extraction.name}-${index}`} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr auto' }, gap: 1 }}>
            <TextField size="small" label="变量名" value={extraction.name || ''} onChange={(event) => onUpdate(index, { name: event.target.value })} />
            <FormControl size="small">
              <InputLabel>来源</InputLabel>
              <Select label="来源" value={extraction.source || 'body'} onChange={(event) => onUpdate(index, { source: event.target.value })}>
                {EXTRACTION_SOURCES.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField size="small" label="路径" value={extraction.path || ''} onChange={(event) => onUpdate(index, { path: event.target.value || undefined })} />
            <Button size="small" color="error" onClick={() => onRemove(index)}>删除</Button>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}
