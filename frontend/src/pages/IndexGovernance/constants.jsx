import React from 'react';
import {
  AccountTreeOutlined,
  AutoFixHighOutlined,
  CancelOutlined,
  DataObjectOutlined,
  ReplayOutlined,
  RestartAltOutlined,
  SearchOutlined,
  StorageOutlined,
  SyncProblemOutlined,
} from '@mui/icons-material';

export const PIPELINE_STEPS = [
  { label: '业务数据源', icon: <DataObjectOutlined fontSize="small" />, caption: '文档 / 用例 / API 知识', color: '#4f46e5' },
  { label: 'Neo4j 知识图谱', icon: <AccountTreeOutlined fontSize="small" />, caption: '图谱节点、关系与 Embeddings', color: '#0ea5e9' },
  { label: 'Qdrant 向量库', icon: <StorageOutlined fontSize="small" />, caption: '语义向量点与 metadata payload', color: '#10b981' },
  { label: '智能 RAG 检索', icon: <SearchOutlined fontSize="small" />, caption: '仅召回 active 同步健康资产', color: '#8b5cf6' },
];

export const statusConfig = {
  healthy: { label: '同步健康', color: 'success', gradient: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' },
  attention: { label: '需关注', color: 'warning', gradient: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)' },
  unavailable: { label: '服务断联', color: 'error', gradient: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)' },
};

export const taskStatusConfig = {
  queued: { label: '排队中', color: 'default', icon: <ReplayOutlined fontSize="small" /> },
  running: { label: '重建中', color: 'info', icon: <RestartAltOutlined fontSize="small" className="spin-animation" /> },
  succeeded: { label: '已完成', color: 'success', icon: <AutoFixHighOutlined fontSize="small" /> },
  failed: { label: '失败', color: 'error', icon: <SyncProblemOutlined fontSize="small" /> },
  cancelled: { label: '已取消', color: 'warning', icon: <CancelOutlined fontSize="small" /> },
};

export const taskOperationLabels = {
  rebuild_qdrant: 'Qdrant 重建',
};
