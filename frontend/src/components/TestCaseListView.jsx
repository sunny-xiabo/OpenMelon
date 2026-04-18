import { Box, Typography, Paper } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function generateMarkdown(testCases) {
  if (!testCases?.length) return '';
  let md = '# 生成的测试用例\n\n';
  testCases.forEach((tc, i) => {
    md += `## ${tc.id || `TC-${i + 1}`}: ${tc.title}\n\n`;
    if (tc.priority) md += `**优先级:** ${tc.priority}\n\n`;
    md += `**描述:** ${tc.description}\n\n`;
    if (tc.preconditions) md += `**前置条件:** ${tc.preconditions}\n\n`;
    md += `### 测试步骤\n\n`;
    md += `| # | 步骤描述 | 预期结果 |\n`;
    md += `| --- | --- | --- |\n`;
    (tc.steps || []).forEach(step => {
      md += `| ${step.step_number} | ${step.description} | ${step.expected_result} |\n`;
    });
    md += '\n\n';
  });
  return md;
}

export default function TestCaseListView({ testCases }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
        已生成 {testCases.length} 个测试用例
      </Typography>
      <Paper
        variant="outlined"
        className="chat-markdown"
        sx={{
          flex: 1,
          overflow: 'auto',
          bgcolor: '#ffffff',
          p: 2,
          maxHeight: 600,
          borderRadius: 2.5
        }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{generateMarkdown(testCases)}</ReactMarkdown>
      </Paper>
    </Box>
  );
}
