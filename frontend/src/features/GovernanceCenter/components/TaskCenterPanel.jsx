import {
  Box,
  Button,
  Chip,
  FormControl,
  IconButton,
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
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { 
  ContentCopyOutlined, 
  FactCheckOutlined,
  CheckCircleOutlineOutlined,
  WarningAmberOutlined,
  ErrorOutlineOutlined,
  HelpOutlineOutlined,
} from '@mui/icons-material';
import EmptyState from '../../../components/EmptyState';
import {
  formatRunTime,
} from '../../APIExecution/utils';
import {
  getTaskDisplayLabel,
  getTaskSource,
  Metric,
  TASK_CATEGORY_LABELS,
  TASK_LABELS,
  TASK_STATUS_LABELS,
} from './governanceModel';

const RISK_CONFIG = {
  low: { bg: 'rgba(16, 185, 129, 0.08)', text: '#10b981', border: 'rgba(16, 185, 129, 0.15)', label: '低风险' },
  medium: { bg: 'rgba(245, 158, 11, 0.08)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.15)', label: '中风险' },
  high: { bg: 'rgba(239, 68, 68, 0.08)', text: '#ef4444', border: 'rgba(239, 68, 68, 0.15)', label: '高风险' },
  blocked: { bg: 'rgba(99, 102, 241, 0.08)', text: '#4f46e5', border: 'rgba(99, 102, 241, 0.15)', label: '阻断审批' },
};

const STATUS_CONFIG = {
  pending: { bg: 'rgba(217, 119, 6, 0.08)', text: '#d97706', border: 'rgba(217, 119, 6, 0.15)' },
  running: { bg: 'rgba(2, 132, 199, 0.08)', text: '#0284c7', border: 'rgba(2, 132, 199, 0.15)' },
  failed: { bg: 'rgba(220, 38, 38, 0.08)', text: '#dc2626', border: 'rgba(220, 38, 38, 0.15)' },
  resolved: { bg: 'rgba(22, 163, 74, 0.08)', text: '#16a34a', border: 'rgba(22, 163, 74, 0.15)' },
};

export function TaskCenterPanel({
  taskCenter,
  tasks,
  rawTaskCount,
  taskStatus,
  setTaskStatus,
  taskType,
  setTaskType,
  taskRisk,
  setTaskRisk,
  taskKeyword,
  setTaskKeyword,
  taskTypeOptions,
  approveCandidate,
  resolveTask,
  copyText,
}) {
  const statusCounts = taskCenter?.status_counts || {};
  const buckets = taskCenter?.action_buckets || [];
  const typeOptions = [...new Set([...Object.keys(TASK_LABELS), ...(taskTypeOptions || [])].filter(Boolean))];

  return (
    <Stack spacing={3.5}>
      {/* Search Filters Section - Premium Glassmorphic Card */}
      <Box
        sx={{
          p: 2.2,
          borderRadius: 4,
          border: '1px solid rgba(255, 255, 255, 0.45)',
          bgcolor: 'rgba(255, 255, 255, 0.3)',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 4px 20px rgba(15, 23, 42, 0.015), inset 0 1px 0 rgba(255,255,255,0.7)',
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel id="task-status-label" sx={{ fontSize: '12px', fontWeight: 600 }}>任务状态</InputLabel>
            <Select 
              labelId="task-status-label"
              label="任务状态" 
              value={taskStatus} 
              onChange={(event) => setTaskStatus(event.target.value)}
              sx={{ 
                borderRadius: 2.2,
                fontSize: '12px',
                fontWeight: 600,
                bgcolor: 'white',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,0,0,0.06)' },
              }}
            >
              <MenuItem value="" sx={{ fontSize: '12px', fontWeight: 600 }}>全部状态</MenuItem>
              {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
                <MenuItem key={value} value={value} sx={{ fontSize: '12px' }}>{label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="task-type-label" sx={{ fontSize: '12px', fontWeight: 600 }}>任务类型</InputLabel>
            <Select 
              labelId="task-type-label"
              label="任务类型" 
              value={taskType} 
              onChange={(event) => setTaskType(event.target.value)}
              sx={{ 
                borderRadius: 2.2,
                fontSize: '12px',
                fontWeight: 600,
                bgcolor: 'white',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,0,0,0.06)' },
              }}
            >
              <MenuItem value="" sx={{ fontSize: '12px', fontWeight: 600 }}>全部类型</MenuItem>
              {typeOptions.map((value) => (
                <MenuItem key={value} value={value} sx={{ fontSize: '12px' }}>{TASK_LABELS[value] || value}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="task-risk-label" sx={{ fontSize: '12px', fontWeight: 600 }}>风险级别</InputLabel>
            <Select 
              labelId="task-risk-label"
              label="风险级别" 
              value={taskRisk} 
              onChange={(event) => setTaskRisk(event.target.value)}
              sx={{ 
                borderRadius: 2.2,
                fontSize: '12px',
                fontWeight: 600,
                bgcolor: 'white',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,0,0,0.06)' },
              }}
            >
              <MenuItem value="" sx={{ fontSize: '12px', fontWeight: 600 }}>全部风险</MenuItem>
              <MenuItem value="low" sx={{ fontSize: '12px' }}>低风险</MenuItem>
              <MenuItem value="medium" sx={{ fontSize: '12px' }}>中风险</MenuItem>
              <MenuItem value="high" sx={{ fontSize: '12px' }}>高风险</MenuItem>
              <MenuItem value="blocked" sx={{ fontSize: '12px' }}>阻断审批</MenuItem>
            </Select>
          </FormControl>

          <TextField
            size="small"
            label="输入关键词过滤"
            value={taskKeyword}
            onChange={(event) => setTaskKeyword(event.target.value)}
            placeholder="ID / 任务说明 / 异常原因..."
            sx={{ 
              minWidth: 220, 
              flex: 1,
              '& .MuiOutlinedInput-root': {
                borderRadius: 2.2,
                fontSize: '12px',
                fontWeight: 600,
                bgcolor: 'white',
                '& fieldset': { borderColor: 'rgba(0,0,0,0.06)' },
              }
            }}
          />

          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, whiteSpace: 'nowrap' }}>
            已过滤显示 {tasks.length} / {rawTaskCount}
          </Typography>
        </Stack>
      </Box>

      {/* Sub-Metrics Section */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 2 }}>
        <Metric label="待处理队列" value={taskCenter?.pending_task_count || statusCounts.pending || 0} tone="warning" />
        <Metric label="执行失败诊断" value={taskCenter?.failed_task_count || statusCounts.failed || 0} tone="error" />
        <Metric label="累计已解冲突" value={taskCenter?.resolved_task_count || statusCounts.resolved || 0} tone="success" />
        <Metric label="历史任务总计" value={taskCenter?.total_task_count || 0} tone="info" />
      </Box>

      {/* Process Buckets Cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 2 }}>
        {buckets.map((bucket) => {
          const isWarning = bucket.pending_count > 0;
          return (
            <Box 
              key={bucket.bucket} 
              sx={{ 
                p: 2, 
                border: '1px solid', 
                borderColor: isWarning ? 'rgba(217, 119, 6, 0.15)' : 'rgba(0,0,0,0.04)', 
                borderRadius: 3.5, 
                bgcolor: isWarning ? 'rgba(217, 119, 6, 0.02)' : 'rgba(255,255,255,0.45)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)',
                backdropFilter: 'blur(6px)',
                transition: 'all 0.2s',
                '&:hover': {
                  transform: 'translateY(-1px)',
                  borderColor: isWarning ? '#d97706' : 'rgba(0,0,0,0.1)'
                }
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block', letterSpacing: '0.02em' }}>
                {bucket.label}
              </Typography>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-end" sx={{ mt: 1 }}>
                <Typography variant="h5" sx={{ fontWeight: 900, color: isWarning ? '#d97706' : 'text.primary', lineHeight: 1.1 }}>
                  {bucket.pending_count}
                </Typography>
                <Chip 
                  size="small" 
                  label={`共 ${bucket.count}`} 
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

      {/* Main Task List Table */}
      <TaskTable 
        tasks={tasks} 
        approveCandidate={approveCandidate} 
        resolveTask={resolveTask} 
        copyText={copyText} 
      />
    </Stack>
  );
}

function TaskEmptyIllustration() {
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
          <linearGradient id="taskGrad" x1="40" y1="40" x2="160" y2="160" gradientUnits="userSpaceOnUse">
            <stop stopColor="#6366f1" />
            <stop offset="1" stopColor="#4f46e5" />
          </linearGradient>
          <filter id="taskGlow" x="50" y="50" width="100" height="100" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="10" result="blur" />
          </filter>
        </defs>
        
        {/* Floating Paper Stack (Isometric Drafts) representing tasks queue */}
        <path d="M45 135L100 112L155 135L100 158Z" fill="rgba(99, 102, 241, 0.04)" stroke="rgba(99, 102, 241, 0.12)" strokeWidth="1.5" />
        <path d="M45 125L100 102L155 125L100 148Z" fill="rgba(99, 102, 241, 0.07)" stroke="rgba(99, 102, 241, 0.2)" strokeWidth="1.5" strokeDasharray="3 3" />
        <path d="M45 115L100 92L155 115L100 138Z" fill="rgba(255, 255, 255, 0.85)" stroke="rgba(99, 102, 241, 0.35)" strokeWidth="1.8" />
        
        {/* Lines on the isometric draft page */}
        <path d="M75 110L100 100L125 110" stroke="rgba(99, 102, 241, 0.25)" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M80 118L100 110L120 118" stroke="rgba(99, 102, 241, 0.25)" strokeWidth="1.8" strokeLinecap="round" />

        {/* Orbit Ring representing circular checklist queue */}
        <ellipse cx="100" cy="90" rx="65" ry="26" stroke="rgba(99, 102, 241, 0.2)" strokeWidth="1.5" strokeDasharray="6 4" />
        
        {/* Glowing floating check circle */}
        <circle cx="100" cy="72" r="30" fill="#6366f1" opacity="0.12" filter="url(#taskGlow)" />
        <circle cx="100" cy="72" r="22" fill="url(#taskGrad)" stroke="#fff" strokeWidth="2.5" />
        
        {/* Floating sparkly stars indicating complete success */}
        <path d="M155 58L158 63L163 64L158 65L155 70L152 65L147 64L152 63Z" fill="#6366f1" opacity="0.85" />
        <path d="M42 72L44 75L47 76L44 77L42 80L40 77L37 76L40 75Z" fill="#4f46e5" opacity="0.6" />

        {/* Check icon */}
        <path d="M92 72L97 77L109 66" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 900, color: 'text.primary', textAlign: 'center' }}>
        待办队列已全部处理完成
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary', maxWidth: 440, textAlign: 'center', lineHeight: 1.6, px: 2, display: 'block', fontWeight: 600 }}>
        当前待办队列中无挂起事务。系统所有待确认知识候选、执行故障诊断及策略审批均已完成决策，治理链路保持畅通运行。
      </Typography>
    </Stack>
  );
}

function TaskTable({ tasks, approveCandidate, resolveTask, copyText }) {
  if (!tasks?.length) {
    return (
      <Box 
        sx={{ 
          py: 3, 
          borderRadius: 4.5, 
          border: '1px dashed rgba(99, 102, 241, 0.25)',
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.03) 0%, transparent 70%)',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(99, 102, 241, 0.01)',
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
            background: 'radial-gradient(circle, rgba(99, 102, 241, 0.05) 0%, transparent 60%)',
            animation: 'taskPulseGlow 4s infinite ease-in-out',
            pointerEvents: 'none',
            zIndex: 0,
          }} 
        />
        <style>
          {`
            @keyframes taskPulseGlow {
              0% { transform: translate(-50%, -50%) scale(0.9); opacity: 0.4; }
              50% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.8; }
              100% { transform: translate(-50%, -50%) scale(0.9); opacity: 0.4; }
            }
          `}
        </style>
        
        <Box sx={{ position: 'relative', zIndex: 1, width: '100%' }}>
          <TaskEmptyIllustration />
        </Box>
      </Box>
    );
  }

  return (
    <TableContainer 
      sx={{ 
        border: '1px solid rgba(0,0,0,0.05)', 
        borderRadius: 4, 
        overflow: 'hidden', 
        bgcolor: 'rgba(255, 255, 255, 0.25)' 
      }}
    >
      <Table size="small">
        <TableHead>
          <TableRow 
            sx={{
              '& th': {
                bgcolor: 'rgba(241, 245, 249, 0.6)',
                color: 'text.secondary',
                fontWeight: 800,
                fontSize: '11px',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                borderBottom: '1px solid rgba(0,0,0,0.06)',
                py: 1.75,
              }
            }}
          >
            <TableCell sx={{ pl: 2.5 }}>任务主体说明</TableCell>
            <TableCell>来源归宿</TableCell>
            <TableCell>风险评级</TableCell>
            <TableCell>状态</TableCell>
            <TableCell>更新时间</TableCell>
            <TableCell align="right" sx={{ pr: 2.5 }}>治理操作</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {tasks.map((task) => {
            const taskLabel = getTaskDisplayLabel(task);
            const categoryLabel = TASK_CATEGORY_LABELS[task.task_type] || task.task_type || '其他任务';
            
            const statusStyle = STATUS_CONFIG[task.status] || { bg: 'rgba(0,0,0,0.05)', text: 'text.secondary', border: 'rgba(0,0,0,0.1)' };
            const statusLabel = TASK_STATUS_LABELS[task.status] || task.status || '未知';
            
            const riskStyle = RISK_CONFIG[task.risk_level] || { bg: 'rgba(0,0,0,0.03)', text: '#6b7280', border: 'rgba(0,0,0,0.08)', label: task.risk_level || '未知' };
            const source = getTaskSource(task);

            return (
              <TableRow 
                key={task.task_id} 
                hover
                sx={{
                  transition: 'background-color 0.2s',
                  '&:hover': {
                    bgcolor: 'rgba(26, 115, 232, 0.015) !important'
                  },
                  '& td': {
                    borderBottom: '1px solid rgba(0,0,0,0.03)',
                    py: 1.5,
                  }
                }}
              >
                {/* Task description */}
                <TableCell sx={{ pl: 2.5 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 800, color: 'text.primary', fontSize: '13px' }}>
                      {taskLabel}
                    </Typography>
                    <Chip 
                      size="small" 
                      label={categoryLabel} 
                      sx={{
                        fontSize: '10px',
                        fontWeight: 700,
                        height: 18,
                        bgcolor: 'rgba(99, 102, 241, 0.08)',
                        color: '#4f46e5',
                        border: '1px solid rgba(99, 102, 241, 0.15)',
                        borderRadius: '6px'
                      }}
                    />
                  </Stack>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500, display: 'block', maxWidth: 450, whiteSpace: 'normal', wordBreak: 'break-all' }}>
                    {task.reason || task.task_id}
                  </Typography>
                </TableCell>

                {/* Source column */}
                <TableCell>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Chip 
                      size="small" 
                      label={source.label} 
                      sx={{
                        fontSize: '10px',
                        fontWeight: 700,
                        height: 18,
                        bgcolor: 'rgba(79, 70, 229, 0.06)',
                        color: '#4f46e5',
                        border: '1px solid rgba(79, 70, 229, 0.12)',
                        borderRadius: '6px'
                      }}
                    />
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        fontWeight: 700,
                        fontSize: '12px',
                        maxWidth: 200, 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        color: 'text.primary',
                      }}
                    >
                      {source.value}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '11px' }}>
                    {source.helper || `ID: ${task.task_id.substring(0, 8)}...`}
                  </Typography>
                </TableCell>

                {/* Risk Level */}
                <TableCell>
                  <Chip 
                    size="small" 
                    label={riskStyle.label} 
                    sx={{
                      fontSize: '11px',
                      fontWeight: 800,
                      bgcolor: riskStyle.bg,
                      color: riskStyle.text,
                      border: `1px solid ${riskStyle.border}`,
                      borderRadius: '6px'
                    }}
                  />
                </TableCell>

                {/* Status */}
                <TableCell>
                  <Chip 
                    size="small" 
                    label={statusLabel} 
                    sx={{
                      fontSize: '11px',
                      fontWeight: 800,
                      bgcolor: statusStyle.bg,
                      color: statusStyle.text,
                      border: `1px solid ${statusStyle.border}`,
                      borderRadius: '6px'
                    }}
                  />
                </TableCell>

                {/* Update Time */}
                <TableCell sx={{ fontSize: '12px', color: 'text.secondary', fontWeight: 500 }}>
                  {formatRunTime(task.updated_at) || '未记录'}
                </TableCell>

                {/* Actions */}
                <TableCell align="right" sx={{ pr: 2.5 }}>
                  <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ flexWrap: 'wrap', gap: 1 }}>
                    {task.task_type === 'knowledge_ingest_candidate' && task.status === 'pending' && (
                      <Button 
                        size="small" 
                        variant="outlined" 
                        startIcon={<CheckCircleOutlineOutlined sx={{ fontSize: 13 }} />}
                        onClick={() => approveCandidate(task.task_id)}
                        sx={{
                          borderRadius: 2.2,
                          textTransform: 'none',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#10b981',
                          borderColor: 'rgba(16, 185, 129, 0.3)',
                          bgcolor: 'rgba(16, 185, 129, 0.02)',
                          '&:hover': {
                            borderColor: '#10b981',
                            bgcolor: 'rgba(16, 185, 129, 0.08)',
                            transform: 'translateY(-1px)',
                          },
                          transition: 'all 0.2s',
                        }}
                      >
                        确认沉淀
                      </Button>
                    )}
                    {task.status === 'pending' && (
                      <Button 
                        size="small" 
                        variant="outlined" 
                        startIcon={<FactCheckOutlined sx={{ fontSize: 13 }} />}
                        onClick={() => resolveTask(task.task_id)}
                        sx={{
                          borderRadius: 2.2,
                          textTransform: 'none',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#4f46e5',
                          borderColor: 'rgba(79, 70, 229, 0.3)',
                          bgcolor: 'rgba(79, 70, 229, 0.02)',
                          '&:hover': {
                            borderColor: '#4f46e5',
                            bgcolor: 'rgba(79, 70, 229, 0.08)',
                            transform: 'translateY(-1px)',
                          },
                          transition: 'all 0.2s',
                        }}
                      >
                        标记完成
                      </Button>
                    )}
                    
                    <Tooltip title="复制任务 ID">
                      <IconButton 
                        size="small" 
                        onClick={() => copyText(task.task_id, '任务 ID')}
                        sx={{
                          width: 26,
                          height: 26,
                          border: '1px solid rgba(0,0,0,0.06)',
                          borderRadius: 1.5,
                          '&:hover': { bgcolor: 'rgba(0,0,0,0.03)' }
                        }}
                      >
                        <ContentCopyOutlined sx={{ fontSize: 13 }} />
                      </IconButton>
                    </Tooltip>
                    
                    {task.run_id && (
                      <Tooltip title="复制执行记录 ID">
                        <IconButton 
                          size="small" 
                          onClick={() => copyText(task.run_id, '执行 ID')}
                          sx={{
                            width: 26,
                            height: 26,
                            border: '1px solid rgba(0,0,0,0.06)',
                            borderRadius: 1.5,
                            '&:hover': { bgcolor: 'rgba(0,0,0,0.03)' }
                          }}
                        >
                          <FactCheckOutlined sx={{ fontSize: 13 }} />
                        </IconButton>
                      </Tooltip>
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
