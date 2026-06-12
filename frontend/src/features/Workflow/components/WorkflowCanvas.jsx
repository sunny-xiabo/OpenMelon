import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Box, Paper, InputBase, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  PlayArrow, Stop, SmartToy, Http, Code, CallSplit,
  Search as SearchIcon, Description, Merge, Loop, Build, Tune, Category
} from '@mui/icons-material';
import { workflowNodeTypes } from './nodes';
import { NODE_CATEGORIES, NODE_DEFINITIONS, generateNodeId, resetNodeIdCounter } from '../utils/nodeDefinitions';
import { wouldCreateCycle } from '../utils/dagValidation';

const ICON_MAP = {
  PlayArrow, Stop, SmartToy, Http, Code, CallSplit,
  Search: SearchIcon, Description, Merge, Loop, Build, Tune, Category,
};

/**
 * Floating Context Menu component for quick node addition on right-click or double-click.
 */
function NodeContextMenu({ x, y, flowX, flowY, onClose, onSelect }) {
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  // Auto-focus search input
  React.useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Filter categories and types based on search query
  const filteredCategories = useMemo(() => {
    return NODE_CATEGORIES.map(cat => {
      const types = cat.types.filter(type => {
        const def = NODE_DEFINITIONS[type];
        if (!def) return false;
        return (
          def.label.toLowerCase().includes(search.toLowerCase()) ||
          (def.description || '').toLowerCase().includes(search.toLowerCase()) ||
          type.toLowerCase().includes(search.toLowerCase())
        );
      });
      return { ...cat, types };
    }).filter(cat => cat.types.length > 0);
  }, [search]);

  // Flatten options for keyboard arrow navigation
  const flatItems = useMemo(() => {
    const items = [];
    filteredCategories.forEach(cat => {
      cat.types.forEach(type => {
        items.push({ type, categoryId: cat.id });
      });
    });
    return items;
  }, [filteredCategories]);

  // Reset keyboard focus when search query changes
  React.useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  // Keyboard navigation handler
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (flatItems.length > 0 ? (prev + 1) % flatItems.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (flatItems.length > 0 ? (prev - 1 + flatItems.length) % flatItems.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatItems[activeIndex]) {
        onSelect(flatItems[activeIndex].type, { x: flowX, y: flowY });
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  // Scroll active item into viewport if out of bounds
  React.useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector('[data-active="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeIndex]);

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'absolute',
        left: x,
        top: y,
        zIndex: 1000,
        width: 280,
        maxHeight: 360,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 3,
        border: '1px solid',
        borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)',
        bgcolor: isDark ? 'rgba(17, 24, 39, 0.85)' : 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(20px)',
        overflow: 'hidden',
        boxShadow: isDark ? '0 12px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(99, 102, 241, 0.1)' : '0 12px 32px rgba(15,23,42,0.12)',
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      {/* Search Header */}
      <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid', borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }}>
        <SearchIcon sx={{ color: 'text.secondary', fontSize: 18 }} />
        <InputBase
          inputRef={inputRef}
          placeholder="输入节点名称搜索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          fullWidth
          sx={{
            fontSize: '13px',
            color: 'text.primary',
            '& input::placeholder': {
              color: 'text.secondary',
              opacity: 0.8,
            }
          }}
        />
      </Box>

      {/* Node Options Scroll Pane */}
      <Box
        ref={listRef}
        sx={{
          flex: 1,
          overflowY: 'auto',
          p: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          '&::-webkit-scrollbar': { width: '4px' },
          '&::-webkit-scrollbar-track': { background: 'transparent' },
          '&::-webkit-scrollbar-thumb': {
            background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
            borderRadius: '4px'
          }
        }}
      >
        {flatItems.length === 0 ? (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">无匹配节点</Typography>
          </Box>
        ) : (
          filteredCategories.map(cat => {
            let runningIndexOffset = 0;
            const catIndex = filteredCategories.indexOf(cat);
            for (let i = 0; i < catIndex; i++) {
              runningIndexOffset += filteredCategories[i].types.length;
            }

            return (
              <Box key={cat.id}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    fontWeight: 700,
                    px: 1,
                    mb: 0.5,
                    display: 'block',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    fontSize: '10px'
                  }}
                >
                  {cat.label}
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                  {cat.types.map((type, idx) => {
                    const def = NODE_DEFINITIONS[type];
                    const IconComponent = ICON_MAP[def.icon] || PlayArrow;
                    const itemFlatIndex = runningIndexOffset + idx;
                    const isActive = activeIndex === itemFlatIndex;

                    return (
                      <Box
                        key={type}
                        data-active={isActive ? 'true' : 'false'}
                        onClick={() => onSelect(type, { x: flowX, y: flowY })}
                        onMouseEnter={() => setActiveIndex(itemFlatIndex)}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          px: 1,
                          py: 0.75,
                          borderRadius: 1.5,
                          cursor: 'pointer',
                          border: '1px solid',
                          borderColor: isActive ? def.color : 'transparent',
                          bgcolor: isActive ? `${def.color}12` : 'transparent',
                          transition: 'all 0.15s ease',
                          '&:hover': {
                            bgcolor: `${def.color}08`,
                          }
                        }}
                      >
                        <Box
                          sx={{
                            width: 24,
                            height: 24,
                            borderRadius: '6px',
                            display: 'grid',
                            placeItems: 'center',
                            bgcolor: `${def.color}15`,
                          }}
                        >
                          <IconComponent sx={{ fontSize: 14, color: def.color }} />
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', color: 'text.primary', lineHeight: 1.2 }}>
                            {def.label}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{
                              fontSize: '9px',
                              color: 'text.secondary',
                              display: 'block',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              lineHeight: 1.2
                            }}
                          >
                            {def.description}
                          </Typography>
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            );
          })
        )}
      </Box>
    </Paper>
  );
}

/**
 * Main workflow canvas component.
 * Wraps ReactFlow with node palette drag-and-drop support.
 */
function WorkflowCanvasInner({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onDrop,
  onDragOver,
  selectedNodeId,
}) {
  const reactFlowWrapper = useRef(null);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { screenToFlowPosition } = useReactFlow();
  const [menuPosition, setMenuPosition] = useState(null);

  // Memoize node types
  const nodeTypes = useMemo(() => workflowNodeTypes, []);

  // Validate connections -- prevent cycles and self-connections
  const isValidConnection = useCallback(
    (connection) => {
      if (connection.source === connection.target) return false;
      return !wouldCreateCycle(nodes, edges, connection.source, connection.target);
    },
    [nodes, edges]
  );

  // Handle new connections
  const handleConnect = useCallback(
    (params) => {
      if (isValidConnection(params)) {
        onConnect(params);
      }
    },
    [isValidConnection, onConnect]
  );

  // Project screen coordinates to ReactFlow flow coordinate system
  const handleDrop = useCallback(
    (event) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData('application/reactflow-type');
      if (!nodeType) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Snap to grid coordinates
      const snapGrid = [20, 20];
      const snappedPosition = {
        x: Math.round(position.x / snapGrid[0]) * snapGrid[0],
        y: Math.round(position.y / snapGrid[1]) * snapGrid[1],
      };

      onDrop?.(nodeType, snappedPosition);
    },
    [screenToFlowPosition, onDrop]
  );

  // Right-click event on pane
  const handlePaneContextMenu = useCallback(
    (event) => {
      event.preventDefault();
      if (!reactFlowWrapper.current) return;
      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;

      const flowPosition = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Snap menu selection spawn to grid coordinates
      const snapGrid = [20, 20];
      const snappedFlowPosition = {
        x: Math.round(flowPosition.x / snapGrid[0]) * snapGrid[0],
        y: Math.round(flowPosition.y / snapGrid[1]) * snapGrid[1],
      };

      setMenuPosition({
        x,
        y,
        flowX: snappedFlowPosition.x,
        flowY: snappedFlowPosition.y,
      });
    },
    [screenToFlowPosition]
  );

  // Double-click event on pane
  const handlePaneDoubleClick = useCallback(
    (event) => {
      event.preventDefault();
      if (!reactFlowWrapper.current) return;
      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;

      const flowPosition = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Snap menu selection spawn to grid coordinates
      const snapGrid = [20, 20];
      const snappedFlowPosition = {
        x: Math.round(flowPosition.x / snapGrid[0]) * snapGrid[0],
        y: Math.round(flowPosition.y / snapGrid[1]) * snapGrid[1],
      };

      setMenuPosition({
        x,
        y,
        flowX: snappedFlowPosition.x,
        flowY: snappedFlowPosition.y,
      });
    },
    [screenToFlowPosition]
  );

  // Dismiss context menu
  const handlePaneClick = useCallback(() => {
    setMenuPosition(null);
  }, []);

  return (
    <Box
      ref={reactFlowWrapper}
      sx={{ 
        flex: 1, 
        height: '100%', 
        position: 'relative',
        bgcolor: isDark ? '#090d16' : '#fafafa', 
        transition: 'background-color var(--transition-normal)' 
      }}
      onDrop={handleDrop}
      onDragOver={onDragOver}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        isValidConnection={isValidConnection}
        fitView
        snapToGrid
        snapGrid={[20, 20]}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#6366f1', strokeWidth: 2.5 },
        }}
        proOptions={{ hideAttribution: true }}
        onPaneContextMenu={handlePaneContextMenu}
        onPaneClick={handlePaneClick}
        onPaneDoubleClick={handlePaneDoubleClick}
        onMoveStart={handlePaneClick}
        zoomOnDoubleClick={false}
      >
        <Background 
          gap={20} 
          size={1.5} 
          color={isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.08)'} 
        />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const def = NODE_DEFINITIONS[node.type];
            return def?.color || '#94a3b8';
          }}
          maskColor={isDark ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.08)'}
          style={{ 
            height: 100, 
            width: 150,
            background: isDark ? '#111827' : '#ffffff',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(15, 23, 42, 0.08)',
            borderRadius: '8px',
          }}
        />
      </ReactFlow>

      {menuPosition && (
        <NodeContextMenu
          x={menuPosition.x}
          y={menuPosition.y}
          flowX={menuPosition.flowX}
          flowY={menuPosition.flowY}
          onClose={handlePaneClick}
          onSelect={(nodeType, pos) => {
            onDrop?.(nodeType, pos);
            handlePaneClick();
          }}
        />
      )}
    </Box>
  );
}

/**
 * Exported component wrapped with ReactFlowProvider.
 */
export default function WorkflowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onDrop,
  onDragOver,
  selectedNodeId,
}) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onDrop={onDrop}
        onDragOver={onDragOver}
        selectedNodeId={selectedNodeId}
      />
    </ReactFlowProvider>
  );
}
