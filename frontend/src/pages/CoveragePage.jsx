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
  FormControl,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Button,
  TextField,
  IconButton,
  Tooltip,
  Collapse,
  CircularProgress,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  SaveAlt as SaveAltIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Widgets as WidgetsIcon,
  AccountTree as FeaturesIcon,
  BugReport as CasesIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { graphAPI } from '../services/api';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { useSnackbar } from '../components/SnackbarProvider';

function getCoverageTone(pct) {
  if (pct >= 80) return { color: 'success', label: '健康' };
  if (pct >= 50) return { color: 'warning', label: '关注' };
  return { color: 'error', label: '风险' };
}

function MetricCard({ label, value, helper, accent, icon, trend }) {
  return (
    <Paper
      elevation={0}
      sx={{
        flex: 1,
        minWidth: 0,
        p: 2,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 3,
        background: `linear-gradient(180deg, ${accent} 0%, #ffffff 100%)`,
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
        },
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        {icon && <Box sx={{ opacity: 0.5, fontSize: 18 }}>{icon}</Box>}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 0.75 }}>
        <Typography variant="h4" sx={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>
          {value}
        </Typography>
        {trend && (
          <Typography variant="caption" sx={{ color: trend.color, fontWeight: 600 }}>
            {trend.text}
          </Typography>
        )}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
        {helper}
      </Typography>
    </Paper>
  );
}

function DonutChart({ value }) {
  const radius = 56;
  const stroke = 12;
  const normalized = Math.max(0, Math.min(100, value));
  const circumference = 2 * Math.PI * radius;
  const dash = (normalized / 100) * circumference;

  const getGradientColors = (pct) => {
    if (pct >= 80) return { start: '#22c55e', end: '#16a34a', glow: 'rgba(34,197,94,0.2)' };
    if (pct >= 50) return { start: '#f59e0b', end: '#d97706', glow: 'rgba(245,158,11,0.2)' };
    return { start: '#ef4444', end: '#dc2626', glow: 'rgba(239,68,68,0.2)' };
  };
  const gradient = getGradientColors(normalized);

  return (
    <Box sx={{ position: 'relative', width: 148, height: 148, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="148" height="148" viewBox="0 0 148 148">
        <defs>
          <linearGradient id="coverageGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={gradient.start} />
            <stop offset="100%" stopColor={gradient.end} />
          </linearGradient>
          <filter id="coverageGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle cx="74" cy="74" r={radius} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        <circle
          cx="74" cy="74" r={radius}
          fill="none"
          stroke="url(#coverageGradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform="rotate(-90 74 74)"
          filter="url(#coverageGlow)"
          style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>
      <Box sx={{ position: 'absolute', textAlign: 'center' }}>
        <Typography variant="h4" sx={{ fontSize: 30, fontWeight: 700, color: gradient.start }}>
          {normalized.toFixed(0)}%
        </Typography>
        <Typography variant="caption" color="text.secondary">
          平均覆盖率
        </Typography>
      </Box>
    </Box>
  );
}

function HorizontalBars({ modules }) {
  const maxCoverage = Math.max(...modules.map((item) => item.coverage_percentage), 1);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      {modules.map((item, idx) => {
        const tone = getCoverageTone(item.coverage_percentage);
        return (
          <Tooltip
            key={item.module_name}
            title={`功能 ${item.feature_count} · 用例 ${item.test_case_count}`}
            placement="right"
            arrow
          >
            <Box sx={{ '&:hover .bar-fill': { filter: 'brightness(1.1)' }, cursor: 'default' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5, gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                  <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 700, fontSize: 10, minWidth: 16 }}>
                    #{idx + 1}
                  </Typography>
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {item.module_name}
                  </Typography>
                </Box>
                <Typography variant="caption" sx={{ fontWeight: 600, color: tone.color === 'success' ? '#22c55e' : tone.color === 'warning' ? '#f59e0b' : '#ef4444' }}>
                  {item.coverage_percentage.toFixed(1)}%
                </Typography>
              </Box>
              <Box sx={{ height: 10, borderRadius: 999, bgcolor: '#f1f5f9', overflow: 'hidden' }}>
                <Box
                  className="bar-fill"
                  sx={{
                    width: `${(item.coverage_percentage / maxCoverage) * 100}%`,
                    height: '100%',
                    borderRadius: 999,
                    transition: 'width 0.5s ease, filter 0.2s',
                    background:
                      tone.color === 'success'
                        ? 'linear-gradient(90deg, #34d399 0%, #22c55e 100%)'
                        : tone.color === 'warning'
                          ? 'linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)'
                          : 'linear-gradient(90deg, #fb7185 0%, #ef4444 100%)',
                  }}
                />
              </Box>
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}

function ModuleDetailRow({ moduleName }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await graphAPI.getCoverageDetail(moduleName);
        if (!cancelled) setDetail(data);
      } catch {
        if (!cancelled) setDetail({ features: [], test_cases: [], coverage_percentage: 0 });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [moduleName]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
        <CircularProgress size={20} />
        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>加载模块详情...</Typography>
      </Box>
    );
  }

  if (!detail) return null;

  return (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', py: 1, maxHeight: 200 }}>
      <Paper elevation={0} sx={{ flex: '1 1 280px', p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: '#f8fafc', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 200 }}>
        <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 1, flexShrink: 0 }}>
          功能列表 ({detail.features?.length || 0})
        </Typography>
        {(detail.features?.length || 0) === 0 ? (
          <Typography variant="caption" color="text.disabled">暂无功能节点</Typography>
        ) : (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', overflowY: 'auto', flex: 1, minHeight: 0, alignContent: 'flex-start' }}>
            {detail.features.map((f, i) => (
              <Chip key={i} label={f} size="small" variant="outlined"
                sx={{ borderRadius: 1.5, borderColor: 'rgba(59,130,246,0.3)', color: '#3b82f6', bgcolor: 'rgba(59,130,246,0.05)', fontSize: 12, maxWidth: 200, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
              />
            ))}
          </Box>
        )}
      </Paper>
      <Paper elevation={0} sx={{ flex: '1 1 280px', p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: '#f8fafc', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 200 }}>
        <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 1, flexShrink: 0 }}>
          关联用例 ({detail.test_cases?.length || 0})
        </Typography>
        {(detail.test_cases?.length || 0) === 0 ? (
          <Typography variant="caption" color="text.disabled">暂无关联用例</Typography>
        ) : (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', overflowY: 'auto', flex: 1, minHeight: 0, alignContent: 'flex-start' }}>
            {detail.test_cases.map((tc, i) => (
              <Chip key={i} label={tc} size="small" variant="outlined"
                sx={{ borderRadius: 1.5, borderColor: 'rgba(16,185,129,0.3)', color: '#10b981', bgcolor: 'rgba(16,185,129,0.05)', fontSize: 12, maxWidth: 200, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
              />
            ))}
          </Box>
        )}
      </Paper>
    </Box>
  );
}

function exportCSV(modules) {
  const header = '模块名称,功能数,用例数,覆盖率(%),状态\n';
  const rows = modules.map((m) => {
    const tone = getCoverageTone(m.coverage_percentage);
    return `${m.module_name},${m.feature_count},${m.test_case_count},${m.coverage_percentage.toFixed(1)},${tone.label}`;
  }).join('\n');
  const bom = '\uFEFF';
  const blob = new Blob([bom + header + rows], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `覆盖率报告_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

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
    let filtered = riskOnly
      ? modules.filter((item) => item.coverage_percentage < 50)
      : modules;

    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      filtered = filtered.filter((item) => item.module_name.toLowerCase().includes(q));
    }

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'coverageDesc') return b.coverage_percentage - a.coverage_percentage;
      if (sortBy === 'moduleName') return a.module_name.localeCompare(b.module_name, 'zh-CN');
      if (sortBy === 'featureDesc') return b.feature_count - a.feature_count;
      if (sortBy === 'caseDesc') return b.test_case_count - a.test_case_count;
      return a.coverage_percentage - b.coverage_percentage;
    });

    return sorted;
  }, [modules, riskOnly, sortBy, searchText]);

  const metrics = useMemo(() => {
    const totalFeatures = modules.reduce((sum, item) => sum + item.feature_count, 0);
    const totalCases = modules.reduce((sum, item) => sum + item.test_case_count, 0);
    const avgCoverage = totalFeatures ? (totalCases / totalFeatures) * 100 : 0;
    const healthyCount = modules.filter((item) => item.coverage_percentage >= 80).length;
    const riskCount = modules.filter((item) => item.coverage_percentage < 50).length;
    const topModules = visibleModules.slice(0, 8);
    return {
      totalFeatures,
      totalCases,
      avgCoverage,
      healthyCount,
      riskCount,
      topModules,
    };
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
                <IconButton size="small" onClick={() => { exportCSV(visibleModules); showSnackbar('导出成功', 'success'); }}
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
                      onChange={(e) => setSearchText(e.target.value)}
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

              <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
                <MetricCard
                  label="模块总数"
                  value={modules.length}
                  helper={`其中 ${metrics.healthyCount} 个模块覆盖健康`}
                  accent="rgba(26,115,232,0.08)"
                  icon={<WidgetsIcon fontSize="inherit" />}
                  trend={metrics.healthyCount > 0 ? { text: `${((metrics.healthyCount / modules.length) * 100).toFixed(0)}% 健康`, color: '#22c55e' } : null}
                />
                <MetricCard
                  label="功能总数"
                  value={metrics.totalFeatures}
                  helper="已纳入图谱统计的功能节点总量"
                  accent="rgba(16,185,129,0.08)"
                  icon={<FeaturesIcon fontSize="inherit" />}
                />
                <MetricCard
                  label="用例总数"
                  value={metrics.totalCases}
                  helper={metrics.totalFeatures > 0 ? `平均每功能 ${(metrics.totalCases / metrics.totalFeatures).toFixed(1)} 条用例` : '按模块聚合的测试用例节点总量'}
                  accent="rgba(245,158,11,0.08)"
                  icon={<CasesIcon fontSize="inherit" />}
                />
                <MetricCard
                  label="风险模块"
                  value={metrics.riskCount}
                  helper="覆盖率低于 50% 的模块数量"
                  accent="rgba(239,68,68,0.08)"
                  icon={<WarningIcon fontSize="inherit" />}
                  trend={metrics.riskCount > 0 ? { text: '需关注', color: '#ef4444' } : { text: '无风险', color: '#22c55e' }}
                />
              </Box>

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
