import os
import re

file_path = 'frontend/src/pages/APIExecutionPage.jsx'
with open(file_path, 'r') as f:
    content = f.read()

# Create components directory
os.makedirs('frontend/src/features/APIExecution/components', exist_ok=True)

# 1. Extract SectionCard
section_card_match = re.search(r'function SectionCard\(\{.*?return \(\n.*?</Paper>\n  \);\n}', content, re.DOTALL)
if section_card_match:
    section_card_code = section_card_match.group(0)
    # create SectionCard.jsx
    with open('frontend/src/features/APIExecution/components/SectionCard.jsx', 'w') as f:
        f.write('''import React from 'react';
import { Paper, Box, Stack, Typography } from '@mui/material';

const cardSx = {
  border: '1px solid',
  borderColor: 'rgba(148, 163, 184, 0.18)',
  borderRadius: 4,
  bgcolor: 'rgba(255,255,255,0.96)',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.04)',
};

export default ''' + section_card_code + '\n')

# 2. Extract Sidebar
sidebar_start = content.find('{/* LEFT SIDEBAR - API Flow */}')
sidebar_end = content.find('{/* MAIN CONTENT AREA */}')
sidebar_jsx = content[sidebar_start:sidebar_end].strip()

with open('frontend/src/features/APIExecution/components/Sidebar.jsx', 'w') as f:
    f.write('''import React from 'react';
import { Paper, Box, Typography, TextField, Stack, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Chip, Collapse } from '@mui/material';
import { AutoAwesomeOutlined, RouteOutlined } from '@mui/icons-material';
import { useAPIExecution } from '../context';
import EmptyState from '../../../components/EmptyState';
import { METHOD_COLORS } from '../constants';
import { getTagNames } from '../utils';

export default function Sidebar() {
  const {
    spec, searchText, setSearchText, tagOptions, filteredOperations, 
    toggleOperation, selectedOperationIds, activeStep
  } = useAPIExecution();

  return (
    ''' + sidebar_jsx + '''
  );
}
''')

# 3. Extract StepImport
step0_start = content.find('{/* STEP 0: IMPORT */}')
step0_end = content.find('{/* STEP 1: SCOPE */}')
# We need to strip the wrapping `{activeStep === 0 && (` and `)}`
step0_block = content[step0_start:step0_end].strip()
step0_jsx = re.sub(r'^\{\/\* STEP 0: IMPORT \*\/}\n\s*\{activeStep === 0 && \(\n', '', step0_block)
step0_jsx = re.sub(r'\n\s*\)\}$', '', step0_jsx).strip()

with open('frontend/src/features/APIExecution/components/StepImport.jsx', 'w') as f:
    f.write('''import React from 'react';
import { Stack, Typography, Paper, Box, Button, TextField, FormControl, InputLabel, Select, MenuItem, Checkbox } from '@mui/material';
import { CloudUploadOutlined } from '@mui/icons-material';
import { useAPIExecution } from '../context';
import { NEW_PROJECT_VALUE, NEW_ENVIRONMENT_VALUE, ENVIRONMENT_TYPE_OPTIONS } from '../constants';

export default function StepImport() {
  const {
    fileInputRef, setSelectedFile, selectedFile, parseFile, sourceUrl, setSourceUrl, parseUrl,
    projects, selectedProjectId, applyProjectValues, loadEnvironments, setProjectName,
    environments, selectedEnvironmentId, applyEnvironmentValues,
    projectName, environmentName, environmentType, setEnvironmentType,
    environmentTimeoutMs, setEnvironmentTimeoutMs, baseUrl, setBaseUrl,
    environmentVariablesText, setEnvironmentVariablesText,
    allowAiGenerateDsl, setAllowAiGenerateDsl, allowAiExecution, setAllowAiExecution,
    allowAiRepair, setAllowAiRepair, allowScheduledExecution, setAllowScheduledExecution,
    allowOverwriteHistory, setAllowOverwriteHistory, maxAutoRepairs, setMaxAutoRepairs,
    maxReruns, setMaxReruns, maxRequestsPerRun, setMaxRequestsPerRun,
    operationAllowlistText, setOperationAllowlistText, operationBlocklistText, setOperationBlocklistText,
    riskOverridesText, setRiskOverridesText, saveCurrentEnvironment, handleDeleteEnvironment, handleDeleteProject,
    setSelectedProjectId, setSelectedEnvironmentId, setEnvironments, setEnvironmentName, spec
  } = useAPIExecution();

  return (
    ''' + step0_jsx + '''
  );
}
''')

# 4. Extract StepScope
step1_start = content.find('{/* STEP 1: SCOPE */}')
step1_end = content.find('{/* STEP 2: ORCHESTRATE */}')
step1_block = content[step1_start:step1_end].strip()
step1_jsx = re.sub(r'^\{\/\* STEP 1: SCOPE \*\/}\n\s*\{activeStep === 1 && \(\n', '', step1_block)
step1_jsx = re.sub(r'\n\s*\)\}$', '', step1_jsx).strip()

with open('frontend/src/features/APIExecution/components/StepScope.jsx', 'w') as f:
    f.write('''import React from 'react';
import { Stack, Box, Typography, Button, Checkbox, Chip } from '@mui/material';
import { useAPIExecution } from '../context';
import SectionCard from './SectionCard';
import EmptyState from '../../../components/EmptyState';
import { METHOD_COLORS } from '../constants';

export default function StepScope() {
  const {
    spec, selectedOperationIds, generateDsl, visibleOperationIds, toggleVisibleOperations,
    filteredOperations, toggleOperation
  } = useAPIExecution();

  return (
    ''' + step1_jsx + '''
  );
}
''')

# 5. Extract StepOrchestrate
step2_start = content.find('{/* STEP 2: ORCHESTRATE */}')
step2_end = content.find('{/* STEP 3: RUN & TROUBLESHOOT */}')
step2_block = content[step2_start:step2_end].strip()
step2_jsx = re.sub(r'^\{\/\* STEP 2: ORCHESTRATE \*\/}\n\s*\{activeStep === 2 && \(\n', '', step2_block)
step2_jsx = re.sub(r'\n\s*\)\}$', '', step2_jsx).strip()

with open('frontend/src/features/APIExecution/components/StepOrchestrate.jsx', 'w') as f:
    f.write('''import React from 'react';
import { Stack, Box, Typography, Button, TextField, FormControl, InputLabel, Select, MenuItem, Checkbox, Paper } from '@mui/material';
import { AutoAwesomeOutlined, PlayCircleOutlineOutlined } from '@mui/icons-material';
import { useAPIExecution } from '../context';
import SectionCard from './SectionCard';
import { ASSERTION_TYPES, EXTRACTION_SOURCES } from '../constants';

export default function StepOrchestrate() {
  const {
    dslText, setDslText, enhanceDslWithAi, globalHeadersText, setGlobalHeadersText,
    bearerToken, setBearerToken, parsedScript, runStepId, setRunStepId, assertionStepId,
    setAssertionStepId, assertionType, setAssertionType, assertionExpected, setAssertionExpected,
    insertAssertion, runSelectedStep, runAllSteps, runAllStepsInBackground, loading
  } = useAPIExecution();

  return (
    ''' + step2_jsx + '''
  );
}
''')

# 6. Extract StepResult
step3_start = content.find('{/* STEP 3: RUN & TROUBLESHOOT */}')
step3_end = content.find('{/* STEP NAVIGATION */}')
step3_block = content[step3_start:step3_end].strip()
step3_jsx = re.sub(r'^\{\/\* STEP 3: RUN & TROUBLESHOOT \*\/}\n\s*\{activeStep === 3 && \(\n', '', step3_block)
step3_jsx = re.sub(r'\n\s*\)\}$', '', step3_jsx).strip()

with open('frontend/src/features/APIExecution/components/StepResult.jsx', 'w') as f:
    f.write('''import React from 'react';
import { Stack, Box, Typography, Button, Chip, Divider, Paper, Alert } from '@mui/material';
import { AutoAwesomeOutlined, DescriptionOutlined, RocketLaunchOutlined } from '@mui/icons-material';
import { useAPIExecution } from '../context';
import SectionCard from './SectionCard';
import { getRunStatusMeta, formatRunTime, getSeverityColor } from '../utils';

export default function StepResult() {
  const {
    runResult, runReport, parsedScript, loading, exportRunReport, exportPytestScript, exportPostmanCollection,
    generateAiRepairPatch, aiPatch, applyAiPatch, rerunFailedSteps, setActiveStep
  } = useAPIExecution();

  return (
    ''' + step3_jsx + '''
  );
}
''')

# 7. Extract RunHistory
history_start = content.find(' {/* RUN HISTORY */}')
history_end = content.find('          </Box>\n        </Box>\n      </Box>\n    </Box>\n  );\n}')
history_block = content[history_start:history_end].strip()

with open('frontend/src/features/APIExecution/components/RunHistory.jsx', 'w') as f:
    f.write('''import React from 'react';
import { Box, Typography, Stack, Button, TextField, FormControl, InputLabel, Select, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip } from '@mui/material';
import { RefreshOutlined, EditOutlined, HistoryOutlined, LinkOutlined, AutoAwesomeOutlined } from '@mui/icons-material';
import { useAPIExecution } from '../context';
import { getRunStatusMeta, formatRunTime, getRunModeLabel, getEnvironmentTypeLabel } from '../utils';

export default function RunHistory() {
  const {
    projects, runHistoryProjectId, setRunHistoryProjectId, runHistoryStatus, setRunHistoryStatus,
    runHistoryKeyword, setRunHistoryKeyword, fetchHistory, backgroundRunId, backgroundRunStatus,
    refreshBackgroundRun, cancelBackgroundRun, runHistory, handleDeleteRun, loadRunIntoEditor,
    handleReplayRun, handleAutoRepairRun, automationTasks, handleResolveAutomationTask,
    handleTriggerScheduledRuns, handleTriggerSpecSync, handleIngestRunKnowledge, handleApproveKnowledgeCandidate
  } = useAPIExecution();

  return (
    ''' + history_block + '''
  );
}
''')

print("All components extracted successfully.")
