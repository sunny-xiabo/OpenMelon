import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProjectEnvConfigPage from './ProjectEnvConfigPage';
import { useExecProjects, useExecEnvironments, useSaveProjectMutation, useSaveEnvironmentMutation } from '../features/APIExecution/hooks/useAPIExecutionQueries';

vi.mock('../components/SnackbarProvider', () => ({
  useSnackbar: () => vi.fn(),
}));

vi.mock('../features/APIExecution/hooks/useAPIExecutionQueries', () => ({
  useExecProjects: vi.fn(),
  useExecEnvironments: vi.fn(),
  useSaveProjectMutation: vi.fn(),
  useDeleteProjectMutation: vi.fn(),
  useSaveEnvironmentMutation: vi.fn(),
  useDeleteEnvironmentMutation: vi.fn(),
}));

describe('ProjectEnvConfigPage', () => {
  const refetchProjects = vi.fn();
  const saveProject = vi.fn();
  const saveEnvironment = vi.fn();
  let projects;

  const renderPage = () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <ProjectEnvConfigPage />
      </QueryClientProvider>,
    );
  };

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    projects = [
      { project_id: 'proj-1', name: 'Old Project', default_environment_id: 'env-1', operation_allowlist: [], operation_blocklist: [], risk_overrides: {} },
    ];
    refetchProjects.mockImplementation(() => Promise.resolve({ data: projects }));
    useExecProjects.mockReturnValue({
      data: projects,
      isLoading: false,
      refetch: refetchProjects,
    });
    useExecEnvironments.mockReturnValue({ data: [], isLoading: false });
    useSaveProjectMutation.mockReturnValue({ mutateAsync: saveProject, isPending: false });
    useSaveEnvironmentMutation.mockReturnValue({ mutateAsync: saveEnvironment, isPending: false });
    saveProject.mockImplementation(async (payload) => {
      const saved = { ...payload, project_id: 'proj-new', name: payload.name };
      projects = [saved, ...projects.filter((item) => item.project_id !== saved.project_id)];
      return saved;
    });
    saveEnvironment.mockResolvedValue({ environment_id: 'env-new', project_id: 'proj-new' });
  });

  it('keeps the newly created project selected after saving', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: '新增项目' }));
    await userEvent.clear(screen.getByLabelText('项目名称'));
    await userEvent.type(screen.getByLabelText('项目名称'), 'New Project');
    await userEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() => {
      expect(saveProject).toHaveBeenCalledWith(expect.objectContaining({ project_id: undefined, name: 'New Project' }));
      expect(refetchProjects).toHaveBeenCalled();
      expect(screen.getByText('New Project')).toBeInTheDocument();
    });
  });

  it('binds a new environment to the selected project', async () => {
    renderPage();
    await userEvent.click(screen.getByText('Old Project'));
    await userEvent.click(screen.getByRole('tab', { name: /网关环境管理/ }));
    await userEvent.click(screen.getByRole('button', { name: '新增环境' }));
    await userEvent.type(screen.getByLabelText('环境名称'), 'Staging');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(saveEnvironment).toHaveBeenCalledWith(
        { envId: undefined, payload: expect.objectContaining({ project_id: 'proj-1', name: 'Staging' }) }
      );
    });
  });
});
