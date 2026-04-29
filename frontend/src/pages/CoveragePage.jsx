import React, { useEffect, useMemo, useState, useCallback } from 'react';
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
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  SaveAlt as SaveAltIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { graphAPI } from '../services/api';
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

export default function CoveragePage() {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('coverageAsc');
  const [riskOnly, setRiskOnly] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);
  const showSnackbar = useSnackbar();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await graphAPI.getCoverage();
      setModules((data.modules || []).sort((a, b) => b.coverage_percentage - a.coverage_percentage));
      setLastUpdated(new Date());
      setExpandedRow(null);
    } catch (e) {
      console.error(e);
      showSnackbar('加载覆盖率数据失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [showSnackbar]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleModules = useMemo(() => {
    return filterAndSortModules(modules, { riskOnly, searchText, sortBy });
  }, [modules, riskOnly, sortBy, searchText]);

  const metrics = useMemo(() => {
    return buildCoverageMetrics(modules, visibleModules);
  }, [modules, visibleModules]);

  const toggleRow = (moduleName) => {
    setExpandedRow((prev) => (prev === moduleName ? null : moduleName));
  };

  return (
    <Box sx={{ flex: 1, p: 1.5, overflow: 'auto', bgcolor: 'background.default' }}>
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
        <PageHeader title="覆盖率视图" subtitle="从模块、功能数和用例数三个维度查看测试覆盖情况，并快速定位风险模块。">
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            {lastUpdated && (
              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                更新于 {lastUpdated.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </Typography>
            )}
            <Tooltip title="刷新数据">
              <span>
                <IconButton size="small" onClick={load} disabled={loading}
                  sx={{ bgcolor: 'rgba(99,102,241,0.08)', '&:hover': { bgcolor: 'rgba(99,102,241,0.15)' } }}
                >
                  <RefreshIcon fontSize="small" sx={{ color: '#6366f1', animation: loading ? 'spin 1s linear infinite' : 'none', '@keyframes spin': { '0%': { transform: 'rotate(0)' }, '100%': { transform: 'rotate(360deg)' } } }} />
                </IconButton>
              </span>
            </Tooltip>
            {modules.length > 0 && (
              <Tooltip title="导出 CSV 报告">
                <IconButton size="small" onClick={() => { exportCoverageCSV(visibleModules); showSnackbar('导出成功', 'success'); }}
                  sx={{ bgcolor: 'rgba(16,185,129,0.08)', '&:hover': { bgcolor: 'rgba(16,185,129,0.15)' } }}
                >
                  <SaveAltIcon fontSize="small" sx={{ color: '#10b981' }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </PageHeader>
        <Box sx={{ p: 2.5, bgcolor: 'background.paper' }}>
          {loading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
                {[1, 2, 3, 4].map((item) => (
                  <Skeleton key={item} variant="rectangular" height={112} sx={{ borderRadius: 3, flex: '1 1 220px' }} />
                ))}
              </Box>
              <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
                {[1, 2].map((item) => (
                  <Skeleton key={item} variant="rectangular" height={280} sx={{ borderRadius: 3, flex: '1 1 420px' }} />
                ))}
              </Box>
              <Skeleton variant="rectangular" height={260} sx={{ borderRadius: 3 }} />
            </Box>
          ) : modules.length === 0 ? (
            <EmptyState
              title="暂无覆盖率数据"
              description="请先导入并索引文档，系统才能生成按模块聚合的覆盖率视图。"
            />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <CoverageFilterBar
                riskOnly={riskOnly}
                searchText={searchText}
                setRiskOnly={setRiskOnly}
                setSearchText={setSearchText}
                setSortBy={setSortBy}
                sortBy={sortBy}
              />

              <CoverageMetricCards metrics={metrics} modules={modules} />

              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                <Paper elevation={0} sx={{ flex: '1 1 320px', border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                    总览
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                    <DonutChart value={metrics.avgCoverage} />
                    <Box sx={{ flex: 1, minWidth: 180 }}>
                      <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
                        <Chip size="small" color="success" label={`健康 ${metrics.healthyCount}`} />
                        <Chip size="small" color="warning" label={`关注 ${modules.length - metrics.healthyCount - metrics.riskCount}`} />
                        <Chip size="small" color="error" label={`风险 ${metrics.riskCount}`} />
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>
                        平均覆盖率按"用例数 / 功能数"计算，用来快速判断当前模块测试投入是否均衡。
                      </Typography>
                    </Box>
                  </Box>
                </Paper>

                <Paper elevation={0} sx={{ flex: '1 1 480px', border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                    模块覆盖率排行
                  </Typography>
                  <HorizontalBars modules={metrics.topModules} />
                </Paper>
              </Box>

              <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
                  <Typography variant="subtitle2">模块明细</Typography>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Typography variant="caption" color="text.secondary">
                      共 {visibleModules.length} 个模块，平均覆盖率 {metrics.avgCoverage.toFixed(1)}%
                    </Typography>
                    <Tooltip title="点击表格行可展开查看功能和用例详情">
                      <Typography variant="caption" sx={{ px: 1, py: 0.25, borderRadius: 1, bgcolor: 'rgba(99,102,241,0.08)', color: '#6366f1', fontWeight: 600, cursor: 'default' }}>
                        可展开
                      </Typography>
                    </Tooltip>
                  </Box>
                </Box>

                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, maxHeight: 480 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ width: 36, bgcolor: '#f8fafc' }} />
                        <TableCell sx={{ bgcolor: '#f8fafc', fontWeight: 700, fontSize: 12, color: '#475569' }}>模块名称</TableCell>
                        <TableCell align="center" sx={{ bgcolor: '#f8fafc', fontWeight: 700, fontSize: 12, color: '#475569' }}>功能数</TableCell>
                        <TableCell align="center" sx={{ bgcolor: '#f8fafc', fontWeight: 700, fontSize: 12, color: '#475569' }}>用例数</TableCell>
                        <TableCell align="center" sx={{ bgcolor: '#f8fafc', fontWeight: 700, fontSize: 12, color: '#475569' }}>状态</TableCell>
                        <TableCell sx={{ minWidth: 240, bgcolor: '#f8fafc', fontWeight: 700, fontSize: 12, color: '#475569' }}>覆盖率</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {visibleModules.map((item) => {
                        const tone = getCoverageTone(item.coverage_percentage);
                        const isExpanded = expandedRow === item.module_name;
                        return (
                          <React.Fragment key={item.module_name}>
                            <TableRow
                              hover
                              onClick={() => toggleRow(item.module_name)}
                              sx={{ cursor: 'pointer', '&:nth-of-type(odd)': { bgcolor: 'rgba(248,250,252,0.5)' }, ...(isExpanded && { bgcolor: 'rgba(99,102,241,0.04) !important' }) }}
                            >
                              <TableCell sx={{ px: 0.5 }}>
                                <IconButton size="small" sx={{ p: 0.25 }}>
                                  {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                                </IconButton>
                              </TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>{item.module_name}</TableCell>
                              <TableCell align="center">{item.feature_count}</TableCell>
                              <TableCell align="center">{item.test_case_count}</TableCell>
                              <TableCell align="center">
                                <Chip size="small" color={tone.color} label={tone.label} />
                              </TableCell>
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                                  <Box sx={{ flex: 1 }}>
                                    <LinearProgress
                                      variant="determinate"
                                      value={item.coverage_percentage}
                                      color={tone.color}
                                      sx={{ height: 8, borderRadius: 999 }}
                                    />
                                  </Box>
                                  <Typography variant="caption" sx={{ minWidth: 48, textAlign: 'right', fontWeight: 600 }}>
                                    {item.coverage_percentage.toFixed(1)}%
                                  </Typography>
                                </Box>
                              </TableCell>
                            </TableRow>
                            <TableRow key={`${item.module_name}-detail`}>
                              <TableCell colSpan={6} sx={{ py: 0, px: 2, borderBottom: isExpanded ? '1px solid' : 'none', borderColor: 'divider' }}>
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
              </Paper>
            </Box>
          )}
        </Box>
      </Paper>
    </Box>
  );
}
