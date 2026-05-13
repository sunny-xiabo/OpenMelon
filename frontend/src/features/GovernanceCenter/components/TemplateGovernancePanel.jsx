import {
  Alert,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { DeleteOutline } from '@mui/icons-material';
import { formatRunTime } from '../../APIExecution/utils';

export function TemplateGovernancePanel({
  templates,
  rawTemplateCount,
  templateKeyword,
  setTemplateKeyword,
  templateStatus,
  setTemplateStatus,
  deleteTemplate,
  copyText,
}) {
  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>模板状态</InputLabel>
          <Select label="模板状态" value={templateStatus} onChange={(event) => setTemplateStatus(event.target.value)}>
            <MenuItem value="">全部状态</MenuItem>
            <MenuItem value="active">可用</MenuItem>
            <MenuItem value="deprecated">已废弃</MenuItem>
          </Select>
        </FormControl>
        <TextField
          size="small"
          label="关键词"
          value={templateKeyword}
          onChange={(event) => setTemplateKeyword(event.target.value)}
          sx={{ minWidth: 240, flex: 1 }}
        />
        <Typography variant="caption" color="text.secondary">
          显示 {templates.length} / {rawTemplateCount}
        </Typography>
      </Stack>
      {!templates.length ? (
        <Alert severity="info">暂无匹配流程模板。可以在 API 自动化编排工作台中保存当前 DSL 为模板。</Alert>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>模板</TableCell>
                <TableCell>版本</TableCell>
                <TableCell>状态</TableCell>
                <TableCell>适用范围</TableCell>
                <TableCell>历史表现</TableCell>
                <TableCell>更新时间</TableCell>
                <TableCell align="right">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {templates.map((template) => {
                const performance = template.performance_snapshot || {};
                const runCount = performance.run_count || 0;
                const passRate = performance.pass_rate !== undefined ? `${Math.round(Number(performance.pass_rate) * 100)}%` : '暂无';
                return (
                  <TableRow key={template.template_id} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{template.name}</Typography>
                      <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                        {(template.tags || []).slice(0, 4).map((tag) => <Chip key={tag} size="small" label={tag} />)}
                      </Stack>
                    </TableCell>
                    <TableCell>{template.version || 'v1'}</TableCell>
                    <TableCell><Chip size="small" color={template.deprecated ? 'warning' : 'success'} label={template.deprecated ? '已废弃' : '可用'} variant="outlined" /></TableCell>
                    <TableCell>{template.scope || template.project_id || '全项目可用'}</TableCell>
                    <TableCell>{runCount ? `${runCount} 次 · 通过率 ${passRate}` : '暂无执行样本'}</TableCell>
                    <TableCell>{formatRunTime(template.updated_at) || '未记录'}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.75} justifyContent="flex-end">
                        <Button size="small" onClick={() => copyText(template.template_id, '模板 ID')}>复制ID</Button>
                        <Button size="small" color="error" startIcon={<DeleteOutline />} onClick={() => deleteTemplate(template.template_id)}>删除</Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}
