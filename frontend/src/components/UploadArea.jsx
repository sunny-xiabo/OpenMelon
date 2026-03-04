import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ImageIcon from '@mui/icons-material/Image';
import Grid from '@mui/material/Grid';

const UploadArea = ({ onFileUpload, onGenerateTestCases, isGenerating, uploadedFile, serverStatus = 'checking' }) => {
  const [context, setContext] = useState('');
  const [requirements, setRequirements] = useState('');

  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      onFileUpload(acceptedFiles[0]);
    }
  }, [onFileUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'],
      'application/pdf': ['.pdf'],
      'application/json': ['.json'],
      'text/yaml': ['.yaml', '.yml'],
      'application/x-yaml': ['.yaml', '.yml']
    },
    maxFiles: 1
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onGenerateTestCases(context, requirements);
  };

  return (
    <Paper elevation={3} sx={{ p: 3, mb: 4 }}>
      <Typography variant="h5" component="h2" gutterBottom>
        Generate Test Cases
      </Typography>

      <form onSubmit={handleSubmit}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Box
              {...getRootProps()}
              sx={{
                border: '2px dashed #1a73e8',
                borderRadius: 2,
                p: 3,
                textAlign: 'center',
                cursor: 'pointer',
                backgroundColor: isDragActive ? 'rgba(26, 115, 232, 0.1)' : 'transparent',
                transition: 'background-color 0.3s',
                mb: 2,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '150px'
              }}
            >
              <input {...getInputProps()} />

              {uploadedFile ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <ImageIcon color="primary" sx={{ fontSize: 48, mb: 1 }} />
                  <Typography variant="body1" color="primary">
                    {uploadedFile.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    点击或拖动替换
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <CloudUploadIcon color="primary" sx={{ fontSize: 48, mb: 1 }} />
                  <Typography variant="body1">
                    将文件拖放到这里
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    支持：图像文件、PDF需求文档、OpenAPI文档
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    或点击选择文件
                  </Typography>
                </Box>
              )}
            </Box>
          </Grid>

          <Grid item xs={12}>
            <TextField
              label="Context"
              multiline
              rows={3}
              fullWidth
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="提供关于被测试系统或功能的上下文"
              variant="outlined"
              required
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              label="Requirements"
              multiline
              rows={3}
              fullWidth
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              placeholder="描述测试用例生成的具体需求"
              variant="outlined"
              required
            />
          </Grid>

          <Grid item xs={12}>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              size="large"
              disabled={!uploadedFile || isGenerating || !context || !requirements || serverStatus !== 'connected'}
              startIcon={isGenerating ? <CircularProgress size={20} color="inherit" /> : null}
            >
              {isGenerating ? '生成中...' : '生成测试用例'}
            </Button>
          </Grid>
        </Grid>
      </form>
    </Paper>
  );
};

export default UploadArea;
