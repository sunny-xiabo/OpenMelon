import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Grid,
  Card,
  CardContent,
  Chip,
  Stack,
  Divider,
  Alert,
  LinearProgress,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  CloudUpload,
  Description,
  Image,
  Code,
  AutoAwesome,
  PlayArrow,
  Refresh,
  Info,
  CheckCircle,
  Warning
} from '@mui/icons-material';

const WorkspaceArea = ({
  uploadedFile,
  onFileUpload,
  onGenerateTestCases,
  isGenerating,
  serverStatus
}) => {
  const [context, setContext] = useState('');
  const [requirements, setRequirements] = useState('');

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      onFileUpload(file);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onGenerateTestCases(context, requirements);
  };

  const getFileTypeInfo = (file) => {
    if (!file) return null;
    
    const extension = file.name.split('.').pop().toLowerCase();
    const fileTypes = {
      'png': { icon: <Image />, type: '图像文件', color: '#4caf50' },
      'jpg': { icon: <Image />, type: '图像文件', color: '#4caf50' },
      'jpeg': { icon: <Image />, type: '图像文件', color: '#4caf50' },
      'gif': { icon: <Image />, type: '图像文件', color: '#4caf50' },
      'pdf': { icon: <Description />, type: 'PDF文档', color: '#f44336' },
      'json': { icon: <Code />, type: 'API文档', color: '#ff9800' },
      'yaml': { icon: <Code />, type: 'API文档', color: '#ff9800' },
      'yml': { icon: <Code />, type: 'API文档', color: '#ff9800' }
    };
    
    return fileTypes[extension] || { icon: <Description />, type: '文档', color: '#9e9e9e' };
  };

  const fileInfo = getFileTypeInfo(uploadedFile);

  return (
    <Paper 
      elevation={3} 
      sx={{ 
        p: 4, 
        borderRadius: 3,
        background: 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%)',
        border: '1px solid rgba(0,0,0,0.05)'
      }}
    >
      {/* 标题区域 */}
      <Box sx={{ mb: 4 }}>
        <Typography 
          variant="h5" 
          component="h2" 
          gutterBottom 
          sx={{ 
            fontWeight: 600,
            color: '#1a73e8',
            display: 'flex',
            alignItems: 'center',
            gap: 1
          }}
        >
          <AutoAwesome />
          智能测试用例生成工作台
        </Typography>
        <Typography variant="body2" color="text.secondary">
          上传您的文件，填写相关信息，AI将为您生成专业的测试用例
        </Typography>
      </Box>

      <form onSubmit={handleSubmit}>
        <Grid container spacing={4}>
          {/* 文件上传区域 */}
          <Grid item xs={12}>
            <Card 
              elevation={0} 
              sx={{ 
                border: uploadedFile ? '2px solid #4caf50' : '2px dashed #1a73e8',
                borderRadius: 3,
                transition: 'all 0.3s ease',
                '&:hover': {
                  borderColor: uploadedFile ? '#4caf50' : '#0d47a1',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 8px 25px rgba(0,0,0,0.1)'
                }
              }}
            >
              <CardContent sx={{ p: 4 }}>
                {uploadedFile ? (
                  // 已上传文件显示
                  <Box sx={{ textAlign: 'center' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                      <Chip
                        icon={fileInfo?.icon}
                        label={fileInfo?.type}
                        sx={{
                          bgcolor: fileInfo?.color,
                          color: 'white',
                          fontWeight: 600,
                          '& .MuiChip-icon': { color: 'white' }
                        }}
                      />
                    </Box>
                    
                    {uploadedFile.type.startsWith('image/') ? (
                      <Box sx={{ mb: 2 }}>
                        <img
                          src={URL.createObjectURL(uploadedFile)}
                          alt="预览"
                          style={{
                            maxWidth: '200px',
                            maxHeight: '150px',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                          }}
                        />
                      </Box>
                    ) : (
                      <Box sx={{ mb: 2 }}>
                        {fileInfo?.icon && React.cloneElement(fileInfo.icon, {
                          sx: { fontSize: 64, color: fileInfo.color }
                        })}
                      </Box>
                    )}
                    
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                      {uploadedFile.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      文件大小: {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                    </Typography>
                    
                    <Button
                      variant="outlined"
                      component="label"
                      startIcon={<Refresh />}
                      sx={{ borderRadius: 2 }}
                    >
                      更换文件
                      <input
                        type="file"
                        hidden
                        accept="image/*,.pdf,.json,.yaml,.yml"
                        onChange={handleFileChange}
                      />
                    </Button>
                  </Box>
                ) : (
                  // 文件上传区域
                  <Box sx={{ textAlign: 'center' }}>
                    <CloudUpload sx={{ fontSize: 64, color: '#1a73e8', mb: 2 }} />
                    <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                      拖放文件到这里或点击上传
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                      支持图像文件、PDF需求文档、OpenAPI规范文档
                    </Typography>
                    
                    <Stack direction="row" spacing={1} justifyContent="center" sx={{ mb: 3 }}>
                      <Chip icon={<Image />} label="图像" size="small" variant="outlined" />
                      <Chip icon={<Description />} label="PDF" size="small" variant="outlined" />
                      <Chip icon={<Code />} label="API" size="small" variant="outlined" />
                    </Stack>
                    
                    <Button
                      variant="contained"
                      component="label"
                      startIcon={<CloudUpload />}
                      sx={{ borderRadius: 2, px: 4 }}
                    >
                      选择文件
                      <input
                        type="file"
                        hidden
                        accept="image/*,.pdf,.json,.yaml,.yml"
                        onChange={handleFileChange}
                      />
                    </Button>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* 上下文信息 */}
          <Grid item xs={12} md={6}>
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                测试上下文
                <Tooltip title="描述被测试的系统、功能或模块的基本信息">
                  <IconButton size="small" sx={{ ml: 1 }}>
                    <Info fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Typography>
            </Box>
            <TextField
              multiline
              rows={4}
              fullWidth
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="例如：这是一个电商网站的用户登录功能，包含用户名密码登录、手机号登录、第三方登录等方式..."
              variant="outlined"
              required
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2
                }
              }}
            />
          </Grid>

          {/* 需求描述 */}
          <Grid item xs={12} md={6}>
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                测试需求
                <Tooltip title="描述希望生成的测试用例类型和重点关注的测试场景">
                  <IconButton size="small" sx={{ ml: 1 }}>
                    <Info fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Typography>
            </Box>
            <TextField
              multiline
              rows={4}
              fullWidth
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              placeholder="例如：需要生成包含正向测试、异常测试、边界测试的完整测试用例，重点关注安全性和用户体验..."
              variant="outlined"
              required
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2
                }
              }}
            />
          </Grid>

          {/* 状态提示 */}
          <Grid item xs={12}>
            {serverStatus === 'error' && (
              <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                <Typography variant="body2">
                  无法连接到后端服务器，请确保服务器正在运行
                </Typography>
              </Alert>
            )}
            
            {isGenerating && (
              <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  AI正在分析您的文件并生成测试用例，请稍候...
                </Typography>
                <LinearProgress sx={{ borderRadius: 1 }} />
              </Alert>
            )}
          </Grid>

          {/* 生成按钮 */}
          <Grid item xs={12}>
            <Box sx={{ textAlign: 'center' }}>
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={!uploadedFile || isGenerating || !context || !requirements || serverStatus !== 'connected'}
                startIcon={isGenerating ? <AutoAwesome className="rotating" /> : <PlayArrow />}
                sx={{
                  px: 6,
                  py: 2,
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  borderRadius: 3,
                  background: 'linear-gradient(45deg, #1a73e8 30%, #4285f4 90%)',
                  '&:hover': {
                    background: 'linear-gradient(45deg, #1557b0 30%, #3367d6 90%)',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 8px 25px rgba(26, 115, 232, 0.3)'
                  },
                  '&:disabled': {
                    background: '#e0e0e0'
                  },
                  transition: 'all 0.3s ease'
                }}
              >
                {isGenerating ? '生成中...' : '🚀 开始生成测试用例'}
              </Button>
              
              {!uploadedFile && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  请先上传文件并填写相关信息
                </Typography>
              )}
            </Box>
          </Grid>
        </Grid>
      </form>

      {/* 添加旋转动画 */}
      <style jsx>{`
        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .rotating {
          animation: rotate 2s linear infinite;
        }
      `}</style>
    </Paper>
  );
};

export default WorkspaceArea;
