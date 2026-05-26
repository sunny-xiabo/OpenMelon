import { describe, expect, it } from 'vitest';
import {
  applyDependencyConnection,
  applyParallelGroup,
  buildFlowGraph,
  buildFlowLayout,
  buildFlowSummary,
  clearParallelGroups,
  removeDependencyConnection,
  validateParallelGroupSelection,
  wouldCreateDependencyCycle,
} from './flowAnalysis';

const steps = [
  {
    id: 'login',
    name: 'Login',
    method: 'POST',
    path: '/auth/login',
    operation_id: 'login',
    extractions: [{ name: 'access_token', source: 'body', path: 'data.token' }],
  },
  {
    id: 'listUsers',
    name: 'List users',
    method: 'GET',
    path: '/users',
    operation_id: 'listUsers',
    headers: { Authorization: 'Bearer {{access_token}}' },
    depends_on: ['login'],
  },
  {
    id: 'listOrders',
    name: 'List orders',
    method: 'GET',
    path: '/orders',
    operation_id: 'listOrders',
    headers: { Authorization: 'Bearer {{access_token}}' },
    depends_on: ['login'],
  },
  {
    id: 'getOrder',
    name: 'Get order',
    method: 'GET',
    path: '/orders/{id}',
    operation_id: 'getOrder',
    path_params: { id: '{{order_id}}' },
  },
];

describe('API execution flow analysis', () => {
  it('builds editable dependency and variable graph without inferred sequence edges', () => {
    const summary = buildFlowSummary({ steps });
    const graph = buildFlowGraph(steps, summary, { includeInferredSequence: false });

    expect(graph.dependencyEdges).toEqual([
      { from: 'login', to: 'listUsers', type: 'dependency' },
      { from: 'login', to: 'listOrders', type: 'dependency' },
    ]);
    expect(graph.variableEdges).toEqual([
      { from: 'login', to: 'listUsers', name: 'access_token', type: 'variable' },
      { from: 'login', to: 'listOrders', name: 'access_token', type: 'variable' },
    ]);
    expect(graph.resourceEdges).toEqual([]);
  });

  it('adds read-only resource lead lines from created ids to detail consumers', () => {
    const resourceSteps = [
      {
        id: 'createOrder',
        name: 'Create order',
        method: 'POST',
        path: '/orders',
        operation_id: 'createOrder',
        extractions: [{ name: 'order_id', source: 'body', path: 'data.id' }],
      },
      {
        id: 'getOrder',
        name: 'Get order detail',
        method: 'GET',
        path: '/orders/{id}',
        operation_id: 'getOrder',
      },
      {
        id: 'updateOrder',
        name: 'Update order',
        method: 'PATCH',
        path: '/orders/{order_id}',
        operation_id: 'updateOrder',
        path_params: { order_id: '{{order_id}}' },
      },
    ];
    const summary = buildFlowSummary({ steps: resourceSteps });
    const graph = buildFlowGraph(resourceSteps, summary, { includeInferredSequence: false });

    expect(graph.resourceEdges).toEqual([
      { from: 'createOrder', to: 'getOrder', name: 'order_id', type: 'resource', inferred: true },
      { from: 'createOrder', to: 'updateOrder', name: 'order_id', type: 'resource', inferred: false },
    ]);
    expect(graph.variableEdges).toEqual([
      { from: 'createOrder', to: 'updateOrder', name: 'order_id', type: 'variable' },
    ]);
  });

  it('lays out dependent steps to the right of their dependencies', () => {
    const layout = buildFlowLayout(steps);

    expect(layout.positions.get('login').level).toBe(0);
    expect(layout.positions.get('listUsers').level).toBe(1);
    expect(layout.positions.get('listOrders').level).toBe(1);
  });

  it('adds and removes dependency connections', () => {
    const added = applyDependencyConnection(steps, 'listUsers', 'getOrder');

    expect(added.changed).toBe(true);
    expect(added.steps.find((step) => step.id === 'getOrder').depends_on).toEqual(['listUsers']);

    const removed = removeDependencyConnection(added.steps, 'listUsers', 'getOrder');
    expect(removed.changed).toBe(true);
    expect(removed.steps.find((step) => step.id === 'getOrder').depends_on).toEqual([]);
  });

  it('rejects connections that would create cycles', () => {
    const connected = applyDependencyConnection(steps, 'login', 'listUsers').steps;

    expect(wouldCreateDependencyCycle(connected, 'listUsers', 'login')).toBe(true);
    expect(applyDependencyConnection(connected, 'listUsers', 'login').changed).toBe(false);
  });

  it('sets and clears parallel groups for safe reads with shared dependencies', () => {
    const summary = buildFlowSummary({ steps });
    const result = applyParallelGroup(steps, ['listUsers', 'listOrders'], summary);

    expect(result.changed).toBe(true);
    expect(result.groupName).toBe('parallel_read_1');
    expect(result.steps.find((step) => step.id === 'listUsers').parallel_group).toBe('parallel_read_1');

    const cleared = clearParallelGroups(result.steps, ['listUsers', 'listOrders']);
    expect(cleared.changed).toBe(true);
    expect(cleared.steps.find((step) => step.id === 'listUsers').parallel_group).toBe('');
  });

  it('rejects parallel groups for variable-consuming business reads or writes', () => {
    const summary = buildFlowSummary({ steps });
    const withWrite = [
      ...steps,
      { id: 'createOrder', name: 'Create order', method: 'POST', path: '/orders', operation_id: 'createOrder', depends_on: ['login'] },
    ];

    expect(validateParallelGroupSelection(steps, ['listUsers', 'getOrder'], summary).valid).toBe(false);
    expect(validateParallelGroupSelection(withWrite, ['listUsers', 'createOrder'], buildFlowSummary({ steps: withWrite })).valid).toBe(false);
  });
});
