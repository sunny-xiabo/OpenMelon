const FULL_NODE_LIMIT = 500;
const CLUSTER_NODE_LIMIT = 1000;
const CLUSTER_GROUP_MIN_SIZE = 8;

const DEFAULT_VISUAL = {
  color: {
    bg: '#64748b',
    border: '#475569',
  },
  size: 20,
};

export function getGraphRenderMode(nodeCount = 0) {
  if (nodeCount > CLUSTER_NODE_LIMIT) return 'cluster';
  if (nodeCount > FULL_NODE_LIMIT) return 'lite';
  return 'full';
}

function getNodeColorKey(node) {
  const labels = node?.labels || [];
  return labels[0] || node?.group || node?.properties?.kind || 'Entity';
}

function getClusterKey(node) {
  const labels = node?.labels || [];
  if (node?.properties?.module) return String(node.properties.module);
  if (labels.includes('Module')) return String(node?.properties?.name || node?.group || labels[0] || 'Module');
  if (labels.includes('DocumentChunk')) return String(node.properties.module || node.properties.doc_type || 'DocumentChunk');
  if (labels.includes('Feature') || labels.includes('APIEntity') || labels.includes('TestCase') || labels.includes('Defect')) {
    return String(node.properties.module || node.properties.name || labels[0] || 'Entity');
  }
  return String(node?.group || labels[0] || node?.properties?.name || 'Entity');
}

function getLegendVisual(legend, key) {
  return legend.find((item) => item.type === key) || DEFAULT_VISUAL;
}

export function getGraphOptions(mode) {
  const isFull = mode === 'full';
  return {
    autoResize: true,
    physics: {
      enabled: isFull,
      stabilization: isFull ? { enabled: true, iterations: 100, fit: true } : false,
    },
    layout: {
      improvedLayout: isFull,
    },
    interaction: {
      hover: isFull,
      tooltipDelay: isFull ? 200 : 0,
      zoomView: true,
      dragView: true,
      hideEdgesOnDrag: !isFull,
      hideNodesOnDrag: false,
    },
    edges: {
      smooth: isFull ? { type: 'curvedCW', roundness: 0.2 } : false,
      color: '#94a3b8',
    },
    nodes: {
      shape: 'dot',
    },
  };
}

export function buildGraphRenderState(data, legend = [], expandedClusterKeys = new Set()) {
  const rawNodes = data?.nodes || [];
  const rawEdges = data?.relationships || [];
  const mode = getGraphRenderMode(rawNodes.length);

  const allNodes = rawNodes.map((node) => {
    const colorKey = getNodeColorKey(node);
    const visual = getLegendVisual(legend, colorKey);
    const clusterKey = getClusterKey(node);
    return {
      id: node.id,
      label: node.properties?.name || node.label || node.id,
      title: node.properties?.description || node.properties?.content || node.label || node.id,
      group: colorKey,
      clusterKey,
      properties: node.properties || {},
      labels: node.labels || [],
      color: {
        background: visual.color.bg,
        border: visual.color.border,
      },
      size: mode === 'cluster' ? Math.max(14, visual.size - 3) : mode === 'lite' ? Math.max(16, visual.size - 1) : visual.size,
      font: {
        color: '#fff',
        size: mode === 'full' ? 12 : 11,
        face: 'Inter, system-ui, sans-serif',
        strokeWidth: 2,
        strokeColor: '#1e293b',
      },
      borderWidth: 1,
      shape: 'dot',
    };
  });

  const clusterBuckets = new Map();
  for (const node of allNodes) {
    const bucket = clusterBuckets.get(node.clusterKey) || {
      key: node.clusterKey,
      count: 0,
      sampleColorKey: node.group,
    };
    bucket.count += 1;
    clusterBuckets.set(node.clusterKey, bucket);
  }

  const clusterGroups = mode === 'cluster'
    ? Array.from(clusterBuckets.values())
        .filter((bucket) => bucket.count >= CLUSTER_GROUP_MIN_SIZE)
        .sort((a, b) => b.count - a.count)
        .map((bucket) => ({
          key: bucket.key,
          count: bucket.count,
          clusterId: `cluster:${encodeURIComponent(bucket.key)}`,
          colorKey: bucket.sampleColorKey,
        }))
    : [];

  const clusterGroupByKey = new Map(clusterGroups.map((group) => [group.key, group]));
  const collapsedClusterLookup = new Map();
  const nodeClusterLookup = new Map();
  const nodes = [];
  const addedClusterNodes = new Set();

  for (const node of allNodes) {
    const clusterGroup = clusterGroupByKey.get(node.clusterKey);
    const shouldCollapse = clusterGroup && !expandedClusterKeys.has(clusterGroup.key);
    if (!shouldCollapse) {
      nodes.push(node);
      continue;
    }

    nodeClusterLookup.set(node.id, clusterGroup.clusterId);
    if (addedClusterNodes.has(clusterGroup.clusterId)) {
      continue;
    }
    const visual = getLegendVisual(legend, clusterGroup.colorKey);
    nodes.push({
      id: clusterGroup.clusterId,
      label: `${clusterGroup.key} · ${clusterGroup.count}`,
      title: `${clusterGroup.key} 聚合节点 · ${clusterGroup.count} 项。点击展开局部。`,
      group: clusterGroup.colorKey,
      clusterKey: clusterGroup.key,
      properties: {
        isCluster: true,
        clusterKey: clusterGroup.key,
        count: clusterGroup.count,
      },
      labels: ['Cluster'],
      color: {
        background: visual.color.bg,
        border: visual.color.border,
      },
      size: Math.max(26, Math.min(48, 22 + Math.log2(clusterGroup.count) * 4)),
      font: {
        color: '#0f172a',
        size: 12,
        face: 'Inter, system-ui, sans-serif',
        strokeWidth: 1,
        strokeColor: '#f8fafc',
      },
      borderWidth: 1,
      shape: 'database',
    });
    addedClusterNodes.add(clusterGroup.clusterId);
    collapsedClusterLookup.set(clusterGroup.clusterId, clusterGroup.key);
  }

  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  const edgeKeys = new Set();
  const edges = [];
  for (const [index, edge] of rawEdges.entries()) {
    const source = edge.source || edge.from;
    const target = edge.target || edge.to;
    const from = nodeClusterLookup.get(source) || source;
    const to = nodeClusterLookup.get(target) || target;
    if (!from || !to || from === to || !visibleNodeIds.has(from) || !visibleNodeIds.has(to)) {
      continue;
    }
    const label = edge.label || edge.type;
    const edgeKey = `${from}->${to}->${label || ''}`;
    if (edgeKeys.has(edgeKey)) {
      continue;
    }
    edgeKeys.add(edgeKey);
    edges.push({
      id: edge.id || `${from}-${to}-${index}`,
      from,
      to,
      label,
      arrows: 'to',
      title: label || '',
      smooth: mode === 'full' ? { type: 'curvedCW', roundness: 0.2 } : false,
      font: {
        align: 'middle',
        size: mode === 'full' ? 11 : 10,
        color: '#334155',
        strokeWidth: 2,
        strokeColor: '#ffffff',
      },
      color: {
        color: '#94a3b8',
        highlight: '#64748b',
        hover: '#64748b',
      },
    });
  }

  return {
    mode,
    nodes,
    allNodes,
    edges,
    options: getGraphOptions(mode),
    clusterGroups,
    collapsedClusterLookup,
    nodeClusterLookup,
  };
}

export function focusGraphNode(network, targetNodeId, nodeClusterLookup) {
  if (!network || !targetNodeId) return false;
  const clusterId = nodeClusterLookup.get(targetNodeId);
  if (clusterId && typeof network.isCluster === 'function' && network.isCluster(clusterId)) {
    try {
      network.openCluster(clusterId);
    } catch (error) {
      console.warn('Failed to open graph cluster:', error?.message || error);
    }
    window.setTimeout(() => {
      try {
        network.focus(targetNodeId, { scale: 1.2, animation: true });
      } catch (error) {
        console.warn('Failed to focus graph node after cluster open:', error?.message || error);
      }
    }, 60);
    return true;
  }

  try {
    network.focus(targetNodeId, { scale: 1.2, animation: true });
    return true;
  } catch (error) {
    console.warn('Failed to focus graph node:', error?.message || error);
    return false;
  }
}
