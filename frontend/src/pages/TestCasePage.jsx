import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Box,
  Paper,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { testCaseAPI } from '../services/api';
import { useSnackbar } from '../components/SnackbarProvider';
import StageOutput from '../components/StageOutput';
import TestCaseListView from '../components/TestCaseListView';
import { parseTestCasesFromMarkdown } from '../utils/parseTestCases';
import EmptyState from '../components/EmptyState';
import { ALL_EXTS } from '../features/TestCase/constants';
import { isImage } from '../features/TestCase/utils';
import { usePromptHubOptions } from '../features/TestCase/hooks/usePromptHubOptions';
import GenerationPanel from '../features/TestCase/components/GenerationPanel';
import ResultFilters from '../features/TestCase/components/ResultFilters';
import ResultHeader, { ResultActionBar } from '../features/TestCase/components/ResultHeader';
import ResultSummaryCards from '../features/TestCase/components/ResultSummaryCards';
import TestCaseMindMap, { prefetchMindMapEngine } from '../components/TestCaseMindMap';

// Hooks
import { 
  useVectorStatus, 
  useAvailableModules, 
  useStoreToVector, 
  useExportTestCases 
} from '../features/TestCase/hooks/useTestCase';

export default function TestCasePage({ isActive = true }) {
  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down('lg'));
  const showSnackbar = useSnackbar();
  
  // 表单状态
  const [mode, setMode] = useState('file');
  const [context, setContext] = useState('');
  const [requirements, setRequirements] = useState('');
  const [moduleName, setModuleName] = useState('');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [useVector, setUseVector] = useState(true);

  // 生成过程状态
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const [streamingContent, setStreamingContent] = useState('');
  const [parsedTestCases, setParsedTestCases] = useState([]);
  
  // UI 视图状态
  const [viewMode, setViewMode] = useState('list');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [exportAnchorEl, setExportAnchorEl] = useState(null);

  const fileRef = useRef(null);

  // 使用 TanStack Query 钩子
  const { data: vectorStatus } = useVectorStatus(isActive);
  const { data: availableModules = [] } = useAvailableModules(isActive);
  const storeMutation = useStoreToVector();
  const exportMutation = useExportTestCases();

  const {
    defaultTemplateId,
    selectedSkillIds,
    setSelectedSkillIds,
    setStyleId,
    skillOptions,
    styleId,
    templateOptions,
  } = usePromptHubOptions({ isActive, showSnackbar });

  const handleReset = () => {
    setContext('');
    setRequirements('');
    setModuleName('');
    setStyleId(defaultTemplateId);
    setSelectedSkillIds([]);
    clearFile();
    setStreamingContent('');
    setParsedTestCases([]);
    setViewMode('list');
  };

  const handleFileSelect = useCallback((f) => {
    if (!f) return;
    const ext = '.' + f.name.split('.').pop().toLowerCase();
    if (!ALL_EXTS.includes(ext)) {
      showSnackbar('不支持的文件格式: ' + ext, { severity: 'error' });
      return;
    }
    setFile(f);
    setPreviewUrl(isImage(f.name) ? URL.createObjectURL(f) : null);
  }, [showSnackbar]);

  const clearFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
  };

  // 生成逻辑保留流式处理，但状态流转更清晰
  const generate = async () => {
    if (!context.trim() || !requirements.trim()) return;
    if (mode === 'file' && !file) return;
    
    setGenerating(true);
    setGenerationError('');
    setStreamingContent('');
    setPriorityFilter('all');
    setModuleFilter('all');

    // 预热思维导图引擎，因为生成过程需要几秒，正好利用这个空档下载代码包。
    prefetchMindMapEngine().catch(() => {});

    try {
      let fullText = '';
      const resp = mode === 'file' && file
        ? await testCaseAPI.generateFromFile(file, context, requirements, moduleName, useVector, styleId, selectedSkillIds)
        : await testCaseAPI.generateFromContext(context, requirements, moduleName, useVector, styleId, selectedSkillIds);
      
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += dec.decode(value, { stream: true });
        setStreamingContent(fullText);
      }

      const parsed = parseTestCasesFromMarkdown(fullText).map((item) => ({
        ...item,
        module: item.module || moduleName.trim() || '未分组',
      }));

      if (parsed.length > 0) {
        setParsedTestCases(parsed);
        showSnackbar(`成功解析 ${parsed.length} 个测试用例`, { severity: 'success' });
      } else {
        showSnackbar('生成完成，但未能解析出标准格式用例', { severity: 'warning' });
      }
    } catch (e) {
      const message = e.message || '测试用例生成失败';
      showSnackbar('生成失败: ' + message, { severity: 'error' });
      setGenerationError(message);
    } finally {
      setGenerating(false);
    }
  };

  const priorityOptions = useMemo(() => {
    const set = new Set();
    parsedTestCases.forEach((t) => t.priority?.trim() && set.add(t.priority.trim()));
    return Array.from(set);
  }, [parsedTestCases]);

  const moduleOptions = useMemo(() => {
    const set = new Set();
    parsedTestCases.forEach((t) => t.module?.trim() && set.add(t.module.trim()));
    return Array.from(set);
  }, [parsedTestCases]);

  const filteredTestCases = useMemo(() => (
    parsedTestCases.filter((t) => {
      const matchesPriority = priorityFilter === 'all' || t.priority === priorityFilter;
      const matchesModule = moduleFilter === 'all' || t.module === moduleFilter;
      return matchesPriority && matchesModule;
    })
  ), [moduleFilter, parsedTestCases, priorityFilter]);

  const totalStepCount = useMemo(() => (
    filteredTestCases.reduce((sum, t) => sum + (t.steps?.length || 0), 0)
  ), [filteredTestCases]);

  const hasResult = streamingContent.length > 0;

  return (
    <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', p: { xs: 2, md: 3 }, gap: 3, background: 'transparent', flexDirection: isNarrow ? 'column' : 'row' }}>
      <GenerationPanel
        availableModules={availableModules}
        clearFile={clearFile}
        context={context}
        dragOver={dragOver}
        file={file}
        fileRef={fileRef}
        generate={generate}
        generating={generating}
        handleFileSelect={handleFileSelect}
        handleReset={handleReset}
        isNarrow={isNarrow}
        mode={mode}
        moduleName={moduleName}
        previewUrl={previewUrl}
        requirements={requirements}
        selectedSkillIds={selectedSkillIds}
        setContext={setContext}
        setDragOver={setDragOver}
        setMode={setMode}
        setModuleName={setModuleName}
        setRequirements={setRequirements}
        setSelectedSkillIds={setSelectedSkillIds}
        setStyleId={setStyleId}
        skillOptions={skillOptions}
        styleId={styleId}
        templateOptions={templateOptions}
      />

      <Paper 
        elevation={0} 
        sx={{ 
          flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', 
          border: '1px solid rgba(255, 255, 255, 0.4)', borderRadius: 4,
          background: 'rgba(255, 255, 255, 0.65)', backdropFilter: 'blur(20px)',
          boxShadow: '0 8px 32px rgba(15, 23, 42, 0.04), inset 0 1px 0 rgba(255, 255, 255, 1)'
        }}
      >
        <ResultHeader
          checkVectorStatus={() => {}} // 逻辑已移入 Hook 自动轮询
          generating={generating}
          setUseVector={setUseVector}
          useVector={useVector}
          vectorStatus={vectorStatus}
        />
        <Box sx={{ flex: 1, p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'transparent' }}>
          <ResultActionBar
            exportAnchorEl={exportAnchorEl}
            exportExcel={() => exportMutation.mutate({ type: 'excel', data: filteredTestCases })}
            exportXMind={() => exportMutation.mutate({ type: 'xmind', data: filteredTestCases })}
            generating={generating}
            hasResult={hasResult}
            parsedTestCases={parsedTestCases}
            setExportAnchorEl={setExportAnchorEl}
            setViewMode={setViewMode}
            onPrefetchMindMap={() => prefetchMindMapEngine().catch(() => {})}
            storeToVector={() => storeMutation.mutate({ testCases: filteredTestCases, moduleName })}
            storingVector={storeMutation.isPending}
            vectorStatus={vectorStatus}
            viewMode={viewMode}
          />

          {hasResult && !generating && (
            <ResultSummaryCards
              filteredTestCases={filteredTestCases}
              parsedTestCases={parsedTestCases}
              totalStepCount={totalStepCount}
              vectorStatus={vectorStatus}
              viewMode={viewMode}
            />
          )}

          {!generating && parsedTestCases.length > 0 && (
            <ResultFilters
              moduleFilter={moduleFilter}
              moduleOptions={moduleOptions}
              priorityFilter={priorityFilter}
              priorityOptions={priorityOptions}
              setModuleFilter={setModuleFilter}
              setPriorityFilter={setPriorityFilter}
            />
          )}

          {generationError && !generating ? (
            <EmptyState
              variant="error"
              title="测试用例生成失败"
              description={generationError}
              actionLabel="重试生成"
              onAction={generate}
            />
          ) : generating ? (
            <StageOutput content={streamingContent} />
          ) : hasResult ? (
            viewMode === 'stages' ? (
              <StageOutput content={streamingContent} isComplete />
            ) : viewMode === 'mindmap' && parsedTestCases.length > 0 ? (
              <TestCaseMindMap testCases={filteredTestCases} />
            ) : parsedTestCases.length > 0 ? (
              <TestCaseListView testCases={filteredTestCases} />
            ) : (
              <Paper variant="outlined" sx={{ flex: 1, p: 1.75, overflow: 'auto', borderRadius: 2.5, bgcolor: '#fbfcff' }}>
                <Box className="chat-markdown" sx={{ fontSize: 13, lineHeight: 1.6, '& pre': { whiteSpace: 'pre-wrap' } }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown>
                </Box>
              </Paper>
            )
          ) : (
            <EmptyState
              title="暂无生成结果"
              description={mode === 'file' ? '上传文件并填写上下文与测试需求后，即可开始生成测试用例。' : '填写上下文和测试需求后，即可开始生成测试用例。'}
            />
          )}
        </Box>
      </Paper>
    </Box>
  );
}
