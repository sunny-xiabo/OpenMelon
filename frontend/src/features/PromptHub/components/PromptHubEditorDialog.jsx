import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import CheckCircleOutlineOutlined from '@mui/icons-material/CheckCircleOutlineOutlined';

export default function PromptHubEditorDialog({
  open,
  title,
  form,
  onChange,
  onClose,
  onSubmit,
  saving,
  skillCategories,
  type,
}) {
  const isTemplate = type === 'template';

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      fullWidth 
      maxWidth="lg"
      PaperProps={{
        sx: { borderRadius: 4.5, overflow: 'hidden' }
      }}
    >
      <DialogTitle sx={{ px: 3.5, pt: 2.5, pb: 2, fontWeight: 950, fontSize: '16px' }}>
        {title}
      </DialogTitle>
      
      <DialogContent dividers sx={{ p: 3.5, display: 'flex', flexDirection: 'column', gap: 3.5 }}>
        
        {/* Banner Alert */}
        <Paper
          elevation={0}
          sx={{
            p: 2,
            borderRadius: 3.5,
            border: '1px solid',
            borderColor: isTemplate ? 'rgba(14, 165, 233, 0.18)' : 'rgba(16, 185, 129, 0.18)',
            bgcolor: (theme) => isTemplate ? 'rgba(14, 165, 233, 0.03)' : 'rgba(16, 185, 129, 0.03)',
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 800, color: isTemplate ? 'primary.main' : '#10b981', mb: 0.5 }}>
            {isTemplate ? '✦ 整体风格模板 (Prompt Template)' : '✦ 专项覆盖技能 (Prompt Skill)'}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.5, fontWeight: 500 }}>
            {isTemplate
              ? '模板专注于控制测试场景的宏观组织结构、描述密度、粒度与格式风格，请确保其能输出合规的标准 Markdown 用例。'
              : '技能专注于引导 AI 覆盖极限边界、异常请求、角色鉴权漏洞等专项测试方向，用于提升针对目标接口的质量防护强度。'}
          </Typography>
        </Paper>

        {/* Double-column Workbench layout */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.2fr 0.8fr' }, gap: 3.5, alignItems: 'start' }}>
          
          {/* Left Column: Form Fields & Monospace Terminal Box */}
          <Stack spacing={2.5}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <TextField
                size="small"
                label="配置策略名称"
                value={form.name || ''}
                onChange={(event) => onChange({ name: event.target.value })}
                fullWidth
                helperText={isTemplate ? '例如“精简极速模板”' : '例如“边界值专项防线”'}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.2, fontSize: '12px', fontWeight: 700 } }}
              />
              <TextField
                size="small"
                label="稳定唯一 ID (可选)"
                value={form.id || ''}
                onChange={(event) => onChange({ id: event.target.value })}
                fullWidth
                helperText="如果不填写，后台系统将自动生成 UUID"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.2, fontSize: '12px', fontWeight: 700 } }}
              />
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <TextField
                size="small"
                label="核心描述介绍"
                value={form.description || ''}
                onChange={(event) => onChange({ description: event.target.value })}
                fullWidth
                helperText="用一句简洁话语总结本项配置的使用场景"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.2, fontSize: '12px', fontWeight: 700 } }}
              />
              {isTemplate ? (
                <TextField
                  size="small"
                  type="number"
                  label="策略排序权重"
                  value={form.sort_order || 100}
                  onChange={(event) => onChange({ sort_order: event.target.value })}
                  fullWidth
                  helperText="值越小排位越靠前，默认模板通常排在首位"
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.2, fontSize: '12px', fontWeight: 700 } }}
                />
              ) : (
                <Autocomplete
                  size="small"
                  freeSolo
                  options={skillCategories || []}
                  getOptionLabel={(option) => (typeof option === 'string' ? option : option.name || '')}
                  value={form.category || ''}
                  onChange={(_, value) => onChange({ category: typeof value === 'string' ? value : value?.name || '' })}
                  onInputChange={(_, value) => onChange({ category: value })}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="专项技能分类"
                      fullWidth
                      helperText="输入新分类会自动在库中创建"
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.2, fontSize: '12px', fontWeight: 700 } }}
                    />
                  )}
                />
              )}
            </Box>

            {!isTemplate && (
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <TextField
                  size="small"
                  type="number"
                  label="策略排序权重"
                  value={form.sort_order || 100}
                  onChange={(event) => onChange({ sort_order: event.target.value })}
                  fullWidth
                  helperText="值越小排位越靠前，用于同类技能内的顺序控制"
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.2, fontSize: '12px', fontWeight: 700 } }}
                />
                <Box />
              </Box>
            )}

            <TextField
              size="small"
              label={isTemplate ? "评审摘要 (风格意图概括)" : "评审摘要 (覆盖方向概括)"}
              value={form.review_summary || ''}
              onChange={(event) => onChange({ review_summary: event.target.value })}
              fullWidth
              helperText="给自动化评审机制阅读的风格意图摘要，不需粘贴正文全文"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.2, fontSize: '12px', fontWeight: 700 } }}
            />

            {/* macOS Dark hacker styled terminal box for core prompts */}
            <Box 
              sx={{ 
                borderRadius: 4.5, 
                overflow: 'hidden', 
                border: '1px solid rgba(30, 41, 59, 0.4)',
                bgcolor: '#0f172a',
                boxShadow: '0 8px 32px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.05)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* macOS Window Topbar */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.25, bgcolor: '#1e293b', borderBottom: '1px solid rgba(51, 65, 85, 0.4)' }}>
                <Stack direction="row" spacing={1}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#ef4444' }} />
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#f59e0b' }} />
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#10b981' }} />
                </Stack>
                <Typography variant="caption" sx={{ color: 'slate.400', fontFamily: 'monospace', fontWeight: 700, fontSize: '10px', opacity: 0.8, letterSpacing: '0.05em' }}>
                  {isTemplate ? 'prompt_template_core.md' : 'prompt_skill_supplement.md'}
                </Typography>
                <Box sx={{ width: 44 }} />
              </Box>
              
              {/* Monospace Text Area */}
              <TextField
                value={form.content || ''}
                onChange={(event) => onChange({ content: event.target.value })}
                multiline
                minRows={10}
                maxRows={18}
                fullWidth
                placeholder={isTemplate
                  ? '例如：请以精简、直接、高信息密度的风格编写测试用例；优先保留关键步骤与可断言的预期结果；按角色差异组织用例场景……'
                  : '例如：请额外补充边界值、极限条件和安全校验测试，重点关注最小值、最大值、空值、非法格式、越权访问等高风险场景……'}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    fontFamily: '"Fira Code", "Fira Mono", "Consolas", "Courier New", monospace',
                    fontSize: '12px',
                    color: '#38bdf8',
                    p: 2.5,
                    lineHeight: 1.65,
                    '& fieldset': { border: 'none' },
                  }
                }}
              />
            </Box>
          </Stack>
          
          {/* Right Column: Recommended vs Not Recommended expert guide */}
          <Paper
            elevation={0}
            sx={{
              p: 3,
              borderRadius: 4.5,
              border: '1px solid rgba(0,0,0,0.06)',
              bgcolor: 'rgba(0,0,0,0.01)',
              display: 'flex',
              flexDirection: 'column',
              gap: 2.5,
            }}
          >
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 900, color: 'text.primary', mb: 0.5 }}>
                {isTemplate ? '模板编写金科玉律' : '技能编写金科玉律'}
              </Typography>
              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontWeight: 600 }}>
                {isTemplate ? '模板类似于写作策略 (Writing Strategy)' : '技能类似于重点扫描清单 (Checklist)'}
              </Typography>
            </Box>

            <Divider sx={{ borderColor: 'rgba(0,0,0,0.05)' }} />

            {/* Recommended block */}
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                borderRadius: 3.5,
                bgcolor: 'rgba(16, 185, 129, 0.03)',
                borderColor: 'rgba(16, 185, 129, 0.12)',
                borderLeft: '4px solid #10b981'
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, color: '#10b981' }}>
                <CheckCircleOutlineOutlined fontSize="small" />
                <Typography variant="body2" sx={{ fontWeight: 800 }}>
                  推荐写法
                </Typography>
              </Stack>
              <Typography 
                variant="caption" 
                component="pre" 
                sx={{ 
                  m: 0, 
                  whiteSpace: 'pre-wrap', 
                  fontFamily: 'monospace', 
                  fontSize: '11px', 
                  color: 'slate.800', 
                  lineHeight: 1.5,
                  display: 'block' 
                }}
              >
                {isTemplate
                  ? '“请以高信息密度编写测试场景；将场景划分为正常流程、非法入参、鉴权越权，并采用标准的用例输出……”'
                  : '“请针对目标接口补充边界值、负值、空数组校验；重点关注超长文本参数以及特殊控制字符的清洗过滤……”'}
              </Typography>
            </Paper>

            {/* Not Recommended block */}
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                borderRadius: 3.5,
                bgcolor: 'rgba(239, 68, 68, 0.03)',
                borderColor: 'rgba(239, 68, 68, 0.12)',
                borderLeft: '4px solid #ef4444'
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, color: '#ef4444' }}>
                <WarningAmberOutlined fontSize="small" />
                <Typography variant="body2" sx={{ fontWeight: 800 }}>
                  不推荐写法
                </Typography>
              </Stack>
              <Typography 
                variant="caption" 
                component="pre" 
                sx={{ 
                  m: 0, 
                  whiteSpace: 'pre-wrap', 
                  fontFamily: 'monospace', 
                  fontSize: '11px', 
                  color: '#7f1d1d', 
                  lineHeight: 1.5,
                  display: 'block' 
                }}
              >
                {isTemplate
                  ? '“请补充 SQL 注入测试、多级并发性能瓶颈测试……”（这属于具体的覆盖专项，应写到技能中）'
                  : '“请尽量让生成的结果字数少一点，行文更流畅利落……”（这属于整体写作风格，应写到模板中）'}
              </Typography>
            </Paper>

            <Divider sx={{ borderColor: 'rgba(0,0,0,0.05)' }} />

            <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.5, fontWeight: 500 }}>
              {isTemplate
                ? '注意：整体写作模板不要涉及过多专项场景，否则会让底层引擎陷入逻辑冗长。'
                : '注意：专项技能专注于针对接口的风险边界进行补漏，不要试图修改全局的排版样式。'}
            </Typography>
          </Paper>
        </Box>

        {/* Dynamic checking switches */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ mt: 1 }}>
          <FormControlLabel
            control={
              <Switch 
                size="small"
                checked={Boolean(form.enabled)} 
                onChange={(event) => onChange({ enabled: event.target.checked })} 
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': {
                    color: '#10b981',
                    '& + .MuiSwitch-track': {
                      backgroundColor: '#10b981',
                    },
                  },
                }}
              />
            }
            label={
              <Typography variant="body2" sx={{ fontWeight: 800, fontSize: '12px', ml: 0.5 }}>
                立即启用此策略部署
              </Typography>
            }
          />
          {isTemplate && (
            <FormControlLabel
              control={
                <Switch 
                  size="small"
                  checked={Boolean(form.is_default)} 
                  onChange={(event) => onChange({ is_default: event.target.checked })} 
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': {
                      color: '#0ea5e9',
                      '& + .MuiSwitch-track': {
                        backgroundColor: '#0ea5e9',
                      },
                    },
                  }}
                />
              }
              label={
                <Typography variant="body2" sx={{ fontWeight: 800, fontSize: '12px', ml: 0.5 }}>
                  设置为兜底默认模板 (Default Template)
                </Typography>
              }
            />
          )}
        </Stack>

      </DialogContent>
      
      <DialogActions sx={{ px: 3.5, py: 2.5, bgcolor: 'rgba(0,0,0,0.01)' }}>
        <Button onClick={onClose} sx={{ fontWeight: 800, fontSize: '12px' }}>
          取消
        </Button>
        <Button 
          variant="contained" 
          onClick={onSubmit} 
          disabled={saving}
          sx={{ borderRadius: 2, px: 3.5, fontWeight: 800, fontSize: '12px' }}
        >
          {saving ? '正在保存中...' : '提交保存'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
