import {
  Box,
  Button,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { getCategoryChipColor } from '../utils';
import { alpha } from '@mui/material/styles';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';

export default function NodeTypeTable({
  items,
  nodeTypeOverrides,
  onDelete,
  onEdit,
  onResetOverride,
  onUpdateOverride,
}) {
  return (
    <TableContainer 
      sx={{ 
        border: '1px solid rgba(0, 0, 0, 0.05)', 
        borderRadius: 4, 
        bgcolor: 'white',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.6)',
        overflow: 'hidden'
      }}
    >
      <Table size="small">
        <TableHead>
          <TableRow
            sx={{
              '& th': {
                bgcolor: 'rgba(241, 245, 249, 0.6)',
                color: 'text.secondary',
                fontWeight: 800,
                fontSize: '11px',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
                py: 1.5,
              }
            }}
          >
            <TableCell sx={{ pl: 2.5 }}>Label / 节点类型</TableCell>
            <TableCell>业务分类</TableCell>
            <TableCell>后端配置默认</TableCell>
            <TableCell sx={{ minWidth: 260 }}>前端本地样式覆盖</TableCell>
            <TableCell>拓扑约束限制说明</TableCell>
            <TableCell align="right" sx={{ pr: 2.5 }}>操作面板</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map(({ type, category, color, size, locked, constraints }) => {
            const hasBgOverride = !!nodeTypeOverrides[type]?.bg;
            const hasBorderOverride = !!nodeTypeOverrides[type]?.border;
            const hasSizeOverride = nodeTypeOverrides[type]?.size !== undefined;
            const isCustomized = hasBgOverride || hasBorderOverride || hasSizeOverride;

            const currentBg = nodeTypeOverrides[type]?.bg || color.bg;
            const currentBorder = nodeTypeOverrides[type]?.border || color.border;
            const currentSize = nodeTypeOverrides[type]?.size ?? size;

            return (
              <TableRow 
                key={type} 
                hover
                sx={{
                  transition: 'background-color 0.2s',
                  '&:hover': { bgcolor: 'rgba(14, 165, 233, 0.015) !important' },
                  '& td': { borderBottom: '1px solid rgba(0, 0, 0, 0.03)', py: 1.5 }
                }}
              >
                <TableCell sx={{ pl: 2.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box 
                      sx={{ 
                        width: 12, 
                        height: 12, 
                        borderRadius: '50%', 
                        bgcolor: currentBg, 
                        border: '1px solid', 
                        borderColor: currentBorder,
                        boxShadow: `0 0 8px ${alpha(currentBg, 0.5)}`
                      }} 
                    />
                    <Typography variant="body2" sx={{ fontWeight: 800, color: 'text.primary', fontSize: '13px' }}>
                      {type}
                    </Typography>
                    {locked && (
                      <Chip 
                        size="small" 
                        label="保留" 
                        sx={{
                          height: 18,
                          fontSize: '9px',
                          fontWeight: 800,
                          bgcolor: 'rgba(0,0,0,0.04)',
                          color: 'text.secondary',
                          border: 'none',
                        }} 
                      />
                    )}
                  </Box>
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={category}
                    color={getCategoryChipColor(category)}
                    variant={category === 'fixed' ? 'filled' : 'outlined'}
                    sx={{
                      height: 18,
                      fontSize: '9px',
                      fontWeight: 800,
                    }}
                  />
                </TableCell>
                <TableCell sx={{ color: 'text.secondary', fontSize: '11px', fontFamily: 'monospace', fontWeight: 600 }}>
                  {color.bg} / {color.border} / {size}
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1, maxWidth: 300 }}>
                    <TextField
                      size="small"
                      type="color"
                      value={currentBg}
                      onChange={(e) => onUpdateOverride(type, { bg: e.target.value })}
                      InputLabelProps={{ shrink: true }}
                      sx={{ 
                        '& .MuiOutlinedInput-root': { 
                          borderRadius: 1.8, 
                          height: 28,
                          bgcolor: 'white',
                          '& input': { p: 0.25 }
                        } 
                      }}
                    />
                    <TextField
                      size="small"
                      type="color"
                      value={currentBorder}
                      onChange={(e) => onUpdateOverride(type, { border: e.target.value })}
                      InputLabelProps={{ shrink: true }}
                      sx={{ 
                        '& .MuiOutlinedInput-root': { 
                          borderRadius: 1.8, 
                          height: 28,
                          bgcolor: 'white',
                          '& input': { p: 0.25 }
                        } 
                      }}
                    />
                    <TextField
                      size="small"
                      type="number"
                      value={currentSize}
                      onChange={(e) => onUpdateOverride(type, { size: parseInt(e.target.value, 10) || 8 })}
                      inputProps={{ min: 8, max: 60 }}
                      sx={{ 
                        '& .MuiOutlinedInput-root': { 
                          borderRadius: 1.8, 
                          height: 28,
                          bgcolor: 'white',
                          fontSize: '11px',
                          fontWeight: 700,
                        } 
                      }}
                    />
                  </Box>
                </TableCell>
                <TableCell sx={{ maxWidth: 320 }}>
                  {constraints?.length ? (
                    <Tooltip title={constraints.join(' ')} arrow enterDelay={300}>
                      <Typography 
                        variant="caption" 
                        style={{ WebkitBoxOrient: 'vertical' }}
                        sx={{ 
                          color: 'text.secondary', 
                          fontWeight: 500, 
                          fontSize: '11px', 
                          lineHeight: 1.4,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          cursor: 'help'
                        }}
                      >
                        {constraints.join(' ')}
                      </Typography>
                    </Tooltip>
                  ) : (
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '11px' }}>
                      -
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right" sx={{ pr: 2.5 }}>
                  <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
                    <Button 
                      size="small" 
                      variant="text" 
                      startIcon={<SettingsBackupRestoreIcon style={{ fontSize: 11 }} />}
                      disabled={!isCustomized}
                      onClick={() => onResetOverride(type)}
                      sx={{ 
                        fontSize: '10px', 
                        fontWeight: 800,
                        color: 'primary.main',
                        '&.Mui-disabled': { color: 'text.disabled' }
                      }}
                    >
                      恢复
                    </Button>
                    <Button 
                      size="small" 
                      variant="outlined" 
                      startIcon={<EditOutlinedIcon sx={{ fontSize: 11 }} />}
                      onClick={() => onEdit({ type, category, color, size, locked, constraints })}
                      sx={{
                        height: 26,
                        borderRadius: 1.8,
                        fontSize: '11px',
                        fontWeight: 800,
                        px: 1.25,
                        borderColor: 'rgba(0,0,0,0.06)',
                        bgcolor: 'white',
                        '&:hover': { bgcolor: 'rgba(14, 165, 233, 0.04)', borderColor: 'primary.main' }
                      }}
                    >
                      编辑
                    </Button>
                    <Button 
                      size="small" 
                      variant="outlined" 
                      color="error" 
                      disabled={locked} 
                      startIcon={<DeleteOutlineIcon sx={{ fontSize: 11 }} />}
                      onClick={() => onDelete({ type })}
                      sx={{
                        height: 26,
                        borderRadius: 1.8,
                        fontSize: '11px',
                        fontWeight: 800,
                        px: 1.25,
                        borderColor: 'rgba(239, 68, 68, 0.1)',
                        bgcolor: 'white',
                        '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.03)', borderColor: 'error.main' },
                        '&.Mui-disabled': { borderColor: 'rgba(0,0,0,0.03)' }
                      }}
                    >
                      删除
                    </Button>
                  </Box>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
