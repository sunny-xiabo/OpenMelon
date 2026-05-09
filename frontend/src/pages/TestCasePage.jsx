import { useState, useRef, useCallback, useEffect, useMemo, lazy, Suspense } from 'react';
import {
  Box,
  Paper,
  CircularProgress,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { testCaseAPI, vectorAPI, graphAPI } from '../services/api';
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

const TestCaseMindMap = lazy(() => import('../components/TestCaseMindMap'));

export default function TestCasePage({ isActive = true }) {
  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down('lg'));
  const [mode, setMode] = useState('file');
  const [context, setContext] = useState('');
  const [requirements, setRequirements] = useState('');
  const [moduleName, setModuleName] = useState('');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [useVector, setUseVector] = useState(true);

  const [generating, setGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [parsedTestCases, setParsedTestCases] = useState([]);
  const [viewMode, setViewMode] = useState('list');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');

  const [vectorStatus, setVectorStatus] = useState(null);
  const [storingVector, setStoringVector] = useState(false);
  const [availableModules, setAvailableModules] = useState([]);
  const [exportAnchorEl, setExportAnchorEl] = useState(null);

  const fileRef = useRef(null);
  const showSnackbar = useSnackbar();
  const {
    defaultTemplateId,
    selectedSkillIds,
    setSelectedSkillIds,
    setStyleId,
    skillOptions,
    styleId,
    templateOptions,
  } = usePromptHubOptions({ isActive, showSnackbar });

  useEffect(() => {
    if (isActive) {
      checkVectorStatus();
      loadFilters();
    }
  }, [isActive]);

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

  const loadFilters = async () => {
    try {
      const filters = await graphAPI.getFilters();
      setAvailableModules(filters.modules || []);
    } catch (err) { console.error('Failed to load filters:', err); }
  };


  const checkVectorStatus = async () => {
    try {
      const status = await vectorAPI.checkStatus();
      setVectorStatus(status);
    } catch {
      setVectorStatus({ available: false, message: '检查失败' });
    }
  };

  const storeToVector = async () => {
    if (!filteredTestCases?.length) {
      showSnackbar('没有可存入的最终测试用例，请等待生成完成', 'warning');
      return;
    }
    setStoringVector(true);
    try {
      const result = await vectorAPI.storeTestCases(filteredTestCases, moduleName);
      if (result.success) {
        showSnackbar(result.message, 'success');
        checkVectorStatus();
      } else {
        showSnackbar(result.message || '存储失败', 'error');
      }
    } catch (e) {
      showSnackbar('存储失败: ' + e.message, 'error');
    } finally {
      setStoringVector(false);
    }
  };

  const handleFileSelect = useCallback((f) => {
    if (!f) return;
    const ext = '.' + f.name.split('.').pop().toLowerCase();
    if (!ALL_EXTS.includes(ext)) {
      showSnackbar('不支持的文件格式: ' + ext, 'error');
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

  const generate = async () => {
    if (!context.trim() || !requirements.trim()) return;
    if (mode === 'file' && !file) return;
    setGenerating(true);
    setStreamingContent('');
    setParsedTestCases([]);
    setPriorityFilter('all');
    setModuleFilter('all');

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
        showSnackbar(`成功解析 ${parsed.length} 个测试用例`, 'success');
      } else {
        showSnackbar('生成完成，但未能解析出标准格式用例', 'warning');
      }
    } catch (e) {
      showSnackbar('生成失败: ' + e.message, 'error');
      setStreamingContent(prev => prev || `生成失败: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const exportExcel = async () => {
    setExportAnchorEl(null);
    try {
      let blob;
      if (parsedTestCases.length > 0) {
        blob = await testCaseAPI.exportToExcel(filteredTestCases);
      } else if (streamingContent.trim()) {
        blob = await testCaseAPI.exportMarkdown(streamingContent);
      } else {
        return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '测试用例.xlsx';
      a.click();
      URL.revokeObjectURL(a.href);
      showSnackbar('导出 Excel 成功', 'success');
    } catch (e) {
      showSnackbar('导出失败: ' + e.message, 'error');
    }
  };

  const exportXMind = async () => {
    setExportAnchorEl(null);
    if (!filteredTestCases?.length) {
      showSnackbar('当前未解析出用例，请等待解析完成或确保内容包含受支持的格式', 'warning');
      return;
    }
    try {
      const blob = await testCaseAPI.exportXMind(filteredTestCases);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `test-cases-${Date.now()}.xmind`;
      a.click();
      URL.revokeObjectURL(a.href);
      showSnackbar('导出 XMind 成功', 'success');
    } catch (e) {
      showSnackbar('导出失败: ' + e.message, 'error');
    }
  };

  const hasResult = streamingContent.length > 0;
  const priorityOptions = useMemo(() => {
    const set = new Set();
    parsedTestCases.forEach((testCase) => {
      if (testCase.priority?.trim()) {
        set.add(testCase.priority.trim());
      }
    });
    return Array.from(set);
  }, [parsedTestCases]);

  const moduleOptions = useMemo(() => {
    const set = new Set();
    parsedTestCases.forEach((testCase) => {
      if (testCase.module?.trim()) {
        set.add(testCase.module.trim());
      }
    });
    return Array.from(set);
  }, [parsedTestCases]);

  const filteredTestCases = useMemo(() => (
    parsedTestCases.filter((testCase) => {
      const matchesPriority = priorityFilter === 'all' || testCase.priority === priorityFilter;
      const matchesModule = moduleFilter === 'all' || testCase.module === moduleFilter;
      return matchesPriority && matchesModule;
    })
  ), [moduleFilter, parsedTestCases, priorityFilter]);

  const totalStepCount = useMemo(() => (
    filteredTestCases.reduce((sum, testCase) => sum + (testCase.steps?.length || 0), 0)
  ), [filteredTestCases]);

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
          flex: 1, 
          minWidth: 0, 
          display: 'flex', 
          flexDirection: 'column', 
          overflow: 'hidden', 
          border: '1px solid rgba(255, 255, 255, 0.4)', 
          borderRadius: 4,
          background: 'rgba(255, 255, 255, 0.65)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 8px 32px rgba(15, 23, 42, 0.04), inset 0 1px 0 rgba(255, 255, 255, 1)'
        }}
      >
        <ResultHeader
          checkVectorStatus={checkVectorStatus}
          generating={generating}
          setUseVector={setUseVector}
          useVector={useVector}
          vectorStatus={vectorStatus}
        />
        <Box sx={{ flex: 1, p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'transparent' }}>
          <ResultActionBar
            exportAnchorEl={exportAnchorEl}
            exportExcel={exportExcel}
            exportXMind={exportXMind}
            generating={generating}
            hasResult={hasResult}
            parsedTestCases={parsedTestCases}
            setExportAnchorEl={setExportAnchorEl}
            setViewMode={setViewMode}
            storeToVector={storeToVector}
            storingVector={storingVector}
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

          {generating ? (
            <StageOutput content={streamingContent} />
          ) : hasResult ? (
            viewMode === 'stages' ? (
              <StageOutput content={streamingContent} isComplete />
            ) : viewMode === 'mindmap' && parsedTestCases.length > 0 ? (
              <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>}>
                <TestCaseMindMap testCases={filteredTestCases} />
              </Suspense>
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
