import {
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { 
  DeleteOutline,
  ContentCopyOutlined,
} from '@mui/icons-material';
import { formatRunTime } from '../../APIExecution/utils';
import EmptyState from '../../../components/EmptyState';

export function TemplateGovernancePanel({
  templates,
  rawTemplateCount,
  templateKeyword,
  setTemplateKeyword,
  templateStatus,
  setTemplateStatus,
  deleteTemplate,
  copyText,
}) {
  return (
    <Stack spacing={3}>
      {/* Search Filters Section - Premium Glassmorphic Card */}
      <Box
        sx={{
          p: 2.2,
          borderRadius: 4,
          border: '1px solid rgba(255, 255, 255, 0.45)',
          bgcolor: 'rgba(255, 255, 255, 0.3)',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 4px 20px rgba(15, 23, 42, 0.015), inset 0 1px 0 rgba(255,255,255,0.7)',
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel id="template-status-label" sx={{ fontSize: '12px', fontWeight: 600 }}>模板状态</InputLabel>
            <Select 
              labelId="template-status-label"
              label="模板状态" 
              value={templateStatus} 
              onChange={(event) => setTemplateStatus(event.target.value)}
              sx={{ 
                borderRadius: 2.2,
                fontSize: '12px',
                fontWeight: 600,
                bgcolor: 'white',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,0,0,0.06)' },
              }}
            >
              <MenuItem value="" sx={{ fontSize: '12px', fontWeight: 600 }}>全部状态</MenuItem>
              <MenuItem value="active" sx={{ fontSize: '12px' }}>可用状态</MenuItem>
              <MenuItem value="deprecated" sx={{ fontSize: '12px' }}>已废弃状态</MenuItem>
            </Select>
          </FormControl>
          
          <TextField
            size="small"
            label="输入关键词过滤"
            value={templateKeyword}
            onChange={(event) => setTemplateKeyword(event.target.value)}
            placeholder="模板名称 / ID / 描述..."
            sx={{ 
              minWidth: 240, 
              flex: 1,
              '& .MuiOutlinedInput-root': {
                borderRadius: 2.2,
                fontSize: '12px',
                fontWeight: 600,
                bgcolor: 'white',
                '& fieldset': { borderColor: 'rgba(0,0,0,0.06)' },
              }
            }}
          />
          
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, whiteSpace: 'nowrap' }}>
            已过滤显示 {templates.length} / {rawTemplateCount}
          </Typography>
        </Stack>
      </Box>

      {/* Main Table or Empty State */}
      {!templates.length ? (
        <Box 
          sx={{ 
            py: 3, 
            borderRadius: 4.5, 
            border: '1px dashed rgba(139, 92, 246, 0.25)',
            background: 'radial-gradient(circle, rgba(139, 92, 246, 0.03) 0%, transparent 70%)',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(139, 92, 246, 0.01)',
          }}
        >
          {/* Animated Sci-Fi Glow Pulse Circle */}
          <Box 
            className="purify-pulse"
            sx={{ 
              position: 'absolute', 
              top: '50%', 
              left: '50%', 
              transform: 'translate(-50%, -50%)', 
              width: 250, 
              height: 250, 
              borderRadius: '50%', 
              background: 'radial-gradient(circle, rgba(139, 92, 246, 0.05) 0%, transparent 60%)',
              animation: 'tplPulseGlow 4s infinite ease-in-out',
              pointerEvents: 'none',
              zIndex: 0,
            }} 
          />
          <style>
            {`
              @keyframes tplPulseGlow {
                0% { transform: translate(-50%, -50%) scale(0.9); opacity: 0.4; }
                50% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.8; }
                100% { transform: translate(-50%, -50%) scale(0.9); opacity: 0.4; }
              }
            `}
          </style>
          
          <Box sx={{ position: 'relative', zIndex: 1, width: '100%' }}>
            <TemplateEmptyIllustration />
          </Box>
        </Box>
      ) : (
        <TableContainer 
          sx={{ 
            border: '1px solid rgba(0,0,0,0.05)', 
            borderRadius: 4, 
            overflow: 'hidden', 
            bgcolor: 'rgba(255, 255, 255, 0.25)' 
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
                    borderBottom: '1px solid rgba(0,0,0,0.06)',
                    py: 1.75,
                  }
                }}
              >
                <TableCell sx={{ pl: 2.5 }}>复用流程模板 (Templates)</TableCell>
                <TableCell>模板版本</TableCell>
                <TableCell>生命周期状态</TableCell>
                <TableCell>项目适用范围</TableCell>
                <TableCell>历史运行表现</TableCell>
                <TableCell>最后更新时间</TableCell>
                <TableCell align="right" sx={{ pr: 2.5 }}>治理操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {templates.map((template) => {
                const performance = template.performance_snapshot || {};
                const runCount = performance.run_count || 0;
                const passRate = performance.pass_rate !== undefined ? `${Math.round(Number(performance.pass_rate) * 100)}%` : '暂无';
                
                return (
                  <TableRow 
                    key={template.template_id} 
                    hover
                    sx={{
                      transition: 'background-color 0.2s',
                      '&:hover': {
                        bgcolor: 'rgba(26, 115, 232, 0.015) !important'
                      },
                      '& td': {
                        borderBottom: '1px solid rgba(0,0,0,0.03)',
                        py: 1.5,
                      }
                    }}
                  >
                    {/* Template name & descriptive tags */}
                    <TableCell sx={{ pl: 2.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 800, color: 'text.primary', fontSize: '13px' }}>
                        {template.name}
                      </Typography>
                      {template.description && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
                          {template.description}
                        </Typography>
                      )}
                      <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
                        {(template.tags || []).slice(0, 4).map((tag) => (
                          <Chip 
                            key={tag} 
                            size="small" 
                            label={tag} 
                            sx={{ 
                              fontSize: '9px', 
                              fontWeight: 700, 
                              height: 16, 
                              bgcolor: 'rgba(0,0,0,0.03)', 
                              color: 'text.secondary',
                              border: 'none',
                              borderRadius: '4px'
                            }} 
                          />
                        ))}
                      </Stack>
                    </TableCell>

                    {/* Version */}
                    <TableCell>
                      <Chip 
                        size="small" 
                        label={template.version || 'v1.0.0'} 
                        sx={{
                          fontSize: '10px',
                          fontWeight: 700,
                          height: 18,
                          bgcolor: 'rgba(0,0,0,0.03)',
                          color: 'text.secondary',
                          border: '1px solid rgba(0,0,0,0.08)',
                          borderRadius: '4px'
                        }}
                      />
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      <Chip 
                        size="small" 
                        label={template.deprecated ? '已废弃' : '高复用可用'} 
                        sx={{
                          fontSize: '11px',
                          fontWeight: 800,
                          bgcolor: template.deprecated ? 'rgba(245, 158, 11, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                          color: template.deprecated ? '#f59e0b' : '#10b981',
                          border: template.deprecated ? '1px solid rgba(245, 158, 11, 0.15)' : '1px solid rgba(16, 185, 129, 0.15)',
                          borderRadius: '6px'
                        }}
                      />
                    </TableCell>

                    {/* Scope */}
                    <TableCell sx={{ fontSize: '12px', color: 'text.primary', fontWeight: 600 }}>
                      {template.scope || template.project_id || '全项目高共享'}
                    </TableCell>

                    {/* Historical performance */}
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography variant="body2" sx={{ fontWeight: 800, fontSize: '12px', color: 'text.primary' }}>
                          {runCount} 次执行
                        </Typography>
                        {runCount > 0 && (
                          <Chip 
                            size="small" 
                            label={`通过率 ${passRate}`} 
                            sx={{
                              fontSize: '10px',
                              fontWeight: 800,
                              height: 18,
                              bgcolor: Number(performance.pass_rate) >= 0.9 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                              color: Number(performance.pass_rate) >= 0.9 ? '#10b981' : '#f59e0b',
                              border: 'none',
                            }}
                          />
                        )}
                      </Stack>
                    </TableCell>

                    {/* Last updated */}
                    <TableCell sx={{ fontSize: '12px', color: 'text.secondary', fontWeight: 500 }}>
                      {formatRunTime(template.updated_at) || '未记录'}
                    </TableCell>

                    {/* Actions */}
                    <TableCell align="right" sx={{ pr: 2.5 }}>
                      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ flexWrap: 'wrap', gap: 1 }}>
                        <Button 
                          size="small" 
                          variant="outlined" 
                          startIcon={<ContentCopyOutlined sx={{ fontSize: 12 }} />}
                          onClick={() => copyText(template.template_id, '模板 ID')}
                          sx={{
                            borderRadius: 2.2,
                            textTransform: 'none',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: 'text.secondary',
                            borderColor: 'rgba(0,0,0,0.1)',
                            bgcolor: 'white',
                            '&:hover': {
                              borderColor: 'text.primary',
                              bgcolor: 'rgba(0,0,0,0.02)',
                            }
                          }}
                        >
                          复制 ID
                        </Button>
                        
                        <Button 
                          size="small" 
                          variant="outlined" 
                          startIcon={<DeleteOutline sx={{ fontSize: 12 }} />}
                          onClick={() => deleteTemplate(template.template_id)}
                          sx={{
                            borderRadius: 2.2,
                            textTransform: 'none',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: '#ef4444',
                            borderColor: 'rgba(239, 68, 68, 0.3)',
                            bgcolor: 'rgba(239, 68, 68, 0.02)',
                            '&:hover': {
                              borderColor: '#ef4444',
                              bgcolor: 'rgba(239, 68, 68, 0.08)',
                              transform: 'translateY(-1px)',
                            },
                            transition: 'all 0.2s',
                          }}
                        >
                          永久删除
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}

function TemplateEmptyIllustration() {
  return (
    <Stack alignItems="center" spacing={2.5} sx={{ py: 6 }}>
      <Box 
        component="svg" 
        width={180} 
        height={180} 
        viewBox="0 0 200 200" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="tplGrad" x1="40" y1="40" x2="160" y2="160" gradientUnits="userSpaceOnUse">
            <stop stopColor="#8b5cf6" />
            <stop offset="1" stopColor="#7c3aed" />
          </linearGradient>
          <filter id="tplGlow" x="40" y="40" width="120" height="120" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="8" result="blur" />
          </filter>
        </defs>

        {/* Isometric Blueprint Board Grid base */}
        <path d="M40 100L100 68L160 100L100 132Z" fill="rgba(139, 92, 246, 0.03)" stroke="rgba(139, 92, 246, 0.16)" strokeWidth="1.5" />
        <path d="M40 100L40 108L100 140L160 108L160 100" fill="rgba(139, 92, 246, 0.06)" stroke="rgba(139, 92, 246, 0.16)" strokeWidth="1.5" />

        {/* Grid coordinate guidelines */}
        <path d="M60 90L120 120" stroke="rgba(139, 92, 246, 0.08)" strokeWidth="1" />
        <path d="M80 80L140 110" stroke="rgba(139, 92, 246, 0.08)" strokeWidth="1" />
        <path d="M60 110L120 80" stroke="rgba(139, 92, 246, 0.08)" strokeWidth="1" />
        <path d="M80 120L140 90" stroke="rgba(139, 92, 246, 0.08)" strokeWidth="1" />

        {/* Workflow Node block 1 (Isometric Cube - Input Node) */}
        <g style={{ transform: 'translate(60px, 72px)' }}>
          <path d="M0 10L12 4L24 10L12 16Z" fill="#fff" stroke="#8b5cf6" strokeWidth="1.6" />
          <path d="M0 10L0 18L12 24L12 16Z" fill="rgba(139, 92, 246, 0.2)" stroke="#8b5cf6" strokeWidth="1.6" />
          <path d="M24 10L24 18L12 24L12 16Z" fill="rgba(139, 92, 246, 0.35)" stroke="#8b5cf6" strokeWidth="1.6" />
        </g>
        
        {/* Workflow Node block 2 (Isometric Cube - Output Node) */}
        <g style={{ transform: 'translate(112px, 94px)' }}>
          <path d="M0 10L12 4L24 10L12 16Z" fill="#fff" stroke="#7c3aed" strokeWidth="1.6" />
          <path d="M0 10L0 18L12 24L12 16Z" fill="rgba(124, 58, 237, 0.2)" stroke="#7c3aed" strokeWidth="1.6" />
          <path d="M24 10L24 18L12 24L12 16Z" fill="rgba(124, 58, 237, 0.35)" stroke="#7c3aed" strokeWidth="1.6" />
        </g>

        {/* Curved dashed flow line linking block 1 to block 2 */}
        <path d="M84 88 C98 92, 96 102, 112 104" stroke="#8b5cf6" strokeWidth="2" strokeDasharray="3 3" fill="none" strokeLinecap="round" />
        <circle cx="112" cy="104" r="3.2" fill="#8b5cf6" />
        
        {/* Floating Blueprint Design Pen */}
        <g style={{ transform: 'translate(132px, 42px) rotate(-15deg)' }}>
          <path d="M0 30L4 0L8 30Z" fill="#8b5cf6" opacity="0.3" />
          <rect x="2" y="10" width="4" height="42" rx="1.2" fill="url(#tplGrad)" />
          <path d="M2 10L4 0L6 10Z" fill="#fff" />
        </g>
      </Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 900, color: 'text.primary', textAlign: 'center' }}>
        暂无共享的流程模板
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary', maxWidth: 440, textAlign: 'center', lineHeight: 1.6, px: 2, display: 'block', fontWeight: 600 }}>
        全域当前未匹配到可供复用的自动化流程模板。建议在 API 自动化工作台中进行 DSL 编排设计并保存为可用模板，以沉淀跨项目的高复用架构资产。
      </Typography>
    </Stack>
  );
}
