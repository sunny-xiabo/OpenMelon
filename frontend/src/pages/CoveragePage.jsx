import React, { useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  LinearProgress,
  Skeleton,
  Chip,
  Stack,
  IconButton,
  Tooltip,
  Collapse,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Refresh as RefreshIcon,
  SaveAlt as SaveAltIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { useSnackbar } from '../components/SnackbarProvider';
import DonutChart from '../features/Coverage/components/DonutChart';
import HorizontalBars from '../features/Coverage/components/HorizontalBars';
import ModuleDetailRow from '../features/Coverage/components/ModuleDetailRow';
import CoverageFilterBar from '../features/Coverage/components/CoverageFilterBar';
import CoverageMetricCards from '../features/Coverage/components/CoverageMetricCards';
import {
  buildCoverageMetrics,
  exportCoverageCSV,
  filterAndSortModules,
  getCoverageTone,
} from '../features/Coverage/utils';

// Hooks
import { useCoverage } from '../features/Dashboard/hooks/useDashboard';

export default function CoveragePage({ embedded = false }) {
  const theme = useTheme();
  const showSnackbar = useSnackbar();
  
  // UI 交互状态
  const [sortBy, setSortBy] = useState('coverageAsc');
  const [riskOnly, setRiskOnly] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [expandedRow, setExpandedRow] = useState(null);

  // 使用 TanStack Query
  const { data: modules = [], isLoading, isFetching, refetch, dataUpdatedAt, error } = useCoverage();

  const visibleModules = useMemo(() => {
    return filterAndSortModules(modules, { riskOnly, searchText, sortBy });
  }, [modules, riskOnly, sortBy, searchText]);

  const metrics = useMemo(() => {
    return buildCoverageMetrics(modules, visibleModules);
  }, [modules, visibleModules]);

  const toggleRow = (moduleName) => {
    setExpandedRow((prev) => (prev === moduleName ? null : moduleName));
  };

  const loading = isLoading || (isFetching && modules.length === 0);

  return (
    <Box sx={{ flex: 1, p: embedded ? 0 : { xs: 2, md: 3 }, overflow: embedded ? 'visible' : 'auto', background: 'transparent' }}>
      <Paper 
        elevation={0} 
        sx={{ 
          border: embedded ? 'none' : '1px solid rgba(255, 255, 255, 0.4)', 
          borderRadius: embedded ? 0 : 4, 
          overflow: embedded ? 'visible' : 'hidden',
          background: embedded ? 'transparent' : 'rgba(255, 255, 255, 0.65)',
          backdropFilter: embedded ? 'none' : 'blur(20px)',
          boxShadow: embedded ? 'none' : '0 8px 32px rgba(15, 23, 42, 0.04), inset 0 1px 0 rgba(255, 255, 255, 1)'
        }}
      >
        {!embedded && (
          <PageHeader title="覆盖率视图" subtitle="多维度监控知识资产的测试覆盖情况。">
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              {dataUpdatedAt && (
                <Typography variant="caption" color="text.secondary">
                  最近同步: {new Date(dataUpdatedAt).toLocaleTimeString()}
                </Typography>
              )}
              <Tooltip title="同步数据">
                <IconButton size="small" onClick={() => refetch()} disabled={isFetching}>
                  <RefreshIcon fontSize="small" sx={{ animation: isFetching ? 'spin 1s linear infinite' : 'none', '@keyframes spin': { '0%': { transform: 'rotate(0)' }, '100%': { transform: 'rotate(360deg)' } } }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="导出 CSV">
                <IconButton size="small" onClick={() => { exportCoverageCSV(visibleModules); showSnackbar('导出成功', { severity: 'success' }); }}>
                  <SaveAltIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </PageHeader>
        )}

        <Box sx={{ p: embedded ? 0 : 3 }}>
          {loading ? (
             <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
               <Skeleton variant="rectangular" height={100} sx={{ borderRadius: 3 }} />
               <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 3 }} />
             </Box>
          ) : error && !isLoading ? (
            <EmptyState variant="error" title="覆盖率数据加载失败" description={error.message || '请检查服务是否可用'} action="重试" onAction={() => refetch()} />
          ) : modules.length === 0 ? (
            <EmptyState title="暂无覆盖率数据" description="导入文档并生成索引后将自动计算覆盖率。" />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <CoverageFilterBar riskOnly={riskOnly} searchText={searchText} setRiskOnly={setRiskOnly} setSearchText={setSearchText} setSortBy={setSortBy} sortBy={sortBy} />
              <CoverageMetricCards metrics={metrics} modules={modules} />

              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Paper elevation={0} sx={{ flex: '1 1 320px', border: '1px solid rgba(255, 255, 255, 0.6)', background: 'rgba(255, 255, 255, 0.5)', borderRadius: 3, p: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1.5 }}>总览</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                    <DonutChart value={metrics.avgCoverage} />
                    <Box sx={{ flex: 1 }}>
                      <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap' }}>
                        <Chip size="small" color="success" label={`健康 ${metrics.healthyCount}`} />
                        <Chip size="small" color="error" label={`风险 ${metrics.riskCount}`} />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">平均覆盖率按"已建用例 / 识别功能"计算。</Typography>
                    </Box>
                  </Box>
                </Paper>

                <Paper elevation={0} sx={{ flex: '1 1 480px', border: '1px solid rgba(255, 255, 255, 0.6)', background: 'rgba(255, 255, 255, 0.5)', borderRadius: 3, p: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1.5 }}>覆盖率排行</Typography>
                  <HorizontalBars modules={metrics.topModules} />
                </Paper>
              </Box>

              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, maxHeight: 600 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 40 }} />
                      <TableCell sx={{ fontWeight: 700 }}>模块</TableCell>
                      <TableCell align="center">功能</TableCell>
                      <TableCell align="center">用例</TableCell>
                      <TableCell align="center">状态</TableCell>
                      <TableCell>覆盖率进度</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {visibleModules.map((item) => {
                      const tone = getCoverageTone(item.coverage_percentage);
                      const isExpanded = expandedRow === item.module_name;
                      return (
                        <React.Fragment key={item.module_name}>
                          <TableRow hover onClick={() => toggleRow(item.module_name)} sx={{ cursor: 'pointer', bgcolor: isExpanded ? alpha(theme.palette.primary.main, 0.04) : 'inherit' }}>
                            <TableCell>{isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{item.module_name}</TableCell>
                            <TableCell align="center">{item.feature_count}</TableCell>
                            <TableCell align="center">{item.test_case_count}</TableCell>
                            <TableCell align="center"><Chip size="small" color={tone.color} label={tone.label} /></TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <LinearProgress variant="determinate" value={item.coverage_percentage || 0} color={tone.color} sx={{ flex: 1, height: 6, borderRadius: 3 }} />
                                <Typography variant="caption" sx={{ minWidth: 40, fontWeight: 700 }}>{(item.coverage_percentage || 0).toFixed(0)}%</Typography>
                              </Box>
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell colSpan={6} sx={{ p: 0, borderBottom: isExpanded ? '1px solid rgba(0,0,0,0.08)' : 'none' }}>
                              <Collapse in={isExpanded} unmountOnExit>
                                <ModuleDetailRow moduleName={item.module_name} />
                              </Collapse>
                            </TableCell>
                          </TableRow>
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </Box>
      </Paper>
    </Box>
  );
}
