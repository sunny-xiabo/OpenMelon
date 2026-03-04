import React, { useState, useEffect, useRef } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ViewListIcon from '@mui/icons-material/ViewList';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import Fab from '@mui/material/Fab';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import Header from './components/Header';
import WorkspaceArea from './components/WorkspaceArea';
import TestCaseDisplay from './components/TestCaseDisplay';
import StreamingOutput from './components/StreamingOutput';
import MindMapViewer from './components/MindMapViewer';
import Footer from './components/Footer';
import { generateTestCases, pingServer } from './services/api';

// 从Markdown内容解析测试用例的函数
function parseTestCasesFromMarkdown(markdownText) {
  const testCases = [];
  const lines = markdownText.split('\n');

  let currentTestCase = null;
  let currentSteps = [];
  let inTable = false;

  console.log('开始解析Markdown，总行数:', lines.length);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 跳过文件信息部分和分隔线
    if (line.match(/^\*\*文件信息\*\*$/) ||
        line.match(/^-\s+(文件类型|使用模型)[:：]/) ||
        line.match(/^---+$/)) {
      console.log('跳过文件信息行:', line);
      continue;
    }

    // 检测新测试用例的开始 (支持多种格式，更严格的匹配以避免误识别)
    // ## TC-001: 标题 或 ## 测试用例 1: 标题 或 ## Test Case 1: 标题
    if (line.match(/^##\s+(TC-\d+|测试用例\s*\d+|Test\s*Case\s*\d+)[\s:：]/i)) {
      // 保存之前的测试用例
      if (currentTestCase && currentTestCase.title && currentTestCase.title.trim() !== '') {
        // 只保存有有效标题的测试用例
        currentTestCase.steps = currentSteps;
        testCases.push(currentTestCase);
        console.log('保存测试用例:', currentTestCase.id, '步骤数:', currentSteps.length);
      } else if (currentTestCase) {
        console.log('跳过无效测试用例:', currentTestCase);
      }

      // 解析测试用例标题 (更严格的匹配)
      const titleMatch = line.match(/^##\s+(TC-\d+|测试用例\s*(\d+)|Test\s*Case\s*(\d+))[\s:：]\s*(.+)$/i);
      if (titleMatch) {
        let id = titleMatch[1];
        // 获取标题部分 - 应该是最后一个捕获组
        let title = titleMatch[titleMatch.length - 1] || titleMatch[1];

        // 标准化ID格式
        if (!id.startsWith('TC-')) {
          const numMatch = id.match(/\d+/);
          if (numMatch) {
            id = `TC-${numMatch[0].padStart(3, '0')}`;
          } else {
            // 使用当前已解析的测试用例数量+1作为ID
            id = `TC-${String(testCases.length + 1).padStart(3, '0')}`;
          }
        }

        currentTestCase = {
          id: id,
          title: title.trim(),
          description: '',
          preconditions: '',
          priority: 'Medium'
        };
        currentSteps = [];
        inTable = false;
        console.log('创建新测试用例:', id, title);
      }
    }
    // 检测包含数字编号的测试用例格式 (如 ## 1. 标题)
    else if (line.match(/^##\s+\d+[\.\)]\s+.+/) && !currentTestCase) {
      const titleMatch = line.match(/^##\s+(\d+)[\.\)]\s+(.+)$/);
      if (titleMatch) {
        const num = titleMatch[1];
        const title = titleMatch[2].trim();
        const id = `TC-${num.padStart(3, '0')}`;

        currentTestCase = {
          id: id,
          title: title,
          description: '',
          preconditions: '',
          priority: 'Medium'
        };
        currentSteps = [];
        inTable = false;
        console.log('创建编号测试用例:', id, title);
      }
    }
    // 如果没有匹配到标准格式，检查是否是其他有效的测试用例格式
    else if (line.match(/^##\s+.+/) && !currentTestCase) {
      const title = line.replace(/^##\s+/, '').trim();

      // 排除明显不是测试用例的标题
      if (title.match(/^(文件信息|File\s*Info|正在生成|Generating|生成完成|Complete)/i)) {
        console.log('跳过非测试用例标题:', title);
        continue;
      }

      // 使用当前已解析的测试用例数量+1作为ID
      const id = `TC-${String(testCases.length + 1).padStart(3, '0')}`;

      currentTestCase = {
        id: id,
        title: title,
        description: '',
        preconditions: '',
        priority: 'Medium'
      };
      currentSteps = [];
      inTable = false;
      console.log('创建简单测试用例:', id, title);
    }
    // 检测优先级 (支持中英文)
    else if (line.match(/^\*\*(优先级|Priority):\*\*/i) && currentTestCase) {
      currentTestCase.priority = line.replace(/^\*\*(优先级|Priority):\*\*\s*/i, '');
    }
    // 检测描述 (支持中英文)
    else if (line.match(/^\*\*(描述|Description):\*\*/i) && currentTestCase) {
      currentTestCase.description = line.replace(/^\*\*(描述|Description):\*\*\s*/i, '');
    }
    // 检测前置条件 (支持中英文)
    else if (line.match(/^\*\*(前置条件|Preconditions?):\*\*/i) && currentTestCase) {
      currentTestCase.preconditions = line.replace(/^\*\*(前置条件|Preconditions?):\*\*\s*/i, '');
    }
    // 检测表格分隔行 (更宽松的匹配)
    else if (line.match(/^\|\s*[-:]+\s*\|\s*[-:]+\s*\|\s*[-:]+\s*\|/) ||
             line.match(/^\|\s*-+\s*\|\s*-+\s*\|\s*-+\s*\|/)) {
      inTable = true;
      console.log('检测到表格分隔行，开始解析表格');
    }
    // 检测表格头部（可能没有分隔行）
    else if (!inTable && line.match(/^\|\s*#\s*\|\s*(步骤|操作|动作|Step)\s*\|\s*(预期|结果|Expected)\s*\|/i)) {
      inTable = true;
      console.log('检测到表格头部，开始解析表格');
    }
    // 解析表格行
    else if (inTable && line.match(/^\|.*\|.*\|.*\|$/)) {
      const cells = line.split('|').map(cell => cell.trim()).filter(cell => cell);
      if (cells.length >= 3) {
        // 跳过表头行
        if (cells[0].match(/^#$|^序号$|^步骤号$/i) ||
            cells[1].match(/^步骤|^操作|^动作|^Step/i)) {
          console.log('跳过表头行');
          continue; // 使用 continue 而不是 return
        }

        // 尝试解析步骤号，如果失败则使用序号
        let stepNumber = parseInt(cells[0]);
        if (isNaN(stepNumber)) {
          // 尝试从文本中提取数字
          const numMatch = cells[0].match(/\d+/);
          if (numMatch) {
            stepNumber = parseInt(numMatch[0]);
          } else {
            stepNumber = currentSteps.length + 1;
          }
        }

        // 确保有有效的描述和预期结果
        const description = cells[1] ? cells[1].trim() : '执行操作';
        const expectedResult = cells[2] ? cells[2].trim() : '验证操作成功';

        currentSteps.push({
          step_number: stepNumber,
          description: description,
          expected_result: expectedResult
        });
        console.log('添加测试步骤:', stepNumber, description);
      }
    }
    // 检测非表格格式的步骤（备用解析）
    else if (currentTestCase && line.match(/^\d+[\.\)]\s+.+/) && !inTable) {
      const stepMatch = line.match(/^(\d+)[\.\)]\s+(.+)$/);
      if (stepMatch) {
        const stepNumber = parseInt(stepMatch[1]);
        const description = stepMatch[2].trim();

        // 查找下一行是否有预期结果
        let expectedResult = '验证操作成功';
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          if (nextLine.match(/^(预期|期望|结果|Expected)[:：]/i)) {
            expectedResult = nextLine.replace(/^(预期|期望|结果|Expected)[:：]\s*/i, '');
          }
        }

        currentSteps.push({
          step_number: stepNumber,
          description: description,
          expected_result: expectedResult
        });
        console.log('添加非表格步骤:', stepNumber, description);
      }
    }
    // 如果遇到新的二级标题，结束当前表格
    else if (line.match(/^##/) && inTable) {
      inTable = false;
    }
  }

  // 保存最后一个测试用例
  if (currentTestCase && currentTestCase.title && currentTestCase.title.trim() !== '') {
    currentTestCase.steps = currentSteps;
    testCases.push(currentTestCase);
    console.log('保存最后一个测试用例:', currentTestCase.id, '步骤数:', currentSteps.length);
  } else if (currentTestCase) {
    console.log('跳过最后一个无效测试用例:', currentTestCase);
  }

  // 过滤掉可能的重复或无效测试用例
  const validTestCases = testCases.filter((testCase, index, array) => {
    // 检查是否有标题
    if (!testCase.title || testCase.title.trim() === '') {
      console.log('过滤掉无标题的测试用例:', testCase);
      return false;
    }

    // 检查标题是否是明显的非测试用例内容
    if (testCase.title.match(/^(文件信息|File\s*Info|正在生成|Generating|生成完成|Complete|测试步骤|Test\s*Steps)$/i)) {
      console.log('过滤掉非测试用例标题:', testCase.title);
      return false;
    }

    // 检查是否有重复的ID
    const duplicateIndex = array.findIndex(tc => tc.id === testCase.id);
    if (duplicateIndex !== index) {
      console.log('过滤掉重复ID的测试用例:', testCase.id);
      return false;
    }

    // 检查是否有重复的标题
    const duplicateTitleIndex = array.findIndex(tc => tc.title === testCase.title);
    if (duplicateTitleIndex !== index) {
      console.log('过滤掉重复标题的测试用例:', testCase.title);
      return false;
    }

    return true;
  });

  console.log('解析完成，原始测试用例数:', testCases.length, '有效测试用例数:', validTestCases.length);

  // 输出每个有效测试用例的详细信息用于调试
  validTestCases.forEach((tc, index) => {
    console.log(`有效测试用例 ${index + 1}:`, {
      id: tc.id,
      title: tc.title,
      description: tc.description,
      steps: tc.steps.length
    });
  });

  return validTestCases;
}

// 创建专业的产品主题
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1a73e8',
      light: '#4285f4',
      dark: '#1557b0',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#8430ce',
      light: '#9c4dcc',
      dark: '#6a1b9a',
    },
    success: {
      main: '#34a853',
      light: '#4caf50',
      dark: '#2e7d32',
    },
    warning: {
      main: '#fbbc04',
      light: '#ffc107',
      dark: '#f57c00',
    },
    error: {
      main: '#ea4335',
      light: '#f44336',
      dark: '#d32f2f',
    },
    background: {
      default: '#f8f9fa',
      paper: '#ffffff',
    },
    text: {
      primary: '#202124',
      secondary: '#5f6368',
    },
  },
  typography: {
    fontFamily: '"Google Sans", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '3.5rem',
      fontWeight: 700,
      lineHeight: 1.2,
    },
    h2: {
      fontSize: '2.5rem',
      fontWeight: 600,
      lineHeight: 1.3,
    },
    h3: {
      fontSize: '2rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 600,
      lineHeight: 1.5,
    },
    h6: {
      fontSize: '1.125rem',
      fontWeight: 600,
      lineHeight: 1.5,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.6,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.5,
    },
  },
  shape: {
    borderRadius: 12,
  },
  shadows: [
    'none',
    '0px 2px 4px rgba(0, 0, 0, 0.05)',
    '0px 4px 8px rgba(0, 0, 0, 0.1)',
    '0px 8px 16px rgba(0, 0, 0, 0.1)',
    '0px 12px 24px rgba(0, 0, 0, 0.15)',
    '0px 16px 32px rgba(0, 0, 0, 0.15)',
    '0px 20px 40px rgba(0, 0, 0, 0.2)',
    ...Array(18).fill('0px 20px 40px rgba(0, 0, 0, 0.2)'),
  ],
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 24,
          padding: '10px 24px',
          fontWeight: 600,
          fontSize: '0.95rem',
          transition: 'all 0.3s ease',
        },
        containedPrimary: {
          background: 'linear-gradient(45deg, #1a73e8 30%, #4285f4 90%)',
          boxShadow: '0 4px 12px rgba(26, 115, 232, 0.3)',
          '&:hover': {
            background: 'linear-gradient(45deg, #1557b0 30%, #3367d6 90%)',
            boxShadow: '0 6px 16px rgba(26, 115, 232, 0.4)',
            transform: 'translateY(-2px)',
          },
        },
        outlined: {
          borderWidth: '2px',
          '&:hover': {
            borderWidth: '2px',
            transform: 'translateY(-1px)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0px 4px 20px rgba(0, 0, 0, 0.08)',
          transition: 'all 0.3s ease',
        },
        elevation1: {
          boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.05)',
        },
        elevation2: {
          boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.08)',
        },
        elevation3: {
          boxShadow: '0px 6px 16px rgba(0, 0, 0, 0.1)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          transition: 'all 0.3s ease',
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: '0px 12px 24px rgba(0, 0, 0, 0.15)',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 12,
            transition: 'all 0.3s ease',
            '&:hover': {
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: '#1a73e8',
              },
            },
            '&.Mui-focused': {
              '& .MuiOutlinedInput-notchedOutline': {
                borderWidth: '2px',
                borderColor: '#1a73e8',
              },
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          fontWeight: 500,
        },
      },
    },
  },
});

function App() {
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingOutput, setStreamingOutput] = useState('');
  const [testCases, setTestCases] = useState([]);
  const [serverStatus, setServerStatus] = useState('checking');
  const [viewMode, setViewMode] = useState('markdown'); // 'markdown' or 'mindmap'
  const [showScrollTop, setShowScrollTop] = useState(false);

  // 创建refs用于滚动
  const workspaceRef = useRef(null);

  // 在组件加载时测试与后端的连接
  useEffect(() => {
    const checkServerConnection = async () => {
      try {
        const result = await pingServer();
        if (result.status === 'success') {
          setServerStatus('connected');
          console.log('与后端连接成功!');
        } else {
          setServerStatus('error');
          console.error('后端返回了意外的响应:', result);
        }
      } catch (error) {
        setServerStatus('error');
        console.error('无法连接到后端:', error);
      }
    };

    checkServerConnection();
  }, []);

  // 监听滚动事件，显示回到顶部按钮
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.pageYOffset > 300);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 回到顶部
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  const handleFileUpload = (file) => {
    setUploadedFile(file);
  };

  const handleGenerateTestCases = async (context, requirements) => {
    if (!uploadedFile) {
      alert('请先上传文件');
      return;
    }

    setIsGenerating(true);
    setStreamingOutput('');
    setTestCases([]);

    try {
      // 创建表单数据
      const formData = new FormData();
      formData.append('file', uploadedFile);
      formData.append('context', context);
      formData.append('requirements', requirements);

      // 使用流式响应发起API请求
      console.log('发送请求到后端...');
      console.log('请求数据:', {
        file: uploadedFile?.name,
        context: context,
        requirements: requirements
      });

      // 使用我们的 API 服务发送请求
      const response = await generateTestCases(formData);
      console.log('收到后端响应:', response.status);

      // 处理流式响应
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      console.log('开始读取流式响应...');

      // 读取流式响应
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('流式响应读取完成');
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // 更新流式输出
        setStreamingOutput(prev => prev + chunk);
        console.log('收到数据块:', chunk);
      }

      // 解析完整响应以获取测试用例
      console.log('开始解析测试用例...');
      console.log('完整的响应缓冲区:', buffer);

      // 直接从Markdown内容解析测试用例
      console.log('开始从Markdown解析测试用例...');
      const parsedTestCases = parseTestCasesFromMarkdown(buffer);

      if (parsedTestCases.length > 0) {
        console.log('成功解析的测试用例数量:', parsedTestCases.length);
        setTestCases(parsedTestCases);
      } else {
        // 如果没有解析到测试用例，设置空数组
        console.log('没有解析到测试用例，设置空数组');
        setTestCases([]);
      }
    } catch (error) {
      console.error('Error generating test cases:', error);
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
      setStreamingOutput(`生成测试用例时出错: ${error.message}\n请检查控制台以获取更多信息。`);
      alert(`请求错误: ${error.message}\n请检查浏览器控制台以获取更多信息。`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportToExcel = async () => {
    if (testCases.length === 0) {
      alert('No test cases to export');
      return;
    }

    try {
      const response = await fetch('http://localhost:8000/api/test-cases/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testCases),
      });

      if (response.ok) {
        // 从响应中获取blob
        const blob = await response.blob();

        // 为blob创建一个URL
        const url = window.URL.createObjectURL(blob);

        // 创建一个链接并点击它以下载文件
        const a = document.createElement('a');
        a.href = url;
        a.download = response.headers.get('content-disposition')?.split('filename=')[1] || 'test_cases.xlsx';
        document.body.appendChild(a);
        a.click();

        // 清理
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        console.error('Error exporting test cases:', await response.text());
        alert('Error exporting test cases. Please try again.');
      }
    } catch (error) {
      console.error('Error exporting test cases:', error);
      alert('Error exporting test cases. Please try again.');
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      {/* Header */}
      <Header serverStatus={serverStatus} />

      {/* Workspace Area */}
      <Container maxWidth="lg" sx={{ py: 4 }} ref={workspaceRef}>
        <WorkspaceArea
          uploadedFile={uploadedFile}
          onFileUpload={handleFileUpload}
          onGenerateTestCases={handleGenerateTestCases}
          isGenerating={isGenerating}
          serverStatus={serverStatus}
        />
      </Container>


      {/* Results Area */}
      {(isGenerating || testCases.length > 0 || streamingOutput) && (
        <Container maxWidth="lg" sx={{ py: 4 }}>
          <Paper elevation={3} sx={{ p: 4, borderRadius: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h5" sx={{ fontWeight: 600, color: '#1a73e8' }}>
                {isGenerating ? '🤖 AI正在生成测试用例...' : '📋 测试用例结果'}
              </Typography>

              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                {!isGenerating && testCases.length > 0 && (
                  <>
                    <ToggleButtonGroup
                      value={viewMode}
                      exclusive
                      onChange={(event, newMode) => {
                        if (newMode !== null) {
                          setViewMode(newMode);
                        }
                      }}
                      size="small"
                      sx={{ borderRadius: 2 }}
                    >
                      <ToggleButton value="markdown" aria-label="列表视图">
                        <ViewListIcon />
                      </ToggleButton>
                      <ToggleButton value="mindmap" aria-label="思维导图">
                        <AccountTreeIcon />
                      </ToggleButton>
                    </ToggleButtonGroup>

                    <Button
                      variant="outlined"
                      color="primary"
                      onClick={handleExportToExcel}
                      sx={{ borderRadius: 2 }}
                    >
                      📊 导出Excel
                    </Button>
                  </>
                )}
              </Box>
            </Box>

            {isGenerating ? (
              <StreamingOutput content={streamingOutput} />
            ) : testCases.length > 0 ? (
              viewMode === 'mindmap' ? (
                <MindMapViewer
                  testCases={testCases}
                  onMindMapUpdate={(updatedData) => {
                    console.log('思维导图已更新:', updatedData);
                  }}
                />
              ) : (
                <TestCaseDisplay
                  testCases={testCases}
                  onExportToExcel={handleExportToExcel}
                />
              )
            ) : streamingOutput ? (
              <Box>
                <StreamingOutput content={streamingOutput} />
                <Box sx={{
                  p: 3,
                  mt: 2,
                  backgroundColor: '#fff3cd',
                  borderRadius: 2,
                  border: '1px solid #ffeaa7'
                }}>
                  <Typography variant="body2" color="text.secondary">
                    ⚠️ 生成完成，但未能解析出标准格式的测试用例。请查看上方的生成内容。
                  </Typography>
                </Box>
              </Box>
            ) : null}
          </Paper>
        </Container>
      )}

      {/* Footer */}
      <Footer />

      {/* Scroll to Top Button */}
      {showScrollTop && (
        <Fab
          color="primary"
          size="medium"
          onClick={scrollToTop}
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1000,
            boxShadow: '0 8px 24px rgba(26, 115, 232, 0.3)',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: '0 12px 32px rgba(26, 115, 232, 0.4)',
            },
            transition: 'all 0.3s ease'
          }}
        >
          <KeyboardArrowUpIcon />
        </Fab>
      )}
    </ThemeProvider>
  );
}

export default App;
