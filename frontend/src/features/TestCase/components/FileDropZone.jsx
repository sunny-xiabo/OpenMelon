import { Box, Chip, IconButton, Typography } from '@mui/material';
import { UploadFile } from '@mui/icons-material';
import { ACCEPT_STR, FILE_CATEGORIES } from '../constants';
import { fmtSize, getFileCategory } from '../utils';

export default function FileDropZone({
  clearFile,
  dragOver,
  file,
  fileRef,
  handleFileSelect,
  previewUrl,
  setDragOver,
}) {
  const category = file ? getFileCategory(file.name) : null;

  return (
    <Box>
      <Box
        sx={{
          border: '2px dashed',
          borderColor: dragOver ? '#6366f1' : file ? '#6366f1' : 'rgba(99,102,241,0.3)',
          borderRadius: 2.5,
          p: file ? 1.5 : 4,
          textAlign: 'center',
          cursor: 'pointer',
          background: file ? 'rgba(99,102,241,0.06)' : dragOver ? 'rgba(99,102,241,0.04)' : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
          boxShadow: (dragOver || file) ? 'inset 0 0 0 2px rgba(99,102,241,0.05)' : 'none',
          transition: 'all 0.2s',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 160,
          '&:hover': { borderColor: '#6366f1', background: 'rgba(99,102,241,0.02)' },
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          handleFileSelect(event.dataTransfer.files[0]);
        }}
        onClick={() => !file && fileRef.current?.click()}
      >
        {file ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            {previewUrl && (
              <Box
                component="img"
                src={previewUrl}
                sx={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 0.75, border: '1px solid', borderColor: 'divider' }}
                alt="preview"
              />
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {category && <Chip label={category.icon} size="small" color="primary" sx={{ mb: 0.5, height: 18, fontSize: 10 }} />}
              <Typography variant="body2" fontWeight={500} noWrap>{file.name}</Typography>
              <Typography variant="caption" color="text.disabled">{fmtSize(file.size)}</Typography>
            </Box>
            <IconButton
              size="small"
              onClick={(event) => {
                event.stopPropagation();
                clearFile();
              }}
            >
              <Typography variant="body2">X</Typography>
            </IconButton>
          </Box>
        ) : (
          <>
            <Box sx={{ width: 44, height: 44, borderRadius: '50%', bgcolor: 'primary.light', color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}>
              <UploadFile fontSize="small" />
            </Box>
            <Typography variant="body2" color="text.secondary">
              拖拽文件到此处，或 <Typography component="span" color="primary" fontWeight={500}>点击选择文件</Typography>
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'center', mt: 1, flexWrap: 'wrap' }}>
              {FILE_CATEGORIES.map((item) => (
                <Chip key={item.label} label={`${item.icon} ${item.label}`} size="small" variant="outlined" />
              ))}
            </Box>
          </>
        )}
      </Box>
      <input
        ref={fileRef}
        type="file"
        hidden
        accept={ACCEPT_STR}
        onChange={(event) => {
          handleFileSelect(event.target.files[0]);
          event.target.value = '';
        }}
      />
    </Box>
  );
}
