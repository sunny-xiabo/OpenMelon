import React, { useState, useCallback, useMemo } from 'react';
import { Box, Snackbar, Alert } from '@mui/material';
import {
  useNodesState,
  useEdgesState,
  addEdge,
} from '@xyflow/react';

import WorkflowCanvas from './components/WorkflowCanvas';
import NodePalette from './components/NodePalette';
import NodeConfigPanel from './components/NodeConfigPanel';
import WorkflowToolbar from './components/WorkflowToolbar';
import WorkflowRunPanel from './components/WorkflowRunPanel';
import WorkflowList from './components/WorkflowList';

import { useWorkflow } from './hooks/useWorkflow';
import { useWorkflowRun } from './hooks/useWorkflowRun';
import { NODE_DEFINITIONS, generateNodeId, resetNodeIdCounter } from './utils/nodeDefinitions';
import { validateWorkflow } from './utils/dagValidation';

/**
 * Main workflow page -- either shows the list or the editor.
 */
export default function WorkflowPage() {
  const [currentWorkflowId, setCurrentWorkflowId] = useState(null);
  const [view, setView] = useState('list'); // list | editor

  const handleSelectWorkflow = useCallback((wfId) => {
    setCurrentWorkflowId(wfId);
    setView('editor');
  }, []);

  const handleBackToList = useCallback(() => {
    setCurrentWorkflowId(null);
    setView('list');
  }, []);

  if (view === 'list') {
    return (
      <WorkflowList
        onSelectWorkflow={handleSelectWorkflow}
        onCreateWorkflow={async (data) => {
          // Will be handled by the editor after creation
          setCurrentWorkflowId('__new__');
          setView('editor');
        }}
      />
    );
  }

  return (
    <WorkflowEditor
      workflowId={currentWorkflowId}
      onBack={handleBackToList}
    />
  );
}

/**
 * Workflow editor -- canvas + palette + config panel + toolbar + run panel.
 */
function WorkflowEditor({ workflowId: propWorkflowId, onBack }) {
  // Track the actual workflow ID locally so new workflows get their ID after first save
  const [workflowId, setWorkflowId] = useState(propWorkflowId);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [workflowName, setWorkflowName] = useState('Untitled');
  const [workflowStatus, setWorkflowStatus] = useState('draft');
  const [workflowMeta, setWorkflowMeta] = useState({});
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  const {
    workflow, isLoading, create, update, publish, unpublish,
  } = useWorkflow(workflowId !== '__new__' ? workflowId : null);

  const {
    runStatus, nodeStates, events, outputs, error: runError,
    startRun, cancelRun, resetRun, isRunning,
  } = useWorkflowRun();

  // Load workflow data when available
  React.useEffect(() => {
    if (workflow) {
      setWorkflowName(workflow.name);
      setWorkflowStatus(workflow.status);
      setWorkflowMeta(workflow);

      // Convert workflow nodes to ReactFlow format
      const rfNodes = (workflow.nodes || []).map(n => ({
        id: n.id,
        type: n.type,
        position: n.position || { x: 0, y: 0 },
        data: {
          ...n,
          nodeType: n.type,
          config: n.config || {},
          label: n.title,
        },
      }));
      const rfEdges = (workflow.edges || []).map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.source_handle,
        targetHandle: e.target_handle,
        type: 'smoothstep',
        animated: true,
      }));

      setNodes(rfNodes);
      setEdges(rfEdges);
      resetNodeIdCounter();
    }
  }, [workflow]);

  // Handle new node drop from palette (position is pre-projected to flow coordinates by WorkflowCanvas)
  const onDrop = useCallback((nodeType, position) => {
    if (!nodeType || !NODE_DEFINITIONS[nodeType]) return;

    const def = NODE_DEFINITIONS[nodeType];
    const id = generateNodeId(nodeType);

    const newNode = {
      id,
      type: nodeType,
      position,
      data: {
        nodeType,
        config: { ...def.defaultConfig },
        label: def.label,
        description: def.description,
      },
    };

    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Handle node selection
  const onNodeClick = useCallback((event, node) => {
    setSelectedNodeId(node.id);
  }, []);

  // Get selected node object
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find(n => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  // Update node config from config panel
  const handleNodeConfigChange = useCallback((updatedNode) => {
    setNodes(nds => nds.map(n => {
      if (n.id === updatedNode.id) {
        return {
          ...n,
          data: updatedNode.data,
        };
      }
      return n;
    }));
  }, [setNodes]);

  // Handle new connections
  const onConnect = useCallback((params) => {
    const newEdge = {
      ...params,
      id: `edge-${params.source}-${params.target}-${params.sourceHandle || 'source'}`,
      type: 'smoothstep',
      animated: true,
    };
    setEdges(eds => addEdge(newEdge, eds));
  }, [setEdges]);

  // Save workflow
  const handleSave = useCallback(async () => {
    const workflowData = {
      name: workflowName,
      nodes: nodes.map(n => ({
        id: n.id,
        type: n.data?.nodeType || n.type,
        title: n.data?.label || n.id,
        description: n.data?.description || '',
        config: n.data?.config || {},
        position: n.position,
      })),
      edges: edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        source_handle: e.sourceHandle || 'source',
        target_handle: e.targetHandle || 'target',
      })),
      variables: workflowMeta.variables || [],
      environment_variables: workflowMeta.environment_variables || [],
    };

    try {
      if (workflowId === '__new__' || !workflowId) {
        const created = await create(workflowData);
        // Update local workflow ID so subsequent saves/publish/run work
        setWorkflowId(created.id);
        window.history.replaceState(null, '', `?workflow=${created.id}`);
        setSnackbar({ open: true, message: '工作流已创建', severity: 'success' });
      } else {
        await update(workflowData);
        setSnackbar({ open: true, message: '工作流已保存', severity: 'success' });
      }
    } catch (err) {
      setSnackbar({ open: true, message: `保存失败: ${err.message}`, severity: 'error' });
    }
  }, [workflowName, nodes, edges, workflowMeta, workflowId, create, update]);

  // Run workflow
  const handleRun = useCallback(async () => {
    if (!workflowId || workflowId === '__new__') {
      setSnackbar({ open: true, message: '请先保存工作流', severity: 'warning' });
      return;
    }

    // Validate
    const errors = validateWorkflow(nodes, edges);
    if (errors.length > 0) {
      setSnackbar({ open: true, message: errors[0], severity: 'error' });
      return;
    }

    // Collect inputs from start node
    const startNode = nodes.find(n => n.type === 'start');
    const inputs = {};
    if (startNode?.data?.config?.variables) {
      for (const v of startNode.data.config.variables) {
        inputs[v.name] = v.default || '';
      }
    }

    await startRun(workflowId, inputs);
  }, [workflowId, nodes, edges, startRun]);

  // Export DSL
  const handleExport = useCallback(async () => {
    if (!workflowId || workflowId === '__new__') return;
    try {
      const res = await fetch(`/api/workflows/${workflowId}/export?format=json`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `workflow_${workflowId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setSnackbar({ open: true, message: `导出失败: ${err.message}`, severity: 'error' });
    }
  }, [workflowId]);

  // Import DSL client-side
  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result;
          if (!content) return;

          const data = JSON.parse(content);
          
          // Support both direct root exported format and wrapped format
          const dslData = data.workflow ? data.workflow : data;

          if (!dslData.nodes || !Array.isArray(dslData.nodes)) {
            throw new Error('DSL 文件格式不正确，缺少 nodes 数组。');
          }

          const name = dslData.name || 'Imported Workflow';
          
          // Convert nodes to ReactFlow format
          const rfNodes = dslData.nodes.map(n => ({
            id: n.id,
            type: n.type,
            position: n.position || { x: 100, y: 100 },
            data: {
              ...n,
              nodeType: n.type,
              config: n.config || {},
              label: n.title || n.label || n.id,
            },
          }));

          const rfEdges = (dslData.edges || []).map(e => ({
            id: e.id || `edge-${e.source}-${e.target}-${e.source_handle || 'source'}`,
            source: e.source,
            target: e.target,
            sourceHandle: e.source_handle || e.sourceHandle || 'source',
            targetHandle: e.target_handle || e.targetHandle || 'target',
            type: 'smoothstep',
            animated: true,
          }));

          setWorkflowName(name);
          setNodes(rfNodes);
          setEdges(rfEdges);
          setWorkflowStatus('draft');
          
          // Re-initialize ID counters based on current nodes to prevent duplicates
          resetNodeIdCounter();

          setSnackbar({ open: true, message: '工作流 DSL 导入成功，请确认后保存', severity: 'success' });
        } catch (err) {
          setSnackbar({ open: true, message: `导入失败: ${err.message}`, severity: 'error' });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [setNodes, setEdges]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <WorkflowToolbar
        onBack={onBack}
        workflowName={workflowName}
        status={workflowStatus}
        isRunning={isRunning}
        onSave={handleSave}
        onPublish={async () => {
          if (workflowId && workflowId !== '__new__') {
            await publish();
            setWorkflowStatus('published');
            setSnackbar({ open: true, message: '已发布', severity: 'success' });
          }
        }}
        onUnpublish={async () => {
          if (workflowId && workflowId !== '__new__') {
            await unpublish();
            setWorkflowStatus('draft');
            setSnackbar({ open: true, message: '已取消发布', severity: 'info' });
          }
        }}
        onRun={handleRun}
        onCancel={() => cancelRun()}
        onExport={handleExport}
        onImport={handleImport}
        onNameChange={setWorkflowName}
      />

      {/* Main area */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: Node Palette */}
        <NodePalette />

        {/* Center: Canvas */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <WorkflowCanvas
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

          {/* Run panel */}
          <WorkflowRunPanel
            runStatus={runStatus}
            nodeStates={nodeStates}
            events={events}
            error={runError}
            onReset={resetRun}
          />
        </Box>

        {/* Right: Config Panel */}
        <NodeConfigPanel
          node={selectedNode}
          onChange={handleNodeConfigChange}
          onClose={() => setSelectedNodeId(null)}
        />
      </Box>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
