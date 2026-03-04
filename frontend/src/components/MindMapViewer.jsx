import React, { useEffect, useRef, useState } from 'react';
import { Markmap } from 'markmap-view';
import { Transformer } from 'markmap-lib';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import DownloadIcon from '@mui/icons-material/Download';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';

const MindMapViewer = ({ testCases = [], onMindMapUpdate }) => {
  const svgRef = useRef();
  const markmapRef = useRef();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingNode, setEditingNode] = useState(null);
  const [editDialog, setEditDialog] = useState({ open: false, node: null, newText: '' });
  const [mindMapData, setMindMapData] = useState(null);

  // 从测试用例生成思维导图数据
  const generateMindMapData = (testCases) => {
    if (!testCases || testCases.length === 0) {
      return {
        name: "暂无测试用例",
        children: []
      };
    }

    // 按优先级分组
    const priorityGroups = {};
    testCases.forEach(tc => {
      const priority = tc.priority || 'Medium';
      if (!priorityGroups[priority]) {
        priorityGroups[priority] = [];
      }
      priorityGroups[priority].push(tc);
    });

    // 构建思维导图结构
    const mindMapData = {
      name: `测试用例总览 (${testCases.length}个)`,
      children: []
    };

    // 为每个优先级创建分支
    Object.entries(priorityGroups).forEach(([priority, cases]) => {
      const priorityNode = {
        name: `${priority} 优先级 (${cases.length}个)`,
        children: []
      };

      cases.forEach(tc => {
        const testCaseNode = {
          name: tc.title || tc.id || '未知测试用例',
          children: []
        };

        // 添加描述
        if (tc.description) {
          testCaseNode.children.push({
            name: `描述: ${tc.description.length > 50 ? tc.description.substring(0, 50) + '...' : tc.description}`,
            children: []
          });
        }

        // 添加前置条件
        if (tc.preconditions) {
          testCaseNode.children.push({
            name: `前置条件: ${tc.preconditions.length > 50 ? tc.preconditions.substring(0, 50) + '...' : tc.preconditions}`,
            children: []
          });
        }

        // 添加测试步骤
        if (tc.steps && tc.steps.length > 0) {
          const stepsNode = {
            name: `测试步骤 (${tc.steps.length}步)`,
            children: []
          };

          tc.steps.slice(0, 5).forEach(step => {
            const stepNode = {
              name: `步骤${step.step_number}: ${step.description.length > 30 ? step.description.substring(0, 30) + '...' : step.description}`,
              children: []
            };

            if (step.expected_result) {
              stepNode.children.push({
                name: `预期: ${step.expected_result.length > 40 ? step.expected_result.substring(0, 40) + '...' : step.expected_result}`,
                children: []
              });
            }

            stepsNode.children.push(stepNode);
          });

          testCaseNode.children.push(stepsNode);
        }

        priorityNode.children.push(testCaseNode);
      });

      mindMapData.children.push(priorityNode);
    });

    // 添加统计信息
    const totalSteps = testCases.reduce((sum, tc) => sum + (tc.steps ? tc.steps.length : 0), 0);
    const avgSteps = testCases.length > 0 ? (totalSteps / testCases.length).toFixed(1) : 0;

    mindMapData.children.push({
      name: "统计信息",
      children: [
        { name: `总测试用例: ${testCases.length}`, children: [] },
        { name: `优先级分布: ${Object.keys(priorityGroups).length}种`, children: [] },
        { name: `平均步骤数: ${avgSteps}`, children: [] }
      ]
    });

    return mindMapData;
  };

  // 将思维导图数据转换为Markdown格式
  const convertToMarkdown = (data, level = 1) => {
    const prefix = '#'.repeat(level);
    let markdown = `${prefix} ${data.name}\n\n`;

    if (data.children && data.children.length > 0) {
      data.children.forEach(child => {
        markdown += convertToMarkdown(child, level + 1);
      });
    }

    return markdown;
  };

  // 初始化思维导图
  useEffect(() => {
    if (testCases && testCases.length > 0) {
      const data = generateMindMapData(testCases);
      setMindMapData(data);
      
      const markdown = convertToMarkdown(data);
      const transformer = new Transformer();
      const { root, features } = transformer.transform(markdown);

      if (svgRef.current) {
        if (markmapRef.current) {
          markmapRef.current.destroy();
        }

        markmapRef.current = Markmap.create(svgRef.current, {
          colorFreezeLevel: 2,
          duration: 300,
          maxWidth: 300,
          spacingVertical: 8,
          spacingHorizontal: 80,
          autoFit: true,
          pan: true,
          zoom: true
        }, root);

        // 添加点击事件监听
        if (isEditing) {
          svgRef.current.addEventListener('click', handleNodeClick);
        }
      }
    }

    return () => {
      if (markmapRef.current) {
        markmapRef.current.destroy();
      }
    };
  }, [testCases, isEditing]);

  // 处理节点点击事件
  const handleNodeClick = (event) => {
    if (!isEditing) return;

    const target = event.target;
    const textElement = target.closest('g')?.querySelector('text');
    
    if (textElement) {
      const nodeText = textElement.textContent;
      setEditDialog({
        open: true,
        node: textElement,
        newText: nodeText
      });
    }
  };

  // 处理节点编辑
  const handleNodeEdit = () => {
    if (editDialog.node && editDialog.newText.trim()) {
      editDialog.node.textContent = editDialog.newText.trim();
      
      // 通知父组件更新
      if (onMindMapUpdate) {
        onMindMapUpdate(mindMapData);
      }
    }
    
    setEditDialog({ open: false, node: null, newText: '' });
  };

  // 缩放控制
  const handleZoomIn = () => {
    if (markmapRef.current) {
      markmapRef.current.rescale(1.2);
    }
  };

  const handleZoomOut = () => {
    if (markmapRef.current) {
      markmapRef.current.rescale(0.8);
    }
  };

  const handleFitView = () => {
    if (markmapRef.current) {
      markmapRef.current.fit();
    }
  };

  // 全屏切换
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // 导出思维导图
  const handleExport = () => {
    if (svgRef.current) {
      const svgData = new XMLSerializer().serializeToString(svgRef.current);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      
      const downloadLink = document.createElement('a');
      downloadLink.href = svgUrl;
      downloadLink.download = 'test-cases-mindmap.svg';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(svgUrl);
    }
  };

  if (!testCases || testCases.length === 0) {
    return (
      <Paper elevation={3} sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          暂无测试用例数据，无法生成思维导图
        </Typography>
      </Paper>
    );
  }

  return (
    <>
      <Paper 
        elevation={3} 
        sx={{ 
          position: isFullscreen ? 'fixed' : 'relative',
          top: isFullscreen ? 0 : 'auto',
          left: isFullscreen ? 0 : 'auto',
          width: isFullscreen ? '100vw' : '100%',
          height: isFullscreen ? '100vh' : '600px',
          zIndex: isFullscreen ? 9999 : 'auto',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* 工具栏 */}
        <Box sx={{ 
          p: 2, 
          borderBottom: 1, 
          borderColor: 'divider',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <Typography variant="h6">
            测试用例思维导图
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title="放大">
              <IconButton onClick={handleZoomIn} size="small">
                <ZoomInIcon />
              </IconButton>
            </Tooltip>
            
            <Tooltip title="缩小">
              <IconButton onClick={handleZoomOut} size="small">
                <ZoomOutIcon />
              </IconButton>
            </Tooltip>
            
            <Tooltip title="适应视图">
              <IconButton onClick={handleFitView} size="small">
                <CenterFocusStrongIcon />
              </IconButton>
            </Tooltip>
            
            <Tooltip title={isEditing ? "保存编辑" : "编辑模式"}>
              <IconButton 
                onClick={() => setIsEditing(!isEditing)} 
                size="small"
                color={isEditing ? "primary" : "default"}
              >
                {isEditing ? <SaveIcon /> : <EditIcon />}
              </IconButton>
            </Tooltip>
            
            <Tooltip title="导出SVG">
              <IconButton onClick={handleExport} size="small">
                <DownloadIcon />
              </IconButton>
            </Tooltip>
            
            <Tooltip title={isFullscreen ? "退出全屏" : "全屏显示"}>
              <IconButton onClick={toggleFullscreen} size="small">
                {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* 思维导图容器 */}
        <Box sx={{ 
          flex: 1, 
          position: 'relative',
          overflow: 'hidden'
        }}>
          {isEditing && (
            <Box sx={{ 
              position: 'absolute', 
              top: 10, 
              left: 10, 
              zIndex: 10,
              bgcolor: 'warning.light',
              p: 1,
              borderRadius: 1
            }}>
              <Typography variant="caption">
                编辑模式：点击节点进行编辑
              </Typography>
            </Box>
          )}
          
          <svg
            ref={svgRef}
            style={{
              width: '100%',
              height: '100%',
              cursor: isEditing ? 'pointer' : 'default'
            }}
          />
        </Box>
      </Paper>

      {/* 编辑对话框 */}
      <Dialog open={editDialog.open} onClose={() => setEditDialog({ open: false, node: null, newText: '' })}>
        <DialogTitle>编辑节点</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="节点文本"
            fullWidth
            variant="outlined"
            value={editDialog.newText}
            onChange={(e) => setEditDialog({ ...editDialog, newText: e.target.value })}
            multiline
            rows={3}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog({ open: false, node: null, newText: '' })}>
            <CancelIcon sx={{ mr: 1 }} />
            取消
          </Button>
          <Button onClick={handleNodeEdit} variant="contained">
            <SaveIcon sx={{ mr: 1 }} />
            保存
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default MindMapViewer;
