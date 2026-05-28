import {
  Autocomplete,
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { AutoFixHigh, DescriptionOutlined, UploadFile, StopCircleOutlined } from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import PageHeader from '../../../components/PageHeader';
import FileDropZone from './FileDropZone';

export default function GenerationPanel({
  availableModules,
  clearFile,
  context,
  dragOver,
  file,
  fileRef,
  generate,
  generating,
  handleCancel,
  handleFileSelect,
  handleReset,
  isNarrow,
  mode,
  moduleName,
  previewUrl,
  requirements,
  selectedSkillIds,
  setContext,
  setDragOver,
  setMode,
  setModuleName,
  setRequirements,
  setSelectedSkillIds,
  setStyleId,
  skillOptions,
  styleId,
  templateOptions,
}) {
  const selectedTemplateName = templateOptions.find((option) => option.id === styleId)?.name || '默认模板';

  return (
    <Paper elevation={0} sx={{ width: isNarrow ? '100%' : '35%', minWidth: 280, maxWidth: isNarrow ? 'none' : 480, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
      <PageHeader title="测试用例生成" subtitle="基于文件或文本上下文生成测试用例，并可保存到向量库。">
        <Box sx={{ display: 'flex', bgcolor: 'rgba(0,0,0,0.04)', borderRadius: 1.5, p: 0.5 }}>
          {['file', 'text'].map((item) => (
            <Button
              key={item}
              disableElevation
              size="small"
              variant={mode === item ? 'contained' : 'text'}
              onClick={() => setMode(item)}
              sx={{
                borderRadius: 1,
                py: 0.6,
                px: 2,
                color: mode === item ? 'common.white' : 'text.secondary',
                bgcolor: mode === item ? 'primary.main' : 'transparent',
                fontWeight: mode === item ? 600 : 500,
                boxShadow: 'none',
                whiteSpace: 'nowrap',
                minWidth: 88,
                transition: 'all 0.2s',
                '&:hover': { bgcolor: mode === item ? 'primary.dark' : 'rgba(0,0,0,0.04)' },
              }}
            >
              {item === 'file' ? '文件生成' : '文本描述'}
            </Button>
          ))}
        </Box>
      </PageHeader>

      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, overflowY: 'auto', bgcolor: 'background.paper' }}>
        <Paper elevation={0} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2.5, background: (theme) => `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.06)} 0%, ${theme.palette.background.paper} 100%)` }}>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: 'primary.light', color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {mode === 'file' ? <UploadFile fontSize="small" /> : <DescriptionOutlined fontSize="small" />}
            </Box>
            <Box>
              <Typography variant="body2" fontWeight={600}>
                {mode === 'file' ? '文件驱动生成' : '文本驱动生成'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {mode === 'file' ? '适合 PDF、OpenAPI、图片等输入，自动结合上下文生成用例。' : '适合快速描述模块、场景和测试诉求。'}
              </Typography>
            </Box>
          </Stack>
        </Paper>

        {mode === 'file' && (
          <FileDropZone
            clearFile={clearFile}
            dragOver={dragOver}
            file={file}
            fileRef={fileRef}
            handleFileSelect={handleFileSelect}
            previewUrl={previewUrl}
            setDragOver={setDragOver}
          />
        )}

        <TextField
          label="上下文信息"
          multiline
          rows={3}
          fullWidth
          placeholder={mode === 'file' ? '描述被测试系统的基本信息，或补充文件未覆盖的背景' : '描述被测试的系统、功能或模块的基本信息'}
          value={context}
          onChange={(e) => setContext(e.target.value)}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5, bgcolor: 'slate.50' } }}
        />
        <TextField
          label="测试需求"
          multiline
          rows={3}
          fullWidth
          placeholder="描述希望生成的测试用例类型和重点关注的测试场景"
          value={requirements}
          onChange={(e) => setRequirements(e.target.value)}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5, bgcolor: 'slate.50' } }}
        />
        <Autocomplete
          freeSolo
          options={availableModules}
          value={moduleName}
          onChange={(e, newValue) => setModuleName(newValue || '')}
          onInputChange={(e, newInputValue) => setModuleName(newInputValue)}
          renderInput={(params) => (
            <TextField
              {...params}
              label="所属模块（可选）"
              placeholder="选择或输入模块名"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5, bgcolor: 'slate.50' } }}
            />
          )}
          size="small"
        />

        <FormControl fullWidth size="small">
          <InputLabel>生成模板</InputLabel>
          <Select
            value={styleId}
            label="生成模板"
            onChange={(e) => setStyleId(e.target.value)}
            sx={{ borderRadius: 1.5, bgcolor: 'slate.50' }}
          >
            {templateOptions.map((option) => (
              <MenuItem key={option.id} value={option.id}>
                {option.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Autocomplete
          multiple
          options={skillOptions}
          getOptionLabel={(option) => option.name}
          value={skillOptions.filter((option) => selectedSkillIds.includes(option.id))}
          onChange={(e, newValue) => setSelectedSkillIds(newValue.map((item) => item.id))}
          renderInput={(params) => (
            <TextField
              {...params}
              label="专项技能"
              placeholder="选择需要强化的测试覆盖维度"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5, bgcolor: 'slate.50' } }}
            />
          )}
          renderTags={(value, getTagProps) => value.map((option, index) => (
            <Chip {...getTagProps({ index })} key={option.id} label={option.name} size="small" />
          ))}
          isOptionEqualToValue={(option, value) => option.id === value.id}
        />

        <Paper elevation={0} sx={{ p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: '#fbfcff' }}>
          <Typography variant="body2" fontWeight={700} sx={{ mb: 0.75 }}>
            当前生成策略
          </Typography>
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
            <Chip size="small" color="primary" label={`模板：${selectedTemplateName}`} />
            <Chip size="small" variant="outlined" label={selectedSkillIds.length ? `技能：${selectedSkillIds.length}项` : '技能：未选择'} />
            {selectedSkillIds.map((skillId) => {
              const skill = skillOptions.find((option) => option.id === skillId);
              return skill ? <Chip key={skillId} size="small" variant="outlined" label={skill.name} /> : null;
            })}
          </Stack>
        </Paper>

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            fullWidth={isNarrow}
            onClick={generate}
            disabled={generating || !context.trim() || !requirements.trim() || (mode === 'file' && !file)}
            sx={{
              mt: 0.5,
              minWidth: isNarrow ? '100%' : 180,
              background: (theme) => theme.palette.gradients.primary,
              boxShadow: '0 4px 12px rgba(99,102,241,0.25)',
              fontWeight: 600,
              '&:hover': {
                background: (theme) => theme.palette.gradients.primaryHover,
                boxShadow: '0 6px 16px rgba(99,102,241,0.3)',
              },
              '&.Mui-disabled': {
                background: 'slate.200',
                color: 'slate.400',
                boxShadow: 'none',
              },
            }}
            startIcon={generating ? <Box sx={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'common.white', animation: 'spin 1s linear infinite' }} /> : <AutoFixHigh />}
          >
            {generating ? '正在生成...' : mode === 'file' ? '基于文件生成' : '生成测试用例'}
          </Button>
          <Button
            variant="outlined"
            onClick={handleReset}
            disabled={generating}
            sx={{
              mt: 0.5,
              minWidth: 100,
              color: 'text.secondary',
              borderColor: 'divider',
              '&:hover': { borderColor: 'text.secondary', bgcolor: 'rgba(0,0,0,0.04)' },
            }}
          >
            清空重置
          </Button>
          {generating && (
            <Button
              variant="outlined"
              color="warning"
              size="small"
              onClick={handleCancel}
              startIcon={<StopCircleOutlined />}
              sx={{
                mt: 0.5,
                minWidth: 100,
                fontWeight: 600,
                borderRadius: 2,
                borderColor: 'warning.main',
                color: 'warning.dark',
                '&:hover': {
                  borderColor: 'warning.dark',
                  bgcolor: (theme) => theme.palette.warning.main + '14',
                },
              }}
            >
              取消生成
            </Button>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            生成会流式输出，完成后可切换列表/导图并导出。
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
}
