import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmptyState from './EmptyState';

describe('EmptyState', () => {
  it('renders loading state copy', () => {
    render(<EmptyState variant="loading" title="正在加载数据" />);
    expect(screen.getByText('正在同步数据')).toBeInTheDocument();
  });

  it('renders error state with retry action', async () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        variant="error"
        title="加载失败"
        description="服务暂时不可用"
        actionLabel="重试"
        onAction={onAction}
      />,
    );

    expect(screen.getByText('服务暂时不可用')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /重试/ }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('renders success state copy when no custom text is provided', () => {
    render(<EmptyState variant="success" />);

    expect(screen.getByText('系统运行稳健')).toBeInTheDocument();
    expect(screen.getByText(/当前资产配置与自动化流程均处于健康状态/)).toBeInTheDocument();
  });
});
