import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Collapse,
  IconButton,
  Typography,
  Stack,
  TextField,
  Popover,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { ThumbUpOutlined, ThumbDownOutlined, ContentCopy, Edit } from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { METHOD_LABELS } from '../constants';

function MessageActions({ content, feedback, onCopy, onRetry, onFeedback }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard API unavailable */ }
  };

  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 0.5, mt: 1, pt: 0.75,
      borderTop: '1px solid', borderColor: 'divider',
      opacity: 0.5, '&:hover': { opacity: 1 }, transition: 'opacity 0.2s',
    }}>
      <Chip size="small" label={copied ? '已复制' : '复制'} onClick={handleCopy} variant="outlined" sx={{ fontSize: 11, height: 24 }} />
      <Chip size="small" label="重试" onClick={onRetry} variant="outlined" sx={{ fontSize: 11, height: 24 }} />
      <Box sx={{ ml: 'auto', display: 'flex', gap: 0.5 }}>
        <IconButton size="small" onClick={() => onFeedback?.(feedback === 'up' ? null : 'up')} sx={{ color: feedback === 'up' ? 'success.main' : 'text.secondary' }}>
          <ThumbUpOutlined sx={{ fontSize: 16 }} />
        </IconButton>
        <IconButton size="small" onClick={() => onFeedback?.(feedback === 'down' ? null : 'down')} sx={{ color: feedback === 'down' ? 'error.main' : 'text.secondary' }}>
          <ThumbDownOutlined sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>
    </Box>
  );
}

export default function MessageBubble({ msg, message, onPush, onCopy, onRetry, onFeedback, onCitationClick, feedback, onEdit }) {
  const bubbleMessage = msg || message;
  const [expanded, setExpanded] = useState(false);
  const [contextExpanded, setContextExpanded] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [hoveredCitation, setHoveredCitation] = useState(null);

  const handleCopyUser = async () => {
    try {
      await navigator.clipboard.writeText(bubbleMessage.content);
    } catch { /* clipboard API unavailable */ }
  };

  if (!bubbleMessage) return null;

  if (bubbleMessage.role === 'user') {
    return (
      <Box sx={{ alignSelf: 'flex-end', maxWidth: '78%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
        <Box sx={{ background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)', color: 'primary.contrastText', borderRadius: '20px 20px 4px 20px', px: 2, py: 1.4, fontSize: 13.5, lineHeight: 1.6, boxShadow: '0 8px 24px rgba(99,102,241,0.25)' }}>
          {bubbleMessage.content}
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5, opacity: 0, '&:hover': { opacity: 1 }, '.chat-row:hover &': { opacity: 0.4 }, transition: 'opacity 0.2s', mr: 1 }}>
          <IconButton size="small" onClick={handleCopyUser} title="复制内容" sx={{ p: 0.5 }}>
            <ContentCopy sx={{ fontSize: 13, color: 'text.secondary' }} />
          </IconButton>
          <IconButton size="small" onClick={() => onEdit?.(bubbleMessage.content)} title="修改问题" sx={{ p: 0.5 }}>
            <Edit sx={{ fontSize: 13, color: 'text.secondary' }} />
          </IconButton>
        </Box>
      </Box>
    );
  }

  if (bubbleMessage.role === 'error') {
    return (
      <Box sx={{ alignSelf: 'flex-start', maxWidth: '78%', bgcolor: '#fdecea', color: 'error.dark', borderRadius: 2.5, borderBottomLeftRadius: 0.75, px: 1.4, py: 1.15, fontSize: 13, lineHeight: 1.6 }}>
        {bubbleMessage.content}
      </Box>
    );
  }

  return (
    <Box sx={{ alignSelf: 'flex-start', maxWidth: '80%', bgcolor: '#ffffff', borderRadius: '20px 20px 20px 4px', px: 2.25, py: 1.5, fontSize: 13.5, lineHeight: 1.6, boxShadow: '0 12px 32px rgba(15,23,42,0.06), 0 2px 4px rgba(15,23,42,0.02)', border: '1px solid rgba(226,232,240,0.6)' }}>
      <Box className="chat-markdown" sx={{ '& p': { m: '0 0 0.5em' }, '& p:last-child': { mb: 0 }, '& img': { maxWidth: '100%', height: 'auto', borderRadius: 2 }, fontSize: 13, lineHeight: 1.65, wordBreak: 'break-word' }}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            text({ children }) {
              if (typeof children !== 'string') return children;
              const parts = children.split(/(\[\d+\])/g);
              if (parts.length === 1) return children;
              return parts.map((part, i) => {
                const match = part.match(/^\[(\d+)\]$/);
                if (match) {
                  const idx = parseInt(match[1], 10);
                  const citation = bubbleMessage.citations?.[idx - 1];
                  const handleMouseEnter = (event) => {
                    if (citation) {
                      setAnchorEl(event.currentTarget);
                      setHoveredCitation({ ...citation, idx });
                    }
                  };
                  const handleMouseLeave = () => {
                    setAnchorEl(null);
                    setHoveredCitation(null);
                  };
                  return (
                    <sup
                      key={i}
                      onClick={() => onCitationClick?.(idx)}
                      onMouseEnter={handleMouseEnter}
                      onMouseLeave={handleMouseLeave}
                      style={{
                        color: '#6366f1',
                        cursor: 'pointer',
                        fontWeight: 700,
                        fontSize: '0.75em',
                        padding: '0 2px',
                        display: 'inline-block',
                      }}
                    >
                      [{idx}]
                    </sup>
                  );
                }
                return part;
              });
            },
          }}
        >{bubbleMessage.content}</ReactMarkdown>
      </Box>
      <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {bubbleMessage.retrieval_method && METHOD_LABELS[bubbleMessage.retrieval_method] && (
          <Chip size="small" label={METHOD_LABELS[bubbleMessage.retrieval_method]} sx={{ fontSize: 10 }} />
        )}
        {bubbleMessage.citations?.length > 0 && (
          bubbleMessage.citations.map((citation, index) => (
            <Chip
              key={index}
              size="small"
              label={citation.source_type === 'vector' ? `Vector: ${citation.filename || ''}` : 'Graph'}
              color={citation.source_type === 'vector' ? 'primary' : 'success'}
              onClick={() => onCitationClick?.(index + 1)}
              sx={{ fontSize: 10, cursor: 'pointer', '&:hover': { filter: 'brightness(0.95)' } }}
            />
          ))
        )}
      </Box>
      {bubbleMessage.reasoning_steps?.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          {(() => {
            const isAgentic = bubbleMessage.reasoning_steps.some(step => 
              step.toLowerCase().includes('sufficiency') || 
              step.toLowerCase().includes('score') || 
              step.toLowerCase().includes('failed') || 
              step.toLowerCase().includes('fallback')
            );
            return (
              <Button
                size="small"
                variant="text"
                onClick={() => setExpanded(!expanded)}
                sx={{
                  fontSize: '11px',
                  fontWeight: 800,
                  p: '4px 12px',
                  borderRadius: 2,
                  bgcolor: expanded ? 'rgba(99,102,241,0.06)' : 'transparent',
                  color: '#6366f1',
                  textTransform: 'none',
                  '&:hover': { bgcolor: 'rgba(99,102,241,0.1)' }
                }}
              >
                {expanded 
                  ? (isAgentic ? '隐藏 Agent 推理链路' : '隐藏检索与意图分析') 
                  : (isAgentic ? '查看 Agent 推理链路' : '查看检索与意图分析')}
              </Button>
            );
          })()}
          
          <Collapse in={expanded}>
            <Box sx={{
              mt: 1.5,
              pl: 2.5,
              position: 'relative',
              '&::before': {
                content: '""',
                position: 'absolute',
                left: 7,
                top: 8,
                bottom: 8,
                width: 2,
                bgcolor: 'divider',
                backgroundImage: 'linear-gradient(to bottom, #6366f1, #10b981, rgba(0,0,0,0.05))',
                borderRadius: 1,
              }
            }}>
              {bubbleMessage.reasoning_steps.map((step, index) => {
                const isFail = step.toLowerCase().includes('failed');
                const isSuccess = step.toLowerCase().includes('success') || step.toLowerCase().includes('succeeded');
                
                const stepNumMatch = step.match(/Step (\d+):/i);
                const stepTitle = stepNumMatch ? `第 ${stepNumMatch[1]} 步推理` : `第 ${index + 1} 步`;
                const stepContent = step.replace(/Step \d+:\s*/i, '');
                
                let dotColor = '#6366f1';
                let bgColor = 'rgba(99, 102, 241, 0.03)';
                if (isFail) {
                  dotColor = '#ef4444';
                  bgColor = 'rgba(239, 68, 68, 0.03)';
                } else if (isSuccess) {
                  dotColor = '#10b981';
                  bgColor = 'rgba(16, 185, 129, 0.03)';
                }
                
                return (
                  <Box
                    key={index}
                    sx={{
                      position: 'relative',
                      mb: 2,
                      '&:last-child': { mb: 0.5 },
                      transition: 'all 0.2s ease',
                      '&:hover': { transform: 'translateX(4px)' }
                    }}
                  >
                    <Box sx={{
                      position: 'absolute',
                      left: -22,
                      top: 6,
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      bgcolor: '#ffffff',
                      border: '3px solid',
                      borderColor: dotColor,
                      boxShadow: `0 0 6px ${alpha(dotColor, 0.3)}`,
                      zIndex: 10,
                    }} />
                    
                    <Box sx={{
                      p: 1.5,
                      bgcolor: bgColor,
                      border: '1px solid',
                      borderColor: isFail ? 'rgba(239,68,68,0.12)' : isSuccess ? 'rgba(16,185,129,0.12)' : 'rgba(99,102,241,0.12)',
                      borderRadius: 3,
                      backdropFilter: 'blur(8px)',
                    }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: '11px', color: isFail ? 'error.main' : isSuccess ? 'success.main' : '#6366f1', mb: 0.5 }}>
                        {stepTitle}
                      </Typography>
                      <Typography variant="body2" sx={{ fontSize: '11.5px', color: 'slate.700', lineHeight: 1.5 }}>
                        {stepContent}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Collapse>
        </Box>
      )}
      {(bubbleMessage.context_chunks?.length > 0 || bubbleMessage.history_used?.length > 0) && (
        <Box sx={{ mt: 0.75 }}>
          <Button size="small" onClick={() => setContextExpanded(!contextExpanded)} sx={{ fontSize: 11, p: 0, minWidth: 'auto' }}>
            {contextExpanded ? '收起上下文' : '查看上下文'}
          </Button>
          <Collapse in={contextExpanded}>
            {bubbleMessage.history_used?.length > 0 && (
              <Box sx={{ mt: 0.75, p: 1, bgcolor: 'common.white', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  会话上下文
                </Typography>
                {bubbleMessage.history_used.map((item, index) => (
                  <Typography key={index} variant="caption" sx={{ display: 'block', mb: 0.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    <strong>{item.role === 'user' ? '用户' : '助手'}:</strong> {item.content}
                  </Typography>
                ))}
              </Box>
            )}
            {bubbleMessage.context_chunks?.length > 0 && (
              <Box sx={{ mt: 0.75, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {bubbleMessage.context_chunks.map((chunk, index) => (
                  <Box key={index} sx={{ p: 1, bgcolor: 'common.white', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      {chunk.source_type === 'graph'
                        ? '图谱上下文'
                        : `${chunk.doc_type || 'unknown'} / ${chunk.filename || 'unknown'} / chunk ${chunk.chunk_index ?? '?'}`}
                    </Typography>
                    <Typography variant="caption" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {chunk.content}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Collapse>
        </Box>
      )}
      {onPush && (
        <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
          <Button size="small" variant="outlined" onClick={() => onPush(bubbleMessage.content)}>
            推送到企微
          </Button>
        </Box>
      )}
      <MessageActions
        content={bubbleMessage.content}
        feedback={feedback}
        onCopy={onCopy}
        onRetry={onRetry}
        onFeedback={onFeedback}
      />

      <Popover
        id="citation-popover"
        open={Boolean(anchorEl && hoveredCitation)}
        anchorEl={anchorEl}
        onClose={() => {
          setAnchorEl(null);
          setHoveredCitation(null);
        }}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'center',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'center',
        }}
        sx={{
          pointerEvents: 'none',
        }}
        PaperProps={{
          sx: {
            p: 1.5,
            maxWidth: 320,
            bgcolor: 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(226,232,240,0.8)',
            borderRadius: 3,
            boxShadow: '0 8px 32px rgba(15,23,42,0.12)',
          },
        }}
      >
        {hoveredCitation && (
          <Box>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
              <Chip
                label={`引用 [${hoveredCitation.idx}]`}
                size="small"
                sx={{
                  bgcolor: '#6366f1',
                  color: 'white',
                  fontWeight: 800,
                  fontSize: 10,
                  height: 20,
                }}
              />
              <Chip
                label={hoveredCitation.source_type === 'vector' ? 'Vector' : 'Graph'}
                size="small"
                color={hoveredCitation.source_type === 'vector' ? 'primary' : 'success'}
                sx={{ fontWeight: 700, fontSize: 10, height: 20 }}
              />
            </Stack>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: '11.5px', color: 'slate.800', wordBreak: 'break-word', mb: 0.5 }}>
              文件: {hoveredCitation.filename || '知识图谱'}
            </Typography>
            {hoveredCitation.doc_type && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                类型: {hoveredCitation.doc_type} | 分块: #{hoveredCitation.chunk_index ?? 'N/A'}
              </Typography>
            )}
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                fontSize: 11,
                lineHeight: 1.5,
                bgcolor: 'rgba(0,0,0,0.02)',
                p: 1,
                borderRadius: 1.5,
                border: '1px dashed rgba(0,0,0,0.06)',
                display: '-webkit-box',
                WebkitLineClamp: 4,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {hoveredCitation.content_preview ||
                (bubbleMessage.context_chunks?.find(
                  (c) =>
                    c.filename === hoveredCitation.filename &&
                    c.chunk_index === hoveredCitation.chunk_index
                )?.content || '点击左角标或右侧“引用溯源”面板查看完整上下文。')}
            </Typography>
          </Box>
        )}
      </Popover>
    </Box>
  );
}
