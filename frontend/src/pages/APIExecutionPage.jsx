import React from 'react';
import { Box, Paper, Stepper, Step, StepLabel, Button } from '@mui/material';
import { APIExecutionProvider, useAPIExecution } from '../features/APIExecution/context';
import LoadingOverlay from '../components/LoadingOverlay';

import Sidebar from '../features/APIExecution/components/Sidebar';
import StepImport from '../features/APIExecution/components/StepImport';
import StepScope from '../features/APIExecution/components/StepScope';
import StepOrchestrate from '../features/APIExecution/components/StepOrchestrate';
import StepResult from '../features/APIExecution/components/StepResult';
import RunHistory from '../features/APIExecution/components/RunHistory';

function APIExecutionContent() {
  const { activeStep, setActiveStep, loading, loadingMessage, dslText } = useAPIExecution();

  return (
    <Box sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', bgcolor: '#f4f7fb', color: 'text.primary' }}>
      <Sidebar />

      {/* MAIN CONTENT AREA */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, bgcolor: '#f4f7fb' }}>
        {/* STEPPER HEADER */}
        <Paper elevation={0} sx={{ p: 3, borderBottom: '1px solid', borderColor: 'divider', borderRadius: 0, bgcolor: '#ffffff' }}>
          <Stepper activeStep={activeStep} alternativeLabel nonLinear>
            <Step><StepLabel>导入规范</StepLabel></Step>
            <Step><StepLabel>挑选范围</StepLabel></Step>
            <Step><StepLabel>编排与执行</StepLabel></Step>
            <Step><StepLabel>执行结果与诊断</StepLabel></Step>
          </Stepper>
        </Paper>

        {/* STEP CONTENT SCROLL AREA */}
        <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 2, md: 4 } }}>
          <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
            {activeStep === 0 && <StepImport />}
            {activeStep === 1 && <StepScope />}
            {activeStep === 2 && <StepOrchestrate />}
            {activeStep === 3 && <StepResult />}

            {/* STEP NAVIGATION */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4, pt: 3, borderTop: '1px solid', borderColor: 'divider' }}>
              <Button disabled={activeStep === 0} onClick={() => setActiveStep(prev => prev - 1)}>上一步</Button>
              {activeStep < 3 && (
                <Button 
                  variant="contained" 
                  disabled={activeStep === 1 && !dslText}
                  onClick={() => setActiveStep(prev => prev + 1)}
                >
                  {activeStep === 1 && !dslText ? '请先生成脚本' : activeStep === 2 ? '查看执行结果' : '下一步'}
                </Button>
              )}
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
