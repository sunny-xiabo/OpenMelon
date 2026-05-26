import {
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Box,
} from '@mui/material';

export default function RecordTable({ rows, type, onEdit, onDelete, skillCategories = [] }) {
  const categoryMap = new Map(skillCategories.map((item) => [item.id, item.name]));

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
            <TableCell sx={{ pl: 2.5 }}>名称</TableCell>
            <TableCell>ID / 路由标识</TableCell>
            {type === 'skill' && <TableCell>业务分类</TableCell>}
            <TableCell>策略描述说明</TableCell>
            <TableCell>部署状态</TableCell>
            <TableCell align="right" sx={{ pr: 2.5 }}>安全维护</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((item) => (
            <TableRow 
              key={item.id} 
              hover
              sx={{
                transition: 'background-color 0.2s',
                '&:hover': { bgcolor: 'rgba(14, 165, 233, 0.015) !important' },
                '& td': { borderBottom: '1px solid rgba(0, 0, 0, 0.03)', py: 1.5 }
              }}
            >
              <TableCell sx={{ pl: 2.5 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" sx={{ fontWeight: 800, color: 'text.primary', fontSize: '13px' }}>
                    {item.name}
                  </Typography>
                  {item.is_default && (
                    <Chip 
                      size="small" 
                      label="默认" 
                      sx={{
                        height: 18,
                        fontSize: '10px',
                        fontWeight: 800,
                        bgcolor: 'rgba(14, 165, 233, 0.08)',
                        color: 'primary.main',
                        border: 'none',
                      }}
                    />
                  )}
                </Stack>
              </TableCell>
              <TableCell sx={{ color: 'text.secondary', fontFamily: 'monospace', fontSize: '11px', fontWeight: 600 }}>
                {item.id}
              </TableCell>
              {type === 'skill' && (
                <TableCell>
                  <Chip
                    size="small"
                    label={categoryMap.get(item.category) || item.category || '未分类'}
                    sx={{
                      height: 18,
                      fontSize: '10px',
                      fontWeight: 800,
                      bgcolor: 'rgba(99, 102, 241, 0.08)',
                      color: '#6366f1',
                      border: 'none',
                    }}
                  />
                </TableCell>
              )}
              <TableCell sx={{ color: 'text.secondary', fontSize: '12px', fontWeight: 500, maxWidth: 350, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.description || '-'}
              </TableCell>
              <TableCell>
                <Chip
                  size="small"
                  label={item.enabled ? '启用中' : '已停用'}
                  sx={{
                    height: 18,
                    fontSize: '10px',
                    fontWeight: 800,
                    bgcolor: item.enabled ? 'rgba(16, 185, 129, 0.08)' : 'rgba(0,0,0,0.05)',
                    color: item.enabled ? '#10b981' : 'text.secondary',
                    border: 'none',
                  }}
                />
              </TableCell>
              <TableCell align="right" sx={{ pr: 2.5 }}>
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <Button 
                    size="small" 
                    variant="outlined"
                    onClick={() => onEdit(item)}
                    sx={{
                      height: 26,
                      borderRadius: 1.8,
                      fontSize: '11px',
                      fontWeight: 800,
                      px: 1.5,
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
                    onClick={() => onDelete(item)}
                    disabled={type === 'template' && item.is_default}
                    sx={{
                      height: 26,
                      borderRadius: 1.8,
                      fontSize: '11px',
                      fontWeight: 800,
                      px: 1.5,
                      borderColor: 'rgba(239, 68, 68, 0.1)',
                      bgcolor: 'white',
                      '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.03)', borderColor: 'error.main' },
                      '&.Mui-disabled': { borderColor: 'rgba(0,0,0,0.03)' }
                    }}
                  >
                    删除
                  </Button>
                </Stack>
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={type === 'skill' ? 6 : 5} sx={{ py: 0 }}>
                <PromptHubEmptyIllustration type={type} />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function PromptHubEmptyIllustration({ type }) {
  return (
    <Stack alignItems="center" spacing={2} sx={{ py: 6 }}>
      <Box 
        component="svg" 
        width={160} 
        height={160} 
        viewBox="0 0 200 200" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        sx={{
          '& .pulse-glow': {
            animation: 'matrixPulseGlow 3s infinite ease-in-out'
          },
          '& .float-chip': {
            animation: 'chipFloat 4s infinite ease-in-out'
          },
          '@keyframes matrixPulseGlow': {
            '0%, 100%': { opacity: 0.15, transform: 'scale(1)' },
            '50%': { opacity: 0.4, transform: 'scale(1.05)' }
          },
          '@keyframes chipFloat': {
            '0%, 100%': { transform: 'translateY(0)' },
            '50%': { transform: 'translateY(-6px)' }
          }
        }}
      >
        <defs>
          <linearGradient id="baseGrad" x1="40" y1="120" x2="160" y2="160" gradientUnits="userSpaceOnUse">
            <stop stopColor="#6366f1" stopOpacity="0.3" />
            <stop offset="1" stopColor="#0ea5e9" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="chipGrad" x1="80" y1="50" x2="120" y2="90" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0ea5e9" />
            <stop offset="1" stopColor="#6366f1" />
          </linearGradient>
          <filter id="glowEffect" x="20" y="20" width="160" height="160" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="6" result="blur" />
          </filter>
        </defs>

        {/* Outer orbital dash loop */}
        <ellipse cx="100" cy="135" rx="75" ry="24" stroke="rgba(99, 102, 241, 0.15)" strokeWidth="1.5" strokeDasharray="5 5" />

        {/* 3D Isometric Base Platform */}
        <path d="M40 135L100 110L160 135L100 160Z" fill="url(#baseGrad)" stroke="rgba(99, 102, 241, 0.25)" strokeWidth="1.5" />
        <path d="M40 135L40 142L100 167L160 147L160 135" fill="rgba(99, 102, 241, 0.1)" stroke="rgba(99, 102, 241, 0.25)" strokeWidth="1.5" />

        {/* Grid lines inside base platform */}
        <line x1="70" y1="122.5" x2="130" y2="147.5" stroke="rgba(14, 165, 233, 0.12)" strokeWidth="1" />
        <line x1="55" y1="128.75" x2="115" y2="153.75" stroke="rgba(14, 165, 233, 0.12)" strokeWidth="1" />
        <line x1="70" y1="147.5" x2="130" y2="122.5" stroke="rgba(14, 165, 233, 0.12)" strokeWidth="1" />
        <line x1="55" y1="141.25" x2="115" y2="116.25" stroke="rgba(14, 165, 233, 0.12)" strokeWidth="1" />

        {/* Aura Ring in Center */}
        <ellipse cx="100" cy="135" rx="30" ry="10" fill="none" stroke="#0ea5e9" strokeWidth="1" opacity="0.3" className="pulse-glow" />

        {/* Floating 3D Main Prompt Core Chip */}
        <g className="float-chip">
          {/* Vertical connecting technical signal line */}
          <line x1="100" y1="85" x2="100" y2="135" stroke="rgba(14, 165, 233, 0.35)" strokeWidth="1.5" strokeDasharray="3 3" />
          
          {/* Glowing aura under floating core */}
          <ellipse cx="100" cy="85" rx="20" ry="6" fill="#0ea5e9" opacity="0.15" filter="url(#glowEffect)" />
          
          {/* Main 3D Floating Chip */}
          <path d="M75 75L100 62L125 75L100 88Z" fill="url(#chipGrad)" stroke="#fff" strokeWidth="1.5" />
          <path d="M75 75L75 80L100 93L125 85L125 75" fill="rgba(99, 102, 241, 0.8)" stroke="#fff" strokeWidth="1.5" />
          
          {/* Sparkles / Satellite Nodes */}
          <circle cx="60" cy="65" r="3" fill="#0ea5e9" opacity="0.6" />
          <circle cx="140" cy="80" r="2.5" fill="#6366f1" opacity="0.5" />
          <circle cx="100" cy="50" r="2" fill="#fff" />
        </g>
      </Box>
      <Typography variant="body2" sx={{ fontWeight: 800, color: 'text.primary', mt: -1 }}>
        暂无{type === 'template' ? '测试用例生成模板' : '专项提示覆盖技能'}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary', maxWidth: 300, textAlign: 'center', lineHeight: 1.5, fontWeight: 500 }}>
        {type === 'template' 
          ? '点击上方的“新增模板”按钮，编写风格模板控制 AI 行文策略。' 
          : '点击上方的“新增技能”按钮，定制边界值、安全注入等专项测试规则。'}
      </Typography>
    </Stack>
  );
}
