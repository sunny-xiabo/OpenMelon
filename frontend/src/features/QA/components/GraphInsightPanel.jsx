import { useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
  Tabs,
  Tab,
  Card,
  CardContent,
  Chip,
  Stack,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { AccountTree, DownloadOutlined, MenuBook, GpsFixed } from '@mui/icons-material';
import EmptyState from '../../../components/EmptyState';

export default function GraphInsightPanel({
  checkGraphStatus,
  containerRef,
  docType,
  filters,
  graphError,
  graphLoading,
  graphReady,
  isNarrow,
  legend,
  loadFullGraph,
  moduleFilter,
  onExport,
  searchEntity,
  searchText,
  setDocType,
  setModuleFilter,
  setSearchText,
  setShowChunks,
  showChunks,
  activeTab = 0,
  setActiveTab,
  activeMessage = null,
  activeCitationIndex = null,
  onLocateNode,
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        width: isNarrow ? '100%' : '42%',
        height: isNarrow ? 520 : 'auto',
        flex: isNarrow ? '0 0 520px' : '0 1 42%',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 3,
        overflow: 'hidden',
        bgcolor: 'background.paper',
      }}
    >
      {/* 头部标题与控制 */}
      <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: (theme) => alpha(theme.palette.slate[200], 0.8), background: (theme) => `linear-gradient(90deg, ${theme.palette.slate[50]} 0%, ${theme.palette.slate[100]} 100%)` }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 34, height: 34, borderRadius: 2, background: 'linear-gradient(135deg, #cffafe 0%, #a5f3fc 100%)', color: 'accent.cyan', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.7), 0 4px 8px rgba(6,182,212,0.1)' }}>
            <AccountTree fontSize="small" />
          </Box>
          <Box>
            <Typography variant="subtitle1" fontWeight={700} sx={{ color: 'slate.800' }}>智能线索分析</Typography>
            <Typography variant="caption" sx={{ color: 'slate.500' }}>通过知识图谱与引用溯源，双向校验大模型回答依据</Typography>
          </Box>
        </Box>
      </Box>

      {/* 滑动 Tab 控制 */}
      <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'slate.50' }}>
        <Tabs
          value={activeTab}
          onChange={(e, val) => setActiveTab?.(val)}
          variant="fullWidth"
          sx={{
            minHeight: 40,
            '& .MuiTab-root': { minHeight: 40, py: 1, fontSize: 12.5, fontWeight: 700 },
          }}
        >
          <Tab icon={<AccountTree sx={{ fontSize: 16 }} />} label="知识图谱" iconPosition="start" />
          <Tab icon={<MenuBook sx={{ fontSize: 16 }} />} label="引用溯源" iconPosition="start" />
        </Tabs>
      </Box>

      {activeTab === 0 ? (
        <>
          {/* 原有图谱过滤控制器 */}
          <Box sx={{ p: 1.25, borderBottom: '1px solid', borderColor: (theme) => alpha(theme.palette.slate[200], 0.8), background: 'common.white', display: 'flex', flexDirection: 'column', gap: 1, zIndex: 2 }}>
            <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
              <TextField
                size="small"
                placeholder="搜索实体..."
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && searchEntity()}
                sx={{ flex: 1, minWidth: 160, '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'slate.50' }, '& .MuiInputBase-input': { fontSize: 13 } }}
              />
              <Button size="small" variant="contained" onClick={searchEntity} disabled={!graphReady || !searchText.trim()} sx={{ borderRadius: 2, boxShadow: 'none' }}>
                搜索
              </Button>
              <Button size="small" variant="outlined" onClick={loadFullGraph} disabled={!graphReady} sx={{ borderRadius: 2 }}>全图</Button>
              {onExport && (
                <Button size="small" variant="outlined" onClick={onExport} disabled={!graphReady} startIcon={<DownloadOutlined fontSize="small" />} sx={{ borderRadius: 2, fontWeight: 600, fontSize: 11 }}>
                  导出图片
                </Button>
              )}
              {!graphReady && (
                <Button size="small" variant="outlined" onClick={checkGraphStatus} sx={{ borderRadius: 2 }}>刷新数据</Button>
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <FormControl size="small" sx={{ minWidth: 110, flex: '0 0 auto' }}>
                <Select value={docType} onChange={(event) => setDocType(event.target.value)} displayEmpty sx={{ borderRadius: 2, bgcolor: 'slate.50', fontSize: 13 }}>
                  <MenuItem value="">全部类型</MenuItem>
                  {filters.doc_types?.map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 110, flex: '0 0 auto' }}>
                <Select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)} displayEmpty sx={{ borderRadius: 2, bgcolor: 'slate.50', fontSize: 13 }}>
                  <MenuItem value="">全部模块</MenuItem>
                  {filters.modules?.map((module) => <MenuItem key={module} value={module}>{module}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControlLabel
                control={<Checkbox size="small" checked={showChunks} onChange={(event) => setShowChunks(event.target.checked)} color="info" />}
                label={<Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>显示分块</Typography>}
                sx={{ ml: 0.25 }}
              />
            </Box>
          </Box>

          {/* 原有图谱画布容器 */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', minHeight: 0, overflow: 'hidden' }}>
            {graphLoading && (
              <Box sx={{ position: 'absolute', top: 10, left: 12, right: 12, zIndex: 12, borderRadius: 1, bgcolor: (theme) => alpha(theme.palette.common.white, 0.88), border: '1px solid', borderColor: 'divider', overflow: 'hidden', pointerEvents: 'none' }}>
                <LinearProgress sx={{ height: 3 }} />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 1.25, py: 0.75, fontWeight: 800 }}>
                  图谱线索正在刷新，当前内容可继续查看
                </Typography>
              </Box>
            )}
            {graphError ? (
              <Box sx={{ m: 1, flex: 1, minHeight: 0, display: 'flex' }}>
                <EmptyState
                  variant="error"
                  title="图谱加载失败"
                  description={graphError.message || '请稍后重试或刷新图谱状态。'}
                  actionLabel="重新加载"
                  onAction={loadFullGraph}
                />
              </Box>
            ) : graphReady === false ? (
              <Box sx={{ m: 1, flex: 1, minHeight: 0, display: 'flex' }}>
                <EmptyState
                  title="暂无数据"
                  description="Neo4j 为空，上传完成后会自动恢复，也可以手动刷新数据。"
                  actionLabel="刷新数据"
                  onAction={checkGraphStatus}
                />
              </Box>
            ) : (
              <Box ref={containerRef} sx={{ flex: 1, minHeight: 260, borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider', outline: 'none', bgcolor: 'slate.50', backgroundImage: (theme) => `radial-gradient(${theme.palette.slate[200]} 1px, transparent 1px)`, backgroundSize: '24px 24px' }} />
            )}
            <Box sx={{ position: 'absolute', bottom: 16, left: 16, display: 'flex', flexWrap: 'wrap', gap: 1.25, p: 1.25, bgcolor: (theme) => alpha(theme.palette.common.white, 0.8), backdropFilter: 'blur(12px)', border: '1px solid', borderColor: (theme) => alpha(theme.palette.common.white, 0.4), borderRadius: 3, boxShadow: '0 4px 16px rgba(0,0,0,0.04)', zIndex: 10, maxWidth: 'calc(100% - 32px)' }}>
              {legend.map(({ type, color }) => (
                <Box key={type} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, bgcolor: (theme) => alpha(theme.palette.common.white, 0.6), px: 1, py: 0.5, borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color.bg, boxShadow: `0 0 0 1px ${color.border}` }} />
                  <Typography variant="caption" sx={{ color: 'slate.600', fontWeight: 500 }}>{type}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </>
      ) : (
        /* 新增：引用溯源卡片列表看板 */
        <Box sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 2, bgcolor: '#f8fafc' }}>
          {!activeMessage || !activeMessage.citations || activeMessage.citations.length === 0 ? (
            <Box sx={{ flex: 1, minHeight: 0, display: 'flex', p: 4 }}>
              <EmptyState
                title="暂无引用溯源线索"
                description="请在左侧会话窗口发送提问。AI 回答后，此看板将自动呈现引用的完整分块与定位线索。"
              />
            </Box>
          ) : (
            activeMessage.citations.map((cit, idx) => {
              const num = idx + 1;
              const isFocused = activeCitationIndex === num;

              // 从 activeMessage 的 context_chunks 中查找完全匹配的分块内容
              const matchedChunk = activeMessage.context_chunks?.find(
                (c) => c.filename === cit.filename && c.chunk_index === cit.chunk_index
              );

              return (
                <Card
                  key={idx}
                  id={`citation-card-${num}`}
                  elevation={0}
                  sx={{
                    borderRadius: 3.5,
                    border: '1px solid',
                    borderColor: isFocused ? 'primary.main' : 'rgba(226,232,240,0.8)',
                    bgcolor: isFocused ? 'rgba(26,115,232,0.02)' : '#ffffff',
                    boxShadow: isFocused ? '0 12px 24px rgba(26,115,232,0.06)' : '0 2px 8px rgba(0,0,0,0.01)',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    '&:hover': {
                      boxShadow: '0 12px 28px rgba(15,23,42,0.05)',
                      borderColor: isFocused ? 'primary.main' : 'rgba(203,213,225,0.8)',
                    },
                  }}
                >
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                      <Box sx={{
                        width: 22,
                        height: 22,
                        borderRadius: 1.5,
                        bgcolor: isFocused ? 'primary.main' : 'slate.100',
                        color: isFocused ? 'primary.contrastText' : 'slate.600',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '11px',
                        fontWeight: 900,
                        boxShadow: isFocused ? '0 4px 8px rgba(99,102,241,0.2)' : 'none',
                      }}>
                        {num}
                      </Box>
                      <Chip
                        label={cit.source_type === 'vector' ? '向量数据库' : '关联图谱'}
                        size="small"
                        color={cit.source_type === 'vector' ? 'primary' : 'success'}
                        sx={{ fontSize: 9.5, fontWeight: 700, height: 18 }}
                      />
                      {cit.doc_type && (
                        <Chip
                          label={cit.doc_type.toUpperCase()}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: 9.5, fontWeight: 700, height: 18, borderColor: 'divider' }}
                        />
                      )}
                      
                      {/* 图谱定位联动 */}
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => onLocateNode?.(cit.filename || cit.doc_type || '')}
                        startIcon={<GpsFixed sx={{ fontSize: 11 }} />}
                        sx={{ ml: 'auto', fontSize: '10.5px', py: 0.25, fontWeight: 800, borderRadius: 1.5 }}
                      >
                        图谱定位
                      </Button>
                    </Stack>

                    <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: '12.5px', color: 'slate.800', mb: 1, wordBreak: 'break-word' }}>
                      数据源: {cit.filename || '图谱关系节点'}
                    </Typography>

                    {matchedChunk ? (
                      <Box>
                        {matchedChunk.section_path && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, bgcolor: '#f8fafc', p: 0.75, borderRadius: 1, fontFamily: 'monospace', fontSize: '9.5px', border: '1px solid rgba(0,0,0,0.02)' }}>
                            路径: {matchedChunk.section_path}
                          </Typography>
                        )}
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{
                            fontSize: 12,
                            lineHeight: 1.6,
                            bgcolor: '#f8fafc',
                            p: 1.5,
                            borderRadius: 2.5,
                            border: '1px solid',
                            borderColor: '#eff6ff',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {matchedChunk.content}
                        </Typography>
                      </Box>
                    ) : (
                      <Typography variant="body2" color="slate.500" sx={{ fontSize: 12, fontStyle: 'italic', bgcolor: '#f8fafc', p: 1.5, borderRadius: 2.5, border: '1px solid rgba(0,0,0,0.02)' }}>
                        参考源来自知识图谱拓扑关系网络。点击“图谱定位”可在左侧画布中联动聚焦该实体节点，支持节点深度关系回溯。
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </Box>
      )}
    </Paper>
  );
}
