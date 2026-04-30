import {
  Box,
  Checkbox,
  FormControl,
  FormControlLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';

export default function CoverageFilterBar({
  riskOnly,
  searchText,
  setRiskOnly,
  setSearchText,
  setSortBy,
  sortBy,
}) {
  return (
    <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 1.5 }}>
      <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="subtitle2">分析筛选</Typography>
          <Typography variant="caption" color="text.secondary">
            按排序方式和风险级别聚焦需要优先处理的模块。
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder="搜索模块名..."
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ color: 'text.disabled', fontSize: 18, mr: 0.5 }} />,
            }}
            sx={{ minWidth: 180, '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#ffffff' } }}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <Select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <MenuItem value="coverageAsc">覆盖率从低到高</MenuItem>
              <MenuItem value="coverageDesc">覆盖率从高到低</MenuItem>
              <MenuItem value="featureDesc">按功能数排序</MenuItem>
              <MenuItem value="caseDesc">按用例数排序</MenuItem>
              <MenuItem value="moduleName">按模块名排序</MenuItem>
            </Select>
          </FormControl>
          <FormControlLabel
            control={<Checkbox checked={riskOnly} onChange={(event) => setRiskOnly(event.target.checked)} />}
            label={<Typography variant="caption">只看风险模块</Typography>}
          />
        </Box>
      </Box>
    </Paper>
  );
}
