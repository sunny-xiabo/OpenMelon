import { useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const API_BASE = '/api/workflows';

/**
 * Fetch wrapper for workflow API.
 */
async function workflowFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Workflow API error ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Hook for workflow CRUD operations.
 */
export function useWorkflow(workflowId) {
  const queryClient = useQueryClient();

  // Get single workflow
  const {
    data: workflow,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => workflowFetch(`/${workflowId}`),
    enabled: !!workflowId,
  });

  // Create workflow
  const createMutation = useMutation({
    mutationFn: (data) => workflowFetch('', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });

  // Update workflow
  const updateMutation = useMutation({
    mutationFn: (data) => workflowFetch(`/${workflowId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });

  // Delete workflow
  const deleteMutation = useMutation({
    mutationFn: () => workflowFetch(`/${workflowId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });

  // Publish / Unpublish
  const publishMutation = useMutation({
    mutationFn: () => workflowFetch(`/${workflowId}/publish`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
    },
  });

  const unpublishMutation = useMutation({
    mutationFn: () => workflowFetch(`/${workflowId}/unpublish`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
    },
  });

  return {
    workflow,
    isLoading,
    error,
    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    remove: deleteMutation.mutateAsync,
    publish: publishMutation.mutateAsync,
    unpublish: unpublishMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
  };
}

/**
 * Hook for workflow list.
 */
export function useWorkflowList(status, limit = 50, offset = 0) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('limit', String(limit));
  params.set('offset', String(offset));

  return useQuery({
    queryKey: ['workflows', status, limit, offset],
    queryFn: () => workflowFetch(`?${params}`),
  });
}

export function useDeleteWorkflow() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (workflowId) => workflowFetch(`/${workflowId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
  return {
    deleteWorkflow: mutation.mutateAsync,
    isDeleting: mutation.isPending,
  };
}
