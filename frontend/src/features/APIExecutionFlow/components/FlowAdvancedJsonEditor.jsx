import { Box, Button, Collapse, Paper, Stack, Typography } from '@mui/material';
import { CodeOutlined } from '@mui/icons-material';
import CodeMirror from '@uiw/react-codemirror';
import { autocompletion } from '@codemirror/autocomplete';
import { json } from '@codemirror/lang-json';

export default function FlowAdvancedJsonEditor({
  open,
  dslText,
  setDslText,
  editorTheme,
  editorHighlightStyle,
  completionSource,
  onToggle,
}) {
  return (
    <Paper sx={{ borderRadius: 3, border: '1px solid rgba(255,255,255,0.65)', bgcolor: 'rgba(255,255,255,0.52)', overflow: 'hidden' }}>
      <Box sx={{ px: 2, py: 1.25, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <CodeOutlined color="primary" fontSize="small" />
          <Box>
            <Typography variant="subtitle2" fontWeight={800}>高级 DSL JSON</Typography>
            <Typography variant="caption" color="text.secondary">可直接编辑，工作台会按最新 JSON 重新渲染。</Typography>
          </Box>
        </Stack>
        <Button size="small" variant="outlined" onClick={onToggle}>
          {open ? '收起 JSON' : '展开 JSON'}
        </Button>
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.65)' }}>
          <CodeMirror
            value={dslText}
            height="360px"
            theme={editorTheme}
            basicSetup={{
              lineNumbers: true,
              highlightActiveLine: true,
              highlightActiveLineGutter: true,
              foldGutter: true,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: true,
            }}
            extensions={[
              json(),
              editorHighlightStyle,
              autocompletion({ override: [completionSource], activateOnTyping: true }),
            ].filter(Boolean)}
            onChange={(value) => setDslText(value)}
          />
        </Box>
      </Collapse>
    </Paper>
  );
}
