import React, { useEffect, useRef } from 'react';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const StreamingOutput = ({ content }) => {
  const outputRef = useRef(null);

  // 当内容更新时自动滚动到底部
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [content]);

  return (
    <Paper elevation={3} sx={{ p: 3, mb: 4 }}>
      <Box sx={{ mb: 2 }}>
        <LinearProgress />
      </Box>

      <Box
        ref={outputRef}
        sx={{
          backgroundColor: '#f5f5f5',
          borderRadius: 1,
          p: 2,
          maxHeight: '400px',
          overflowY: 'auto',
          wordBreak: 'break-word'
        }}
      >
        {content ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        ) : (
          <Typography variant="body2" color="text.secondary">
            等待输出...
          </Typography>
        )}
      </Box>
    </Paper>
  );
};

export default StreamingOutput;
