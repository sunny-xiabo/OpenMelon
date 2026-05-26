import {
  Alert,
  Box,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import {
  Metric,
  TASK_LABELS,
} from './governanceModel';

export function DataAssetPanel({ taskCenter, knowledgeItems, templates }) {
  const failedWrites = (taskCenter?.type_counts || []).find((item) => item.task_type === 'knowledge_write_failure')?.pending_count || 0;
  const activeKnowledge = knowledgeItems.filter((item) => (item.status || 'active') === 'active').length;
  const pausedKnowledge = knowledgeItems.filter((item) => ['invalid', 'revoked'].includes(item.status)).length;
  const availableTemplates = templates.filter((template) => !template.deprecated).length;

  return (
    <Stack spacing={3.5}>
      {/* 5-Column Governance Telemetry Cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 2 }}>
        <Metric label="有效沉淀知识" value={activeKnowledge} tone="success" />
        <Metric label="暂停/停用知识" value={pausedKnowledge} tone={pausedKnowledge ? 'warning' : 'info'} compact />
        <Metric label="高可用共享模板" value={availableTemplates} tone="success" />
        <Metric label="数据写入失败" value={failedWrites} tone={failedWrites ? 'error' : 'success'} />
        <Metric label="待决策处理总量" value={taskCenter?.pending_task_count || 0} tone="warning" />
      </Box>

      {/* Task Type Breakdown Cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 2 }}>
        {(taskCenter?.type_counts || []).map((item) => {
          const isFailedType = item.task_type === 'knowledge_write_failure' && item.pending_count > 0;
          return (
            <Box 
              key={item.task_type} 
              sx={{ 
                p: 2, 
                border: '1px solid', 
                borderColor: isFailedType ? 'rgba(239, 68, 68, 0.15)' : 'rgba(0,0,0,0.04)', 
                borderRadius: 3.5, 
                bgcolor: isFailedType ? 'rgba(239, 68, 68, 0.02)' : 'rgba(255,255,255,0.45)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)',
                backdropFilter: 'blur(6px)',
                transition: 'all 0.2s',
                '&:hover': {
                  transform: 'translateY(-1px)',
                  borderColor: isFailedType ? '#ef4444' : 'rgba(0,0,0,0.1)'
                }
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block', letterSpacing: '0.02em' }}>
                {TASK_LABELS[item.task_type] || item.task_type}
              </Typography>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-end" sx={{ mt: 1 }}>
                <Typography variant="h5" sx={{ fontWeight: 900, color: isFailedType ? '#ef4444' : 'text.primary', lineHeight: 1.1 }}>
                  {item.pending_count || 0}
                </Typography>
                <Chip 
                  size="small" 
                  label={`共 ${item.count || 0}`} 
                  sx={{ 
                    height: 18, 
                    fontSize: '10px', 
                    fontWeight: 700, 
                    bgcolor: 'rgba(0,0,0,0.03)', 
                    color: 'text.secondary',
                    border: 'none'
                  }} 
                />
              </Stack>
            </Box>
          );
        })}
      </Box>

      {/* Health Status Illustration - Pulse Glow Effect */}
      {!failedWrites && (
        <Box 
          sx={{ 
            py: 4, 
            borderRadius: 4.5, 
            border: '1px dashed rgba(16, 185, 129, 0.3)',
            background: 'radial-gradient(circle, rgba(16, 185, 129, 0.04) 0%, transparent 70%)',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(16, 185, 129, 0.02)',
          }}
        >
          {/* Animated Sci-Fi Glow Pulse Circle */}
          <Box 
            className="purify-pulse"
            sx={{ 
              position: 'absolute', 
              top: '50%', 
              left: '50%', 
              transform: 'translate(-50%, -50%)', 
              width: 250, 
              height: 250, 
              borderRadius: '50%', 
              background: 'radial-gradient(circle, rgba(16, 185, 129, 0.06) 0%, transparent 60%)',
              animation: 'pulseGlow 4s infinite ease-in-out',
              pointerEvents: 'none',
              zIndex: 0,
            }} 
          />
          <style>
            {`
              @keyframes pulseGlow {
                0% { transform: translate(-50%, -50%) scale(0.9); opacity: 0.4; }
                50% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.8; }
                100% { transform: translate(-50%, -50%) scale(0.9); opacity: 0.4; }
              }
            `}
          </style>
          
          <Box sx={{ position: 'relative', zIndex: 1, width: '100%' }}>
            <DataAssetHealthyIllustration />
          </Box>
        </Box>
      )}
      
      {failedWrites > 0 && (
        <Alert 
          severity="warning"
          sx={{
            borderRadius: 3.5,
            bgcolor: 'rgba(245, 158, 11, 0.03)',
            border: '1px solid rgba(245, 158, 11, 0.1)',
            fontSize: '12px',
            fontWeight: 600,
            color: '#f59e0b',
            '& .MuiAlert-icon': {
              color: '#f59e0b',
              opacity: 0.9
            }
          }}
        >
          监测到知识库同步在底层写入时发生异常阻断。建议尽快前往「待办事件队列」定位处理向量库或图谱写入失败的记录，以保证 AI Agent 的有效决策召回不受阻碍。
        </Alert>
      )}
    </Stack>
  );
}

function DataAssetHealthyIllustration() {
  return (
    <Stack alignItems="center" spacing={2.5} sx={{ py: 6 }}>
      <Box 
        component="svg" 
        width={180} 
        height={180} 
        viewBox="0 0 200 200" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="assetGrad" x1="40" y1="40" x2="160" y2="160" gradientUnits="userSpaceOnUse">
            <stop stopColor="#10b981" />
            <stop offset="1" stopColor="#059669" />
          </linearGradient>
          <filter id="assetGlow" x="40" y="40" width="120" height="120" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="8" result="blur" />
          </filter>
        </defs>

        {/* Database Fortress Base Platform */}
        <path d="M40 132L100 100L160 132L100 164Z" fill="rgba(16, 185, 129, 0.03)" stroke="rgba(16, 185, 129, 0.15)" strokeWidth="1.5" />
        <path d="M40 132L40 140L100 172L160 152L160 132" fill="rgba(16, 185, 129, 0.05)" stroke="rgba(16, 185, 129, 0.15)" strokeWidth="1.5" />

        {/* Main Database Cylinder Tower (Robust Storage) representing knowledge assets */}
        {/* Layer 3 (Bottom) */}
        <g style={{ transform: 'translate(80px, 92px)' }}>
          <ellipse cx="20" cy="30" rx="20" ry="8" fill="rgba(16, 185, 129, 0.18)" stroke="#10b981" strokeWidth="1.5" />
          <path d="M0 15V30 C0 35, 40 35, 40 30V15" fill="rgba(16, 185, 129, 0.22)" stroke="#10b981" strokeWidth="1.5" />
          <ellipse cx="20" cy="15" rx="20" ry="8" fill="rgba(255, 255, 255, 0.9)" stroke="#10b981" strokeWidth="1.5" />
        </g>
        {/* Layer 2 (Middle) */}
        <g style={{ transform: 'translate(80px, 76px)' }}>
          <ellipse cx="20" cy="15" rx="20" ry="8" fill="rgba(16, 185, 129, 0.22)" stroke="#10b981" strokeWidth="1.5" />
          <path d="M0 0V15 C0 20, 40 20, 40 15V0" fill="rgba(16, 185, 129, 0.28)" stroke="#10b981" strokeWidth="1.5" />
          <ellipse cx="20" cy="0" rx="20" ry="8" fill="rgba(255, 255, 255, 0.9)" stroke="#10b981" strokeWidth="1.5" />
        </g>
        {/* Layer 1 (Top / Glowing Core) */}
        <g style={{ transform: 'translate(80px, 60px)' }}>
          <ellipse cx="20" cy="0" rx="20" ry="8" fill="rgba(16, 185, 129, 0.35)" stroke="#10b981" strokeWidth="1.5" />
          <path d="M0 -15V0 C0 5, 40 5, 40 0V-15" fill="url(#assetGrad)" stroke="#10b981" strokeWidth="1.5" />
          <ellipse cx="20" cy="-15" rx="20" ry="8" fill="#fff" stroke="#10b981" strokeWidth="1.5" />
        </g>

        {/* Database glowing light indicators */}
        <circle cx="92" cy="52" r="2.2" fill="#fff" />
        <circle cx="108" cy="52" r="2.2" fill="#fff" />
        <circle cx="92" cy="84" r="2.2" fill="#fff" />
        <circle cx="108" cy="84" r="2.2" fill="#fff" />

        {/* Orbital Shield Ring rotating around the database representing Postgres sync safety */}
        <ellipse cx="100" cy="86" rx="58" ry="23" stroke="#10b981" strokeWidth="2.2" strokeDasharray="8 6" opacity="0.7" />
        
        {/* Shield glowing node dots */}
        <circle cx="48" cy="74" r="5.5" fill="#10b981" stroke="#fff" strokeWidth="1.6" />
        <circle cx="152" cy="98" r="5.5" fill="#10b981" stroke="#fff" strokeWidth="1.6" />
      </Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 900, color: 'text.primary', textAlign: 'center' }}>
        数据资产状态：健康稳健
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary', maxWidth: 440, textAlign: 'center', lineHeight: 1.6, px: 2, display: 'block', fontWeight: 600 }}>
        当前 PostgreSQL 与向量库实体同步校验良好，系统全域自动化决策执行链路通畅，未监测到任何冲突阻塞。
      </Typography>
    </Stack>
  );
}
