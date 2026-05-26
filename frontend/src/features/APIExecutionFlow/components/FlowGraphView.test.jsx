import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import FlowGraphView from './FlowGraphView';

vi.mock('@xyflow/react', () => ({
  addEdge: (edge, edges) => [...edges, edge],
  applyEdgeChanges: (_changes, edges) => edges,
  applyNodeChanges: (_changes, nodes) => nodes,
  Background: () => <div data-testid="background" />,
  Controls: () => <div data-testid="controls" />,
  Handle: () => <span data-testid="handle" />,
  MarkerType: { ArrowClosed: 'arrowclosed' },
  MiniMap: () => <div data-testid="minimap" />,
  Position: { Left: 'left', Right: 'right' },
  ReactFlowProvider: ({ children }) => <div>{children}</div>,
  ReactFlow: ({ nodes, edges, children, onConnect, onEdgesDelete, onSelectionChange, onNodeClick }) => (
    <div data-testid="react-flow">
      <button type="button" onClick={() => onSelectionChange({ nodes: nodes.filter((node) => ['listUsers', 'listOrders'].includes(node.id)) })}>
        mock-select-reads
      </button>
      <button type="button" onClick={() => onConnect({ source: 'listUsers', target: 'getOrder' })}>
        mock-connect
      </button>
      <button type="button" onClick={() => onEdgesDelete(edges.filter((edge) => edge.id === 'dep-login-listUsers'))}>
        mock-delete-dependency
      </button>
      {nodes.map((node) => (
        <button type="button" key={node.id} onClick={() => onNodeClick({}, node)}>
          {node.data.step.name}
        </button>
      ))}
      {edges.map((edge) => <span key={edge.id}>{edge.label}</span>)}
      {children}
    </div>
  ),
}));

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
  },
];

describe('FlowGraphView', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders editable canvas nodes and applies a parallel group to DSL', () => {
    const onApply = vi.fn();
    render(
      <FlowGraphView
        steps={steps}
        activeStepId="login"
        disabledSet={new Set()}
        getResultForStep={() => null}
        onSelectStep={() => {}}
        onApplyOrchestration={onApply}
      />,
    );

    expect(screen.getByText('List users')).toBeInTheDocument();
    expect(screen.getAllByText('depends').length).toBeGreaterThan(0);
    expect(screen.getAllByText('{{access_token}}').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('mock-select-reads'));
    fireEvent.click(screen.getByRole('button', { name: /设并行组/ }));
    fireEvent.click(screen.getByRole('button', { name: /应用到 DSL/ }));

    expect(onApply).toHaveBeenCalledTimes(1);
    const appliedSteps = onApply.mock.calls[0][0];
    expect(appliedSteps.find((step) => step.id === 'listUsers').parallel_group).toBe('parallel_read_1');
    expect(appliedSteps.find((step) => step.id === 'listOrders').parallel_group).toBe('parallel_read_1');
  });

  it('applies dependency connection and deletion through the explicit apply button', () => {
    const onApply = vi.fn();
    render(
      <FlowGraphView
        steps={steps}
        activeStepId="login"
        disabledSet={new Set()}
        getResultForStep={() => null}
        onSelectStep={() => {}}
        onApplyOrchestration={onApply}
      />,
    );

    fireEvent.click(screen.getAllByText('mock-connect')[0]);
    fireEvent.click(screen.getByRole('button', { name: /应用到 DSL/ }));
    expect(onApply.mock.calls[0][0].find((step) => step.id === 'getOrder').depends_on).toEqual(['listUsers']);

    fireEvent.click(screen.getAllByText('mock-delete-dependency')[0]);
    fireEvent.click(screen.getByRole('button', { name: /应用到 DSL/ }));
    expect(onApply.mock.calls[1][0].find((step) => step.id === 'listUsers').depends_on).toEqual([]);
  });

  it('resets draft changes before applying', () => {
    const onApply = vi.fn();
    render(
      <FlowGraphView
        steps={steps}
        activeStepId="login"
        disabledSet={new Set()}
        getResultForStep={() => null}
        onSelectStep={() => {}}
        onApplyOrchestration={onApply}
      />,
    );

    fireEvent.click(screen.getAllByText('mock-connect')[0]);
    expect(screen.getByRole('button', { name: /应用到 DSL/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /重置/ }));

    expect(screen.getByRole('button', { name: /应用到 DSL/ })).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
  });
});
