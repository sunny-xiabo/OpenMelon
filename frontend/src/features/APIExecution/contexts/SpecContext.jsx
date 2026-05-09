import { createContext, useContext, useMemo, useRef, useState } from 'react';
import { useSnackbar } from '../../../components/SnackbarProvider';
import { apiExecutionAPI } from '../../../api/execution';
import { getTagNames } from '../utils';
import { useUIContext } from './UIContext';

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

  // Callbacks for cross-domain reset -- set by CombinedProvider
  const resetCallbacksRef = useRef([]);

  const registerResetCallback = (cb) => {
    resetCallbacksRef.current.push(cb);
    return () => {
      resetCallbacksRef.current = resetCallbacksRef.current.filter((fn) => fn !== cb);
    };
  };

  const tagOptions = useMemo(() => {
    const names = new Set(getTagNames(spec?.tags || []));
    for (const operation of spec?.operations || []) {
      for (const tag of operation.tags || []) names.add(tag);
    }
    return Array.from(names).sort();
  }, [spec]);

  const filteredOperations = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return (spec?.operations || []).filter((operation) => {
      if (!keyword) return true;
      return [operation.path, operation.summary, operation.operation_id, operation.method]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });
  }, [spec, searchText]);

  const visibleOperationIds = filteredOperations.map((operation) => operation.id);

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

  const resetAfterSpecChange = (data) => {
    setSpec(data);
    setSearchText('');
    setSelectedOperationIds(new Set());
    // Cross-domain resets handled via callbacks
    for (const cb of resetCallbacksRef.current) cb(data);
    setActiveStep(1);
  };

  const parseFile = async () => {
    if (!selectedFile) {
      showSnackbar('请先选择 API 文档文件', 'warning');
      return;
    }
    setLoadingMessage('正在解析 API 文档...');
    setLoading(true);
    try {
      const data = await apiExecutionAPI.parseOpenApiFile(selectedFile);
      resetAfterSpecChange(data);
      showSnackbar(`解析成功，共 ${data.operation_count || 0} 个接口`, 'success');
    } catch (error) {
      showSnackbar(error.message || 'API 文档解析失败', 'error');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const parseUrl = async (forceRefresh = false) => {
    const url = sourceUrl.trim();
    if (!url) {
      showSnackbar('请输入 API 文档 URL', 'warning');
      return;
    }
    setLoadingMessage('正在获取并解析 API 文档...');
    setLoading(true);
    try {
      const data = await apiExecutionAPI.parseOpenApiUrl(url, forceRefresh);
      resetAfterSpecChange(data);
      showSnackbar(`解析成功，共 ${data.operation_count || 0} 个接口`, 'success');
    } catch (error) {
      showSnackbar(error.message || 'API 文档 URL 解析失败', 'error');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const value = {
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
    registerResetCallback,
    parseFile,
    parseUrl,
  };

  return (
    <SpecContext.Provider value={value}>
      {children}
    </SpecContext.Provider>
  );
};
