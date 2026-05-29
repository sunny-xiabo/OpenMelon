import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Collapse,
  IconButton,
  Typography,
} from '@mui/material';
import { ThumbUpOutlined, ThumbDownOutlined } from '@mui/icons-material';
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

export default function MessageBubble({ msg, message, onPush, onCopy, onRetry, onFeedback, onCitationClick, feedback }) {
  const bubbleMessage = msg || message;
  const [expanded, setExpanded] = useState(false);
  const [contextExpanded, setContextExpanded] = useState(false);

  if (!bubbleMessage) return null;

  if (bubbleMessage.role === 'user') {
    return (
      <Box sx={{ alignSelf: 'flex-end', maxWidth: '78%', background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)', color: 'primary.contrastText', borderRadius: '20px 20px 4px 20px', px: 2, py: 1.4, fontSize: 13.5, lineHeight: 1.6, boxShadow: '0 8px 24px rgba(99,102,241,0.25)' }}>
        {bubbleMessage.content}
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
                  return (
                    <sup key={i} onClick={() => onCitationClick?.(idx)}
                      style={{ color: '#6366f1', cursor: 'pointer', fontWeight: 700, fontSize: '0.7em' }}>
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
            <Chip key={index} size="small" label={citation.source_type === 'vector' ? `Vector: ${citation.filename || ''}` : 'Graph'} color={citation.source_type === 'vector' ? 'primary' : 'success'} sx={{ fontSize: 10 }} />
          ))
        )}
      </Box>
      {bubbleMessage.reasoning_steps?.length > 0 && (
        <Box sx={{ mt: 0.75 }}>
          <Button size="small" onClick={() => setExpanded(!expanded)} sx={{ fontSize: 11, p: 0, minWidth: 'auto' }}>
            {expanded ? '收起推理步骤' : '展开推理步骤'}
          </Button>
          {expanded && (
            <Box sx={{ pl: 1.25, borderLeft: '2px solid', borderColor: 'divider', mt: 0.5 }}>
              {bubbleMessage.reasoning_steps.map((step, index) => (
                <Typography key={index} variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
                  {index + 1}. {step}
                </Typography>
              ))}
            </Box>
          )}
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
      <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
        <Button size="small" variant="outlined" onClick={() => onPush && onPush(bubbleMessage.content)}>
          推送到企微
        </Button>
      </Box>
      <MessageActions
        content={bubbleMessage.content}
        feedback={feedback}
        onCopy={onCopy}
        onRetry={onRetry}
        onFeedback={onFeedback}
      />
    </Box>
  );
}
