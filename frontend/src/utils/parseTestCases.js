/**
 * 从 AI 生成的 markdown 文本中解析出结构化 TestCase 对象数组。
 * 参照 testcase_generator_platform 的 parseTestCasesFromMarkdown 实现。
 */
export function parseTestCasesFromMarkdown(markdownText) {
  if (!markdownText) return [];

  let targetText = markdownText;
  
  // 查找特殊标记，模型通常会输出 **===最终测试用例===**
  const finalMatch = markdownText.match(/\*\*[:\s]*=*最终测试用例=*[:\s]*\*\*/i) || markdownText.match(/={2,3}最终测试用例={2,3}/i);
  
  if (finalMatch) {
    targetText = markdownText.substring(finalMatch.index + finalMatch[0].length);
  } else {
    const tcMatch = markdownText.match(/#\s*测试用例生成阶段/);
    const reviewMatch = markdownText.match(/#\s*测试用例评审阶段/);
    if (tcMatch) {
      if (reviewMatch) {
        // 如果存在评审阶段但还没输出“最终测试用例”标记，有可能还在评审中，保留全本以防截断有效用例
        // targetText = markdownText.substring(tcMatch.index, reviewMatch.index);
        targetText = markdownText.substring(tcMatch.index);
      } else {
        targetText = markdownText.substring(tcMatch.index);
      }
    }
  }

  const testCases = [];
  const lines = targetText.split('\n');

  let currentTestCase = null;
  let currentSteps = [];
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 跳过文件信息行和分隔线
    if (/^\*\*文件信息\*\*$/.test(line) ||
        /^-\s+(文件类型|使用模型)[:：]/.test(line) ||
        /^---+$/.test(line)) {
      continue;
    }

    // 检测新测试用例: ##/### TC-001: 标题 / ##/### 测试用例 1: 标题 / ##/### Test Case 1: 标题
    if (/^#{2,3}\s+(TC[-_]?\d+|测试用例\s*\d+|Test\s*Case\s*\d+)[\s:：]/i.test(line)) {
      saveCurrent();
      const m = line.match(/^#{2,3}\s+(TC[-_]?\d+|测试用例\s*(\d+)|Test\s*Case\s*(\d+))[\s:：]\s*(.+)$/i);
      if (m) {
        let id = m[1];
        let title = m[m.length - 1];
        if (!id.startsWith('TC')) {
          const num = id.match(/\d+/);
          id = num ? `TC-${num[0].padStart(3, '0')}` : `TC-${String(testCases.length + 1).padStart(3, '0')}`;
        }
        currentTestCase = { id, title: title.trim(), description: '', preconditions: '', priority: 'Medium' };
        currentSteps = [];
        inTable = false;
      }
    }
    // 检测 ##/### 1. 标题 格式
    else if (/^#{2,3}\s+\d+[\.\\)]\s+.+/.test(line)) {
      saveCurrent();
      const m = line.match(/^#{2,3}\s+(\d+)[\.\\)]\s+(.+)$/);
      if (m) {
        currentTestCase = {
          id: `TC-${m[1].padStart(3, '0')}`,
          title: m[2].trim(),
          description: '', preconditions: '', priority: 'Medium',
        };
        currentSteps = [];
        inTable = false;
      }
    }
    // 通用 ##/### 标题
    else if (/^#{2,4}\s+.+/.test(line)) {
      const title = line.replace(/^#{2,4}\s+/, '').trim();
      if (/^(文件信息|File\s*Info|正在生成|Generating|生成完成|Complete|测试步骤|测试用例评审|需求分析|评审报告|优点|问题|改进|覆盖|功能概述|功能需求|非功能性|交互需求|数据需求|异常场景|Overview|Summary|建议|重点|规则)/i.test(title)) {
        // 如果是特殊标题且当前有用例，说明该用例结束了
        saveCurrent();
        continue;
      }
      
      saveCurrent();
      currentTestCase = {
        id: `TC-${String(testCases.length + 1).padStart(3, '0')}`,
        title, description: '', preconditions: '', priority: 'Medium',
      };
      currentSteps = [];
      inTable = false;
    }
    // 优先级
    else if (/^\*\*(优先级|Priority):\*\*/i.test(line) && currentTestCase) {
      currentTestCase.priority = line.replace(/^\*\*(优先级|Priority):\*\*\s*/i, '').trim();
    }
    // 描述
    else if (/^\*\*(描述|Description):\*\*/i.test(line) && currentTestCase) {
      currentTestCase.description = line.replace(/^\*\*(描述|Description):\*\*\s*/i, '').trim();
    }
    // 前置条件
    else if (/^\*\*(前置条件|Preconditions?):\*\*/i.test(line) && currentTestCase) {
      currentTestCase.preconditions = line.replace(/^\*\*(前置条件|Preconditions?):\*\*\s*/i, '').trim();
    }
    // 表格分隔行
    else if (/^\|\s*[-:]+\s*\|\s*[-:]+\s*\|/.test(line)) {
      inTable = true;
    }
    // 表格头行（无分隔行时）
    else if (!inTable && /^\|\s*#?\s*\|\s*(步骤|操作|Step)\s*\|\s*(预期|结果|Expected)\s*\|/i.test(line)) {
      inTable = true;
    }
    // 表格数据行
    else if (inTable && /^\|.*\|.*\|/.test(line)) {
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length >= 2) {
        // 跳过表头
        if (/^#?$|^序号$|^步骤号$/i.test(cells[0]) || /^(步骤|操作|Step)/i.test(cells[1])) continue;
        let stepNum = parseInt(cells[0]);
        if (isNaN(stepNum)) {
          const nm = cells[0].match(/\d+/);
          stepNum = nm ? parseInt(nm[0]) : currentSteps.length + 1;
        }
        currentSteps.push({
          step_number: stepNum,
          description: cells[1] || '执行操作',
          expected_result: cells[2] || '验证操作成功',
        });
      }
    }
    // 非表格格式: 1. xxx
    else if (currentTestCase && /^\d+[\.\)]\s+.+/.test(line) && !inTable) {
      const m = line.match(/^(\d+)[\.\)]\s+(.+)$/);
      if (m) {
        let expectedResult = '验证操作成功';
        if (i + 1 < lines.length) {
          const next = lines[i + 1].trim();
          if (/^(预期|期望|结果|Expected)[:：]/i.test(next)) {
            expectedResult = next.replace(/^(预期|期望|结果|Expected)[:：]\s*/i, '');
          }
        }
        currentSteps.push({ step_number: parseInt(m[1]), description: m[2].trim(), expected_result: expectedResult });
      }
    }
    // 遇到新的 ## 结束表格
    else if (/^##/.test(line) && inTable) {
      inTable = false;
    }
  }

  saveCurrent();
  return testCases;

  function saveCurrent() {
    if (currentTestCase && currentTestCase.title && currentTestCase.title.trim()) {
      currentTestCase.steps = currentSteps.map((step, index) => ({
        ...step,
        step_number: index + 1,
      }));
      testCases.push(currentTestCase);
    }
    currentTestCase = null;
    currentSteps = [];
  }
}
