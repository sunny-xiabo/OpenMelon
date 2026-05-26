import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Collapse, Paper, Stack, Typography } from '@mui/material';

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
    
    // Sleek macOS Hacker Dark Theme for CodeMirror
    const editorTheme = EditorView.theme({
      '&': {
        backgroundColor: '#0f172a',
        color: '#cbd5e1',
      },
      '.cm-content': {
        caretColor: '#38bdf8',
      },
      '.cm-gutters': {
        backgroundColor: '#1e293b',
        color: '#64748b',
        borderRight: '1px solid #334155',
      },
      '.cm-activeLine': {
        backgroundColor: 'rgba(30, 41, 59, 0.5)',
      },
      '.cm-activeLineGutter': {
        backgroundColor: '#1e293b',
        color: '#38bdf8',
      },
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
        backgroundColor: 'rgba(56, 189, 248, 0.25)',
      },
      '&.cm-focused': {
        outline: 'none',
      },
      '.cm-tooltip': {
        border: '1px solid #334155',
        borderRadius: '6px',
        backgroundColor: '#1e293b',
        color: '#cbd5e1',
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
      },
      '.cm-tooltip-autocomplete ul li[aria-selected]': {
        backgroundColor: 'rgba(56, 189, 248, 0.15)',
        color: '#38bdf8',
      },
    });

    const apiJsonHighlightStyle = HighlightStyle.define([
      { tag: tags.propertyName, color: '#38bdf8', fontWeight: '600' }, // bright cyan keys
      { tag: tags.string, color: '#34d399' }, // emerald strings
      { tag: tags.number, color: '#fbbf24' }, // amber numbers
      { tag: tags.bool, color: '#a78bfa' }, // purple booleans
      { tag: tags.null, color: '#94a3b8', fontStyle: 'italic' },
      { tag: tags.punctuation, color: '#cbd5e1' },
    ]);

    return {
      theme: editorTheme,
      highlight: syntaxHighlighting(apiJsonHighlightStyle),
    };
  }, [editorModules]);

  return (
    <Paper sx={{
      borderRadius: 3.5,
      border: '1px solid rgba(0,0,0,0.08)',
      overflow: 'hidden',
      boxShadow: '0 12px 30px rgba(0,0,0,0.04)',
      bgcolor: '#0f172a',
    }}>
      {/* macOS Title Bar */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 2,
        py: 1.25,
        bgcolor: '#e2e8f0',
        borderBottom: '1px solid rgba(0,0,0,0.05)',
      }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#ef4444' }} />
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#f59e0b' }} />
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#10b981' }} />
          <Typography variant="caption" sx={{ ml: 1.5, fontWeight: 800, color: 'text.secondary', fontFamily: 'monospace', fontSize: '10px' }}>terminal - flow_dsl.json</Typography>
        </Stack>
        <Button
          size="small"
          variant="text"
          onClick={onToggle}
          sx={{
            color: '#4f46e5',
            fontWeight: 800,
            textTransform: 'none',
            fontSize: '11px',
            '&:hover': { bgcolor: 'rgba(79, 70, 229, 0.08)' }
          }}
        >
          {open ? '收起 JSON' : '展开 JSON'}
        </Button>
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
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
            <Box sx={{ height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', bgcolor: '#0f172a', fontFamily: 'monospace' }}>
              编辑器准备中...
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}
