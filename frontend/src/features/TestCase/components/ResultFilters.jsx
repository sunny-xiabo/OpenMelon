import {
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from '@mui/material';

export default function ResultFilters({
  moduleFilter,
  moduleOptions,
  priorityFilter,
  priorityOptions,
  setModuleFilter,
  setPriorityFilter,
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        mb: 1.5,
        p: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2.5,
        bgcolor: '#fbfcff',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.25, flexWrap: 'wrap', mb: 1 }}>
        <Box>
          <Typography variant="body2" fontWeight={700}>
            结果快速筛选
          </Typography>
          <Typography variant="caption" color="text.secondary">
            按模块和优先级快速定位要查看或导出的测试用例。
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">
          当前导出与导图均基于筛选结果
        </Typography>
      </Box>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25}>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>模块</InputLabel>
          <Select
            value={moduleFilter}
            label="模块"
            onChange={(event) => setModuleFilter(event.target.value)}
            sx={{ borderRadius: 2, bgcolor: '#ffffff' }}
          >
            <MenuItem value="all">全部模块</MenuItem>
            {moduleOptions.map((option) => (
              <MenuItem key={option} value={option}>{option}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>优先级</InputLabel>
          <Select
            value={priorityFilter}
            label="优先级"
            onChange={(event) => setPriorityFilter(event.target.value)}
            sx={{ borderRadius: 2, bgcolor: '#ffffff' }}
          >
            <MenuItem value="all">全部优先级</MenuItem>
            {priorityOptions.map((option) => (
              <MenuItem key={option} value={option}>{option}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          {moduleFilter !== 'all' && <Chip size="small" label={`模块: ${moduleFilter}`} onDelete={() => setModuleFilter('all')} />}
          {priorityFilter !== 'all' && <Chip size="small" label={`优先级: ${priorityFilter}`} onDelete={() => setPriorityFilter('all')} />}
          {(moduleFilter !== 'all' || priorityFilter !== 'all') && (
            <Button size="small" onClick={() => { setModuleFilter('all'); setPriorityFilter('all'); }}>
              清空筛选
            </Button>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}
