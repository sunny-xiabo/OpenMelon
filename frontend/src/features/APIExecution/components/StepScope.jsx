import React from 'react';
import { Stack, Box, Typography, Button, Checkbox, Chip, Paper, TextField, TableContainer, Table, TableHead, TableRow, TableCell, TableBody } from '@mui/material';
import { useAPIExecution } from '../context';
import SectionCard from './SectionCard';
import EmptyState from '../../../components/EmptyState';
import { METHOD_COLORS } from '../constants';

export default function StepScope() {
  const {
    spec, selectedOperationIds, generateDsl, visibleOperationIds, toggleVisibleOperations,
    filteredOperations, toggleOperation, searchText, setSearchText
  } = useAPIExecution();

  return (
    <>
    <Stack spacing={3}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="h5" fontWeight={800}>步骤 2: 选择执行范围</Typography>
                  <Button variant="contained" color="primary" disabled={!selectedOperationIds.size} onClick={() => generateDsl()}>
                    生成测试脚本 ({selectedOperationIds.size})
                  </Button>
                </Box>
                
                <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                  <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                    <TextField fullWidth size="small" placeholder="搜索接口..." value={searchText} onChange={e => setSearchText(e.target.value)} />
                    <Button variant="outlined" onClick={toggleVisibleOperations} sx={{ whiteSpace: 'nowrap' }}>全选/取消</Button>
                  </Box>

                  <TableContainer sx={{ maxHeight: 500, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell padding="checkbox"></TableCell>
                          <TableCell>方法</TableCell>
                          <TableCell>路径</TableCell>
                          <TableCell>描述</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {filteredOperations.map(op => {
                          const opKey = `${op.method}-${op.path}-${op.operation_id}`;
                          const isSelected = selectedOperationIds.has(op.id || opKey);
                          return (
                            <TableRow key={opKey} hover onClick={() => toggleOperation(op.id || opKey)} sx={{ cursor: 'pointer' }}>
                              <TableCell padding="checkbox"><Checkbox size="small" checked={isSelected} /></TableCell>
                              <TableCell><Chip size="small" label={op.method} color={METHOD_COLORS[op.method] || 'default'} variant="outlined" sx={{ fontWeight: 800 }} /></TableCell>
                              <TableCell sx={{ fontFamily: 'monospace' }}>{op.path}</TableCell>
                              <TableCell color="text.secondary">{op.summary}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              </Stack>
  </>
  );
}
