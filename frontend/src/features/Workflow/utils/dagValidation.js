/**
 * DAG validation utilities -- cycle detection, connectivity checks.
 */

/**
 * Check if adding an edge from sourceId to targetId would create a cycle.
 * Uses DFS on the existing graph.
 */
export function wouldCreateCycle(nodes, edges, sourceId, targetId) {
  if (sourceId === targetId) return true;

  // Build adjacency list including the proposed new edge
  const adj = {};
  nodes.forEach(n => { adj[n.id] = []; });
  edges.forEach(e => {
    if (adj[e.source]) adj[e.source].push(e.target);
  });
  // Add the proposed edge
  if (adj[sourceId]) adj[sourceId].push(targetId);

  // DFS from targetId to see if we can reach sourceId
  const visited = new Set();
  const stack = [targetId];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === sourceId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const neighbors = adj[current] || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        stack.push(neighbor);
      }
    }
  }

  return false;
}

/**
 * Detect all cycles in the graph. Returns array of cycle paths.
 */
export function detectCycles(nodes, edges) {
  const adj = {};
  nodes.forEach(n => { adj[n.id] = []; });
  edges.forEach(e => {
    if (adj[e.source]) adj[e.source].push(e.target);
  });

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = {};
  const parent = {};
  const cycles = [];

  nodes.forEach(n => {
    color[n.id] = WHITE;
    parent[n.id] = null;
  });

  function dfs(nid) {
    color[nid] = GRAY;
    for (const neighbor of (adj[nid] || [])) {
      if (color[neighbor] === GRAY) {
        // Found a cycle -- reconstruct
        const cycle = [neighbor, nid];
        let current = nid;
        while (parent[current] && parent[current] !== neighbor) {
          current = parent[current];
          cycle.push(current);
        }
        cycle.reverse();
        cycles.push(cycle);
      } else if (color[neighbor] === WHITE) {
        parent[neighbor] = nid;
        dfs(neighbor);
      }
    }
    color[nid] = BLACK;
  }

  nodes.forEach(n => {
    if (color[n.id] === WHITE) {
      dfs(n.id);
    }
  });

  return cycles;
}

/**
 * Validate a workflow graph. Returns array of error messages.
 */
export function validateWorkflow(nodes, edges) {
  const errors = [];

  // Check for start node
  const hasStart = nodes.some(n => n.type === 'start');
  if (!hasStart) {
    errors.push('工作流缺少"开始"节点');
  }

  // Check for end node
  const hasEnd = nodes.some(n => n.type === 'end');
  if (!hasEnd) {
    errors.push('工作流缺少"结束"节点');
  }

  // Check for duplicate IDs
  const ids = nodes.map(n => n.id);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    errors.push('存在重复的节点 ID');
  }

  // Check for cycles
  const cycles = detectCycles(nodes, edges);
  if (cycles.length > 0) {
    errors.push(`图中存在循环: ${cycles[0].join(' -> ')}`);
  }

  // Check for dangling edges
  const nodeIds = new Set(ids);
  edges.forEach(e => {
    if (!nodeIds.has(e.source)) {
      errors.push(`边的源节点不存在: ${e.source}`);
    }
    if (!nodeIds.has(e.target)) {
      errors.push(`边的目标节点不存在: ${e.target}`);
    }
  });

  return errors;
}
