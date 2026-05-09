import React from 'react';
import { Box, Stepper, Step, StepLabel, Button, Fade } from '@mui/material';
import { APIExecutionProvider, useAPIExecution } from '../features/APIExecution/context';
import LoadingOverlay from '../components/LoadingOverlay';

import Sidebar from '../features/APIExecution/components/Sidebar';
import StepImport from '../features/APIExecution/components/StepImport';
import StepScope from '../features/APIExecution/components/StepScope';
import StepOrchestrate from '../features/APIExecution/components/StepOrchestrate';
import StepResult from '../features/APIExecution/components/StepResult';
import RunHistory from '../features/APIExecution/components/RunHistory';

function APIExecutionContent() {
  const { activeStep, setActiveStep, loading, loadingMessage, dslText, runReport, runResult } = useAPIExecution();
  const hasExecutionResult = Boolean(runReport || runResult);
  const nextDisabled = (activeStep === 1 && !dslText) || (activeStep === 2 && !hasExecutionResult);
  const nextLabel = activeStep === 1 && !dslText
    ? '请先生成脚本'
    : activeStep === 2
      ? hasExecutionResult ? '查看执行结果' : '暂无执行结果'
      : '下一步';

  return (
    <Box sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', color: 'text.primary' }}>
      {/* 动态侧边栏：在步骤 0（尚未导入规范）时隐藏，让用户聚焦导入；导入后才显示资产目录 */}
      {activeStep > 0 && (
        <Fade in timeout={500}>
          <Box sx={{ display: 'flex', flexShrink: 0, zIndex: 2, boxShadow: '4px 0 24px rgba(0,0,0,0.02)' }}>
            <Sidebar />
          </Box>
        </Fade>
      )}

      {/* MAIN CONTENT AREA */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
        
        {/* STEP CONTENT SCROLL AREA */}
        <Box sx={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', p: { xs: 2, md: 4, lg: 6 } }}>
          
          {/* 现代悬浮胶囊 Stepper */}
          <Box 
            sx={{ 
              width: '100%', 
              maxWidth: 900, 
              mb: 5, 
              p: 2, 
              borderRadius: 4, 
              bgcolor: 'rgba(255, 255, 255, 0.7)', 
              backdropFilter: 'blur(20px)',
              boxShadow: '0 4px 32px rgba(15, 23, 42, 0.04), inset 0 1px 0 rgba(255, 255, 255, 1)',
              border: '1px solid rgba(255, 255, 255, 0.4)'
            }}
          >
            <Stepper activeStep={activeStep} alternativeLabel nonLinear sx={{ '& .MuiStepLabel-label': { fontWeight: 600 } }}>
              <Step><StepLabel>导入规范</StepLabel></Step>
              <Step><StepLabel>挑选范围</StepLabel></Step>
              <Step><StepLabel>编排与执行</StepLabel></Step>
              <Step><StepLabel>执行结果与诊断</StepLabel></Step>
            </Stepper>
          </Box>

          <Box sx={{ width: '100%', maxWidth: 1080, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {activeStep === 0 && <StepImport />}
            {activeStep === 1 && <StepScope />}
            {activeStep === 2 && <StepOrchestrate />}
            {activeStep === 3 && <StepResult />}

            {/* STEP NAVIGATION */}
            <Box 
              sx={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                mt: 2, 
                p: 3, 
                bgcolor: 'rgba(255, 255, 255, 0.5)',
                backdropFilter: 'blur(10px)',
                borderRadius: 4,
                border: '1px solid rgba(255, 255, 255, 0.6)'
              }}
            >
              <Button 
                variant="outlined" 
                disabled={activeStep === 0} 
                onClick={() => setActiveStep(prev => prev - 1)}
                sx={{ borderRadius: 2, px: 3, fontWeight: 600, bgcolor: 'white' }}
              >
                上一步
              </Button>
              {activeStep < 3 ? (
                <Button 
                  variant={activeStep === 2 && !hasExecutionResult ? 'outlined' : 'contained'}
                  disabled={nextDisabled}
                  onClick={() => setActiveStep(prev => prev + 1)}
                  sx={{ borderRadius: 2, px: 4, fontWeight: 600, boxShadow: '0 4px 14px rgba(99, 102, 241, 0.25)' }}
                >
                  {nextLabel}
                </Button>
              ) : <Box />}
            </Box>
            
            <RunHistory />
          </Box>
        </Box>
      </Box>
      
      {loading && loadingMessage && <LoadingOverlay message={loadingMessage} />}
    </Box>
  );
}

export default function APIExecutionPage() {
  return (
    <APIExecutionProvider>
      <APIExecutionContent />
    </APIExecutionProvider>
  );
}
