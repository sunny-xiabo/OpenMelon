import { describe, expect, it } from 'vitest';
import { buildGraphRenderState, getGraphRenderMode } from './graphRendering';

const buildGraph = (count, moduleName = 'orders') => ({
  nodes: Array.from({ length: count }, (_, index) => ({
    id: String(index),
    labels: ['DocumentChunk'],
    properties: {
      name: `Node ${index}`,
      module: moduleName,
      content: `Content ${index}`,
    },
  })),
  relationships: [],
});

describe('graphRendering', () => {
  it('switches between full, lite and cluster modes by node count', () => {
    expect(getGraphRenderMode(500)).toBe('full');
    expect(getGraphRenderMode(501)).toBe('lite');
    expect(getGraphRenderMode(1001)).toBe('cluster');
  });

  it('reduces interaction and physics cost for large graphs', () => {
    const state = buildGraphRenderState(buildGraph(600), []);

    expect(state.mode).toBe('lite');
    expect(state.options.physics.enabled).toBe(false);
    expect(state.options.interaction.hover).toBe(false);
    expect(state.options.edges.smooth).toBe(false);
  });

  it('creates clustered groups for very large graphs', () => {
    const state = buildGraphRenderState(buildGraph(1200), []);

    expect(state.mode).toBe('cluster');
    expect(state.clusterGroups.length).toBeGreaterThan(0);
    expect(state.nodeClusterLookup.size).toBeGreaterThan(0);
  });
});
