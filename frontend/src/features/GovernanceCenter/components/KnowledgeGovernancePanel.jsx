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
import { DeleteOutline, RestoreOutlined } from '@mui/icons-material';
import EmptyState from '../../../components/EmptyState';
import {
  KNOWLEDGE_STATUS,
  KNOWLEDGE_TYPE_LABELS,
} from './governanceModel';

export function KnowledgeGovernancePanel({
  knowledgeItems,
  knowledgeTypeOptions,
  filteredKnowledgeItems,
  knowledgeStatus,
  setKnowledgeStatus,
  knowledgeType,
  setKnowledgeType,
  knowledgeKeyword,
  setKnowledgeKeyword,
  updateKnowledgeStatus,
  requestDeleteKnowledgeItem,
  copyText,
}) {
  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>知识状态</InputLabel>
          <Select label="知识状态" value={knowledgeStatus} onChange={(event) => setKnowledgeStatus(event.target.value)}>
            <MenuItem value="">全部状态</MenuItem>
            <MenuItem value="active">已沉淀</MenuItem>
            <MenuItem value="invalid">已标记失效</MenuItem>
            <MenuItem value="revoked">已撤回使用</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>知识类型</InputLabel>
          <Select label="知识类型" value={knowledgeType} onChange={(event) => setKnowledgeType(event.target.value)}>
            <MenuItem value="">全部类型</MenuItem>
            {[...new Set([knowledgeType, ...knowledgeTypeOptions].filter(Boolean))].map((type) => (
              <MenuItem key={type} value={type}>{KNOWLEDGE_TYPE_LABELS[type] || type}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          size="small"
          label="关键词"
          value={knowledgeKeyword}
          onChange={(event) => setKnowledgeKeyword(event.target.value)}
          sx={{ minWidth: 240, flex: 1 }}
        />
        <Typography variant="caption" color="text.secondary">
          显示 {filteredKnowledgeItems.length} / {knowledgeItems.length}
        </Typography>
      </Stack>

      <Alert severity="info">
        标记失效和撤回使用都不会删除知识原始记录；失效用于暂停参与有效知识召回，撤回表示该知识不再被认可，后续仍可恢复。
      </Alert>

      <KnowledgeTable
        items={filteredKnowledgeItems}
        updateKnowledgeStatus={updateKnowledgeStatus}
        requestDeleteKnowledgeItem={requestDeleteKnowledgeItem}
        copyText={copyText}
      />
    </Stack>
  );
}

function KnowledgeTable({ items, updateKnowledgeStatus, requestDeleteKnowledgeItem, copyText }) {
  if (!items.length) return <EmptyState compact title="当前筛选下暂无知识项" description="可以调整知识状态、类型或关键词后重新查看。" />;
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>知识项</TableCell>
            <TableCell>类型</TableCell>
            <TableCell>状态</TableCell>
            <TableCell>来源</TableCell>
            <TableCell>修复效果</TableCell>
            <TableCell align="right">治理操作</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => {
            const status = KNOWLEDGE_STATUS[item.status] || KNOWLEDGE_STATUS.active;
            const effect = item.payload?.repair_effect_score || item.payload?.automation_summary?.repair_effect_score;
            return (
              <TableRow key={item.knowledge_id} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{item.summary || item.knowledge_id}</Typography>
                  <Typography variant="caption" color="text.secondary">{item.knowledge_id}</Typography>
                </TableCell>
                <TableCell>{KNOWLEDGE_TYPE_LABELS[item.item_type] || item.item_type}</TableCell>
                <TableCell><Chip size="small" color={status.color} label={status.label} variant="outlined" /></TableCell>
                <TableCell>{item.source_run_id || item.project_id || '未记录'}</TableCell>
                <TableCell>{effect?.label || (effect?.score ? `${effect.score} 分` : '未评分')}</TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={0.75} justifyContent="flex-end">
                    <Button size="small" onClick={() => copyText(item.knowledge_id, '知识 ID')}>复制ID</Button>
                    {item.status !== 'invalid' && (
                      <Button size="small" color="warning" onClick={() => updateKnowledgeStatus(item.knowledge_id, 'invalid')}>标记失效</Button>
                    )}
                    {item.status !== 'revoked' && (
                      <Button size="small" color="inherit" onClick={() => updateKnowledgeStatus(item.knowledge_id, 'revoked')}>撤回使用</Button>
                    )}
                    {item.status !== 'active' && (
                      <Button size="small" startIcon={<RestoreOutlined />} onClick={() => updateKnowledgeStatus(item.knowledge_id, 'active')}>恢复</Button>
                    )}
                    {item.status !== 'active' && (
                      <Button size="small" color="error" startIcon={<DeleteOutline />} onClick={() => requestDeleteKnowledgeItem(item)}>永久删除</Button>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
