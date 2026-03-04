import React, { useState } from 'react';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Chip from '@mui/material/Chip';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const TestCaseDisplay = ({ testCases = [], onExportToExcel }) => {
  // 生成Markdown格式的测试用例
  const generateMarkdown = (testCases) => {
    if (!testCases || testCases.length === 0) return '';

    let markdown = '# 生成的测试用例\n\n';

    testCases.forEach((testCase, index) => {
      markdown += `## ${testCase.id || `TC-${index + 1}`}: ${testCase.title}\n\n`;

      if (testCase.priority) {
        markdown += `**优先级:** ${testCase.priority}\n\n`;
      }

      markdown += `**描述:** ${testCase.description}\n\n`;

      if (testCase.preconditions) {
        markdown += `**前置条件:** ${testCase.preconditions}\n\n`;
      }

      markdown += `### 测试步骤\n\n`;
      markdown += `| # | 步骤描述 | 预期结果 |\n`;
      markdown += `| --- | --- | --- |\n`;

      testCase.steps.forEach(step => {
        markdown += `| ${step.step_number} | ${step.description} | ${step.expected_result} |\n`;
      });

      markdown += '\n\n';
    });

    return markdown;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="body1" color="text.secondary">
          已生成 {testCases.length} 个测试用例
        </Typography>
      </Box>

      <Box sx={{
        flexGrow: 1,
        overflow: 'auto',
        bgcolor: '#f8f9fa',
        p: 3,
        borderRadius: 1,
        maxHeight: '600px'
      }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {generateMarkdown(testCases)}
        </ReactMarkdown>
      </Box>
    </Box>
  );
};

export default TestCaseDisplay;
