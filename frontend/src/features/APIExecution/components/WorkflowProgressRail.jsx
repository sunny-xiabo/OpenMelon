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
        display: { xs: 'none', lg: 'block' },
        position: { md: 'sticky' },
        top: { md: 24 },
        p: 2.2,
        borderRadius: 4.5,
        border: '1px solid rgba(255, 255, 255, 0.45)',
        bgcolor: 'rgba(255, 255, 255, 0.45)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 12px 40px rgba(15, 23, 42, 0.03), inset 0 1px 0 rgba(255,255,255,0.7)',
        alignSelf: 'start',
      }}
    >
      <style>{`
        @keyframes railNeonPulse {
          0% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.4); }
          50% { box-shadow: 0 0 12px 4px rgba(79, 70, 229, 0.25); }
          100% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0); }
        }
      `}</style>
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Box>
            <Typography variant="subtitle2" fontWeight={900} sx={{ letterSpacing: '-0.01em', color: 'text.primary' }}>流程进度</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Agent 测试主链路</Typography>
          </Box>
          <Chip 
            size="small" 
            variant="outlined" 
            label={`${completedCount}/${steps.length}`} 
            sx={{ 
              fontSize: '11px', 
              fontWeight: 800, 
              color: '#4f46e5', 
              borderColor: 'rgba(79, 70, 229, 0.2)',
              bgcolor: 'rgba(79, 70, 229, 0.02)',
              borderRadius: '6px'
            }}
          />
        </Stack>
        <Box sx={{ position: 'relative' }}>
          <LinearProgress
            variant="determinate"
            value={percent}
            sx={{ 
              height: 6, 
              borderRadius: 3, 
              bgcolor: 'rgba(0, 0, 0, 0.04)',
              '& .MuiLinearProgress-bar': {
                background: 'linear-gradient(90deg, #4f46e5 0%, #10b981 100%)',
                borderRadius: 3
              }
            }}
          />
        </Box>

        <Box sx={{ pt: 1 }}>
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
                  gap: 1.5,
                  position: 'relative',
                  pb: index === steps.length - 1 ? 0 : 1.75,
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
                  {index < steps.length - 1 && (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 30,
                        bottom: -14,
                        width: 2,
                        borderRadius: 1,
                        background: isDone 
                          ? 'linear-gradient(180deg, #10b981 0%, rgba(16, 185, 129, 0.25) 100%)' 
                          : 'rgba(148, 163, 184, 0.2)',
                        transition: 'background 0.3s ease',
                      }}
                    />
                  )}
                  <Box
                    sx={(theme) => ({
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 1,
                      color: isDone ? '#10b981' : isWarning ? '#ef4444' : isActive ? '#4f46e5' : '#94a3b8',
                      bgcolor: isDone || isWarning || isActive
                        ? alpha(theme.palette[isWarning ? 'error' : isDone ? 'success' : 'primary'].main, 0.08)
                        : '#ffffff',
                      border: '2px solid',
                      borderColor: isDone ? '#10b981' : isWarning ? '#ef4444' : isActive ? '#4f46e5' : 'rgba(148, 163, 184, 0.3)',
                      boxShadow: isActive ? '0 0 10px rgba(79, 70, 229, 0.2)' : 'none',
                      animation: isActive ? 'railNeonPulse 2s infinite ease-in-out' : 'none',
                      transition: 'all 0.3s ease'
                    })}
                  >
                    {isDone ? <CheckCircleOutline sx={{ fontSize: 16 }} /> : <RadioButtonUnchecked sx={{ fontSize: 14 }} />}
                  </Box>
                </Box>

                <ButtonBase
                  onClick={() => onNavigate(step.section)}
                  sx={(theme) => ({
                    width: '100%',
                    justifyContent: 'stretch',
                    textAlign: 'left',
                    borderRadius: 3.5,
                    p: 1.25,
                    mt: -0.5,
                    bgcolor: selected ? 'rgba(255, 255, 255, 0.7)' : 'transparent',
                    border: '1px solid',
                    borderColor: selected ? 'rgba(79, 70, 229, 0.15)' : 'transparent',
                    boxShadow: selected ? '0 4px 16px rgba(79, 70, 229, 0.02)' : 'none',
                    '&:hover': {
                      bgcolor: selected ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.02)',
                    },
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                  })}
                >
                  <Box sx={{ minWidth: 0, width: '100%' }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                      <Typography variant="caption" color="text.secondary" fontWeight={800} sx={{ fontSize: '10px' }}>
                        步骤 {index + 1}
                      </Typography>
                      <Typography variant="caption" sx={{ color: isDone ? '#10b981' : isWarning ? '#ef4444' : isActive ? '#4f46e5' : 'text.secondary', fontWeight: 800, fontSize: '10px' }}>
                        {meta.label}
                      </Typography>
                    </Stack>
                    <Typography variant="body2" fontWeight={850} sx={{ mt: 0.25, fontSize: '12.5px', color: 'text.primary' }}>
                      {step.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4, mt: 0.25, fontWeight: 500 }}>
                      {step.description}
                    </Typography>
                  </Box>
                </ButtonBase>
              </Box>
            );
          })}
        </Box>

        <Divider sx={{ borderColor: 'rgba(0,0,0,0.04)' }} />
        <Box 
          sx={{ 
            p: 1.5, 
            borderRadius: 3.5, 
            bgcolor: 'rgba(79, 70, 229, 0.02)', 
            border: '1px solid rgba(79, 70, 229, 0.06)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)'
          }}
        >
          <Typography variant="caption" color="text.secondary" fontWeight={800} sx={{ fontSize: '10px', display: 'block', mb: 0.25 }}>下一步建议</Typography>
          <Typography variant="body2" fontWeight={850} sx={{ color: 'text.primary', fontSize: '12px' }}>{nextStep.title}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, lineHeight: 1.45, fontWeight: 500 }}>
            {nextStep.nextHint}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}
