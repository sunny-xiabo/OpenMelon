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
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            borderRadius: 2.5,
            border: '1px solid',
            borderColor: isTemplate ? 'primary.light' : 'success.light',
            bgcolor: isTemplate ? 'rgba(59,130,246,0.06)' : 'rgba(16,185,129,0.08)',
          }}
        >
          <Typography variant="subtitle2" fontWeight={700}>
            {isTemplate ? '模板用于定义整体生成风格' : '技能用于定义额外覆盖方向'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {isTemplate
              ? '这里更适合写信息密度、表达粒度、场景组织方式和整体写法，不要把它写成专项测试点清单。'
              : '这里更适合写边界、异常、权限、兼容性等专项补充点，不要把它写成整体写作风格模板。'}
          </Typography>
        </Paper>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
          <TextField
            label="名称"
            value={form.name}
            onChange={(event) => onChange({ name: event.target.value })}
            fullWidth
            helperText={isTemplate ? '给用户看的模板名，例如“精简版”。' : '给用户看的技能名，例如“边界值测试”。'}
          />
          <TextField
            label="ID（可选）"
            value={form.id}
            onChange={(event) => onChange({ id: event.target.value })}
            fullWidth
            helperText="稳定标识，建议英文短横线命名；不填时后端自动生成。"
          />
          <TextField
            label="描述"
            value={form.description}
            onChange={(event) => onChange({ description: event.target.value })}
            fullWidth
            helperText={isTemplate ? '一句话说明模板风格，例如“强调去冗余和高信息密度”。' : '一句话说明技能补充的覆盖方向。'}
          />
          {isTemplate ? (
            <TextField
              label="排序权重"
              value={form.sort_order}
              onChange={(event) => onChange({ sort_order: event.target.value })}
              fullWidth
              helperText="数字越小越靠前；默认模板通常排在前面。"
            />
          ) : (
            <Autocomplete
              freeSolo
              options={skillCategories}
              getOptionLabel={(option) => (typeof option === 'string' ? option : option.name)}
              value={form.category || ''}
              onChange={(_, value) => onChange({ category: typeof value === 'string' ? value : value?.name || '' })}
              onInputChange={(_, value) => onChange({ category: value })}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="技能分类"
                  fullWidth
                  helperText="可直接选择中文分类，也可以输入新分类名称；新分类会自动保存。"
                />
              )}
            />
          )}
          {!isTemplate && (
            <TextField
              label="排序权重"
              value={form.sort_order}
              onChange={(event) => onChange({ sort_order: event.target.value })}
              fullWidth
              helperText="数字越小越靠前；同类技能里可用它控制展示顺序。"
            />
          )}
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.2fr 0.8fr' }, gap: 1.5, alignItems: 'start' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            <Paper elevation={0} sx={{ p: 1.25, border: '1px dashed', borderColor: 'divider', borderRadius: 2 }}>
              <Typography variant="body2" fontWeight={700}>
                {isTemplate ? '模板正文建议包含' : '技能正文建议包含'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {isTemplate
                  ? '风格目标、信息取舍规则、场景组织方式，以及保持标准 Markdown 协议不变的约束。'
                  : '需要额外补充的测试类型、重点风险点、典型场景范围，以及专项覆盖的优先级。'}
              </Typography>
            </Paper>

            <TextField
              label={isTemplate ? '评审摘要（风格摘要）' : '评审摘要（覆盖摘要）'}
              value={form.review_summary}
              onChange={(event) => onChange({ review_summary: event.target.value })}
              fullWidth
              helperText={isTemplate
                ? '给评审器看的模板风格摘要，概括意图即可，不要复制正文全文。'
                : '给评审器看的技能覆盖摘要，概括补充方向即可，不要复制正文全文。'}
            />
            <TextField
              label={isTemplate ? '模板正文（决定怎么写）' : '技能正文（决定多覆盖什么）'}
              value={form.content}
              onChange={(event) => onChange({ content: event.target.value })}
              multiline
              minRows={8}
              fullWidth
              helperText={isTemplate
                ? '模板控制“怎么写”：写风格、粒度和场景组织，不要改 Markdown 输出协议。'
                : '技能控制“多覆盖什么”：写需要额外补充的专项场景，不要改输出协议。'}
              placeholder={isTemplate
                ? '例如：请以精简、直接、高信息密度的风格编写测试用例；优先保留关键步骤和最可验证的预期结果；按主流程、异常流程和角色差异组织场景……'
                : '例如：请额外补充边界值和临界条件测试，重点关注最小值、最大值、空值、超长输入、非法格式、集合为空与单项切换等场景……'}
            />
          </Box>

          <Paper
            elevation={0}
            sx={{
              p: 1.5,
              borderRadius: 2.5,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: '#fbfcff',
            }}
          >
            <Typography variant="subtitle2" fontWeight={700}>
              {isTemplate ? '模板写法参考' : '技能写法参考'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              {isTemplate ? '更像一份“写作策略”。' : '更像一份“专项补充清单”。'}
            </Typography>
            <Divider sx={{ my: 1.25 }} />
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
              推荐
            </Typography>
            <Box
              component="pre"
              sx={{
                m: 0,
                mt: 0.5,
                p: 1.25,
                fontSize: 12,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                borderRadius: 2,
                bgcolor: isTemplate ? 'rgba(59,130,246,0.08)' : 'rgba(16,185,129,0.1)',
                color: '#0f172a',
              }}
            >
              {isTemplate
                ? '请以精简、直接、高信息密度的风格编写测试用例；优先保留关键操作与核心断言；按主流程、失败分支和角色差异组织场景。'
                : '请额外补充边界值、空值、超长输入、非法格式和权限不足场景，并优先覆盖最容易漏测的高风险路径。'}
            </Box>
            <Typography variant="caption" sx={{ display: 'block', mt: 1.25, color: 'text.secondary' }}>
              不推荐
            </Typography>
            <Box
              component="pre"
              sx={{
                m: 0,
                mt: 0.5,
                p: 1.25,
                fontSize: 12,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                borderRadius: 2,
                bgcolor: 'rgba(248,113,113,0.1)',
                color: '#7f1d1d',
              }}
            >
              {isTemplate
                ? '请额外补充边界值、SQL 注入、越权访问、网络抖动等专项测试。'
                : '请整体写得简洁一点、信息密度高一点、避免重复描述。'}
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {isTemplate
                ? '上面这种“不推荐”写法会把模板写成技能。'
                : '上面这种“不推荐”写法会把技能写成模板。'}
            </Typography>
          </Paper>
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <FormControlLabel
            control={<Switch checked={Boolean(form.enabled)} onChange={(event) => onChange({ enabled: event.target.checked })} />}
            label="启用"
          />
          {isTemplate && (
            <FormControlLabel
              control={<Switch checked={Boolean(form.is_default)} onChange={(event) => onChange({ is_default: event.target.checked })} />}
              label="设为默认模板"
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">取消</Button>
        <Button onClick={onSubmit} variant="contained" disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
