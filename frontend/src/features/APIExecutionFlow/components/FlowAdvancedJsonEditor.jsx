import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Collapse, Paper, Stack, Typography } from '@mui/material';
import { CodeOutlined } from '@mui/icons-material';

export default function FlowAdvancedJsonEditor({
  open,
  dslText,
  setDslText,
  completionSource,
  onToggle,
}) {
  const [editorModules, setEditorModules] = useState(null);

  useEffect(() => {
    if (!open || editorModules) return;
    let cancelled = false;
    Promise.all([
      import('@uiw/react-codemirror'),
      import('@codemirror/autocomplete'),
      import('@codemirror/lang-json'),
      import('@codemirror/view'),
      import('@codemirror/language'),
      import('@lezer/highlight'),
    ])
      .then(([codeMirrorModule, autocompleteModule, jsonModule, viewModule, languageModule, highlightModule]) => {
        if (cancelled) return;
        setEditorModules({
          CodeMirror: codeMirrorModule.default,
          autocompletion: autocompleteModule.autocompletion,
          json: jsonModule.json,
          EditorView: viewModule.EditorView,
          HighlightStyle: languageModule.HighlightStyle,
          syntaxHighlighting: languageModule.syntaxHighlighting,
          tags: highlightModule.tags,
        });
      })
      .catch((error) => {
        console.error('Failed to load advanced JSON editor:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [editorModules, open]);

  const editorConfig = useMemo(() => {
    if (!editorModules) return null;
    const { EditorView, HighlightStyle, syntaxHighlighting, tags } = editorModules;
    const editorTheme = EditorView.theme({
      '&': {
        backgroundColor: '#ffffff',
        color: '#202124',
      },
      '.cm-content': {
        caretColor: '#1a73e8',
      },
      '.cm-gutters': {
        backgroundColor: '#f8f9fa',
        color: '#9aa0a6',
        borderRight: '1px solid #e8eaed',
      },
      '.cm-activeLine': {
        backgroundColor: '#e8f0fe66',
      },
      '.cm-activeLineGutter': {
        backgroundColor: '#e8f0fe',
        color: '#1a73e8',
      },
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
        backgroundColor: '#d2e3fc',
      },
      '&.cm-focused': {
        outline: 'none',
      },
      '.cm-tooltip': {
        border: '1px solid #e8eaed',
        borderRadius: '6px',
        boxShadow: '0 8px 24px rgba(60,64,67,0.16)',
      },
      '.cm-tooltip-autocomplete ul li[aria-selected]': {
        backgroundColor: '#e8f0fe',
        color: '#202124',
      },
    });

    const apiJsonHighlightStyle = HighlightStyle.define([
      { tag: tags.propertyName, color: '#1a73e8', fontWeight: '600' },
      { tag: tags.string, color: '#188038' },
      { tag: tags.number, color: '#b06000' },
      { tag: tags.bool, color: '#9334e6' },
      { tag: tags.null, color: '#5f6368', fontStyle: 'italic' },
      { tag: tags.punctuation, color: '#5f6368' },
    ]);

    return {
      theme: editorTheme,
      highlight: syntaxHighlighting(apiJsonHighlightStyle),
    };
  }, [editorModules]);

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
          {editorModules && editorConfig ? (
            <editorModules.CodeMirror
              value={dslText}
              height="360px"
              theme={editorConfig.theme}
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
                editorModules.json(),
                editorConfig.highlight,
                editorModules.autocompletion({ override: [completionSource], activateOnTyping: true }),
              ].filter(Boolean)}
              onChange={(value) => setDslText(value)}
            />
          ) : (
            <Box sx={{ height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary' }}>
              正在加载编辑器...
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}
