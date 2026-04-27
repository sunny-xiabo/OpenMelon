import { useEffect, useRef, useState } from 'react';
import { Box, Typography, Paper, IconButton, Tooltip } from '@mui/material';
import { ZoomIn, ZoomOut, FitScreen, Download, Fullscreen, FullscreenExit } from '@mui/icons-material';
import { Transformer } from 'markmap-lib';
import { Markmap } from 'markmap-view';

const transformer = new Transformer();

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

export default function TestCaseMindMap({ testCases }) {
  const svgRef = useRef(null);
  const mmRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!svgRef.current || !testCases?.length) return;
    const data = buildMindMapData(testCases);
    const md = toMarkdown(data);
    const { root } = transformer.transform(md);

    if (mmRef.current) mmRef.current.destroy();
    mmRef.current = Markmap.create(svgRef.current, {
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

    return () => { if (mmRef.current) { mmRef.current.destroy(); mmRef.current = null; } };
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
        <Typography variant="body2" fontWeight={600}>测试用例思维导图</Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
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
