import React from 'react';
import { Paper, Box, Typography, TextField, Stack, List, ListItemButton, Chip, Button, Divider, Collapse, IconButton, Tooltip } from '@mui/material';
import { RouteOutlined, ExpandMore, ExpandLess, ChevronLeft, ChevronRight } from '@mui/icons-material';
import { useAPIExecution } from '../context';
import EmptyState from '../../../components/EmptyState';
import { METHOD_COLORS } from '../constants';

const getOperationKey = (operation) => operation.id || `${operation.method}-${operation.path}-${operation.operation_id}`;

const formatTag = (tag) => (typeof tag === 'string' ? tag : JSON.stringify(tag));

const getOperationRisk = (method = '') => {
  const normalized = method.toUpperCase();
  if (normalized === 'GET') return { label: '只读', color: 'success' };
  if (normalized === 'DELETE') return { label: '高风险', color: 'error' };
  if (['POST', 'PUT', 'PATCH'].includes(normalized)) return { label: '写入', color: 'warning' };
  return { label: '接口', color: 'default' };
};

export default function Sidebar() {
  const {
    spec,
    searchText,
    setSearchText,
    tagOptions,
    filteredOperations,
    toggleOperation,
    selectedOperationIds,
    setActiveStep,
  } = useAPIExecution();

  const [collapsedTags, setCollapsedTags] = React.useState({});
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);

  const toggleTagCollapse = (tagStr) => {
    setCollapsedTags(prev => ({ ...prev, [tagStr]: !prev[tagStr] }));
  };

  const selectedOperations = (spec?.operations || []).filter((operation) => selectedOperationIds.has(getOperationKey(operation)));
  const selectedPreview = selectedOperations.slice(0, 5);
  const groupedTags = [...tagOptions.map(formatTag), '未分组'];

  return (
    <Box sx={{ position: 'relative', display: 'flex', flexShrink: 0, height: '100%', zIndex: 10 }}>
      <Paper
        elevation={0}
        sx={{
          width: isSidebarCollapsed ? 56 : 320, // 56px rail instead of 0
          overflow: 'hidden',
          transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          bgcolor: '#f8fafc',
          borderRight: '1px solid', // Keep border always
          borderColor: 'divider',
          borderRadius: 0,
          minHeight: 0,
          boxShadow: 'inset -4px 0 20px -10px rgba(0,0,0,0.02)'
        }}
      >
        <Box sx={{ p: isSidebarCollapsed ? 1 : 2.5, pb: isSidebarCollapsed ? 1 : 2, borderBottom: '1px solid', borderColor: 'divider', bgcolor: '#ffffff', width: 320, transition: 'all 0.3s' }}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: isSidebarCollapsed ? 0 : 2 }}>
          <Tooltip title={isSidebarCollapsed ? "展开 API 目录" : "API 资产目录"} placement="right">
            <Box 
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              sx={{ 
                width: 40, height: 40, borderRadius: '10px', 
                bgcolor: 'primary.50', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                color: 'primary.main', cursor: 'pointer', flexShrink: 0,
                '&:hover': { bgcolor: 'primary.100' }
              }}
            >
              {isSidebarCollapsed ? <RouteOutlined fontSize="small" /> : <RouteOutlined fontSize="small" />}
            </Box>
          </Tooltip>
          <Box sx={{ minWidth: 0, flex: 1, opacity: isSidebarCollapsed ? 0 : 1, transition: 'opacity 0.2s' }}>
            <Typography variant="subtitle1" fontWeight={800} color="text.primary" sx={{ lineHeight: 1.2 }}>API 资产目录</Typography>
            <Typography variant="caption" color="text.secondary">接口导航与挑选状态</Typography>
          </Box>
          {!isSidebarCollapsed && (
            <Tooltip title="收起目录">
              <IconButton onClick={() => setIsSidebarCollapsed(true)} size="small" sx={{ color: 'text.secondary' }}>
                <ChevronLeft />
              </IconButton>
            </Tooltip>
          )}
        </Stack>

        <Box sx={{ opacity: isSidebarCollapsed ? 0 : 1, transition: 'opacity 0.2s' }}>
        {spec && (
          <Stack spacing={1.5}>
            <Box>
              <Typography variant="overline" color="primary.main" sx={{ fontWeight: 800, letterSpacing: 0.8, display: 'block', lineHeight: 1.2 }}>
                {spec.info?.title || '已导入 API'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                共 {spec.operation_count || 0} 个接口 · 已选 <Typography component="span" fontWeight={800} color={selectedOperationIds.size ? 'primary.main' : 'inherit'}>{selectedOperationIds.size}</Typography> 个
              </Typography>
            </Box>
            <TextField
              size="small"
              placeholder="搜索接口 / 路径 / 方法"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              fullWidth
              sx={{
                '& .MuiOutlinedInput-root': {
                  bgcolor: '#f1f5f9',
                  borderRadius: 2,
                  '& fieldset': { borderColor: 'transparent' },
                  '&:hover fieldset': { borderColor: 'rgba(99, 102, 241, 0.2)' },
                  '&.Mui-focused fieldset': { borderColor: 'primary.main' }
                }
              }}
            />
          </Stack>
        )}
        </Box>
      </Box>

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, opacity: isSidebarCollapsed ? 0 : 1, transition: 'opacity 0.2s', visibility: isSidebarCollapsed ? 'hidden' : 'visible' }}>
      {spec ? (
        <>
          <Box sx={{ p: 2, flex: 1, overflowX: 'hidden', overflowY: 'auto', minHeight: 0, width: 320 }}>
            <List disablePadding>
              {groupedTags.map((tagStr) => {
                const operations = filteredOperations.filter((operation) => {
                  const tags = (operation.tags || []).map(formatTag);
                  return tagStr === '未分组' ? !tags.length : tags.includes(tagStr);
                });
                if (!operations.length) return null;
                const isCollapsed = collapsedTags[tagStr];
                return (
                  <Box key={tagStr} sx={{ mb: 2 }}>
                    <Box 
                      onClick={() => toggleTagCollapse(tagStr)}
                      sx={{ 
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                        cursor: 'pointer', mb: 1.5, px: 0.5, py: 0.5, borderRadius: 1,
                        '&:hover': { bgcolor: 'rgba(0,0,0,0.02)' }
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', fontWeight: 800, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: 'text.disabled' }} /> {tagStr}
                      </Typography>
                      {isCollapsed ? <ExpandMore fontSize="inherit" color="action" sx={{ fontSize: '1rem' }} /> : <ExpandLess fontSize="inherit" color="action" sx={{ fontSize: '1rem' }} />}
                    </Box>
                    <Collapse in={!isCollapsed}>
                      {operations.map((operation) => {
                        const operationKey = getOperationKey(operation);
                        const isSelected = selectedOperationIds.has(operationKey);
                        const risk = getOperationRisk(operation.method);
                        return (
                          <ListItemButton
                            key={operationKey}
                            selected={isSelected}
                            onClick={() => toggleOperation(operationKey)}
                            sx={{
                            alignItems: 'flex-start',
                            borderRadius: 2.5,
                            mb: 1,
                            px: 1.5,
                            py: 1.5,
                            bgcolor: isSelected ? 'rgba(99, 102, 241, 0.04)' : '#ffffff',
                            border: '1px solid',
                            borderColor: isSelected ? 'primary.main' : 'rgba(0, 0, 0, 0.04)',
                            boxShadow: isSelected ? '0 4px 12px rgba(99, 102, 241, 0.08)' : '0 2px 8px -2px rgba(15, 23, 42, 0.02)',
                            transition: 'all 0.2s',
                            position: 'relative',
                            overflow: 'hidden',
                            '&:hover': { 
                                bgcolor: isSelected ? 'rgba(99, 102, 241, 0.08)' : '#ffffff',
                                borderColor: isSelected ? 'primary.main' : 'rgba(99, 102, 241, 0.3)',
                                transform: 'translateY(-2px)',
                                boxShadow: '0 8px 16px -4px rgba(15, 23, 42, 0.06)'
                            },
                          }}
                        >
                          {isSelected && (
                            <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: 'linear-gradient(180deg, #6366f1, #ec4899)' }} />
                          )}
                          <Stack spacing={1} sx={{ width: '100%', minWidth: 0, pl: isSelected ? 0.5 : 0 }}>
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                              <Chip
                                size="small"
                                label={operation.method}
                                color={METHOD_COLORS[operation.method] || 'default'}
                                variant={isSelected ? 'filled' : 'outlined'}
                                sx={{ minWidth: 46, fontSize: '0.65rem', fontWeight: 900, height: 22, borderRadius: 1.5, '& .MuiChip-label': { px: 1 } }}
                              />
                              <Typography
                                variant="body2"
                                noWrap
                                sx={{ flex: 1, minWidth: 0, fontWeight: isSelected ? 800 : 700, color: isSelected ? 'primary.main' : 'text.primary' }}
                              >
                                {operation.summary || operation.path}
                              </Typography>
                            </Stack>
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                              <Typography variant="caption" noWrap sx={{ flex: 1, minWidth: 0, fontFamily: 'monospace', color: 'text.secondary', bgcolor: 'rgba(0,0,0,0.02)', px: 0.5, borderRadius: 1 }}>
                                {operation.path}
                              </Typography>
                              <Chip size="small" label={risk.label} color={risk.color} variant={risk.color === 'error' ? 'filled' : 'outlined'} sx={{ height: 18, fontSize: '0.65rem', borderRadius: 1 }} />
                            </Stack>
                          </Stack>
                        </ListItemButton>
                      );
                    })}
                    </Collapse>
                  </Box>
                );
              })}
            </List>
          </Box>

          <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider', background: 'rgba(255, 255, 255, 0.8)', backdropFilter: 'blur(10px)', width: 320 }}>
            <Stack spacing={1.5}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="subtitle2" fontWeight={800} color="text.secondary">已选范围</Typography>
                <Chip size="small" label={`${selectedOperationIds.size} 个接口`} color={selectedOperationIds.size ? 'primary' : 'default'} variant={selectedOperationIds.size ? 'filled' : 'outlined'} sx={{ fontWeight: 800 }} />
              </Stack>
              {selectedPreview.length ? (
                <Stack spacing={1}>
                  {selectedPreview.map((operation) => (
                    <Box key={getOperationKey(operation)} sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: METHOD_COLORS[operation.method] ? `${METHOD_COLORS[operation.method]}.main` : 'text.disabled' }} />
                      <Typography variant="caption" noWrap sx={{ flex: 1, fontWeight: 700, color: 'text.primary' }}>
                        {operation.summary || operation.path}
                      </Typography>
                    </Box>
                  ))}
                  {selectedOperations.length > selectedPreview.length && (
                    <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', mt: 0.5 }}>
                      ... 另有 {selectedOperations.length - selectedPreview.length} 个接口
                    </Typography>
                  )}
                </Stack>
              ) : (
                <Typography variant="caption" color="text.secondary" sx={{ py: 1, textAlign: 'center' }}>尚未选择任何接口</Typography>
              )}
              <Button 
                variant={selectedOperationIds.size ? 'contained' : 'outlined'} 
                fullWidth 
                onClick={() => setActiveStep(1)}
                sx={{ 
                  borderRadius: 2, 
                  py: 1,
                  fontWeight: 800,
                  ...(selectedOperationIds.size && {
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                    boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                    }
                  })
                }}
              >
                前往挑选范围工作台
              </Button>
            </Stack>
          </Box>
        </>
      ) : (
        <Box sx={{ p: 2, flex: 1, display: 'flex', alignItems: 'center' }}>
          <EmptyState compact title="尚未导入" description="导入 OpenAPI 后，可在这里浏览接口目录。" />
        </Box>
      )}
      </Box>
      </Paper>
    </Box>
  );
}
