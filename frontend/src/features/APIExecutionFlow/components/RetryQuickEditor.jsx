import {
  Box,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { defaultRetry } from '../utils/jsonDraft';

export default function RetryQuickEditor({ retry, onUpdate }) {
  const effectiveRetry = retry || defaultRetry;
  const updateRetry = (patch) => onUpdate({ ...effectiveRetry, ...patch });
  return (
    <Paper variant="outlined" sx={{ p: 1.25, bgcolor: 'rgba(255,255,255,0.55)' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} sx={{ mb: 1 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={800}>失败重试快速编辑</Typography>
        <FormControlLabel
          control={<Switch size="small" checked={Boolean(retry)} onChange={(event) => onUpdate(event.target.checked ? effectiveRetry : null)} />}
          label="启用"
        />
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr 1.4fr' }, gap: 1 }}>
        <TextField
          size="small"
          type="number"
          label="最大次数"
          disabled={!retry}
          value={effectiveRetry.max_attempts ?? 1}
          onChange={(event) => updateRetry({ max_attempts: Math.max(1, Number(event.target.value) || 1) })}
        />
        <TextField
          size="small"
          type="number"
          label="延迟(ms)"
          disabled={!retry}
          value={effectiveRetry.delay_ms ?? 1000}
          onChange={(event) => updateRetry({ delay_ms: Math.max(0, Number(event.target.value) || 0) })}
        />
        <TextField
          size="small"
          type="number"
          label="退避系数"
          disabled={!retry}
          value={effectiveRetry.backoff_factor ?? 1}
          onChange={(event) => updateRetry({ backoff_factor: Math.max(0, Number(event.target.value) || 1) })}
        />
        <TextField
          size="small"
          label="重试触发类型"
          disabled={!retry}
          value={(effectiveRetry.retry_on || []).join(',')}
          onChange={(event) => updateRetry({ retry_on: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })}
          helperText="如 status_code, response_time_lt"
        />
      </Box>
    </Paper>
  );
}
