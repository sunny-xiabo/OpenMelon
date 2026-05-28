import { useEffect, useRef, useState } from 'react';
import { Box, Typography, Paper, IconButton, Tooltip, Button, alpha } from '@mui/material';
import { ZoomIn, ZoomOut, FitScreen, Download, Fullscreen, FullscreenExit, SaveAlt, Schema, ViewList, AccountTree, ViewAgendaOutlined } from '@mui/icons-material';

const loadMarkmapEngine = () => Promise.all([
  import('markmap-lib'),
  import('markmap-view'),
]);

export function prefetchMindMapEngine() {
  return loadMarkmapEngine().then(() => undefined);
}

function buildMindMapData(testCases) {
  if (!testCases?.length) return { name: '暂无测试用例', children: [] };

  const groups = {};
  testCases.forEach(tc => {
    const p = tc.priority || 'Medium';
    (groups[p] ||= []).push(tc);
  });

  const root = {
    name: `测试用例总览 (${testCases.length}个)`,
    children: [],
  };

  Object.entries(groups).forEach(([priority, cases]) => {
    const pNode = { name: `${priority} 优先级 (${cases.length}个)`, children: [] };
    cases.forEach(tc => {
      const tcNode = { name: tc.title || tc.id || '未知', children: [] };
      if (tc.description) tcNode.children.push({ name: `描述: ${tc.description}`, children: [] });
      if (tc.preconditions) tcNode.children.push({ name: `前置条件: ${tc.preconditions}`, children: [] });
      if (tc.steps?.length) {
        const sNode = { name: `测试步骤 (${tc.steps.length}步)`, children: [] };
        tc.steps.forEach(step => {
          const stepNode = { name: `步骤${step.step_number}: ${step.description}`, children: [] };
          if (step.expected_result) stepNode.children.push({ name: `预期: ${step.expected_result}`, children: [] });
          sNode.children.push(stepNode);
        });
        tcNode.children.push(sNode);
      }
      pNode.children.push(tcNode);
    });
    root.children.push(pNode);
  });

  const totalSteps = testCases.reduce((s, tc) => s + (tc.steps?.length || 0), 0);
  root.children.push({
    name: '统计信息',
    children: [
      { name: `总用例: ${testCases.length}`, children: [] },
      { name: `优先级: ${Object.keys(groups).length}种`, children: [] },
      { name: `平均步骤: ${(totalSteps / testCases.length || 0).toFixed(1)}`, children: [] },
    ],
  });

  return root;
}

function toMarkdown(data, level = 1) {
  const prefix = '#'.repeat(Math.min(level, 6));
  let md = `${prefix} ${data.name}\n\n`;
  (data.children || []).forEach(c => { md += toMarkdown(c, level + 1); });
  return md;
}

export default function TestCaseMindMap({ testCases, viewMode, setViewMode, exportExcel, exportXMind, storeToVector, storingVector }) {
  const svgRef = useRef(null);
  const mmRef = useRef(null);
  const markmapRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!svgRef.current || !testCases?.length) return;
    let cancelled = false;

    async function renderMindMap() {
      if (!markmapRef.current) {
        const [{ Transformer }, { Markmap }] = await loadMarkmapEngine();
        markmapRef.current = {
          transformer: new Transformer(),
          Markmap,
        };
      }
      if (cancelled || !svgRef.current) return;

      const data = buildMindMapData(testCases);
      const md = toMarkdown(data);
      const { root } = markmapRef.current.transformer.transform(md);

      if (mmRef.current) mmRef.current.destroy();
      mmRef.current = markmapRef.current.Markmap.create(svgRef.current, {
        initialExpandLevel: 3,
        maxWidth: 350,
        spacingVertical: 10,
        spacingHorizontal: 100,
      });
      mmRef.current.setData(root);
      setTimeout(() => {
        if (mmRef.current) {
          mmRef.current.fit();
        }
      }, 100);
    }

    renderMindMap().catch((error) => {
      console.error('Failed to render test case mind map:', error);
    });

    return () => {
      cancelled = true;
      if (mmRef.current) {
        mmRef.current.destroy();
        mmRef.current = null;
      }
    };
  }, [testCases]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (mmRef.current) {
        mmRef.current.fit();
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [isFullscreen]);

  const zoomIn = () => mmRef.current?.rescale(1.2);
  const zoomOut = () => mmRef.current?.rescale(0.8);
  const fitView = () => mmRef.current?.fit();

  const exportSvg = () => {
    if (!svgRef.current) return;
    mmRef.current?.fit();
    setTimeout(() => {
      const el = svgRef.current.cloneNode(true);
      const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      style.textContent = 'text { font-family: -apple-system, sans-serif; font-size: 13px; }';
      el.insertBefore(style, el.firstChild);
      el.style.backgroundColor = '#fff';
      const blob = new Blob([new XMLSerializer().serializeToString(el)], { type: 'image/svg+xml;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `test-cases-mindmap-${Date.now()}.svg`;
      a.click();
      URL.revokeObjectURL(a.href);
    }, 300);
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        overflow: 'hidden',
        ...(isFullscreen && {
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 9999,
          borderRadius: 0,
        }),
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1.75, py: 1, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'grey.50' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" fontWeight={600}>测试用例思维导图</Typography>
          {setViewMode && (
            <Box sx={{ display: 'flex', gap: 0.25, ml: 1 }}>
              {[
                { mode: 'stages', icon: <ViewAgendaOutlined sx={{ fontSize: 16 }} />, label: '阶段' },
                { mode: 'list', icon: <ViewList sx={{ fontSize: 16 }} />, label: '列表' },
                { mode: 'mindmap', icon: <AccountTree sx={{ fontSize: 16 }} />, label: '导图' },
              ].map(({ mode, icon, label }) => (
                <Button
                  key={mode}
                  size="small"
                  variant={viewMode === mode ? 'contained' : 'outlined'}
                  onClick={() => setViewMode(mode)}
                  startIcon={icon}
                  sx={{
                    minWidth: 0, px: 1.25, py: 0.3, fontSize: 11, fontWeight: 600,
                    textTransform: 'none',
                    ...(viewMode === mode ? {} : { borderColor: 'divider', color: 'text.secondary' }),
                  }}
                >
                  {label}
                </Button>
              ))}
            </Box>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
          {exportExcel && (
            <Tooltip title="导出 Excel">
              <IconButton size="small" onClick={exportExcel}>
                <SaveAlt fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {exportXMind && (
            <Tooltip title="导出 XMind">
              <IconButton size="small" onClick={exportXMind}>
                <Download fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {storeToVector && (
            <Tooltip title="存入向量库">
              <IconButton size="small" onClick={storeToVector} disabled={storingVector}>
                <Schema fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="放大">
            <IconButton size="small" onClick={zoomIn}>
              <ZoomIn fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="缩小">
            <IconButton size="small" onClick={zoomOut}>
              <ZoomOut fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="适应视图">
            <IconButton size="small" onClick={fitView}>
              <FitScreen fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="导出SVG图片">
            <IconButton size="small" onClick={exportSvg}>
              <Download fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={isFullscreen ? '退出全屏' : '全屏'}>
            <IconButton size="small" onClick={() => setIsFullscreen(!isFullscreen)}>
              {isFullscreen ? <FullscreenExit fontSize="small" /> : <Fullscreen fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
      <Box
        sx={{
          flex: 1,
          minHeight: isFullscreen ? 0 : 400,
          position: 'relative',
          overflow: 'hidden',
          '& svg': { width: '100%', height: '100%' },
        }}
      >
        <svg ref={svgRef} />
      </Box>
    </Paper>
  );
}
