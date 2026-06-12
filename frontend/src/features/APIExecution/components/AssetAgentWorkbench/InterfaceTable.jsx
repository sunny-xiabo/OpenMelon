import React from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { InfoOutlined } from '@mui/icons-material';
import EmptyState from '../../../../components/EmptyState';
import { METHOD_COLORS } from '../../constants';
import { formatRunTime, getRunStatusMeta } from '../../utils';
import { ACTIVE_STATUSES, RISK_META, STATUS_META, getInterfaceLabel } from './constants';

export default function InterfaceTable({ filteredInterfaces, selectedInterfaceIds, showAgentActions, isLoading, toggleInterface, openDetail }) {
  return (
    <TableContainer sx={{ maxHeight: 520, borderRadius: 2, border: '1px solid rgba(15, 23, 42, 0.08)', bgcolor: '#ffffff' }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            {showAgentActions && <TableCell padding="checkbox" />}
            <TableCell>方法</TableCell>
            <TableCell>接口</TableCell>
            <TableCell>模块</TableCell>
            <TableCell>风险</TableCell>
            <TableCell>状态</TableCell>
            <TableCell>最近测试</TableCell>
            <TableCell align="right">详情</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredInterfaces.map((item) => {
            const selected = selectedInterfaceIds.has(item.interface_id);
            const risk = RISK_META[item.risk_level] || { label: item.risk_level || '未知', color: 'default' };
            const status = STATUS_META[item.status] || { label: item.status || '未知', color: 'default' };
            const testStatus = getRunStatusMeta(item.last_test_status);
            const disabled = !ACTIVE_STATUSES.has(item.status);
            return (
              <TableRow key={item.interface_id} hover selected={selected} sx={{ opacity: disabled ? 0.55 : 1 }}>
                {showAgentActions && (
                  <TableCell padding="checkbox">
                    <Checkbox size="small" checked={selected} disabled={disabled} onChange={() => toggleInterface(item.interface_id)} />
                  </TableCell>
                )}
                <TableCell>
                  <Chip size="small" label={item.method} color={METHOD_COLORS[item.method] || 'default'} variant="outlined" sx={{ fontWeight: 800 }} />
                </TableCell>
                <TableCell sx={{ minWidth: 240 }}>
                  <Typography variant="body2" fontWeight={700}>{item.summary || getInterfaceLabel(item)}</Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }} color="text.secondary">{item.path}</Typography>
                </TableCell>
                <TableCell>{item.module_name || item.module_key || '-'}</TableCell>
                <TableCell><Chip size="small" label={risk.label} color={risk.color} variant={item.risk_level === 'high' || item.risk_level === 'blocked' ? 'filled' : 'outlined'} /></TableCell>
                <TableCell><Chip size="small" label={status.label} color={status.color} variant="outlined" /></TableCell>
                <TableCell>
                  {item.last_test_status ? (
                    <Stack spacing={0.25}>
                      <Chip size="small" label={testStatus.label} color={testStatus.color} variant="outlined" />
                      <Typography variant="caption" color="text.secondary">{formatRunTime(item.last_tested_at)}</Typography>
                    </Stack>
                  ) : (
                    <Typography variant="caption" color="text.secondary">未测试</Typography>
                  )}
                </TableCell>
                <TableCell align="right">
                  <Button size="small" startIcon={<InfoOutlined />} onClick={() => openDetail(item)}>查看</Button>
                </TableCell>
              </TableRow>
            );
          })}
          {!filteredInterfaces.length && (
            <TableRow>
              <TableCell colSpan={showAgentActions ? 8 : 7}>
                <EmptyState compact title={isLoading ? '接口资产准备中' : '没有匹配接口'} description="请调整筛选条件，或先完成 OpenAPI 导入和项目资产同步。" />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
