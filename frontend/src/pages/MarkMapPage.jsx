import { useState, useEffect, useRef } from 'react';
import { Box, Typography, Button, TextField, IconButton, Tooltip } from '@mui/material';
import { Edit as EditIcon, Visibility as VisibilityIcon } from '@mui/icons-material';
import { Transformer } from 'markmap-lib';
import { Markmap } from 'markmap-view';

const transformer = new Transformer();

const DEFAULT_MARKDOWN = `# 根节点
## 功能模块 1
### 子功能 1.1
### 子功能 1.2
## 功能模块 2
### 子功能 2.1
### 子功能 2.2
### 子功能 2.3`;

export default function MarkMapPage() {
  const [markdown, setMarkdown] = useState(DEFAULT_MARKDOWN);
  const [editing, setEditing] = useState(true);
  const svgRef = useRef(null);
  const mmRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current) return;
    mmRef.current = Markmap.create(svgRef.current, { initialExpandLevel: 2 });
    return () => {
      if (mmRef.current) {
        mmRef.current.destroy();
        mmRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mmRef.current) return;
    const { root } = transformer.transform(markdown);
    mmRef.current.setData(root);
    mmRef.current.fit();
  }, [markdown]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, p: 2, gap: 1.5, overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
        <Typography variant="subtitle1" fontWeight={600}>思维导图</Typography>
        <Button
          size="small"
          variant={editing ? 'contained' : 'outlined'}
          onClick={() => setEditing(!editing)}
          startIcon={editing ? <VisibilityIcon /> : <EditIcon />}
        >
          {editing ? '查看导图' : '编辑内容'}
        </Button>
      </Box>

      <Box sx={{ flex: 1, display: 'flex', gap: 1.5, minHeight: 0, overflow: 'hidden' }}>
        {editing && (
          <Box sx={{ width: 280, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
              输入 Markdown 内容
            </Typography>
            <TextField
              multiline
              fullWidth
              value={markdown}
              onChange={e => setMarkdown(e.target.value)}
              sx={{
                flex: 1,
                '& .MuiInputBase-root': {
                  height: '100%',
                  alignItems: 'flex-start',
                  fontFamily: 'monospace',
                  fontSize: 12,
                },
                '& .MuiOutlinedInput-input': {
                  height: '100% !important',
                  resize: 'none',
                },
              }}
            />
          </Box>
        )}

        <Box
          sx={{
            flex: 1,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            overflow: 'hidden',
            '& svg': { width: '100%', height: '100%' },
          }}
        >
          <svg ref={svgRef} />
        </Box>
      </Box>

      <Typography variant="caption" color="text.disabled">
        使用 Markdown 语法 (# 标题) 定义思维导图结构
      </Typography>
    </Box>
  );
}
