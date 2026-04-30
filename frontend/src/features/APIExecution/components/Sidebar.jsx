import React from 'react';
import { Paper, Box, Typography, TextField, Stack, List, ListItemButton, Chip, Button, Divider } from '@mui/material';
import { RouteOutlined } from '@mui/icons-material';
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

  const selectedOperations = (spec?.operations || []).filter((operation) => selectedOperationIds.has(getOperationKey(operation)));
  const selectedPreview = selectedOperations.slice(0, 5);
  const groupedTags = [...tagOptions.map(formatTag), '未分组'];

  return (
    <Paper
      elevation={0}
      sx={{
        width: 300,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: '#ffffff',
        borderRight: '1px solid',
        borderColor: 'divider',
        borderRadius: 0,
        minHeight: 0,
      }}
    >
      <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <RouteOutlined color="primary" />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" fontWeight={800}>API 目录</Typography>
            <Typography variant="caption" color="text.secondary">接口资产导航与范围状态</Typography>
          </Box>
        </Stack>
      </Box>

      {spec ? (
        <>
          <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Stack spacing={1.5}>
              <Box>
                <Typography variant="overline" color="primary" sx={{ fontWeight: 700, letterSpacing: 0.8 }}>
                  {spec.info?.title || '已导入 API'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {spec.operation_count || 0} 个接口 · 已选 {selectedOperationIds.size} 个
                </Typography>
              </Box>
              <TextField
                size="small"
                placeholder="搜索接口 / 路径 / 方法"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                fullWidth
              />
            </Stack>
          </Box>

          <Box sx={{ p: 1.5, flex: 1, overflow: 'auto', minHeight: 0 }}>
            <List disablePadding>
              {groupedTags.map((tagStr) => {
                const operations = filteredOperations.filter((operation) => {
                  const tags = (operation.tags || []).map(formatTag);
                  return tagStr === '未分组' ? !tags.length : tags.includes(tagStr);
                });
                if (!operations.length) return null;
                return (
                  <Box key={tagStr} sx={{ mb: 1.5 }}>
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', ml: 1, mb: 0.5, display: 'block' }}
                    >
                      {tagStr}
                    </Typography>
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
                            borderRadius: 1.5,
                            mb: 0.75,
                            px: 1,
                            py: 1,
                            border: '1px solid',
                            borderColor: isSelected ? 'primary.main' : 'transparent',
                            bgcolor: isSelected ? 'primary.light' : 'transparent',
                            '&:hover': { bgcolor: isSelected ? 'primary.light' : 'action.hover' },
                          }}
                        >
                          <Stack spacing={0.75} sx={{ width: '100%', minWidth: 0 }}>
                            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
                              <Chip
                                size="small"
                                label={operation.method}
                                color={METHOD_COLORS[operation.method] || 'default'}
                                variant={isSelected ? 'filled' : 'outlined'}
                                sx={{ minWidth: 46, fontSize: 10, fontWeight: 800, height: 20, '& .MuiChip-label': { px: 1 } }}
                              />
                              <Typography
                                variant="body2"
                                noWrap
                                sx={{ flex: 1, minWidth: 0, fontWeight: isSelected ? 800 : 600, color: 'text.primary' }}
                              >
                                {operation.summary || operation.path}
                              </Typography>
                            </Stack>
                            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
                              <Typography variant="caption" noWrap sx={{ flex: 1, minWidth: 0, fontFamily: 'monospace', color: 'text.secondary' }}>
                                {operation.path}
                              </Typography>
                              <Chip size="small" label={risk.label} color={risk.color} variant="outlined" sx={{ height: 20, fontSize: 10 }} />
                            </Stack>
                          </Stack>
                        </ListItemButton>
                      );
                    })}
                  </Box>
                );
              })}
            </List>
          </Box>

          <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}>
            <Stack spacing={1.25}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="subtitle2" fontWeight={800}>已选范围</Typography>
                <Chip size="small" label={`${selectedOperationIds.size} 个`} color={selectedOperationIds.size ? 'primary' : 'default'} variant="outlined" />
              </Stack>
              {selectedPreview.length ? (
                <Stack spacing={0.75}>
                  {selectedPreview.map((operation) => (
                    <Box key={getOperationKey(operation)} sx={{ minWidth: 0 }}>
                      <Typography variant="caption" noWrap sx={{ display: 'block', fontWeight: 700 }}>
                        {operation.method} {operation.summary || operation.path}
                      </Typography>
                      <Typography variant="caption" noWrap sx={{ display: 'block', color: 'text.secondary', fontFamily: 'monospace' }}>
                        {operation.path}
                      </Typography>
                    </Box>
                  ))}
                  {selectedOperations.length > selectedPreview.length && (
                    <Typography variant="caption" color="text.secondary">
                      另有 {selectedOperations.length - selectedPreview.length} 个接口，请到挑选范围查看
                    </Typography>
                  )}
                </Stack>
              ) : (
                <Typography variant="caption" color="text.secondary">尚未选择接口</Typography>
              )}
              <Divider />
              <Button variant="outlined" size="small" fullWidth onClick={() => setActiveStep(1)}>
                去挑选范围
              </Button>
              {/* TODO(APIFlow): 后期单独设计真正的流程编排能力，包括拖拽排序、接口依赖关系图、变量流转图、token 传递可视化和链路模板保存。 */}
            </Stack>
          </Box>
        </>
      ) : (
        <Box sx={{ p: 2, flex: 1, display: 'flex', alignItems: 'center' }}>
          <EmptyState compact title="尚未导入" description="导入 OpenAPI 后，可在这里浏览接口目录。" />
        </Box>
      )}
    </Paper>
  );
}
