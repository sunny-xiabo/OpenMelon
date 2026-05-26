import { Box, Paper, Stack, Typography, Grid, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import BoltOutlined from '@mui/icons-material/BoltOutlined';
import StarBorderOutlined from '@mui/icons-material/StarBorderOutlined';
import InfoOutlined from '@mui/icons-material/InfoOutlined';

export default function PromptHubSummaryCards({ summary }) {
  const theme = useTheme();

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
      {/* 启用模板卡 */}
      <Paper 
        elevation={0} 
        sx={{ 
          p: 2.25, 
          borderRadius: 4.5,
          border: '1px solid',
          borderColor: 'rgba(14, 165, 233, 0.15)',
          background: `linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(255, 255, 255, 0.75) 100%)`,
          backdropFilter: 'blur(10px)',
          boxShadow: '0 8px 32px rgba(14, 165, 233, 0.01), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            transform: 'translateY(-3px)',
            borderColor: 'rgba(14, 165, 233, 0.45)',
            boxShadow: '0 12px 36px rgba(14, 165, 233, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
          }
        }}
      >
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 2, bgcolor: 'rgba(14, 165, 233, 0.1)', color: 'primary.main' }}>
            <AutoAwesomeOutlined fontSize="small" />
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 800, color: 'text.secondary', letterSpacing: '0.02em' }}>启用模板</Typography>
        </Stack>
        <Typography sx={{ mt: 2, fontSize: 32, fontWeight: 950, color: 'slate.900', lineHeight: 1.1, fontFamily: 'monospace' }}>
          {summary?.enabledTemplates ?? 0}
        </Typography>
      </Paper>

      {/* 启用技能卡 */}
      <Paper 
        elevation={0} 
        sx={{ 
          p: 2.25, 
          borderRadius: 4.5,
          border: '1px solid',
          borderColor: 'rgba(16, 185, 129, 0.15)',
          background: `linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(255, 255, 255, 0.75) 100%)`,
          backdropFilter: 'blur(10px)',
          boxShadow: '0 8px 32px rgba(16, 185, 129, 0.01), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            transform: 'translateY(-3px)',
            borderColor: 'rgba(16, 185, 129, 0.45)',
            boxShadow: '0 12px 36px rgba(16, 185, 129, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
          }
        }}
      >
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 2, bgcolor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
            <BoltOutlined fontSize="small" />
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 800, color: 'text.secondary', letterSpacing: '0.02em' }}>启用技能</Typography>
        </Stack>
        <Typography sx={{ mt: 2, fontSize: 32, fontWeight: 950, color: 'slate.900', lineHeight: 1.1, fontFamily: 'monospace' }}>
          {summary?.enabledSkills ?? 0}
        </Typography>
      </Paper>

      {/* 默认模板卡 */}
      <Paper 
        elevation={0} 
        sx={{ 
          p: 2.25, 
          borderRadius: 4.5,
          border: '1px solid',
          borderColor: 'rgba(245, 158, 11, 0.15)',
          background: `linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(255, 255, 255, 0.75) 100%)`,
          backdropFilter: 'blur(10px)',
          boxShadow: '0 8px 32px rgba(245, 158, 11, 0.01), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            transform: 'translateY(-3px)',
            borderColor: 'rgba(245, 158, 11, 0.45)',
            boxShadow: '0 12px 36px rgba(245, 158, 11, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
          }
        }}
      >
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 2, bgcolor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
            <StarBorderOutlined fontSize="small" />
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 800, color: 'text.secondary', letterSpacing: '0.02em' }}>默认模板</Typography>
        </Stack>
        <Typography sx={{ mt: 2, fontSize: 18, fontWeight: 900, color: 'slate.900', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {summary?.defaultTemplate || '未指定默认模板'}
        </Typography>
      </Paper>
    </Box>
  );
}

export function PromptHubWritingGuide() {
  return (
    <Paper 
      elevation={0} 
      sx={{ 
        p: 3, 
        borderRadius: 4.5, 
        border: '1px solid rgba(99, 102, 241, 0.12)', 
        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.03) 0%, rgba(139, 92, 246, 0.03) 100%)',
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: -20,
          right: -20,
          width: 80,
          height: 80,
          borderRadius: '50%',
          bgcolor: 'rgba(99, 102, 241, 0.04)',
          filter: 'blur(10px)'
        }
      }}
    >
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 1.5, bgcolor: 'rgba(99, 102, 241, 0.08)', color: 'indigo.500' }}>
          <InfoOutlined fontSize="small" style={{ color: '#6366f1' }} />
        </Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 900, color: 'slate.900' }}>
          AI 提示策略编写指南 (AI Writing Core Blueprint)
        </Typography>
      </Stack>
      
      <Grid container spacing={2.5}>
        <Grid item xs={12} md={6}>
          <Paper 
            variant="outlined" 
            sx={{ 
              p: 2, 
              borderRadius: 3.5, 
              bgcolor: 'rgba(255, 255, 255, 0.55)', 
              borderColor: 'rgba(14, 165, 233, 0.08)',
              borderLeft: '4px solid #0ea5e9'
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 800, color: 'primary.main', mb: 0.5 }}>
              ① 整体写作模板 (Templates) — 决定“怎么写”
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.6, fontWeight: 500 }}>
              适用于定义文本风格（精简程度、去冗余规则）、用例粒度、以及场景组织架构（如：角色权限分类、主副流线分拆）。请**绝不要**修改标准 Markdown 测试用例的输出协议格式。
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper 
            variant="outlined" 
            sx={{ 
              p: 2, 
              borderRadius: 3.5, 
              bgcolor: 'rgba(255, 255, 255, 0.55)', 
              borderColor: 'rgba(16, 185, 129, 0.08)',
              borderLeft: '4px solid #10b981'
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 800, color: '#10b981', mb: 0.5 }}>
              ② 专项能力技能 (Skills) — 决定“多覆盖什么”
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.6, fontWeight: 500 }}>
              适用于补充专项安全与健壮性规则（如：极限边界值、多层级并发、敏感字符过滤、权限流转审计等）。不影响整体结构，仅作为针对特定接口漏洞的深度用例扫描补充。
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Paper>
  );
}
