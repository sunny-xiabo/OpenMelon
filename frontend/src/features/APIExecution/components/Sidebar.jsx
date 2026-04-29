import React from 'react';
import { Paper, Box, Typography, TextField, Stack, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Chip, Collapse } from '@mui/material';
import { AutoAwesomeOutlined, RouteOutlined } from '@mui/icons-material';
import { useAPIExecution } from '../context';
import EmptyState from '../../../components/EmptyState';
import { METHOD_COLORS } from '../constants';
import { getTagNames } from '../utils';

export default function Sidebar() {
  const {
    spec, searchText, setSearchText, tagOptions, filteredOperations, 
    toggleOperation, selectedOperationIds, activeStep
  } = useAPIExecution();

  return (
    <>
    {/* LEFT SIDEBAR - API Flow */}
      <Paper elevation={0} sx={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', bgcolor: '#ffffff', borderRight: '1px solid', borderColor: 'divider', borderRadius: 0 }}>
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <AutoAwesomeOutlined color="primary" />
          <Typography variant="h6" fontWeight={800} sx={{ letterSpacing: 0.5 }}>APIFlow</Typography>
        </Box>
        
        <Box sx={{ p: 2, flex: 1, overflow: 'auto' }}>
          {spec ? (
            <Stack spacing={2}>
              <Box>
                <Typography variant="overline" color="primary" sx={{ fontWeight: 700, letterSpacing: 1 }}>{spec.info?.title || '已导入 API'}</Typography>
                <Typography variant="body2" color="text.secondary">{spec.operation_count || 0} 个接口</Typography>
              </Box>
              
              <List disablePadding>
                {tagOptions.map(tag => {
                  const tagStr = typeof tag === 'string' ? tag : JSON.stringify(tag);
                  const ops = (spec.operations || []).filter(op => (op.tags || []).some(t => (typeof t === 'string' ? t : JSON.stringify(t)) === tagStr));
                  if (!ops.length) return null;
                  return (
                    <Box key={tagStr} sx={{ mb: 1 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', ml: 1 }}>{tagStr}</Typography>
                      {ops.map(op => {
                        const opKey = `${op.method}-${op.path}-${op.operation_id}`;
                        const isSelected = selectedOperationIds.has(op.id || opKey);
                        return (
                          <ListItemButton key={opKey} sx={{ borderRadius: 1.5, mb: 0.5, py: 0.5, '&:hover': { bgcolor: 'action.hover' } }} selected={isSelected} onClick={() => toggleOperation(op.id || opKey)}>
                            <Chip size="small" label={op.method} color={METHOD_COLORS[op.method] || 'default'} variant={isSelected ? "filled" : "outlined"} sx={{ minWidth: 46, fontSize: 10, fontWeight: 800, height: 20, mr: 1, '& .MuiChip-label': { px: 1 } }} />
                            <Typography variant="body2" noWrap sx={{ fontSize: 13, color: isSelected ? 'text.primary' : 'text.secondary', fontWeight: isSelected ? 700 : 400 }}>{op.summary || op.path}</Typography>
                          </ListItemButton>
                        );
                      })}
                    </Box>
                  )
                })}
              </List>
            </Stack>
          ) : (
            <EmptyState compact title="尚未导入" description="请先完成步骤 1 导入 API 规范" />
          )}
        </Box>
      </Paper>
  </>
  );
}
