import React from 'react';
import {
  Box, Button, Chip, IconButton, Tooltip, Typography,
} from '@mui/material';
import {
  Save, Publish, PlayArrow, Stop, Undo, Redo,
  FileDownload, FileUpload, ArrowBack,
} from '@mui/icons-material';

/**
 * Top toolbar for workflow editor -- save, publish, run, import/export.
 */
export default function WorkflowToolbar({
  workflowName = 'Untitled',
  status = 'draft',
  isRunning = false,
  isSaving = false,
  onSave,
  onPublish,
  onUnpublish,
  onRun,
  onCancel,
  onImport,
  onExport,
  onNameChange,
  onBack,
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 2,
        py: 1,
        borderBottom: 1,
        borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
        bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(17, 24, 39, 0.6)' : 'rgba(255, 255, 255, 0.6)',
        backdropFilter: 'blur(20px)',
      }}
    >
      {/* Back button */}
      {onBack && (
        <Button
          size="small"
          variant="text"
          startIcon={<ArrowBack />}
          onClick={onBack}
          sx={{
            mr: 1.5,
            color: 'text.secondary',
            '&:hover': { color: 'primary.main', bgcolor: 'action.hover' },
            fontWeight: 600,
          }}
        >
          返回
        </Button>
      )}

      {/* Workflow name */}
      <Typography
        variant="subtitle1"
        sx={{
          fontWeight: 700,
          cursor: 'text',
          minWidth: 120,
          '&:hover': { bgcolor: 'action.hover', borderRadius: 1 },
          px: 0.5,
        }}
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => onNameChange?.(e.currentTarget.textContent)}
      >
        {workflowName}
      </Typography>

      {/* Status chip */}
      <Chip
        label={status === 'published' ? '已发布' : '草稿'}
        size="small"
        color={status === 'published' ? 'success' : 'default'}
        variant="outlined"
      />

      <Box sx={{ flex: 1 }} />

      {/* Action buttons */}
      <Tooltip title="保存">
        <span>
          <IconButton size="small" onClick={onSave} disabled={isSaving}>
            <Save fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      {status === 'draft' ? (
        <Button
          size="small"
          variant="outlined"
          startIcon={<Publish />}
          onClick={onPublish}
          disabled={isSaving}
        >
          发布
        </Button>
      ) : (
        <Button
          size="small"
          variant="outlined"
          color="warning"
          onClick={onUnpublish}
          disabled={isSaving}
        >
          取消发布
        </Button>
      )}

      {isRunning ? (
        <Button
          size="small"
          variant="contained"
          color="error"
          startIcon={<Stop />}
          onClick={onCancel}
        >
          停止
        </Button>
      ) : (
        <Button
          size="small"
          variant="contained"
          startIcon={<PlayArrow />}
          onClick={onRun}
        >
          运行
        </Button>
      )}

      <Tooltip title="导出 DSL">
        <IconButton size="small" onClick={onExport}>
          <FileDownload fontSize="small" />
        </IconButton>
      </Tooltip>

      <Tooltip title="导入 DSL">
        <IconButton size="small" onClick={onImport}>
          <FileUpload fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
