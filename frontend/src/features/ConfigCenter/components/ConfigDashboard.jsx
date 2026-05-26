import { Box, Chip, Stack, Typography, alpha, Divider, Paper, Grid } from '@mui/material';
import RestartAltOutlined from '@mui/icons-material/RestartAltOutlined';
import CheckCircleOutlineOutlined from '@mui/icons-material/CheckCircleOutlineOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';

export default function ConfigDashboard({ status, changedCount }) {
  const envActive = status.env_exists !== false;

  return (
    <Box sx={{ mb: 4.5, position: 'relative' }}>
      {/* Dynamic styles for neon LED breathing and dashboard effects */}
      <style>
        {`
          @keyframes status-led-pulse {
            0% { box-shadow: 0 0 2px var(--led-glow), 0 0 4px var(--led-glow); opacity: 0.8; }
            50% { box-shadow: 0 0 8px var(--led-glow), 0 0 16px var(--led-glow); opacity: 1; }
            100% { box-shadow: 0 0 2px var(--led-glow), 0 0 4px var(--led-glow); opacity: 0.8; }
          }
          .status-led {
            width: 10px;
            height: 10px;
            borderRadius: 50%;
            display: inline-block;
            animation: status-led-pulse 2s infinite ease-in-out;
            transition: all 0.3s ease;
          }
          .dashboard-metric-box {
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          }
          .dashboard-metric-box:hover {
            transform: translateY(-2px);
            background: rgba(255, 255, 255, 0.8) !important;
            border-color: rgba(26, 115, 232, 0.2) !important;
          }
        `}
      </style>

      {/* Main glassmorphic container */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: 4,
          border: '1px solid rgba(255, 255, 255, 0.45)',
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.65) 0%, rgba(255, 255, 255, 0.35) 100%)',
          backdropFilter: 'blur(24px)',
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.03), inset 0 1px 0 rgba(255,255,255,0.7)',
        }}
      >
        <Grid container spacing={3} alignItems="center">
          {/* Header Title Section */}
          <Grid item xs={12} md={4.5}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 2.5,
                  bgcolor: 'rgba(26, 115, 232, 0.08)',
                  color: 'primary.main',
                  display: 'grid',
                  placeItems: 'center',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)',
                }}
              >
                <SettingsOutlined sx={{ fontSize: 22 }} />
              </Box>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 900, letterSpacing: '-0.02em', color: 'text.primary' }}>
                  运行配置中心
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, display: 'block', mt: 0.25 }}>
                  热管理当前系统的核心参数，全部更改即时备份。
                </Typography>
              </Box>
            </Stack>
          </Grid>

          {/* Telemetry Metrics Grid */}
          <Grid item xs={12} md={7.5}>
            <Grid container spacing={2}>
              {/* Metric 1: Environment Active State */}
              <Grid item xs={4}>
                <Box
                  className="dashboard-metric-box"
                  sx={{
                    p: 1.5,
                    borderRadius: 3,
                    border: '1px solid rgba(0,0,0,0.03)',
                    bgcolor: 'rgba(255, 255, 255, 0.45)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    minHeight: 68,
                  }}
                >
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                    运行环境状态
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Box
                      className="status-led"
                      style={{
                        backgroundColor: envActive ? '#10b981' : '#f59e0b',
                        '--led-glow': envActive ? 'rgba(16, 185, 129, 0.5)' : 'rgba(245, 158, 11, 0.5)',
                      }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 800, color: envActive ? 'success.main' : 'warning.main', fontSize: '13px' }}>
                      {envActive ? 'Active 已激活' : 'Missing 缺失'}
                    </Typography>
                  </Stack>
                </Box>
              </Grid>

              {/* Metric 2: Backup Snapshots */}
              <Grid item xs={4}>
                <Box
                  className="dashboard-metric-box"
                  sx={{
                    p: 1.5,
                    borderRadius: 3,
                    border: '1px solid rgba(0,0,0,0.03)',
                    bgcolor: 'rgba(255, 255, 255, 0.45)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    minHeight: 68,
                  }}
                >
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                    自动备份快照
                  </Typography>
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <HistoryOutlined sx={{ fontSize: 16, color: 'text.secondary' }} />
                    <Typography variant="body2" sx={{ fontWeight: 800, color: 'text.primary', fontSize: '13px' }}>
                      {status.backup_count || 0} 个历史
                    </Typography>
                  </Stack>
                </Box>
              </Grid>

              {/* Metric 3: Pending Modifications */}
              <Grid item xs={4}>
                <Box
                  className="dashboard-metric-box"
                  sx={{
                    p: 1.5,
                    borderRadius: 3,
                    border: changedCount > 0 ? '1px solid rgba(26, 115, 232, 0.2)' : '1px solid rgba(0,0,0,0.03)',
                    bgcolor: changedCount > 0 ? 'rgba(26, 115, 232, 0.04)' : 'rgba(255, 255, 255, 0.45)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    minHeight: 68,
                  }}
                >
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                    待应用更改
                  </Typography>
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <WarningAmberOutlined sx={{ fontSize: 16, color: changedCount > 0 ? 'primary.main' : 'text.disabled' }} />
                    <Typography variant="body2" sx={{ fontWeight: 800, color: changedCount > 0 ? 'primary.main' : 'text.secondary', fontSize: '13px' }}>
                      {changedCount} 项修改
                    </Typography>
                  </Stack>
                </Box>
              </Grid>
            </Grid>
          </Grid>
        </Grid>

        <Divider sx={{ my: 2, borderColor: 'rgba(0,0,0,0.04)' }} />

        {/* Dynamic Status Badges row */}
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip
            icon={<CheckCircleOutlineOutlined sx={{ fontSize: '14px !important' }} />}
            label=".env 映射就绪"
            color="success"
            variant="soft"
            size="small"
            sx={{ borderRadius: 1.5, px: 0.5, fontWeight: 700, fontSize: '11px' }}
          />
          <Chip
            icon={<HistoryOutlined sx={{ fontSize: '14px !important' }} />}
            label={`模板参考: ${status.example_exists ? '.env.example' : '未检测到模板'}`}
            variant="outlined"
            size="small"
            sx={{ borderRadius: 1.5, px: 0.5, borderColor: 'rgba(0,0,0,0.08)', color: 'text.secondary', fontSize: '11px', fontWeight: 600 }}
          />
          <Chip
            icon={<RestartAltOutlined sx={{ fontSize: '14px !important' }} />}
            label="部分修改需手动重启生效"
            color="warning"
            variant="soft"
            size="small"
            sx={{ borderRadius: 1.5, px: 0.5, fontWeight: 700, fontSize: '11px' }}
          />
          {changedCount > 0 && (
            <Chip
              label="待应用变更项"
              color="primary"
              size="small"
              className="pulse-animation"
              sx={{ borderRadius: 1.5, px: 0.5, fontWeight: 800, fontSize: '11px', boxShadow: '0 2px 8px rgba(37,99,235,0.25)' }}
            />
          )}
        </Stack>
      </Paper>
    </Box>
  );
}
