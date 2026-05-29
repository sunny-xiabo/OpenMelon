import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Chip,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material';
import { CheckOutlined, CloseOutlined } from '@mui/icons-material';
import EmptyState from './EmptyState';

/**
 * Inline-editable text field. Renders as plain text; switches to
 * a MUI TextField on click. Enter confirms (single-line), Escape cancels.
 */
function EditableField({ value, onChange, multiline = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <Box
        onClick={() => { setDraft(value); setEditing(true); }}
        sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' }, borderRadius: 1, px: 0.5, minHeight: 24 }}
      >
        {value || (
          <Typography variant="body2" color="text.disabled">
            点击编辑
          </Typography>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'flex-start' }}>
      <TextField
        size="small"
        fullWidth
        multiline={multiline}
        minRows={multiline ? 2 : 1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !multiline) {
            onChange(draft);
            setEditing(false);
          }
          if (e.key === 'Escape') setEditing(false);
        }}
      />
      <IconButton
        size="small"
        onClick={() => { onChange(draft); setEditing(false); }}
      >
        <CheckOutlined fontSize="small" />
      </IconButton>
      <IconButton size="small" onClick={() => setEditing(false)}>
        <CloseOutlined fontSize="small" />
      </IconButton>
    </Box>
  );
}

const PRIORITIES = ['高', '中', '低'];

const PRIORITY_ALIASES = { P0: '高', P1: '中', P2: '低', High: '高', Medium: '中', Low: '低', high: '高', medium: '中', low: '低' };

export const normalizePriority = (p) => PRIORITY_ALIASES[p] || (PRIORITIES.includes(p) ? p : '中');

const priorityColor = (p) => {
  const n = normalizePriority(p);
  return n === '高' ? 'error' : n === '中' ? 'warning' : 'success';
};

export default function TestCaseListView({ testCases, onUpdate }) {
  if (!testCases?.length) {
    return (
      <EmptyState
        compact
        title="当前筛选下暂无测试用例"
        description="可以调整优先级或模块筛选后重新查看。"
      />
    );
  }

  const updateField = (tcIndex, field, value) => {
    if (!onUpdate) return;
    const next = [...testCases];
    next[tcIndex] = { ...next[tcIndex], [field]: value };
    onUpdate(next);
  };

  const updateStep = (tcIndex, stepIndex, field, value) => {
    if (!onUpdate) return;
    const next = [...testCases];
    const steps = [...next[tcIndex].steps];
    steps[stepIndex] = { ...steps[stepIndex], [field]: value };
    next[tcIndex] = { ...next[tcIndex], steps };
    onUpdate(next);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
      }}
    >
      <Typography variant="body2" color="text.secondary">
        已生成 {testCases.length} 个测试用例
        {onUpdate && ' (点击字段可编辑)'}
      </Typography>

      {testCases.map((tc, tcIndex) => (
        <Paper
          key={tc.id || tcIndex}
          variant="outlined"
          sx={{ p: 2, borderRadius: 2.5 }}
        >
          {/* Header: ID + title + priority badge */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography variant="subtitle2" fontWeight={700} color="primary">
              {tc.id || `TC-${tcIndex + 1}`}
            </Typography>

            <Box sx={{ flex: 1 }}>
              <EditableField
                value={tc.title}
                onChange={(v) => updateField(tcIndex, 'title', v)}
              />
            </Box>

            <Chip
              size="small"
              label={normalizePriority(tc.priority)}
              color={priorityColor(tc.priority)}
              onClick={
                onUpdate
                  ? () => {
                      const current = normalizePriority(tc.priority);
                      const next =
                        PRIORITIES[
                          (PRIORITIES.indexOf(current) + 1) %
                            PRIORITIES.length
                        ];
                      updateField(tcIndex, 'priority', next);
                    }
                  : undefined
              }
              sx={{ cursor: onUpdate ? 'pointer' : 'default' }}
            />
          </Box>

          {/* Description */}
          {tc.description && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary">
                描述
              </Typography>
              <EditableField
                value={tc.description}
                onChange={(v) => updateField(tcIndex, 'description', v)}
                multiline
              />
            </Box>
          )}

          {/* Preconditions */}
          {tc.preconditions && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary">
                前置条件
              </Typography>
              <EditableField
                value={tc.preconditions}
                onChange={(v) => updateField(tcIndex, 'preconditions', v)}
              />
            </Box>
          )}

          {/* Steps table */}
          {tc.steps?.length > 0 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell width={40}>#</TableCell>
                  <TableCell>步骤描述</TableCell>
                  <TableCell>预期结果</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tc.steps.map((step, si) => (
                  <TableRow key={si}>
                    <TableCell>{step.step_number}</TableCell>
                    <TableCell>
                      <EditableField
                        value={step.description}
                        onChange={(v) =>
                          updateStep(tcIndex, si, 'description', v)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <EditableField
                        value={step.expected_result}
                        onChange={(v) =>
                          updateStep(tcIndex, si, 'expected_result', v)
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>
      ))}
    </Box>
  );
}
