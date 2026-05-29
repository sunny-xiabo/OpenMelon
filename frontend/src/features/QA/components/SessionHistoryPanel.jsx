import {
  Box,
  Button,
  Collapse,
  IconButton,
  TextField,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Add,
  Check as CheckIcon,
  Close as CloseIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  KeyboardDoubleArrowLeft,
  Search,
} from '@mui/icons-material';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { formatRelativeTime } from '../utils';

export default function SessionHistoryPanel({
  currentSession,
  deleteConfirm,
  editTitle,
  editingSession,
  handleDeleteSession,
  handleNewSession,
  handleSaveRename,
  handleStartRename,
  handleSwitchSession,
  sessions,
  sessionListExpanded,
  setDeleteConfirm,
  setEditTitle,
  setEditingSession,
  setSessionListExpanded,
  confirmDeleteSession,
  onCollapseSidebar,
  searchQuery,
  onSearchChange,
}) {
  return (
    <>
      <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'grey.50' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <IconButton size="small" onClick={onCollapseSidebar} sx={{ borderRadius: 1.5, p: 0.5, mr: 0.5 }}>
              <KeyboardDoubleArrowLeft sx={{ fontSize: 16 }} />
            </IconButton>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, cursor: 'pointer' }} onClick={() => setSessionListExpanded(!sessionListExpanded)}>
              <Typography variant="caption" fontWeight={700} color="text.secondary">
                会话历史 {sessions.length > 0 && `(${sessions.length})`}
              </Typography>
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>
                {sessionListExpanded ? '▾' : '▸'}
              </Typography>
            </Box>
          </Box>
          <Button size="small" startIcon={<Add fontSize="small" />} onClick={handleNewSession} sx={{ py: 0.25, px: 1, fontSize: '11px', fontWeight: 700 }}>
            新建会话
          </Button>
        </Box>

        {/* 搜索会话框 */}
        <Box sx={{ mt: 1 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="搜索会话..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            InputProps={{
              startAdornment: (
                <Search sx={{ fontSize: 15, color: 'text.disabled', mr: 0.75 }} />
              ),
              sx: {
                borderRadius: 2,
                fontSize: '11.5px',
                bgcolor: 'white',
                '& fieldset': { borderColor: 'rgba(0,0,0,0.06)' },
                px: 1,
                py: 0
              }
            }}
          />
        </Box>
      </Box>

      <Collapse in={sessionListExpanded}>
        <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ mt: 0.75, maxHeight: 180, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {sessions.length === 0 ? (
              <Typography variant="caption" color="text.disabled" sx={{ py: 1, textAlign: 'center' }}>
                暂无历史会话，发送消息将自动创建
              </Typography>
            ) : (
              sessions.map((session) => {
                const isActive = session.id === currentSession;
                const isEditing = editingSession === session.id;
                return (
                  <Box
                    key={session.id}
                    onClick={() => !isEditing && handleSwitchSession(session.id)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      px: 1.5,
                      py: 0.85,
                      borderRadius: 2,
                      cursor: isEditing ? 'default' : 'pointer',
                      bgcolor: isActive ? (theme) => alpha(theme.palette.accent.indigo, 0.08) : 'transparent',
                      border: '1px solid',
                      borderColor: isActive ? (theme) => alpha(theme.palette.accent.indigo, 0.25) : 'transparent',
                      transition: 'all 0.15s',
                      '&:hover': {
                        bgcolor: isActive ? (theme) => alpha(theme.palette.accent.indigo, 0.1) : (theme) => alpha(theme.palette.common.black, 0.03),
                        '& .session-actions': { opacity: 1 },
                      },
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      {isEditing ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }} onClick={(event) => event.stopPropagation()}>
                          <TextField
                            size="small"
                            value={editTitle}
                            onChange={(event) => setEditTitle(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') handleSaveRename();
                              if (event.key === 'Escape') {
                                setEditingSession(null);
                                setEditTitle('');
                              }
                            }}
                            autoFocus
                            sx={{ flex: 1, '& .MuiInputBase-input': { fontSize: 12, py: 0.5 }, '& .MuiOutlinedInput-root': { borderRadius: 1 } }}
                          />
                          <IconButton size="small" onClick={handleSaveRename} sx={{ p: 0.25 }}>
                            <CheckIcon sx={{ fontSize: 14, color: 'success.main' }} />
                          </IconButton>
                          <IconButton size="small" onClick={() => { setEditingSession(null); setEditTitle(''); }} sx={{ p: 0.25 }}>
                            <CloseIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Box>
                      ) : (
                        <>
                          <Typography variant="body2" sx={{ fontSize: 12.5, fontWeight: isActive ? 600 : 500, color: isActive ? 'accent.indigoDark' : 'slate.700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {session.title || session.id.slice(0, 8)}
                          </Typography>
                          <Typography variant="caption" sx={{ fontSize: 10.5, color: 'slate.400', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            {formatRelativeTime(session.updated_at)}
                            {session.message_count > 0 && <span>· {session.message_count} 条消息</span>}
                          </Typography>
                        </>
                      )}
                    </Box>
                    {!isEditing && (
                      <Box className="session-actions" sx={{ display: 'flex', opacity: 0, transition: 'opacity 0.15s', flexShrink: 0 }} onClick={(event) => event.stopPropagation()}>
                        <IconButton size="small" onClick={() => handleStartRename(session.id, session.title)} sx={{ p: 0.25 }}>
                          <EditIcon sx={{ fontSize: 13, color: 'slate.400' }} />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleDeleteSession(session.id, session.title)} sx={{ p: 0.25 }}>
                          <DeleteIcon sx={{ fontSize: 13, color: '#f87171' }} />
                        </IconButton>
                      </Box>
                    )}
                  </Box>
                );
              })
            )}
          </Box>
        </Box>
      </Collapse>

      <ConfirmDialog
        open={deleteConfirm.open}
        message={`确认删除会话「${deleteConfirm.title}」？\n删除后不可恢复。`}
        onConfirm={confirmDeleteSession}
        onCancel={() => setDeleteConfirm({ open: false, sessionId: null, title: '' })}
        danger
      />
    </>
  );
}
