import axios from 'axios';

// API请求的基本URL
const API_BASE_URL = 'http://localhost:8000/api';

// 创建axios实例
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// API函数
export const generateTestCases = async (formData) => {
  try {
    console.log('API 服务: 发送请求到后端...');
    console.log('API 服务: 请求数据:', formData);

    // 使用原生 fetch 而不是 axios 来处理流式响应
    const response = await fetch(`${API_BASE_URL}/test-cases/generate`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`服务器响应错误: ${response.status} ${response.statusText}`);
    }

    return response;
  } catch (error) {
    console.error('API 服务: 生成测试用例错误:', error);
    throw error;
  }
};

// 生成思维导图
export const generateMindMap = async (testCases) => {
  try {
    console.log('API 服务: 生成思维导图...');

    const response = await api.post('/test-cases/generate-mindmap', testCases);

    if (response.status === 200) {
      return response.data;
    } else {
      throw new Error(`生成思维导图失败: ${response.status}`);
    }
  } catch (error) {
    console.error('API 服务: 生成思维导图错误:', error);
    throw error;
  }
};

export const exportToExcel = async (testCases) => {
  try {
    const response = await api.post('/test-cases/export', testCases, {
      responseType: 'blob', // 对于文件下载很重要
    });
    return response;
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    throw error;
  }
};

export const pingServer = async () => {
  try {
    console.log('Pinging server...');
    const response = await fetch(`${API_BASE_URL}/ping`);
    const data = await response.json();
    console.log('Ping response:', data);
    return data;
  } catch (error) {
    console.error('Ping error:', error);
    throw error;
  }
};

export default api;
