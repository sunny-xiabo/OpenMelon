import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Stack, Typography, Collapse, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import SaveOutlined from '@mui/icons-material/SaveOutlined';
import EmptyState from '../../../components/EmptyState';
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
  
  // 使用 TanStack Query 钩子替代原有的手动加载逻辑
  const { data: schema, isLoading: isSchemaLoading, refetch: refetchSchema } = useConfigSchema();
  const [activeGroup, setActiveGroup] = useState('');
  const [draft, setDraft] = useState({});
  const [providerDraft, setProviderDraft] = useState(emptyProviderDraft);
  const [searchQuery, setSearchQuery] = useState('');

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
    </Box>
  );
}
