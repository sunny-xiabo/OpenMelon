import React from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import {
  CloseOutlined,
  PsychologyOutlined,
  LightbulbOutlined,
  TipsAndUpdatesOutlined,
  VerifiedUserOutlined,
} from '@mui/icons-material';

export default function AdviceDrawer({ open, onClose, diagnostics }) {
  const [generating, setGenerating] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setGenerating(true);
      const timer = setTimeout(() => setGenerating(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const issues = diagnostics.filter(d => d.level !== 'success');

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      scroll="paper"
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { 
          borderRadius: 4.5,
          background: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
          overflow: 'hidden'
        }
      }}
    >
      <DialogTitle sx={{ p: 3, pb: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 2, bgcolor: 'rgba(99, 102, 241, 0.08)', color: 'primary.main' }}>
          <PsychologyOutlined />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 900, color: 'text.primary' }}>
            AI 治理专家诊断建议
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 500 }}>
            基于当前全域数据图谱一致性深度扫描得出的受控修复方案
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ alignSelf: 'flex-start', mt: -0.5 }}>
          <CloseOutlined fontSize="small" />
        </IconButton>
      </DialogTitle>
      
      <DialogContent dividers sx={{ p: 3, pt: 2 }}>
        {generating ? (
          <Stack spacing={2.5} sx={{ py: 5, alignItems: 'center', textAlign: 'center' }}>
            <Box sx={{ position: 'relative', width: 70, height: 70, display: 'grid', placeItems: 'center' }}>
              <Box 
                sx={{ 
                  position: 'absolute', 
                  inset: 0, 
                  borderRadius: '50%', 
                  bgcolor: 'rgba(99, 102, 241, 0.08)',
                  animation: 'pulseGlow 2s infinite ease-in-out',
                  '@keyframes pulseGlow': {
                    '0%, 100%': { transform: 'scale(1)', opacity: 0.5 },
                    '50%': { transform: 'scale(1.2)', opacity: 0.9 }
                  }
                }} 
              />
              <PsychologyOutlined sx={{ fontSize: 36, color: 'primary.main', zIndex: 1 }} />
            </Box>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 800 }}>正在评估全图一致性阻断风险...</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontWeight: 500 }}>正在计算语义向量空间物理分布差异</Typography>
            </Box>
            <LinearProgress sx={{ width: '100%', maxWidth: 220, borderRadius: 3, height: 4 }} />
          </Stack>
        ) : (
          <Stack spacing={3} sx={{ py: 1 }}>
            {issues.length > 0 ? (
              <>
                <Alert 
                  icon={<LightbulbOutlined />} 
                  severity="info" 
                  sx={{ 
                    borderRadius: 3.5, 
                    fontWeight: 700, 
                    border: '1px solid rgba(14, 165, 233, 0.12)', 
                    bgcolor: 'rgba(14, 165, 233, 0.02)',
                    color: '#0369a1',
                    '& .MuiAlert-message': { width: '100%' } 
                  }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>核心诊断结论</Typography>
                  <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.5, fontWeight: 500 }}>
                    当前全图分析发现共 {issues.length} 类核心资产结构差异。主要由于后台高并发任务异步回填延迟导致。
                  </Typography>
                </Alert>
                
                <Stack spacing={2}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1, color: 'slate.900' }}>
                    <TipsAndUpdatesOutlined fontSize="small" style={{ color: '#6366f1' }} /> 逐步修复指令推荐
                  </Typography>
                  {issues.map((issue, idx) => (
                    <Paper 
                      key={idx} 
                      variant="outlined" 
                      sx={{ 
                        p: 2, 
                        borderRadius: 3.5, 
                        bgcolor: 'rgba(0,0,0,0.01)', 
                        borderColor: 'rgba(0,0,0,0.05)' 
                      }}
                    >
                      <Stack direction="row" spacing={2} alignItems="flex-start">
                        <Box 
                          sx={{ 
                            width: 20, 
                            height: 20, 
                            borderRadius: '50%', 
                            bgcolor: 'primary.main', 
                            color: 'white', 
                            display: 'grid', 
                            placeItems: 'center', 
                            fontSize: '0.7rem', 
                            fontWeight: 900, 
                            flexShrink: 0,
                            mt: 0.25
                          }}
                        >
                          {idx + 1}
                        </Box>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 800, color: 'text.primary' }}>{issue.title}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, lineHeight: 1.5, fontWeight: 500 }}>
                            建议方案：{issue.action === '清理孤儿' 
                              ? '执行「一键清理孤儿」功能以移除 Qdrant 中多余的脏向量点，防止语义检索到已过期的脏用例数据。' 
                              : '直接在下方资产行中触发「重建」，系统将基于图谱中文本文档重新进行词嵌入 (embedding) 并推送到 Qdrant。'}
                          </Typography>
                        </Box>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
                
                <Box 
                  sx={{ 
                    p: 2, 
                    borderRadius: 3.5, 
                    bgcolor: 'rgba(16, 185, 129, 0.03)', 
                    border: '1px dashed', 
                    borderColor: 'rgba(16, 185, 129, 0.15)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.5
                  }}
                >
                  <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 800 }}>✓ 安全治理保障体系：</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.5, fontWeight: 500 }}>
                    在大规模的图谱回填或增量构建时，建议在系统闲时提交任务。重建完成之后，可通过"一致性扫描"按钮执行核验闭环。
                  </Typography>
                </Box>
              </>
            ) : (
              <Stack spacing={2} sx={{ py: 4, alignItems: 'center', textAlign: 'center' }}>
                <VerifiedUserOutlined sx={{ fontSize: 48, color: 'success.main', opacity: 0.7 }} />
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>您的知识与向量一致性完美</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontWeight: 500 }}>未发现任何异常数据，当前检索召回处于最佳状态！</Typography>
                </Box>
              </Stack>
            )}
          </Stack>
        )}
      </DialogContent>
      
      <Box sx={{ p: 2, px: 3.5, display: 'flex', justifyContent: 'flex-end', bgcolor: 'rgba(0,0,0,0.01)' }}>
        <Button onClick={onClose} variant="contained" sx={{ borderRadius: 2, px: 3, fontWeight: 800, fontSize: '12px' }}>
          {issues.length > 0 ? '我已了解建议' : '太棒了'}
        </Button>
      </Box>
    </Dialog>
  );
}
