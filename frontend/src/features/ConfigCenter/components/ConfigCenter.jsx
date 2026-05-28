import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Box, Button, Stack, Typography, Collapse, useTheme, Dialog, DialogTitle, DialogContent, DialogActions, TextField } from '@mui/material';
import { alpha } from '@mui/material/styles';
import SaveOutlined from '@mui/icons-material/SaveOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import FileUploadOutlined from '@mui/icons-material/FileUploadOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import RestoreOutlined from '@mui/icons-material/RestoreOutlined';
import EmptyState from '../../../components/EmptyState';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { LinearProgress } from '@mui/material';
import { useSnackbar } from '../../../components/SnackbarProvider';

// Hooks
import {
  useConfigSchema,
  useConfigPreview,
  useSaveConfig,
  useSaveProvider,
  useDeleteProvider
} from '../hooks/useConfig';
import { configCenterAPI } from '../../../api/configCenter';

// Sub-components
import ConfigSidebar from './ConfigSidebar';
import ConfigFieldCard from './ConfigFieldCard';
import ConfigDashboard from './ConfigDashboard';
import LLMProviderPanel from './LLMProviderPanel';
import EffectivePreview from './EffectivePreview';
import TestcaseGenPanel from './TestcaseGenPanel';
import ProviderManager from './ProviderManager';
import ConfigGuide from './ConfigGuide';

const providerGroupTitle = 'Provider 管理';

const emptyProviderDraft = {
  key: '', label: '', api_base_url: '', chat_model: '', embedding_model: '', embedding_dim: '1024',
  aliases_text: '', recommended_chat_models_text: '', recommended_embedding_models_text: '',
  default_base_url_label: '默认 Base URL', template_description: '', supports_embedding: true, is_openai_compatible: true,
};

function splitProviderList(text) {
  return String(text || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function buildProviderDraft(provider) {
  if (!provider) return emptyProviderDraft;
  const joinList = (items) => Array.isArray(items) ? items.join(', ') : '';
  return {
    key: provider.key || '', label: provider.label || '', api_base_url: provider.api_base_url || '',
    chat_model: provider.chat_model || '', embedding_model: provider.embedding_model || '',
    embedding_dim: String(provider.embedding_dim || 1024), aliases_text: joinList(provider.aliases),
    recommended_chat_models_text: joinList(provider.recommended_chat_models),
    recommended_embedding_models_text: joinList(provider.recommended_embedding_models),
    default_base_url_label: provider.default_base_url_label || '默认 Base URL',
    template_description: provider.template_description || '',
    supports_embedding: provider.supports_embedding !== false, is_openai_compatible: provider.is_openai_compatible !== false,
  };
}

export default function ConfigCenter() {
  const theme = useTheme();
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  
  // 使用 TanStack Query 钩子替代原有的手动加载逻辑
  const { data: schema, isLoading: isSchemaLoading, refetch: refetchSchema } = useConfigSchema();
  const [activeGroup, setActiveGroup] = useState('');
  const [draft, setDraft] = useState({});
  const [providerDraft, setProviderDraft] = useState(emptyProviderDraft);
  const [searchQuery, setSearchQuery] = useState('');
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importContent, setImportContent] = useState('');
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [backups, setBackups] = useState([]);
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [backupContent, setBackupContent] = useState('');
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(null);

  // 突变操作钩子
  const saveConfigMutation = useSaveConfig();
  const saveProviderMutation = useSaveProvider();
  const deleteProviderMutation = useDeleteProvider();

  const groups = schema?.groups || [];
  const status = schema?.status || {};
  
  // 预览钩子：自动根据 draft 的变化计算有效值
  const { data: preview } = useConfigPreview(draft, status.env_exists);

  const fieldMap = useMemo(() => {
    const next = {};
    groups.forEach((group) => group.fields.forEach((field) => { next[field.key] = field; }));
    return next;
  }, [groups]);

  // 初始选中第一个分组
  useEffect(() => {
    if (groups.length > 0 && !activeGroup) {
      setActiveGroup(groups[0].title);
    }
  }, [groups, activeGroup]);

  const active = groups.find((group) => group.title === activeGroup) || groups[0];
  const changedKeys = Object.keys(draft);

  const filteredFields = useMemo(() => {
    if (!searchQuery) return active?.fields || [];
    const query = searchQuery.toLowerCase();
    return (active?.fields || []).filter(f => 
      f.key.toLowerCase().includes(query) || 
      (f.description && f.description.toLowerCase().includes(query))
    );
  }, [active, searchQuery]);

  const setDraftValue = (key, value) => {
    const original = fieldMap[key]?.value ?? '';
    setDraft((prev) => {
      const next = { ...prev };
      if (String(value) === String(original)) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const applyDraftValues = (values) => {
    setDraft((prev) => {
      const next = { ...prev };
      Object.entries(values || {}).forEach(([key, value]) => {
        if (!fieldMap[key]?.editable) return;
        const normalized = String(value ?? '');
        const original = fieldMap[key]?.value ?? '';
        if (normalized === String(original)) delete next[key];
        else next[key] = normalized;
      });
      return next;
    });
  };

  const handleSave = async () => {
    await saveConfigMutation.mutateAsync(draft);
    setDraft({});
  };

  const handleExport = async () => {
    try {
      const content = await configCenterAPI.exportConfig();
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'openmelon-config.env';
      a.click();
      URL.revokeObjectURL(url);
      snackbar('配置导出成功', { severity: 'success' });
    } catch (e) {
      snackbar('导出失败: ' + e.message, { severity: 'error' });
    }
  };

  const handleImport = async () => {
    try {
      await configCenterAPI.importConfig(importContent);
      setImportDialogOpen(false);
      setImportContent('');
      snackbar('配置导入成功', { severity: 'success' });
      queryClient.invalidateQueries({ queryKey: ['config', 'schema'] });
    } catch (e) {
      snackbar('导入失败: ' + e.message, { severity: 'error' });
    }
  };

  const handleOpenHistory = async () => {
    setHistoryDialogOpen(true);
    setLoadingBackups(true);
    try {
      const data = await configCenterAPI.listBackups();
      setBackups(data.backups || []);
    } catch (e) {
      snackbar('获取备份列表失败: ' + e.message, { severity: 'error' });
    } finally {
      setLoadingBackups(false);
    }
  };

  const handleViewBackup = async (filename) => {
    setLoadingContent(true);
    setSelectedBackup(filename);
    try {
      const data = await configCenterAPI.readBackup(filename);
      setBackupContent(data.content || '');
    } catch (e) {
      snackbar('读取备份失败: ' + e.message, { severity: 'error' });
      setBackupContent('');
    } finally {
      setLoadingContent(false);
    }
  };

  const handleRestore = async () => {
    if (!confirmRestore) return;
    try {
      await configCenterAPI.restoreBackup(confirmRestore);
      setConfirmRestore(null);
      setSelectedBackup(null);
      setBackupContent('');
      setHistoryDialogOpen(false);
      snackbar('配置已恢复，部分配置可能需重启生效', { severity: 'success' });
      queryClient.invalidateQueries({ queryKey: ['config', 'schema'] });
    } catch (e) {
      snackbar('恢复失败: ' + e.message, { severity: 'error' });
    }
  };

  const formatTimestamp = (ts) => {
    if (!ts || ts.length < 15) return ts;
    const y = ts.slice(0, 4);
    const m = ts.slice(4, 6);
    const d = ts.slice(6, 8);
    const h = ts.slice(9, 11);
    const mi = ts.slice(11, 13);
    const s = ts.slice(13, 15);
    return `${y}-${m}-${d} ${h}:${mi}:${s}`;
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  if (isSchemaLoading && !schema) return <EmptyState variant="loading" title="配置准备中..." />;
  if (!schema && !isSchemaLoading) return <EmptyState variant="error" title="配置不可用" onAction={() => refetchSchema()} />;

  const isSaving = saveConfigMutation.isPending || saveProviderMutation.isPending || deleteProviderMutation.isPending;

  return (
    <Box sx={{ 
      p: { xs: 2, md: 3 }, 
      position: 'relative', 
      minHeight: '100%',
      overflow: 'auto',
      bgcolor: 'transparent'
    }}>
      {/* Decorative Background Elements */}
      <Box sx={{ 
        position: 'absolute', top: '10%', right: '-5%', width: 400, height: 400, 
        background: 'radial-gradient(circle, rgba(59, 130, 246, 0.05) 0%, transparent 70%)',
        zIndex: 0, pointerEvents: 'none'
      }} />
      <Box sx={{ 
        position: 'absolute', bottom: '5%', left: '-5%', width: 500, height: 500, 
        background: 'radial-gradient(circle, rgba(139, 92, 246, 0.05) 0%, transparent 70%)',
        zIndex: 0, pointerEvents: 'none'
      }} />

      {isSaving && (
        <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
          <LinearProgress color="primary" />
        </Box>
      )}
      
      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <ConfigDashboard status={status} changedCount={changedKeys.length} />

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '300px 1fr' }, gap: { lg: 6, xl: 8 } }}>
          <ConfigSidebar 
            groups={groups} 
            activeGroup={active?.title} 
            onSelect={(title) => { setActiveGroup(title); setSearchQuery(''); }} 
            onSearch={setSearchQuery}
            searchQuery={searchQuery}
            status={status}
          />

          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ mb: 4 }}>
               <Typography variant="h5" sx={{ fontWeight: 900, letterSpacing: -0.5, mb: 1 }}>
                {active?.display_title || active?.title}
              </Typography>
              <ConfigGuide activeTitle={active?.title} isProviderPanel={active?.title === providerGroupTitle} />

              <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<FileDownloadOutlined />}
                  onClick={handleExport}
                  sx={{ borderRadius: 2, fontWeight: 600, fontSize: '12px', textTransform: 'none' }}
                >
                  导出配置
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<FileUploadOutlined />}
                  onClick={() => setImportDialogOpen(true)}
                  sx={{ borderRadius: 2, fontWeight: 600, fontSize: '12px', textTransform: 'none' }}
                >
                  导入配置
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<HistoryOutlined />}
                  onClick={handleOpenHistory}
                  sx={{ borderRadius: 2, fontWeight: 600, fontSize: '12px', textTransform: 'none' }}
                >
                  配置历史
                </Button>
              </Stack>
            </Box>

            <Box sx={{ position: 'relative' }}>
              {active?.title === providerGroupTitle ? (
                <ProviderManager
                  providers={status.llm_providers} draft={providerDraft}
                  onDraftChange={setProviderDraft} onEdit={(p) => setProviderDraft(buildProviderDraft(p))}
                  onSave={async () => {
                    const payload = {
                      ...providerDraft,
                      embedding_dim: Number(providerDraft.embedding_dim || 1024),
                      aliases: splitProviderList(providerDraft.aliases_text),
                      recommended_chat_models: splitProviderList(providerDraft.recommended_chat_models_text),
                      recommended_embedding_models: splitProviderList(providerDraft.recommended_embedding_models_text),
                    };
                    await saveProviderMutation.mutateAsync(payload);
                    setProviderDraft(emptyProviderDraft);
                  }}
                  onDelete={async (p) => { 
                    if (window.confirm('确认删除？')) { 
                      await deleteProviderMutation.mutateAsync(p.key);
                    } 
                  }}
                  onApplyTemplate={applyDraftValues} 
                  saving={isSaving} 
                  emptyProviderDraft={emptyProviderDraft}
                />
              ) : active?.title?.includes('testcase_gen 独立 LLM') ? (
                <TestcaseGenPanel
                  fieldMap={fieldMap} draft={draft} onChange={setDraftValue}
                  summary={preview?.testcase_gen_llm || status.testcase_gen_llm}
                />
              ) : (
                <Stack spacing={4}>
                  {active?.title?.includes('OpenMelon 主模块 LLM') && (
                    <Box sx={{ 
                      p: 0.5, borderRadius: 4, 
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.1) 100%)',
                      border: '1px solid rgba(255,255,255,0.3)',
                      boxShadow: '0 10px 30px rgba(0,0,0,0.02)'
                    }}>
                      <LLMProviderPanel
                        fieldMap={fieldMap} draft={draft} providers={status.llm_providers}
                        onChange={setDraftValue} onApplyTemplate={applyDraftValues}
                      />
                      <EffectivePreview preview={preview} />
                    </Box>
                  )}
                  
                  <Box sx={{ 
                    display: 'grid', 
                    gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' }, 
                    gap: 3 
                  }}>
                    {filteredFields.map((field) => (
                      <ConfigFieldCard
                        key={field.key} field={field}
                        value={draft[field.key] ?? field.value ?? ''}
                        hasDraft={Object.prototype.hasOwnProperty.call(draft, field.key)}
                        onChange={setDraftValue}
                      />
                    ))}
                  </Box>
                </Stack>
              )}
            </Box>

            {/* Floating Save Action Bar */}
            <Collapse in={changedKeys.length > 0}>
              <Box sx={{ 
                position: 'fixed', bottom: 40, right: 40, left: { xs: 40, lg: 360 },
                p: 2.5, borderRadius: 5, 
                bgcolor: 'rgba(15, 23, 42, 0.9)', 
                backdropFilter: 'blur(20px)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
                color: 'white', zIndex: 1000,
                border: '1px solid rgba(255,255,255,0.1)'
              }}>
                <Stack direction="row" spacing={2} alignItems="center">
                   <Box sx={{ 
                    width: 40, height: 40, borderRadius: '12px', 
                    bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 0 15px rgba(59, 130, 246, 0.5)'
                  }}>
                    <SaveOutlined />
                  </Box>
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>待保存更改</Typography>
                    <Typography variant="caption" sx={{ opacity: 0.6 }}>发现 {changedKeys.length} 项配置已修改，点击应用以同步到 .env</Typography>
                  </Box>
                </Stack>
                <Stack direction="row" spacing={1.5}>
                  <Button 
                    variant="text" sx={{ color: 'white', opacity: 0.7, '&:hover': { opacity: 1 } }}
                    onClick={() => { setDraft({}); }}
                  >
                    放弃修改
                  </Button>
                  <Button 
                    variant="contained" 
                    onClick={handleSave}
                    disabled={isSaving}
                    sx={{ 
                      borderRadius: 3, px: 4, fontWeight: 800,
                      bgcolor: 'white', color: 'black',
                      '&:hover': { bgcolor: '#f1f5f9' }
                    }}
                  >
                    {isSaving ? '正在同步...' : '应用并同步'}
                  </Button>
                </Stack>
              </Box>
            </Collapse>
          </Box>
        </Box>
      </Box>
      {/* Import Configuration Dialog */}
      <Dialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 800 }}>导入配置</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            粘贴 .env 文件内容，将覆盖当前配置（原文件会自动备份）。
          </Typography>
          <TextField
            multiline
            rows={12}
            fullWidth
            placeholder={"LLM_PROVIDER=openai_compat\nAPI_KEY=your-key\nAPI_BASE_URL=https://..."}
            value={importContent}
            onChange={(e) => setImportContent(e.target.value)}
            sx={{ fontFamily: 'monospace' }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setImportDialogOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={handleImport}
            disabled={!importContent.trim()}
          >
            确认导入
          </Button>
        </DialogActions>
      </Dialog>

      {/* Config History Dialog */}
      <Dialog
        open={historyDialogOpen}
        onClose={() => { setHistoryDialogOpen(false); setSelectedBackup(null); setBackupContent(''); }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 800 }}>配置历史版本</DialogTitle>
        <DialogContent>
          {loadingBackups ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">加载中...</Typography>
            </Box>
          ) : backups.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">暂无历史备份</Typography>
            </Box>
          ) : selectedBackup ? (
            <Box>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Button size="small" onClick={() => { setSelectedBackup(null); setBackupContent(''); }}>
                    返回列表
                  </Button>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {formatTimestamp(selectedBackup.replace('.env.bak.', ''))}
                  </Typography>
                </Stack>
                <Button
                  size="small"
                  variant="contained"
                  color="warning"
                  startIcon={<RestoreOutlined />}
                  onClick={() => setConfirmRestore(selectedBackup)}
                >
                  恢复此版本
                </Button>
              </Stack>
              {loadingContent ? (
                <Typography variant="body2" color="text.secondary">加载内容中...</Typography>
              ) : (
                <Box
                  component="pre"
                  sx={{
                    p: 2, borderRadius: 2, fontSize: '12px', fontFamily: 'monospace',
                    bgcolor: 'grey.50', border: '1px solid', borderColor: 'grey.200',
                    maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  }}
                >
                  {backupContent}
                </Box>
              )}
            </Box>
          ) : (
            <Stack spacing={1} sx={{ mt: 1 }}>
              {backups.map((backup) => (
                <Box
                  key={backup.filename}
                  onClick={() => handleViewBackup(backup.filename)}
                  sx={{
                    p: 2, borderRadius: 2, cursor: 'pointer',
                    border: '1px solid', borderColor: 'grey.200',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    transition: 'all 0.2s',
                    '&:hover': { bgcolor: 'grey.50', borderColor: 'primary.light' },
                  }}
                >
                  <Stack>
                    <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                      {formatTimestamp(backup.timestamp)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {backup.filename}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {formatSize(backup.size_bytes)}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setHistoryDialogOpen(false); setSelectedBackup(null); setBackupContent(''); }}>
            关闭
          </Button>
        </DialogActions>
      </Dialog>

      {/* Restore Confirmation Dialog */}
      <ConfirmDialog
        open={!!confirmRestore}
        title="确认恢复配置"
        message={`即将使用历史版本 ${confirmRestore ? formatTimestamp(confirmRestore.replace('.env.bak.', '')) : ''} 覆盖当前 .env 配置。\n\n当前配置会自动备份，恢复后部分配置可能需重启生效。`}
        confirmText="确认恢复"
        cancelText="取消"
        danger
        onConfirm={handleRestore}
        onCancel={() => setConfirmRestore(null)}
      />
    </Box>
  );
}
