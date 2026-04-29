import {
  Autocomplete,
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import {
  CloudUploadOutlined,
  DescriptionOutlined,
  FolderOpenOutlined,
} from '@mui/icons-material';
import { ACCEPTED_EXTENSIONS } from '../constants';

export default function ImportWorkbench({
  dragOver,
  filters,
  handleDrop,
  selectedFiles,
  setDragOver,
  setSelectedFiles,
  setUploadDocType,
  setUploadMode,
  setUploadModule,
  uploadDocType,
  uploadMode,
  uploadModule,
  uploadProgress,
  doUpload,
}) {
  return (
    <Paper elevation={0} sx={{ width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
      <Box sx={{ px: 2.5, py: 1.75, borderBottom: '1px solid', borderColor: 'divider', background: 'linear-gradient(90deg, rgba(59,130,246,0.06) 0%, rgba(99,102,241,0.04) 100%)' }}>
        <Typography variant="subtitle2" sx={{ color: '#1e293b', fontWeight: 600 }}>导入工作台</Typography>
        <Typography variant="caption" sx={{ color: '#64748b' }}>
          选择单文件或整个文件夹，补充文档类型和模块信息后开始索引。
        </Typography>
      </Box>

      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, bgcolor: 'background.paper' }}>
        <Box sx={{ display: 'flex', bgcolor: 'rgba(0,0,0,0.04)', borderRadius: 1.5, p: 0.5, alignSelf: 'flex-start' }}>
          <Button
            disableElevation
            size="small"
            variant={uploadMode === 'single' ? 'contained' : 'text'}
            onClick={() => setUploadMode('single')}
            startIcon={<DescriptionOutlined fontSize="small" />}
            sx={{
              borderRadius: 1,
              py: 0.5,
              px: 1.5,
              color: uploadMode === 'single' ? '#fff' : 'text.secondary',
              bgcolor: uploadMode === 'single' ? 'primary.main' : 'transparent',
              fontWeight: uploadMode === 'single' ? 600 : 500,
              boxShadow: 'none',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s',
              '&:hover': {
                bgcolor: uploadMode === 'single' ? 'primary.dark' : 'rgba(0,0,0,0.04)',
              },
            }}
          >
            单文件
          </Button>
          <Button
            disableElevation
            size="small"
            variant={uploadMode === 'folder' ? 'contained' : 'text'}
            onClick={() => setUploadMode('folder')}
            startIcon={<FolderOpenOutlined fontSize="small" />}
            sx={{
              borderRadius: 1,
              py: 0.5,
              px: 1.5,
              color: uploadMode === 'folder' ? '#fff' : 'text.secondary',
              bgcolor: uploadMode === 'folder' ? 'primary.main' : 'transparent',
              fontWeight: uploadMode === 'folder' ? 600 : 500,
              boxShadow: 'none',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s',
              '&:hover': {
                bgcolor: uploadMode === 'folder' ? 'primary.dark' : 'rgba(0,0,0,0.04)',
              },
            }}
          >
            文件夹
          </Button>
        </Box>

        <Box
          sx={{
            border: '2px dashed',
            borderColor: dragOver ? '#6366f1' : 'rgba(99,102,241,0.3)',
            borderRadius: 3,
            p: 2.5,
            textAlign: 'center',
            cursor: uploadProgress ? 'default' : 'pointer',
            background: dragOver ? 'rgba(99,102,241,0.04)' : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
            minHeight: 160,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            transition: 'all 0.2s',
            boxShadow: dragOver ? 'inset 0 0 0 2px rgba(99,102,241,0.05)' : 'none',
            '&:hover': uploadProgress ? {} : { borderColor: '#6366f1', background: 'rgba(99,102,241,0.02)' },
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (!uploadProgress) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            if (!uploadProgress) handleDrop(event.dataTransfer.files);
          }}
          onClick={() => {
            if (!uploadProgress) document.getElementById('manage-file-input').click();
          }}
        >
          <Box sx={{ width: 48, height: 48, borderRadius: '50%', bgcolor: 'primary.light', color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CloudUploadOutlined />
          </Box>
          <Typography variant="body2" color="text.secondary">
            {uploadMode === 'folder' ? '点击选择文件夹，或拖拽文件夹到这里' : '拖拽文件到这里，或点击选择'}
          </Typography>
          <Typography variant="caption" color="text.disabled">
            支持 PDF / Word / Excel / XMind / PPT / Markdown / TXT / JSON / XML
          </Typography>
        </Box>

        <input
          id="manage-file-input"
          type="file"
          multiple
          style={{ display: 'none' }}
          {...(uploadMode === 'folder' ? { webkitdirectory: '' } : { accept: ACCEPTED_EXTENSIONS })}
          onChange={(event) => {
            handleDrop(event.target.files);
            event.target.value = '';
          }}
        />

        {uploadProgress ? (
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
              上传进度
            </Typography>
            <LinearProgress variant="determinate" value={uploadProgress.pct} sx={{ height: 8, borderRadius: 999 }} />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
              {uploadProgress.text}
            </Typography>
          </Paper>
        ) : null}

        <Autocomplete
          freeSolo
          size="small"
          options={filters.doc_types || []}
          value={uploadDocType}
          inputValue={uploadDocType}
          onChange={(event, newValue) => setUploadDocType(newValue || '')}
          onInputChange={(event, newInputValue) => setUploadDocType(newInputValue)}
          renderInput={(params) => (
            <TextField
              {...params}
              label="文档类型"
              placeholder="可选，便于后续筛选"
              fullWidth
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5, bgcolor: '#f8fafc' } }}
            />
          )}
        />
        <Autocomplete
          freeSolo
          size="small"
          options={filters.modules || []}
          value={uploadModule}
          inputValue={uploadModule}
          onChange={(event, newValue) => setUploadModule(newValue || '')}
          onInputChange={(event, newInputValue) => setUploadModule(newInputValue)}
          renderInput={(params) => (
            <TextField
              {...params}
              label="所属模块"
              placeholder="可选，便于图谱和覆盖率统计"
              fullWidth
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5, bgcolor: '#f8fafc' } }}
            />
          )}
        />

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            fullWidth
            onClick={doUpload}
            disabled={selectedFiles.length === 0 || uploadProgress}
            startIcon={uploadProgress ? <Box sx={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 1s linear infinite' }} /> : <CloudUploadOutlined />}
            sx={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
              boxShadow: '0 4px 12px rgba(99,102,241,0.25)',
              fontWeight: 600,
              '&:hover': {
                background: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)',
                boxShadow: '0 6px 16px rgba(99,102,241,0.3)',
              },
              '&.Mui-disabled': {
                background: '#e2e8f0',
                color: '#94a3b8',
                boxShadow: 'none',
              },
            }}
          >
            {uploadProgress ? '处理中...' : `开始导入${selectedFiles.length > 0 ? ` (${selectedFiles.length})` : ''}`}
          </Button>
          <Button
            variant="outlined"
            disabled={selectedFiles.length === 0 || uploadProgress}
            onClick={() => {
              setSelectedFiles([]);
              setUploadDocType('');
              setUploadModule('');
            }}
          >
            清空
          </Button>
        </Box>

        {selectedFiles.length > 0 && !uploadProgress && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
              待导入文件
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, maxHeight: 120, overflow: 'auto' }}>
              {selectedFiles.map((file, index) => (
                <Chip
                  key={`${file.name}-${file.size}-${index}`}
                  label={file.name}
                  size="small"
                  onDelete={() => setSelectedFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index))}
                />
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </Paper>
  );
}
