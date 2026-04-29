import re
import os

file_path = 'frontend/src/pages/APIExecutionPage.jsx'
with open(file_path, 'r') as f:
    content = f.read()

start_logic = content.find('  const showSnackbar = useSnackbar();')
end_logic = content.find('  return (\n    <Box sx={{ display: \'flex\', flex: 1, minHeight: 0, overflow: \'hidden\', bgcolor: \'#f4f7fb\', color: \'text.primary\' }}>')

if start_logic == -1 or end_logic == -1:
    print('Could not find boundaries')
    exit(1)

logic_block = content[start_logic:end_logic]
jsx_block = content[end_logic:]

var_names = []

state_matches = re.findall(r'const \[([\w]+), ([\w]+)\] = useState', logic_block)
for match in state_matches:
    var_names.extend(match)

ref_matches = re.findall(r'const ([\w]+) = useRef', logic_block)
var_names.extend(ref_matches)

func_matches = re.findall(r'const ([\w]+) = (?:async )?\(.*\) =>', logic_block)
var_names.extend(func_matches)

func_matches_2 = re.findall(r'const ([\w]+) = useMemo', logic_block)
var_names.extend(func_matches_2)

# Specific extractions
func_matches_3 = re.findall(r'function ([\w]+)\(', logic_block)
var_names.extend(func_matches_3)

# Variables like visibleOperationIds
var_matches_4 = re.findall(r'const ([\w]+) = filteredOperations\.map', logic_block)
var_names.extend(var_matches_4)
var_matches_5 = re.findall(r'const ([\w]+) = useMemo', logic_block)
var_names.extend(var_matches_5)

var_names.extend(['showSnackbar'])

var_names = list(dict.fromkeys(var_names))
if 'parsedScript' not in var_names: var_names.append('parsedScript')
if 'visibleOperationIds' not in var_names: var_names.append('visibleOperationIds')

context_file_content = """import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSnackbar } from '../../../components/SnackbarProvider';
import { apiExecutionAPI } from '../../../api/execution';
import {
  BATCH_RUN_MAX_STEPS,
  BATCH_STEP_TIMEOUT_MS,
  BATCH_REQUEST_TIMEOUT_MS,
  BACKGROUND_STEP_TIMEOUT_MS,
  BACKGROUND_RUN_TIMEOUT_MS,
  NEW_PROJECT_VALUE,
  NEW_ENVIRONMENT_VALUE
} from './constants';
import {
  getTagNames,
  buildReportFilename,
  buildDownloadTimestamp,
  validateBaseUrl,
  downloadBlob,
  mergeScriptVariables,
  toRunRequestOptions,
  formatLineList,
  parseJsonObjectText,
  parseLineList,
  normalizeTimeoutMs,
  normalizeNonNegativeInt,
  maskSensitiveConfig
} from './utils';

const APIExecutionContext = createContext();

export const useAPIExecution = () => {
  const context = useContext(APIExecutionContext);
  if (!context) {
    throw new Error('useAPIExecution must be used within an APIExecutionProvider');
  }
  return context;
};

export const APIExecutionProvider = ({ children }) => {
""" + logic_block + """
  const value = {
    """ + ',\n    '.join(var_names) + """
  };

  return (
    <APIExecutionContext.Provider value={value}>
      {children}
    </APIExecutionContext.Provider>
  );
};
"""

with open('frontend/src/features/APIExecution/context.jsx', 'w') as f:
    f.write(context_file_content)

new_page_content = content[:start_logic] + """
import { APIExecutionProvider, useAPIExecution } from '../features/APIExecution/context';

function APIExecutionContent() {
  const {
    """ + ',\n    '.join(var_names) + """
  } = useAPIExecution();

""" + jsx_block + """

export default function APIExecutionPage() {
  return (
    <APIExecutionProvider>
      <APIExecutionContent />
    </APIExecutionProvider>
  );
}
"""
# remove the export default function APIExecutionPage() from the beginning
new_page_content = new_page_content.replace('export default function APIExecutionPage() {', '')

with open(file_path, 'w') as f:
    f.write(new_page_content)

print('Context successfully extracted.')
