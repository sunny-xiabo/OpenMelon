import { Box, Button, Chip, Paper, TextField, Typography, Stack, Tooltip } from '@mui/material';
import { getCategoryChipColor } from '../utils';
import { alpha } from '@mui/material/styles';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';

const tooltipProps = {
  arrow: true,
  enterDelay: 300,
  componentsProps: {
    tooltip: {
      sx: {
        maxWidth: 360,
        fontSize: 11,
        lineHeight: 1.6,
        whiteSpace: 'normal',
      },
    },
  },
};

export default function NodeTypeCardGrid({
  items,
  nodeTypeOverrides,
  onDelete,
  onEdit,
  onResetOverride,
  onUpdateOverride,
}) {
  return (
    <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
      {items.map(({ type, category, color, size, locked, constraints }) => {
        const hasBgOverride = !!nodeTypeOverrides[type]?.bg;
        const hasBorderOverride = !!nodeTypeOverrides[type]?.border;
        const hasSizeOverride = nodeTypeOverrides[type]?.size !== undefined;
        const isCustomized = hasBgOverride || hasBorderOverride || hasSizeOverride;
        
        const currentBg = nodeTypeOverrides[type]?.bg || color.bg;
        const currentBorder = nodeTypeOverrides[type]?.border || color.border;
        const currentSize = nodeTypeOverrides[type]?.size ?? size;
        const defaultSummary = `系统默认: ${color.bg} / ${color.border} / 尺寸 ${size}`;
        const constraintSummary = constraints?.length ? constraints.join(' ') : '暂无 Neo4j 拓扑约束属性限制说明。';

        return (
          <Paper
            key={type}
            elevation={0}
            sx={{
              p: 2.25,
              borderRadius: 4.5,
              border: '1px solid',
              borderColor: alpha(currentBg, 0.15),
              background: `linear-gradient(185deg, ${alpha(currentBg, 0.08)} 0%, rgba(255, 255, 255, 0.8) 100%)`,
              backdropFilter: 'blur(8px)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.01), inset 0 1px 0 rgba(255,255,255,0.6)',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              '&:hover': {
                transform: 'translateY(-3px)',
                borderColor: alpha(currentBg, 0.45),
                boxShadow: `0 12px 36px ${alpha(currentBg, 0.12)}, inset 0 1px 0 rgba(255,255,255,0.8)`,
              }
            }}
          >
            <Box>
              {/* Card Header */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                  <Box 
                    sx={{ 
                      width: 14, 
                      height: 14, 
                      borderRadius: '50%', 
                      bgcolor: currentBg, 
                      border: '1px solid', 
                      borderColor: currentBorder, 
                      boxShadow: `0 0 10px ${alpha(currentBg, 0.6)}`,
                      flexShrink: 0 
                    }} 
                  />
                  <Tooltip title={type} {...tooltipProps}>
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{ fontWeight: 900, color: 'slate.900', minWidth: 0, maxWidth: 150 }}
                    >
                      {type}
                    </Typography>
                  </Tooltip>
                </Box>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" justifyContent="flex-end">
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
                </Stack>
              </Box>

              {/* Sub-details */}
              <Tooltip title={defaultSummary} {...tooltipProps}>
                <Typography
                  variant="caption"
                  noWrap
                  sx={{
                    color: 'text.secondary',
                    display: 'block',
                    fontWeight: 600,
                    fontSize: '10px',
                    maxWidth: '100%',
                    cursor: 'help',
                  }}
                >
                  {defaultSummary}
                </Typography>
              </Tooltip>
              
              <Tooltip title={constraintSummary} {...tooltipProps}>
                <Typography 
                  variant="caption" 
                  component="p"
                  style={{ WebkitBoxOrient: 'vertical' }}
                  sx={{ 
                    color: 'text.secondary', 
                    display: '-webkit-box', 
                    m: 0,
                    mt: 0.75,
                    minHeight: 33,
                    maxHeight: 33,
                    fontSize: '11px',
                    fontWeight: 500,
                    lineHeight: 1.5,
                    overflow: 'hidden',
                    WebkitLineClamp: 2,
                    textOverflow: 'ellipsis',
                    cursor: 'help'
                  }}
                >
                  {constraintSummary}
                </Typography>
              </Tooltip>
            </Box>

            <Box sx={{ mt: 2 }}>
              {/* Overridden state indicator */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.25 }}>
                <Typography variant="caption" sx={{ color: 'slate.400', fontWeight: 700, fontSize: '10px' }}>
                  前端覆盖控制台
                </Typography>
                {isCustomized && (
                  <Chip 
                    size="small"
                    label="已本地覆盖"
                    sx={{
                      height: 16,
                      fontSize: '8px',
                      fontWeight: 900,
                      bgcolor: 'rgba(14, 165, 233, 0.08)',
                      color: 'primary.main',
                      border: 'none',
                    }}
                  />
                )}
              </Box>

              {/* Front-end overwrite editor panel */}
              <Box 
                sx={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', 
                  gap: 1.5, 
                  p: 1.5, 
                  borderRadius: 3.5, 
                  bgcolor: 'rgba(0,0,0,0.015)',
                  border: '1px solid rgba(0,0,0,0.02)'
                }}
              >
                <TextField
                  size="small"
                  type="color"
                  label="填充色"
                  value={currentBg}
                  onChange={(e) => onUpdateOverride(type, { bg: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  sx={{ 
                    '& .MuiOutlinedInput-root': { 
                      borderRadius: 1.8, 
                      fontSize: '11px', 
                      height: 32,
                      bgcolor: 'white',
                      '& input': { p: 0.5 }
                    } 
                  }}
                />
                <TextField
                  size="small"
                  type="color"
                  label="边框色"
                  value={currentBorder}
                  onChange={(e) => onUpdateOverride(type, { border: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  sx={{ 
                    '& .MuiOutlinedInput-root': { 
                      borderRadius: 1.8, 
                      fontSize: '11px', 
                      height: 32,
                      bgcolor: 'white',
                      '& input': { p: 0.5 }
                    } 
                  }}
                />
                <TextField
                  size="small"
                  type="number"
                  label="直径尺寸"
                  value={currentSize}
                  onChange={(e) => onUpdateOverride(type, { size: parseInt(e.target.value, 10) || 8 })}
                  inputProps={{ min: 8, max: 60 }}
                  InputLabelProps={{ shrink: true }}
                  sx={{ 
                    '& .MuiOutlinedInput-root': { 
                      borderRadius: 1.8, 
                      fontSize: '11px', 
                      height: 32,
                      bgcolor: 'white',
                      fontWeight: 700,
                    } 
                  }}
                />
                <Button 
                  size="small" 
                  variant="text" 
                  startIcon={<SettingsBackupRestoreIcon style={{ fontSize: 12 }} />}
                  disabled={!isCustomized}
                  onClick={() => onResetOverride(type)}
                  sx={{ 
                    fontSize: '10px', 
                    fontWeight: 800,
                    color: 'primary.main',
                    '&.Mui-disabled': { color: 'text.disabled' }
                  }}
                >
                  恢复默认
                </Button>
              </Box>

              {/* Bottom Config Actions */}
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.5, mt: 2 }}>
                <Button 
                  size="small" 
                  variant="outlined" 
                  startIcon={<EditOutlinedIcon sx={{ fontSize: 12 }} />}
                  onClick={() => onEdit({ type, category, color, size, locked, constraints })}
                  sx={{
                    height: 28,
                    borderRadius: 2,
                    fontSize: '11px',
                    fontWeight: 800,
                    borderColor: 'rgba(0,0,0,0.06)',
                    bgcolor: 'white',
                    '&:hover': { bgcolor: 'rgba(14, 165, 233, 0.04)', borderColor: 'primary.main' }
                  }}
                >
                  编辑配置
                </Button>
                <Button 
                  size="small" 
                  variant="outlined" 
                  color="error" 
                  disabled={locked} 
                  startIcon={<DeleteOutlineIcon sx={{ fontSize: 12 }} />}
                  onClick={() => onDelete({ type })}
                  sx={{
                    height: 28,
                    borderRadius: 2,
                    fontSize: '11px',
                    fontWeight: 800,
                    borderColor: 'rgba(239, 68, 68, 0.1)',
                    bgcolor: 'white',
                    '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.03)', borderColor: 'error.main' },
                    '&.Mui-disabled': { borderColor: 'rgba(0,0,0,0.03)' }
                  }}
                >
                  删除类型
                </Button>
              </Box>
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
}
