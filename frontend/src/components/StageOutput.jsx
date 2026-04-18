import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Collapse,
  LinearProgress,
  IconButton,
  Chip,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import QueryBuilderIcon from '@mui/icons-material/QueryBuilder';
import { keyframes } from '@mui/system';

const pulse = keyframes`
  0% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(26, 115, 232, 0.4); }
  70% { transform: scale(1.05); opacity: 0.9; box-shadow: 0 0 0 8px rgba(26, 115, 232, 0); }
  100% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(26, 115, 232, 0); }
`;

const STAGES = [
  { key: 'analysis', marker: '# 需求分析阶段', label: '需求分析过程', stage: 'Stage 1', color: '#1a73e8' },
  { key: 'testcases', marker: '# 测试用例生成阶段', label: '用例生成过程', stage: 'Stage 2', color: '#9c27b0' },
  { key: 'review', marker: '# 测试用例评审阶段', label: '用例评审过程', stage: 'Stage 3', color: '#1e8e3e' },
];

const FINAL_MARKER = '**===最终测试用例===**';

const TIMELINE_STAGES = [
  ...STAGES,
  { key: 'final', marker: FINAL_MARKER, label: '解析生成结果', stage: 'Stage 4', color: '#f57c00' }
];

function getStageStatus(stageKey, stageContents, currentStage, isComplete) {
  if (isComplete && stageContents[stageKey]) return 'done';
  if (stageKey === 'final') return stageContents.final ? (isComplete ? 'done' : 'active') : 'pending';
  if (stageContents.final) return 'done';

  const order = STAGES.map(stage => stage.key);
  const currentIndex = order.indexOf(currentStage);
  const stageIndex = order.indexOf(stageKey);

  if (stageContents[stageKey]) {
    if (currentStage === stageKey) return 'active';
    if (currentIndex > stageIndex) return 'done';
  }

  return 'pending';
}

export default function StageOutput({ content, isComplete = false }) {
  const endRef = useRef(null);
  const [stageContents, setStageContents] = useState({ analysis: '', testcases: '', review: '', final: '' });
  const [currentStage, setCurrentStage] = useState('analysis');
  const [expanded, setExpanded] = useState(() =>
    isComplete
      ? { analysis: true, testcases: true, review: true, final: true }
      : { analysis: true, testcases: false, review: false, final: false }
  );
  const stageOrder = STAGES.map(stage => stage.key).concat(['final']);

  useEffect(() => {
    if (isComplete) return;
    setExpanded(prev => {
      const next = { ...prev };
      if (currentStage === 'testcases') next.analysis = false;
      if (currentStage === 'review') { next.analysis = false; next.testcases = false; }
      if (currentStage === 'final') { next.analysis = false; next.testcases = false; next.review = false; }
      next[currentStage] = true;
      return next;
    });
  }, [currentStage, isComplete]);

  const scrollContainerRef = useRef(null);
  const isAutoScroll = useRef(true);

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    isAutoScroll.current = scrollHeight - scrollTop - clientHeight < 80;
  };

  useEffect(() => {
    if (content && scrollContainerRef.current && isAutoScroll.current) {
      requestAnimationFrame(() => {
        const el = scrollContainerRef.current;
        if (el) {
          el.scrollTop = el.scrollHeight;
        }
      });
    }
  }, [content]);

  useEffect(() => {
    if (!content) {
      setStageContents({ analysis: '', testcases: '', review: '', final: '' });
      return;
    }

    // 使用更健壮的正则搜索
    const analysisIdx = content.search(/#\s*需求分析阶段/);
    const tcIdx = content.search(/#\s*测试用例生成阶段/);
    const reviewIdx = content.search(/#\s*测试用例评审阶段/);
    
    // FINAL_MARKER 可能带有不同的空格或加粗方式，使用正则搜索
    const finalMarkerPattern = /\*\*[:\s]*=?==最终测试用例=?==[:\s]*\*\*/;
    const finalMatch = content.match(finalMarkerPattern);
    const finalIdx = finalMatch ? finalMatch.index : -1;

    let analysisText = '';
    let tcText = '';
    let reviewText = '';
    let finalText = '';

    if (reviewIdx !== -1) {
      const reviewStart = reviewIdx;
      const reviewPartEnd = finalIdx !== -1 ? finalIdx : content.length;
      analysisText = analysisIdx !== -1 ? content.substring(analysisIdx, tcIdx !== -1 ? tcIdx : reviewIdx) : '';
      tcText = tcIdx !== -1 ? content.substring(tcIdx, reviewIdx) : '';
      reviewText = content.substring(reviewStart, reviewPartEnd);
      finalText = finalIdx !== -1 ? content.substring(finalIdx + finalMatch[0].length) : '';
      setCurrentStage(finalIdx !== -1 ? 'final' : 'review');
    } else if (tcIdx !== -1) {
      analysisText = analysisIdx !== -1 ? content.substring(analysisIdx, tcIdx) : '';
      tcText = content.substring(tcIdx);
      setCurrentStage('testcases');
    } else if (analysisIdx !== -1) {
      analysisText = content.substring(analysisIdx);
      setCurrentStage('analysis');
    } else {
      analysisText = content;
      setCurrentStage('analysis');
    }

    setStageContents({
      analysis: analysisText,
      testcases: tcText,
      review: reviewText,
      final: finalText,
    });
  }, [content]);

  // 工具函数：移除 Markdown 中的阶段标记标题
  const stripMarker = (text) => {
    if (!text) return '';
    // 移除以 # 开头的前两行（通常是阶段标题和装饰线）
    const lines = text.split('\n');
    if (lines.length > 0 && lines[0].trim().startsWith('#')) {
      return lines.slice(1).join('\n').trim();
    }
    return text.trim();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, flex: 1, minHeight: 0 }}>
      {/* 固定的时间线面板 */}
      <Paper
        variant="outlined"
        sx={{
          p: 1.5,
          borderRadius: 2.5,
          bgcolor: '#fbfcff',
          borderColor: 'divider',
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        <Typography variant="body2" fontWeight={700} sx={{ mb: 1.25 }}>
          生成阶段时间线
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 1 }}>
          {TIMELINE_STAGES.map((stage, index) => {
            const status = getStageStatus(stage.key, stageContents, currentStage, isComplete);
            const isActive = status === 'active';
            const isDone = status === 'done';
            const color = isDone || isActive ? stage.color : '#c4c7cf';
            const isFinal = stage.key === 'final';

            return (
              <Box key={stage.key} sx={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, position: 'relative' }}>
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      border: '2px solid',
                      borderColor: isActive ? 'transparent' : color,
                      bgcolor: isDone ? color : isActive ? stage.color : '#fff',
                      color: isDone || isActive ? '#fff' : color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      fontWeight: 700,
                      flexShrink: 0,
                      animation: isActive ? `${pulse} 2s infinite` : 'none',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      boxShadow: isActive ? `0 0 12px ${stage.color}40` : 'none',
                    }}
                  >
                    {isDone ? <CheckCircleIcon sx={{ fontSize: 18 }} /> : isActive ? <AutorenewIcon className="rotating" sx={{ fontSize: 18, animation: 'spin 2s linear infinite' }} /> : index + 1}
                  </Box>
                  <style>
                    {`
                      @keyframes spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                      }
                    `}
                  </style>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="caption" fontWeight={700} sx={{ color: 'text.disabled', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {stage.stage}
                    </Typography>
                    <Typography
                      variant="body2"
                      fontWeight={isActive ? 800 : 600}
                      sx={{ 
                        color: isActive ? stage.color : isDone ? 'text.primary' : 'text.disabled', 
                        whiteSpace: 'nowrap', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis',
                        transition: 'all 0.3s ease'
                      }}
                    >
                      {stage.label.replace('过程', '').replace('解析', '最终')}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {isActive && <Typography variant="caption" sx={{ color: stage.color, fontSize: 10, fontWeight: 600, animation: 'blink 1.5s infinite' }}>处理中...</Typography>}
                      {isDone && <Typography variant="caption" sx={{ color: 'success.main', fontSize: 10, fontWeight: 600 }}>已完成</Typography>}
                      {!isActive && !isDone && <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: 10 }}>待开始</Typography>}
                    </Box>
                    <style>
                      {`
                        @keyframes blink {
                          0% { opacity: 1; }
                          50% { opacity: 0.5; }
                          100% { opacity: 1; }
                        }
                      `}
                    </style>
                  </Box>
                </Box>
                {index < TIMELINE_STAGES.length - 1 && (
                  <Box
                    sx={{
                      flex: 1,
                      minWidth: 10,
                      height: 3,
                      mx: 1.5,
                      alignSelf: 'center',
                      borderRadius: 1.5,
                      bgcolor: ((currentStage && stageOrder.indexOf(currentStage) > index) || (isFinal && stageContents.final)) ? TIMELINE_STAGES[index].color : '#e0e4eb',
                      opacity: isDone ? 1 : 0.4,
                      transition: 'all 0.5s ease',
                      boxShadow: isDone ? `0 0 4px ${TIMELINE_STAGES[index].color}30` : 'none',
                    }}
                  />
                )}
              </Box>
            );
          })}
        </Box>
      </Paper>

      {/* 可滚动的过程区域 */}
      <Box ref={scrollContainerRef} onScroll={handleScroll} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, flex: 1, minHeight: 0, overflow: 'auto', pr: 1 }}>
        {STAGES.map(s => {
          const text = stageContents[s.key];
          if (!text) return null;
        const isCurrent = !isComplete && currentStage === s.key
          && (s.key === 'analysis' ? !stageContents.testcases
            : s.key === 'testcases' ? !stageContents.review
            : !stageContents.final);
        return (
          <Paper
            key={s.key}
            variant="outlined"
            sx={{ 
                flexShrink: 0, 
                borderRadius: 2.5, 
                borderColor: isCurrent ? s.color : 'divider',
                boxShadow: isCurrent ? `0 4px 12px ${s.color}15` : 'none',
                transition: 'all 0.4s ease'
              }}
          >
            <Box
              onClick={() => setExpanded(p => ({ ...p, [s.key]: !p[s.key] }))}
              sx={{
                position: 'sticky',
                top: 0,
                zIndex: 5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 2,
                py: 1.5,
                bgcolor: expanded[s.key] ? `${s.color}1B` : 'background.paper',
                borderBottom: expanded[s.key] ? '1px solid' : 'none',
                borderColor: 'divider',
                color: expanded[s.key] ? s.color : 'text.primary',
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'all 0.2s ease-in-out',
                backdropFilter: 'blur(8px)',
                borderTopLeftRadius: 8,
                borderTopRightRadius: 8,
                '&:hover': {
                  bgcolor: `${s.color}0A`,
                }
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" fontWeight={600}>{s.label}</Typography>
                <Typography
                  variant="caption"
                  sx={{
                    px: 1,
                    py: 0.25,
                    borderRadius: 1,
                    bgcolor: expanded[s.key] ? `${s.color}24` : 'grey.100',
                    color: expanded[s.key] ? s.color : 'text.secondary',
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  {s.stage}
                </Typography>
                {!expanded[s.key] && (
                  <Typography variant="caption" sx={{ color: 'text.disabled', ml: 0.75 }}>
                    点击展开预览
                  </Typography>
                )}
              </Box>
              <IconButton size="small" sx={{ color: expanded[s.key] ? s.color : 'text.secondary', p: 0 }}>
                {expanded[s.key] ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </IconButton>
            </Box>
            <Collapse in={expanded[s.key]} unmountOnExit={false}>
              <Box sx={{ p: 2, bgcolor: '#ffffff', overflowX: 'hidden' }}>
                {isCurrent && (
                  <Box sx={{ mb: 2, p: 1.5, borderRadius: 1.5, bgcolor: `${s.color}08`, border: `1px dashed ${s.color}33`, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <AutorenewIcon sx={{ fontSize: 18, color: s.color, animation: 'spin 2s linear infinite' }} />
                    <Box sx={{ flex: 1 }}>
                      <LinearProgress sx={{ height: 4, borderRadius: 2, bgcolor: `${s.color}15`, '& .MuiLinearProgress-bar': { bgcolor: s.color } }} />
                      <Typography variant="caption" sx={{ color: s.color, fontWeight: 600, mt: 0.5, display: 'block' }}>
                        {s.key === 'analysis' ? '正在分析需求...' : s.key === 'testcases' ? '正在生成测试用例...' : '正在评审测试用例...'}
                      </Typography>
                    </Box>
                  </Box>
                )}
                <Box 
                  className="stage-markdown" 
                  sx={{ 
                    fontSize: 14, 
                    lineHeight: 1.6, 
                    color: '#334155',
                    '& h1, & h2': { display: 'none' }, // 隐藏重复的阶段标题
                    '& h3': { color: s.color, fontSize: '1.1rem', mt: 2, mb: 1, borderBottom: `1px solid ${s.color}22`, pb: 0.5 },
                    '& p': { m: '0 0 12px', wordBreak: 'break-word' },
                    '& ul, & ol': { pl: 2.5, mb: 1.5 },
                    '& li': { mb: 0.5 },
                    '& code': { bgcolor: '#f1f5f9', px: 0.5, py: 0.2, borderRadius: 0.5, fontSize: '0.9em', color: '#e11d48' },
                    '& table': { 
                      width: '100%', 
                      borderCollapse: 'collapse', 
                      mb: 2, 
                      fontSize: '13px',
                      display: 'table',
                      overflowX: 'auto'
                    },
                    '& th': { bgcolor: '#f8fafc', p: 1, border: '1px solid #e2e8f0', textAlign: 'left', fontWeight: 600 },
                    '& td': { p: 1, border: '1px solid #e2e8f0' },
                    '& blockquote': { borderLeft: `4px solid ${s.color}44`, m: '0 0 16px', pl: 2, color: 'text.secondary', fontStyle: 'italic' }
                  }}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripMarker(text)}</ReactMarkdown>
                </Box>
              </Box>
            </Collapse>
          </Paper>
        );
      })}

      {stageContents.final && (
        <Paper 
          variant="outlined" 
          sx={{ 
            flexShrink: 0, 
            borderRadius: 2.5, 
            borderColor: '#f57c00',
            boxShadow: currentStage === 'final' ? '0 4px 20px rgba(245,124,0,0.15)' : 'none',
            overflow: 'hidden',
            transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
            mb: 2
          }}
        >
          <Box
            onClick={() => setExpanded(p => ({ ...p, final: !p.final }))}
            sx={{
              position: 'sticky',
              top: 0,
              zIndex: 5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 2,
              py: 1.5,
              bgcolor: expanded.final ? 'rgba(245,124,0,0.08)' : 'background.paper',
              borderBottom: expanded.final ? '1px solid' : 'none',
              borderColor: 'rgba(245,124,0,0.2)',
              color: '#e65100',
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'all 0.2s ease-in-out',
              backdropFilter: 'blur(8px)',
              '&:hover': {
                bgcolor: 'rgba(245,124,0,0.04)',
              }
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Box sx={{ 
                width: 24, height: 24, borderRadius: '50%', 
                bgcolor: '#f57c00', color: '#fff', 
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(245,124,0,0.3)'
              }}>
                {isComplete ? <CheckCircleIcon sx={{ fontSize: 16 }} /> : <AutorenewIcon sx={{ fontSize: 16, animation: 'spin 2s linear infinite' }} />}
              </Box>
              <Typography variant="body2" fontWeight={700}>最终测试用例结果</Typography>
              <Chip label="Stage 4" size="small" sx={{ height: 18, fontSize: 10, bgcolor: 'rgba(245,124,0,0.15)', color: '#e65100', fontWeight: 800 }} />
              {isComplete && <Chip label="生成完毕" size="small" color="success" sx={{ height: 18, fontSize: 10, fontWeight: 700 }} />}
            </Box>
            <IconButton size="small" sx={{ color: '#f57c00', p: 0 }}>
              {expanded.final ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          </Box>
          <Collapse in={expanded.final} unmountOnExit={false}>
            <Box sx={{ p: 2, bgcolor: '#ffffff', minHeight: 100 }}>
              {!isComplete && currentStage === 'final' && (
                <Box sx={{ mb: 2, p: 1.5, borderRadius: 1.5, bgcolor: 'rgba(245,124,0,0.04)', border: '1px dashed rgba(245,124,0,0.2)' }}>
                  <LinearProgress color="warning" sx={{ height: 4, borderRadius: 2, mb: 1 }} />
                  <Typography variant="caption" sx={{ color: '#e65100', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <AutorenewIcon sx={{ fontSize: 12, animation: 'spin 2s linear infinite' }} />
                    正在抽取并整理最终结构化测试用例...
                  </Typography>
                </Box>
              )}
              <Box className="stage-markdown" sx={{ 
                fontSize: 14, 
                lineHeight: 1.6, 
                color: '#334155',
                '& h3': { color: '#f57c00', fontSize: '1.2rem', mt: 3, mb: 1.5, borderBottom: '2px solid rgba(245,124,0,0.1)', pb: 0.5 },
                '& h4': { color: '#475569', fontSize: '1rem', mt: 2, mb: 1 },
                '& p': { m: '0 0 12px' },
                '& ul, & ol': { pl: 2.5, mb: 1.5 },
                '& table': { 
                  width: '100%', 
                  borderCollapse: 'collapse', 
                  mb: 3, 
                  fontSize: '13px',
                  display: 'table',
                },
                '& th': { bgcolor: '#f8fafc', p: 1.25, border: '1px solid #e2e8f0', textAlign: 'left', fontWeight: 700, color: '#475569' },
                '& td': { p: 1.25, border: '1px solid #e2e8f0' }
              }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{stageContents.final}</ReactMarkdown>
              </Box>
              {isComplete && (
                <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                    <CheckCircleIcon sx={{ fontSize: 14, color: 'success.main' }} />
                    所有阶段执行完毕，标准功能列表已就绪。
                  </Typography>
                </Box>
              )}
            </Box>
          </Collapse>
        </Paper>
      )}
      </Box>
    </Box>
  );
}
