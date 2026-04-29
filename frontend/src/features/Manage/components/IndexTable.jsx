import {
  Checkbox,
  Chip,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
} from '@mui/material';
import { Delete as DeleteIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import EmptyState from '../../../components/EmptyState';
import StatusBadge from '../../../components/StatusBadge';
import { formatIndexedTime } from '../utils';

export default function IndexTable({
  doDelete,
  doReindex,
  paginatedFiles,
  selected,
  toggleAll,
  toggleOne,
}) {
  return (
    <TableContainer sx={{ flex: 1, overflow: 'auto', bgcolor: 'background.paper' }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox">
              <Checkbox
                checked={selected.size > 0 && selected.size === paginatedFiles.length}
                onChange={toggleAll}
              />
            </TableCell>
            <TableCell>文件名</TableCell>
            <TableCell>文档类型</TableCell>
            <TableCell>模块</TableCell>
            <TableCell align="center">分块数</TableCell>
            <TableCell>导入时间</TableCell>
            <TableCell align="center">状态</TableCell>
            <TableCell align="center">操作</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {paginatedFiles.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                <EmptyState
                  title="暂无已导入文件"
                  description="上传文档后，这里会展示索引状态、分块数量和后续操作入口。"
                  compact
                />
              </TableCell>
            </TableRow>
          ) : (
            paginatedFiles.map((file) => (
              <TableRow
                key={file.id}
                selected={selected.has(file.id)}
                hover
              >
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selected.has(file.id)}
                    onChange={() => toggleOne(file.id)}
                  />
                </TableCell>
                <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: '#1e293b' }}>
                  <Tooltip title={file.filename} placement="top-start" arrow>
                    <span>{file.filename}</span>
                  </Tooltip>
                </TableCell>
                <TableCell sx={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#475569' }}>
                  <Tooltip title={file.doc_type || '-'} placement="top" arrow>
                    <span>{file.doc_type || '-'}</span>
                  </Tooltip>
                </TableCell>
                <TableCell sx={{ maxWidth: 130 }}>
                  {file.module ? (
                    <Tooltip title={file.module} placement="top" arrow>
                      <Chip size="small" label={file.module} sx={{ maxWidth: 120, borderRadius: 1.5, bgcolor: 'rgba(245,158,11,0.1)', color: '#d97706', fontWeight: 500, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }} />
                    </Tooltip>
                  ) : '-'}
                </TableCell>
                <TableCell align="center">{file.chunk_count}</TableCell>
                <TableCell sx={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <Tooltip title={formatIndexedTime(file.indexed_at)} placement="top" arrow>
                    <span>{formatIndexedTime(file.indexed_at)}</span>
                  </Tooltip>
                </TableCell>
                <TableCell align="center">
                  <StatusBadge status={file.status} />
                </TableCell>
                <TableCell align="center">
                  <Tooltip title="重新索引">
                    <IconButton size="small" color="warning" onClick={() => doReindex(file.id, file.filename)}>
                      <RefreshIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="删除">
                    <IconButton size="small" color="error" onClick={() => doDelete(file.id, file.filename)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
