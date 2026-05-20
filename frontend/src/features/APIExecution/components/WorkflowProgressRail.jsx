import React from 'react';
import { Box, ButtonBase, Chip, Divider, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import { CheckCircleOutline, RadioButtonUnchecked } from '@mui/icons-material';
import { alpha } from '@mui/material/styles';

const FLOW_STATUS_META = {
  done: { label: '已完成', color: 'success.main', bg: 'success.light' },
  active: { label: '进行中', color: 'primary.main', bg: 'primary.light' },
  pending: { label: '待处理', color: 'text.disabled', bg: 'action.hover' },
  warning: { label: '待诊断', color: 'error.main', bg: 'error.light' },
};

export default function WorkflowProgressRail({ steps, activeSection, onNavigate }) {
  const completedCount = steps.filter((step) => step.complete).length;
  const percent = Math.round((completedCount / steps.length) * 100);
  const nextStep = steps.find((step) => !step.complete) || steps[steps.length - 1];

  return (
    <Paper
      elevation={0}
      sx={{
        display: { xs: 'block', xl: 'block' },
        position: { xl: 'sticky' },
        top: { xl: 16 },
        p: 2,
        borderRadius: 1,
        border: '1px solid rgba(15, 23, 42, 0.08)',
        bgcolor: '#ffffff',
        alignSelf: 'start',
      }}
    >
      <Stack spacing={1.5}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Box>
            <Typography variant="subtitle2" fontWeight={850}>流程进度</Typography>
            <Typography variant="caption" color="text.secondary">Agent 测试主链路</Typography>
          </Box>
          <Chip size="small" color="primary" variant="outlined" label={`${completedCount}/${steps.length}`} />
        </Stack>
        <LinearProgress
          variant="determinate"
          value={percent}
          sx={{ height: 6, borderRadius: 1, bgcolor: 'rgba(15, 23, 42, 0.08)' }}
        />

        <Box sx={{ pt: 0.5 }}>
          {steps.map((step, index) => {
            const meta = FLOW_STATUS_META[step.status] || FLOW_STATUS_META.pending;
            const selected = activeSection === step.section;
            const isDone = step.status === 'done';
            const isWarning = step.status === 'warning';
            const isActive = step.status === 'active';
            const color = meta.color;

            return (
              <Box
                key={step.id}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '32px minmax(0, 1fr)',
                  gap: 1,
                  position: 'relative',
                  pb: index === steps.length - 1 ? 0 : 1.25,
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
                  {index < steps.length - 1 && (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 30,
                        bottom: -10,
                        width: 2,
                        borderRadius: 1,
                        bgcolor: isDone ? 'success.main' : 'rgba(148, 163, 184, 0.35)',
                      }}
                    />
                  )}
                  <Box
                    sx={(theme) => ({
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 1,
                      color,
                      bgcolor: isDone || isWarning || isActive
                        ? alpha(theme.palette[isWarning ? 'error' : isDone ? 'success' : 'primary'].main, 0.1)
                        : '#ffffff',
                      border: '2px solid',
                      borderColor: color,
                    })}
                  >
                    {isDone ? <CheckCircleOutline sx={{ fontSize: 18 }} /> : <RadioButtonUnchecked sx={{ fontSize: 16 }} />}
                  </Box>
                </Box>

                <ButtonBase
                  onClick={() => onNavigate(step.section)}
                  sx={(theme) => ({
                    width: '100%',
                    justifyContent: 'stretch',
                    textAlign: 'left',
                    borderRadius: 1,
                    p: 1,
                    mt: -0.25,
                    bgcolor: selected ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
                    border: '1px solid',
                    borderColor: selected ? alpha(theme.palette.primary.main, 0.28) : 'transparent',
                    '&:hover': {
                      bgcolor: selected ? alpha(theme.palette.primary.main, 0.1) : 'rgba(15, 23, 42, 0.04)',
                    },
                  })}
                >
                  <Box sx={{ minWidth: 0, width: '100%' }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                      <Typography variant="caption" color="text.secondary" fontWeight={800}>
                        步骤 {index + 1}
                      </Typography>
                      <Typography variant="caption" sx={{ color, fontWeight: 800 }}>
                        {meta.label}
                      </Typography>
                    </Stack>
                    <Typography variant="body2" fontWeight={850} sx={{ mt: 0.25 }}>
                      {step.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.45 }}>
                      {step.description}
                    </Typography>
                  </Box>
                </ButtonBase>
              </Box>
            );
          })}
        </Box>

        <Divider />
        <Box sx={{ p: 1.25, borderRadius: 1, bgcolor: '#f8fafc', border: '1px solid rgba(15, 23, 42, 0.06)' }}>
          <Typography variant="caption" color="text.secondary" fontWeight={800}>下一步</Typography>
          <Typography variant="body2" fontWeight={850}>{nextStep.title}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {nextStep.nextHint}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}
