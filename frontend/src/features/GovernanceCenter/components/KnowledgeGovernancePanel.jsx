import {
  Alert,
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
  RestoreOutlined, 
  ContentCopyOutlined,
  BlockOutlined,
  UndoOutlined,
} from '@mui/icons-material';
import EmptyState from '../../../components/EmptyState';
import {
  KNOWLEDGE_STATUS,
  KNOWLEDGE_TYPE_LABELS,
} from './governanceModel';

const STATUS_STYLE_MAP = {
  active: { bg: 'rgba(16, 185, 129, 0.08)', text: '#10b981', border: 'rgba(16, 185, 129, 0.15)' },
  invalid: { bg: 'rgba(245, 158, 11, 0.08)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.15)' },
  revoked: { bg: 'rgba(107, 114, 128, 0.08)', text: '#6b7280', border: 'rgba(107, 114, 128, 0.15)' },
};

export function KnowledgeGovernancePanel({
  knowledgeItems,
  knowledgeTypeOptions,
  filteredKnowledgeItems,
  knowledgeStatus,
  setKnowledgeStatus,
  knowledgeType,
  setKnowledgeType,
  knowledgeKeyword,
  setKnowledgeKeyword,
  updateKnowledgeStatus,
  requestDeleteKnowledgeItem,
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
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="knowledge-status-label" sx={{ fontSize: '12px', fontWeight: 600 }}>知识状态</InputLabel>
            <Select 
              labelId="knowledge-status-label"
              label="知识状态" 
              value={knowledgeStatus} 
              onChange={(event) => setKnowledgeStatus(event.target.value)}
              sx={{ 
                borderRadius: 2.2,
                fontSize: '12px',
                fontWeight: 600,
                bgcolor: 'white',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,0,0,0.06)' },
              }}
            >
              <MenuItem value="" sx={{ fontSize: '12px', fontWeight: 600 }}>全部状态</MenuItem>
              <MenuItem value="active" sx={{ fontSize: '12px' }}>已沉淀有效</MenuItem>
              <MenuItem value="invalid" sx={{ fontSize: '12px' }}>已标记失效</MenuItem>
              <MenuItem value="revoked" sx={{ fontSize: '12px' }}>已撤回停用</MenuItem>
            </Select>
          </FormControl>
          
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="knowledge-type-label" sx={{ fontSize: '12px', fontWeight: 600 }}>知识类型</InputLabel>
            <Select 
              labelId="knowledge-type-label"
              label="知识类型" 
              value={knowledgeType} 
              onChange={(event) => setKnowledgeType(event.target.value)}
              sx={{ 
                borderRadius: 2.2,
                fontSize: '12px',
                fontWeight: 600,
                bgcolor: 'white',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,0,0,0.06)' },
              }}
            >
              <MenuItem value="" sx={{ fontSize: '12px', fontWeight: 600 }}>全部类型</MenuItem>
              {[...new Set([knowledgeType, ...knowledgeTypeOptions].filter(Boolean))].map((type) => (
                <MenuItem key={type} value={type} sx={{ fontSize: '12px' }}>{KNOWLEDGE_TYPE_LABELS[type] || type}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            size="small"
            label="输入关键词过滤"
            value={knowledgeKeyword}
            onChange={(event) => setKnowledgeKeyword(event.target.value)}
            placeholder="知识名称 / ID / 简介..."
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
            已过滤显示 {filteredKnowledgeItems.length} / {knowledgeItems.length}
          </Typography>
        </Stack>
      </Box>

      {/* Info Warning Alert - Highly Sophisticated Style */}
      <Alert 
        severity="info"
        sx={{
          borderRadius: 3.5,
          bgcolor: 'rgba(2, 132, 199, 0.03)',
          border: '1px solid rgba(2, 132, 199, 0.1)',
          fontSize: '12px',
          fontWeight: 600,
          color: '#0284c7',
          '& .MuiAlert-icon': {
            color: '#0284c7',
            opacity: 0.9
          }
        }}
      >
        提示：标记失效和撤回使用都不会直接从数据库永久擦除物理记录。失效仅用于暂停参与 AI Agent 有效召回，撤回代表业务不认可，后续均可随时执行恢复操作。
      </Alert>

      {/* Knowledge Base Table */}
      <KnowledgeTable
        items={filteredKnowledgeItems}
        updateKnowledgeStatus={updateKnowledgeStatus}
        requestDeleteKnowledgeItem={requestDeleteKnowledgeItem}
        copyText={copyText}
      />
    </Stack>
  );
}

function KnowledgeEmptyIllustration() {
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
          <linearGradient id="knowGrad" x1="50" y1="50" x2="150" y2="150" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f59e0b" />
            <stop offset="1" stopColor="#d97706" />
          </linearGradient>
          <filter id="knowGlow" x="40" y="40" width="120" height="120" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="8" result="blur" />
          </filter>
        </defs>

        {/* Glowing scanning background grid */}
        <circle cx="100" cy="100" r="48" fill="rgba(245, 158, 11, 0.02)" stroke="rgba(245, 158, 11, 0.12)" strokeWidth="1" strokeDasharray="4 4" />
        <circle cx="100" cy="100" r="24" fill="rgba(245, 158, 11, 0.02)" stroke="rgba(245, 158, 11, 0.08)" strokeWidth="1" strokeDasharray="2 2" />

        {/* Linked hexagon nodes representing entity knowledge store graph */}
        {/* Top-Right Hex */}
        <path d="M140 45 L155 53.5 L155 70.5 L140 79 L125 70.5 L125 53.5 Z" fill="rgba(245, 158, 11, 0.06)" stroke="rgba(245, 158, 11, 0.22)" strokeWidth="1.5" />
        {/* Bottom-Left Hex */}
        <path d="M60 115 L75 123.5 L75 140.5 L60 149 L45 140.5 L45 123.5 Z" fill="rgba(245, 158, 11, 0.06)" stroke="rgba(245, 158, 11, 0.22)" strokeWidth="1.5" />

        {/* Center Main Hex */}
        <path d="M100 70 L122 82.5 L122 107.5 L100 120 L78 107.5 L78 82.5 Z" fill="rgba(255, 255, 255, 0.9)" stroke="url(#knowGrad)" strokeWidth="2.2" />
        <path d="M100 78 L115 86.5 L115 103.5 L100 112 L85 103.5 L85 86.5 Z" fill="rgba(245, 158, 11, 0.04)" stroke="rgba(245, 158, 11, 0.15)" strokeWidth="1.2" />

        {/* Connecting network links */}
        <line x1="100" y1="70" x2="140" y2="45" stroke="#f59e0b" strokeWidth="1.8" strokeDasharray="3 3" />
        <line x1="78" y1="107.5" x2="60" y2="115" stroke="#f59e0b" strokeWidth="1.8" strokeDasharray="3 3" />
        
        {/* Floating database cylinders inside central hex */}
        <rect x="94" y="88" width="12" height="5" rx="1.2" fill="#f59e0b" />
        <rect x="94" y="95" width="12" height="5" rx="1.2" fill="#d97706" />
        <rect x="94" y="102" width="12" height="5" rx="1.2" fill="#b45309" opacity="0.8" />
        
        {/* Magnifying Glass scanning / auditing knowledge nodes */}
        <g style={{ transform: 'translate(8px, 8px)' }}>
          <circle cx="118" cy="118" r="15" fill="rgba(255, 255, 255, 0.9)" stroke="#d97706" strokeWidth="2.8" />
          <line x1="128" y1="128" x2="145" y2="145" stroke="#d97706" strokeWidth="4" strokeLinecap="round" />
          {/* Glass glare */}
          <path d="M110 112 A8 8 0 0 1 118 106" stroke="rgba(245, 158, 11, 0.4)" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      </Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 900, color: 'text.primary', textAlign: 'center' }}>
        暂无待治理的知识资产
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary', maxWidth: 440, textAlign: 'center', lineHeight: 1.6, px: 2, display: 'block', fontWeight: 600 }}>
        在当前状态和关键词过滤下未检测到任何知识记录。您可以微调顶部过滤参数，或在 API 运行监控中确认新知识以充实底图储备。
      </Typography>
    </Stack>
  );
}

function KnowledgeTable({ items, updateKnowledgeStatus, requestDeleteKnowledgeItem, copyText }) {
  if (!items.length) {
    return (
      <Box 
        sx={{ 
          py: 3, 
          borderRadius: 4.5, 
          border: '1px dashed rgba(245, 158, 11, 0.25)',
          background: 'radial-gradient(circle, rgba(245, 158, 11, 0.03) 0%, transparent 70%)',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(245, 158, 11, 0.01)',
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
            background: 'radial-gradient(circle, rgba(245, 158, 11, 0.05) 0%, transparent 60%)',
            animation: 'knowPulseGlow 4s infinite ease-in-out',
            pointerEvents: 'none',
            zIndex: 0,
          }} 
        />
        <style>
          {`
            @keyframes knowPulseGlow {
              0% { transform: translate(-50%, -50%) scale(0.9); opacity: 0.4; }
              50% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.8; }
              100% { transform: translate(-50%, -50%) scale(0.9); opacity: 0.4; }
            }
          `}
        </style>
        
        <Box sx={{ position: 'relative', zIndex: 1, width: '100%' }}>
          <KnowledgeEmptyIllustration />
        </Box>
      </Box>
    );
  }

  return (
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
            <TableCell sx={{ pl: 2.5 }}>知识库项目 (Knowledge)</TableCell>
            <TableCell>知识类型</TableCell>
            <TableCell>治理状态</TableCell>
            <TableCell>来源执行 ID</TableCell>
            <TableCell>RAG 修复效能</TableCell>
            <TableCell align="right" sx={{ pr: 2.5 }}>治理操作</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => {
            const rawStatus = item.status || 'active';
            const statusStyle = STATUS_STYLE_MAP[rawStatus] || STATUS_STYLE_MAP.active;
            const statusLabel = KNOWLEDGE_STATUS[rawStatus]?.label || '有效';
            const effect = item.payload?.repair_effect_score || item.payload?.automation_summary?.repair_effect_score;
            
            // Format effect score pill
            let scoreText = '未评分';
            let scoreBg = 'rgba(0,0,0,0.03)';
            let scoreColor = 'text.secondary';
            if (effect?.score) {
              const score = Number(effect.score);
              scoreText = `${score} 分`;
              if (score >= 90) {
                scoreBg = 'rgba(16, 185, 129, 0.08)';
                scoreColor = '#10b981';
              } else if (score >= 70) {
                scoreBg = 'rgba(245, 158, 11, 0.08)';
                scoreColor = '#f59e0b';
              } else {
                scoreBg = 'rgba(239, 68, 68, 0.08)';
                scoreColor = '#ef4444';
              }
            } else if (effect?.label) {
              scoreText = effect.label;
            }

            return (
              <TableRow 
                key={item.knowledge_id} 
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
                {/* Knowledge Title & ID */}
                <TableCell sx={{ pl: 2.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 800, color: 'text.primary', fontSize: '13px' }}>
                    {item.summary || item.knowledge_id}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500, fontFamily: 'monospace' }}>
                    {item.knowledge_id}
                  </Typography>
                </TableCell>

                {/* Knowledge Type */}
                <TableCell>
                  <Chip 
                    size="small" 
                    label={KNOWLEDGE_TYPE_LABELS[item.item_type] || item.item_type} 
                    sx={{
                      fontSize: '10px',
                      fontWeight: 700,
                      height: 18,
                      bgcolor: 'rgba(99, 102, 241, 0.08)',
                      color: '#4f46e5',
                      border: '1px solid rgba(99, 102, 241, 0.15)',
                      borderRadius: '6px'
                    }}
                  />
                </TableCell>

                {/* Status */}
                <TableCell>
                  <Chip 
                    size="small" 
                    label={statusLabel} 
                    sx={{
                      fontSize: '11px',
                      fontWeight: 800,
                      bgcolor: statusStyle.bg,
                      color: statusStyle.text,
                      border: `1px solid ${statusStyle.border}`,
                      borderRadius: '6px'
                    }}
                  />
                </TableCell>

                {/* Source ID */}
                <TableCell>
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      fontWeight: 700,
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      color: item.source_run_id ? 'primary.main' : 'text.secondary',
                      maxWidth: 150,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {item.source_run_id || item.project_id || '共享沉淀'}
                  </Typography>
                </TableCell>

                {/* Repair Efficiency */}
                <TableCell>
                  <Chip 
                    size="small" 
                    label={scoreText} 
                    sx={{
                      fontSize: '10px',
                      fontWeight: 700,
                      height: 18,
                      bgcolor: scoreBg,
                      color: scoreColor,
                      border: 'none',
                    }}
                  />
                </TableCell>

                {/* Actions */}
                <TableCell align="right" sx={{ pr: 2.5 }}>
                  <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ flexWrap: 'wrap', gap: 1 }}>
                    <Button 
                      size="small" 
                      variant="outlined" 
                      startIcon={<ContentCopyOutlined sx={{ fontSize: 12 }} />}
                      onClick={() => copyText(item.knowledge_id, '知识 ID')}
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
                    
                    {item.status !== 'invalid' && (
                      <Button 
                        size="small" 
                        variant="outlined" 
                        startIcon={<BlockOutlined sx={{ fontSize: 12 }} />}
                        onClick={() => updateKnowledgeStatus(item.knowledge_id, 'invalid')}
                        sx={{
                          borderRadius: 2.2,
                          textTransform: 'none',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#d97706',
                          borderColor: 'rgba(217, 119, 6, 0.3)',
                          bgcolor: 'rgba(217, 119, 6, 0.02)',
                          '&:hover': {
                            borderColor: '#d97706',
                            bgcolor: 'rgba(217, 119, 6, 0.08)',
                            transform: 'translateY(-1px)',
                          },
                          transition: 'all 0.2s',
                        }}
                      >
                        失效
                      </Button>
                    )}
                    
                    {item.status !== 'revoked' && (
                      <Button 
                        size="small" 
                        variant="outlined" 
                        startIcon={<UndoOutlined sx={{ fontSize: 12 }} />}
                        onClick={() => updateKnowledgeStatus(item.knowledge_id, 'revoked')}
                        sx={{
                          borderRadius: 2.2,
                          textTransform: 'none',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#6b7280',
                          borderColor: 'rgba(107, 114, 128, 0.3)',
                          bgcolor: 'rgba(107, 114, 128, 0.02)',
                          '&:hover': {
                            borderColor: '#6b7280',
                            bgcolor: 'rgba(107, 114, 128, 0.08)',
                            transform: 'translateY(-1px)',
                          },
                          transition: 'all 0.2s',
                        }}
                      >
                        撤回
                      </Button>
                    )}
                    
                    {item.status !== 'active' && (
                      <Button 
                        size="small" 
                        variant="outlined" 
                        startIcon={<RestoreOutlined sx={{ fontSize: 12 }} />}
                        onClick={() => updateKnowledgeStatus(item.knowledge_id, 'active')}
                        sx={{
                          borderRadius: 2.2,
                          textTransform: 'none',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#10b981',
                          borderColor: 'rgba(16, 185, 129, 0.3)',
                          bgcolor: 'rgba(16, 185, 129, 0.02)',
                          '&:hover': {
                            borderColor: '#10b981',
                            bgcolor: 'rgba(16, 185, 129, 0.08)',
                            transform: 'translateY(-1px)',
                          },
                          transition: 'all 0.2s',
                        }}
                      >
                        恢复
                      </Button>
                    )}
                    
                    {item.status !== 'active' && (
                      <Button 
                        size="small" 
                        variant="outlined" 
                        startIcon={<DeleteOutline sx={{ fontSize: 12 }} />}
                        onClick={() => requestDeleteKnowledgeItem(item)}
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
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
