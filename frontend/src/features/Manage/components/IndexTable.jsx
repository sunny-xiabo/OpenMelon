import {
  Box,
  Checkbox,
  Chip,
  IconButton,
  TableCell,
  TableContainer,
  Tooltip,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Delete as DeleteIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import EmptyState from '../../../components/EmptyState';
import StatusBadge from '../../../components/StatusBadge';
import VirtualizedList from '../../../components/VirtualizedList';
import { formatIndexedTime } from '../utils';

const gridColumns = '52px minmax(180px, 2fr) minmax(110px, 1fr) minmax(120px, 1fr) 92px 140px 100px 96px';

function HeaderCell({ children, align = 'left', sx }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: align === 'center' ? 'center' : 'flex-start',
        minWidth: 0,
        px: 2,
        py: 1,
        fontSize: 12,
        fontWeight: 800,
        color: 'text.secondary',
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

export default function IndexTable({
  doDelete,
  doReindex,
  paginatedFiles,
  selected,
  toggleAll,
  toggleOne,
}) {
  return (
    <TableContainer sx={{ flex: 1, overflow: 'hidden', background: 'transparent', display: 'flex', flexDirection: 'column' }}>
      <Box
        role="row"
        sx={{
          display: 'grid',
          gridTemplateColumns: gridColumns,
          minWidth: 900,
          position: 'sticky',
          top: 0,
          zIndex: 2,
        }}
      >
        <HeaderCell sx={{ px: 1 }}>
          <Checkbox
            checked={selected.size > 0 && selected.size === paginatedFiles.length}
            onChange={toggleAll}
          />
        </HeaderCell>
        <HeaderCell>文件名</HeaderCell>
        <HeaderCell>文档类型</HeaderCell>
        <HeaderCell>模块</HeaderCell>
        <HeaderCell align="center">分块数</HeaderCell>
        <HeaderCell>导入时间</HeaderCell>
        <HeaderCell align="center">状态</HeaderCell>
        <HeaderCell align="center">操作</HeaderCell>
      </Box>

      {paginatedFiles.length === 0 ? (
        <TableCell component="div" align="center" sx={{ py: 3, display: 'block', borderBottom: 0 }}>
          <EmptyState
            title="暂无已导入文件"
            description="上传文档后，这里会展示索引状态、分块数量和后续操作入口。"
            compact
          />
        </TableCell>
      ) : (
        <VirtualizedList
          ariaLabel="已导入文件列表"
          estimateSize={56}
          items={paginatedFiles}
          overscan={6}
          sx={{ flex: 1, minHeight: 0, overflowX: 'auto' }}
          renderItem={(file, index) => (
            <Box
              key={file.id}
              role="row"
              aria-selected={selected.has(file.id)}
              sx={{
                display: 'grid',
                gridTemplateColumns: gridColumns,
                minWidth: 900,
                minHeight: 56,
                alignItems: 'center',
                bgcolor: selected.has(file.id) ? 'action.selected' : 'transparent',
                borderBottom: '1px solid',
                borderColor: 'divider',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
                '&:hover': {
                  bgcolor: 'rgba(99, 102, 241, 0.04)',
                },
              }}
              style={{ animationDelay: `${Math.min(index, 8) * 0.04}s` }}
            >
              <TableCell component="div" padding="checkbox" sx={{ borderBottom: 0 }}>
                <Checkbox
                  checked={selected.has(file.id)}
                  onChange={() => toggleOne(file.id)}
                />
              </TableCell>
              <TableCell component="div" sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: 'slate.800', borderBottom: 0 }}>
                <Tooltip title={file.filename} placement="top-start" arrow>
                  <span>{file.filename}</span>
                </Tooltip>
              </TableCell>
              <TableCell component="div" sx={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'slate.600', borderBottom: 0 }}>
                <Tooltip title={file.doc_type || '-'} placement="top" arrow>
                  <span>{file.doc_type || '-'}</span>
                </Tooltip>
              </TableCell>
              <TableCell component="div" sx={{ maxWidth: 130, borderBottom: 0 }}>
                {file.module ? (
                  <Tooltip title={file.module} placement="top" arrow>
                    <Chip size="small" label={file.module} sx={{ maxWidth: 120, borderRadius: 1.5, bgcolor: (theme) => alpha(theme.palette.accent.amber, 0.1), color: 'accent.amberDark', fontWeight: 500, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }} />
                  </Tooltip>
                ) : '-'}
              </TableCell>
              <TableCell component="div" align="center" sx={{ borderBottom: 0 }}>{file.chunk_count}</TableCell>
              <TableCell component="div" sx={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderBottom: 0 }}>
                <Tooltip title={formatIndexedTime(file.indexed_at)} placement="top" arrow>
                  <span>{formatIndexedTime(file.indexed_at)}</span>
                </Tooltip>
              </TableCell>
              <TableCell component="div" align="center" sx={{ borderBottom: 0 }}>
                <StatusBadge status={file.status} />
              </TableCell>
              <TableCell component="div" align="center" sx={{ borderBottom: 0 }}>
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
            </Box>
          )}
        />
      )}
    </TableContainer>
  );
}
