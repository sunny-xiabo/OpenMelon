import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import VirtualizedList from './VirtualizedList';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }) => ({
    getVirtualItems: () => Array.from({ length: 4 }, (_, index) => ({
      index: index + 5,
      start: (index + 5) * 40,
    })),
    getTotalSize: () => count * 40,
  }),
}));

describe('VirtualizedList', () => {
  it('renders only the visible window items', () => {
    const items = Array.from({ length: 1000 }, (_, index) => ({ id: index, label: `Item ${index}` }));

    render(
      <VirtualizedList
        items={items}
        height={240}
        estimateSize={40}
        getItemKey={(item) => item.id}
        renderItem={(item) => <div>{item.label}</div>}
      />,
    );

    expect(screen.getByText('Item 5')).toBeInTheDocument();
    expect(screen.getByText('Item 8')).toBeInTheDocument();
    expect(screen.queryByText('Item 0')).not.toBeInTheDocument();
    expect(screen.queryByText('Item 999')).not.toBeInTheDocument();
  });
});
