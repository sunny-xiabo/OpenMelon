import { createContext, useContext, useMemo, useRef, useState } from 'react';
import { useSnackbar } from '../../../components/SnackbarProvider';
import { getTagNames } from '../utils';
import { useUIContext } from './UIContext';

// Hooks
import { useParseSpecMutation } from '../hooks/useAPIExecutionQueries';

const SpecContext = createContext();

export const useSpecContext = () => {
  const ctx = useContext(SpecContext);
  if (!ctx) throw new Error('useSpecContext must be used within a SpecProvider');
  return ctx;
};

export const SpecProvider = ({ children }) => {
  const showSnackbar = useSnackbar();
  const { setLoading, setLoadingMessage, setActiveStep } = useUIContext();
  const fileInputRef = useRef(null);

  const [sourceUrl, setSourceUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [spec, setSpec] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [selectedOperationIds, setSelectedOperationIds] = useState(new Set());

  // 解析 Mutation
  const parseMutation = useParseSpecMutation();

  // Callbacks for cross-domain reset
  const resetCallbacksRef = useRef([]);

  const registerResetCallback = (cb) => {
    resetCallbacksRef.current.push(cb);
    return () => {
      resetCallbacksRef.current = resetCallbacksRef.current.filter((fn) => fn !== cb);
    };
  };

  const tagOptions = useMemo(() => {
    const names = new Set(getTagNames(spec?.tags || []));
    for (const op of spec?.operations || []) {
      for (const tag of op.tags || []) names.add(tag);
    }
    return Array.from(names).sort();
  }, [spec]);

  const filteredOperations = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return (spec?.operations || []).filter((op) => {
      if (!keyword) return true;
      return [op.path, op.summary, op.operation_id, op.method]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(keyword));
    });
  }, [spec, searchText]);

  const visibleOperationIds = filteredOperations.map((op) => op.id);

  const toggleOperation = (operationId) => {
    setSelectedOperationIds((prev) => {
      const next = new Set(prev);
      if (next.has(operationId)) next.delete(operationId);
      else next.add(operationId);
      return next;
    });
  };

  const toggleVisibleOperations = () => {
    setSelectedOperationIds((prev) => {
      const next = new Set(prev);
      const allSelected = visibleOperationIds.length > 0 && visibleOperationIds.every((id) => next.has(id));
      if (allSelected) visibleOperationIds.forEach((id) => next.delete(id));
      else visibleOperationIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const resetAfterSpecChange = (data, { advanceStep = true } = {}) => {
    setSpec(data);
    setSearchText('');
    setSelectedOperationIds(new Set());
    for (const cb of resetCallbacksRef.current) cb(data);
    if (advanceStep) setActiveStep(1);
  };

  const clearSpec = () => {
    setSpec(null);
    setSearchText('');
    setSelectedOperationIds(new Set());
    for (const cb of resetCallbacksRef.current) cb(null);
    setActiveStep(0);
  };

  const parseFile = async () => {
    if (!selectedFile) {
      showSnackbar('请先选择 API 文档文件', { severity: 'warning' });
      return;
    }
    setLoadingMessage('正在解析 API 文档...');
    setLoading(true);
    try {
      const data = await parseMutation.mutateAsync({ type: 'file', payload: selectedFile });
      resetAfterSpecChange(data);
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const parseUrl = async (forceRefresh = false) => {
    const url = sourceUrl.trim();
    if (!url) {
      showSnackbar('请输入 API 文档 URL', { severity: 'warning' });
      return;
    }
    setLoadingMessage('正在获取并解析 API 文档...');
    setLoading(true);
    try {
      const data = await parseMutation.mutateAsync({ type: 'url', payload: { url, forceRefresh } });
      resetAfterSpecChange(data);
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const loadDemoOpenApi = async () => {
    setLoadingMessage('Demo API 资产准备中...');
    setLoading(true);
    try {
      const data = await parseMutation.mutateAsync({ type: 'demo' });
      resetAfterSpecChange(data);
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const value = useMemo(() => ({
    sourceUrl, setSourceUrl,
    selectedFile, setSelectedFile,
    spec, setSpec,
    searchText, setSearchText,
    selectedOperationIds, setSelectedOperationIds,
    fileInputRef,
    tagOptions,
    filteredOperations,
    visibleOperationIds,
    toggleOperation,
    toggleVisibleOperations,
    resetAfterSpecChange,
    clearSpec,
    registerResetCallback,
    parseFile,
    parseUrl,
    loadDemoOpenApi,
  }), [sourceUrl, selectedFile, spec, searchText, selectedOperationIds, tagOptions, filteredOperations, visibleOperationIds]);

  return (
    <SpecContext.Provider value={value}>
      {children}
    </SpecContext.Provider>
  );
};
