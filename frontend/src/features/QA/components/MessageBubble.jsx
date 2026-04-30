import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Collapse,
  Typography,
} from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { METHOD_LABELS } from '../constants';

export default function MessageBubble({ msg, onPush }) {
  const [expanded, setExpanded] = useState(false);
  const [contextExpanded, setContextExpanded] = useState(false);

  if (msg.role === 'user') {
    return (
      <Box sx={{ alignSelf: 'flex-end', maxWidth: '78%', background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)', color: 'primary.contrastText', borderRadius: '20px 20px 4px 20px', px: 2, py: 1.4, fontSize: 13.5, lineHeight: 1.6, boxShadow: '0 8px 24px rgba(99,102,241,0.25)' }}>
        {msg.content}
      </Box>
    );
  }

  if (msg.role === 'error') {
    return (
      <Box sx={{ alignSelf: 'flex-start', maxWidth: '78%', bgcolor: '#fdecea', color: 'error.dark', borderRadius: 2.5, borderBottomLeftRadius: 0.75, px: 1.4, py: 1.15, fontSize: 13, lineHeight: 1.6 }}>
        {msg.content}
      </Box>
    );
  }

  return (
    <Box sx={{ alignSelf: 'flex-start', maxWidth: '80%', bgcolor: '#ffffff', borderRadius: '20px 20px 20px 4px', px: 2.25, py: 1.5, fontSize: 13.5, lineHeight: 1.6, boxShadow: '0 12px 32px rgba(15,23,42,0.06), 0 2px 4px rgba(15,23,42,0.02)', border: '1px solid rgba(226,232,240,0.6)' }}>
      <Box className="chat-markdown" sx={{ '& p': { m: '0 0 0.5em' }, '& p:last-child': { mb: 0 }, '& img': { maxWidth: '100%', height: 'auto', borderRadius: 2 }, fontSize: 13, lineHeight: 1.65, wordBreak: 'break-word' }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
      </Box>
      <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {msg.retrieval_method && METHOD_LABELS[msg.retrieval_method] && (
          <Chip size="small" label={METHOD_LABELS[msg.retrieval_method]} sx={{ fontSize: 10 }} />
        )}
        {msg.citations?.length > 0 && (
          msg.citations.map((citation, index) => (
            <Chip key={index} size="small" label={citation.source_type === 'vector' ? `Vector: ${citation.filename || ''}` : 'Graph'} color={citation.source_type === 'vector' ? 'primary' : 'success'} sx={{ fontSize: 10 }} />
          ))
        )}
      </Box>
      {msg.reasoning_steps?.length > 0 && (
        <Box sx={{ mt: 0.75 }}>
          <Button size="small" onClick={() => setExpanded(!expanded)} sx={{ fontSize: 11, p: 0, minWidth: 'auto' }}>
            {expanded ? '收起推理步骤' : '展开推理步骤'}
          </Button>
          {expanded && (
            <Box sx={{ pl: 1.25, borderLeft: '2px solid', borderColor: 'divider', mt: 0.5 }}>
              {msg.reasoning_steps.map((step, index) => (
                <Typography key={index} variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
                  {index + 1}. {step}
                </Typography>
              ))}
            </Box>
          )}
        </Box>
      )}
      {(msg.context_chunks?.length > 0 || msg.history_used?.length > 0) && (
        <Box sx={{ mt: 0.75 }}>
          <Button size="small" onClick={() => setContextExpanded(!contextExpanded)} sx={{ fontSize: 11, p: 0, minWidth: 'auto' }}>
            {contextExpanded ? '收起上下文' : '查看上下文'}
          </Button>
          <Collapse in={contextExpanded}>
            {msg.history_used?.length > 0 && (
              <Box sx={{ mt: 0.75, p: 1, bgcolor: 'common.white', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  会话上下文
                </Typography>
                {msg.history_used.map((item, index) => (
                  <Typography key={index} variant="caption" sx={{ display: 'block', mb: 0.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    <strong>{item.role === 'user' ? '用户' : '助手'}:</strong> {item.content}
                  </Typography>
                ))}
              </Box>
            )}
            {msg.context_chunks?.length > 0 && (
              <Box sx={{ mt: 0.75, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {msg.context_chunks.map((chunk, index) => (
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
        <Button size="small" variant="outlined" onClick={() => onPush && onPush(msg.content)}>
          推送到企微
        </Button>
      </Box>
    </Box>
  );
}
