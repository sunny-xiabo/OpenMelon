import { getAssertionTypeLabel } from '../constants';
import { escapeHtml, formatDuration } from './index';

export const safeJsonPreview = (value) => {
  if (value === null || value === undefined || value === '') return '未记录';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export const getReportStatusTheme = (status) => {
  if (status === 'passed') return { label: '通过', color: '#1e8e3e', bg: '#e6f4ea', border: 'rgba(30, 142, 62, 0.2)' };
  if (status === 'running') return { label: '执行中', color: '#1a73e8', bg: '#e8f0fe', border: 'rgba(26, 115, 232, 0.2)' };
  if (status === 'queued') return { label: '排队中', color: '#e37400', bg: '#fef7e0', border: 'rgba(227, 116, 0, 0.2)' };
  if (status === 'cancelled') return { label: '已取消', color: '#5f6368', bg: '#f1f3f4', border: 'rgba(95, 99, 104, 0.2)' };
  return { label: '失败', color: '#d93025', bg: '#fce8e6', border: 'rgba(217, 48, 37, 0.2)' };
};

export const getMethodClass = (method = '') => {
  const normalized = String(method).toLowerCase();
  return ['get', 'post', 'put', 'patch', 'delete'].includes(normalized) ? normalized : 'default';
};

export const buildMetricCard = (label, value, tone = 'neutral') => `
  <div class="metric-card">
    <div class="metric-label">${escapeHtml(label)}</div>
    <div class="metric-value val-${tone}">${escapeHtml(value)}</div>
  </div>
`;

export const buildReqResHtml = (request, response) => {
  let html = '';

  const formatBlock = (title, data) => {
    if (data === null || data === undefined) return '';
    if (typeof data === 'object' && !Object.keys(data).length) return '';
    let parsed = data;
    if (typeof data === 'string') {
      try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
    }
    return `
      <div style="margin-bottom: 6px;">
        <div style="color: var(--text-secondary); margin-bottom: 4px; font-size: 11px; text-transform: uppercase;">${escapeHtml(title)}</div>
        <div style="background: rgba(0,0,0,0.04); border: 1px solid rgba(0,0,0,0.05); padding: 8px; border-radius: 4px; overflow-x: auto;">${escapeHtml(safeJsonPreview(parsed))}</div>
      </div>
    `;
  };

  if (request) {
    const reqHeaders = formatBlock('Headers', request.headers);
    const reqQuery = formatBlock('Query', request.query);
    const reqBody = formatBlock('Body', request.body);
    const reqContent = reqHeaders + reqQuery + reqBody;

    if (reqContent) {
      html += '<div style="margin-bottom: 16px;">';
      html += '<div style="font-weight: 600; color: var(--primary); margin-bottom: 8px; font-size: 13px; border-bottom: 1px solid var(--divider); padding-bottom: 4px;">Request</div>';
      html += reqContent;
      html += '</div>';
    }
  }

  if (response) {
    const resHeaders = formatBlock('Headers', response.headers);
    const resBody = formatBlock('Body Preview', response.body_preview || response.body);
    const resContent = resHeaders + resBody;

    if (resContent) {
      html += '<div>';
      html += '<div style="font-weight: 600; color: var(--success); margin-bottom: 8px; font-size: 13px; border-bottom: 1px solid var(--divider); padding-bottom: 4px;">Response</div>';
      html += resContent;
      html += '</div>';
    }
  }

  return html;
};

export const buildAssertionsHtml = (assertions = []) => {
  if (!assertions.length) {
    return '<div style="color: var(--text-secondary); font-size: 13px;">未记录断言结果</div>';
  }

  return `
    <div style="display: flex; flex-direction: column; gap: 10px;">
      ${assertions.map((assertion, index) => {
        const passed = Boolean(assertion.passed);
        return `
          <div style="border: 1px solid ${passed ? 'rgba(30, 142, 62, 0.22)' : 'rgba(217, 48, 37, 0.22)'}; background: ${passed ? 'var(--success-light)' : 'var(--danger-light)'}; border-radius: 8px; padding: 12px;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="badge" style="background: ${passed ? '#fff' : '#fff'}; border: 1px solid ${passed ? 'rgba(30, 142, 62, 0.22)' : 'rgba(217, 48, 37, 0.22)'}; color: ${passed ? 'var(--success)' : 'var(--danger)'};">
                  ${passed ? '通过' : '失败'}
                </span>
                <strong style="font-size: 13px; color: var(--text-primary);">${escapeHtml(getAssertionTypeLabel(assertion.type) || `断言 ${index + 1}`)}</strong>
              </div>
              ${assertion.path ? `<code class="inline-code">${escapeHtml(assertion.path)}</code>` : ''}
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px;">
              <div>
                <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px;">Expected</div>
                <div class="code-block" style="margin-top: 0; padding: 10px;">${escapeHtml(safeJsonPreview(assertion.expected))}</div>
              </div>
              <div>
                <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px;">Actual</div>
                <div class="code-block" style="margin-top: 0; padding: 10px; color: ${passed ? 'var(--text-secondary)' : 'var(--danger)'};">${escapeHtml(safeJsonPreview(assertion.actual))}</div>
              </div>
            </div>
            ${assertion.message ? `<div style="font-size: 13px; color: ${passed ? 'var(--text-secondary)' : 'var(--danger)'}; margin-top: 8px;">${escapeHtml(assertion.message)}</div>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
};

export const buildStepRows = (results = []) => {
  if (!results.length) {
    return '<tr><td colspan="9" style="text-align:center; padding: 48px; color: var(--text-secondary); font-size: 14px;">暂无步骤结果</td></tr>';
  }
  return results.map((result, index) => {
    const theme = getReportStatusTheme(result.status);
    const error = result.error || (result.assertions || []).filter((item) => !item.passed).map((item) => item.message || item.type).filter(Boolean).join('；') || '';

    const reqResHtml = buildReqResHtml(result.request, result.response);
    const assertions = result.assertions || [];
    const assertionsHtml = buildAssertionsHtml(assertions);
    const failedAssertionCount = assertions.filter((item) => !item.passed).length;
    const stepTitle = result.name || `第 ${index + 1} 步`;

    return `
      <tr>
        <td style="color: var(--text-secondary); vertical-align: top;">${index + 1}</td>
        <td style="vertical-align: top;"><span class="method method-${getMethodClass(result.method)}">${escapeHtml(result.method || '-')}</span></td>
        <td style="font-family: 'SFMono-Regular', Consolas, monospace; font-size: 13px; color: var(--text-secondary); word-break: break-all; vertical-align: top; max-width: 300px;">${escapeHtml(result.url || '-')}</td>
        <td style="font-family: 'SFMono-Regular', Consolas, monospace; vertical-align: top;">${escapeHtml(result.status_code ?? '-')}</td>
        <td style="color: var(--text-secondary); vertical-align: top;">${escapeHtml(formatDuration(result.duration_ms))}</td>
        <td style="vertical-align: top;"><span class="badge" style="background:${theme.bg};border:1px solid ${theme.border};color:${theme.color};">${escapeHtml(theme.label)}</span></td>
        <td style="vertical-align: top;">
          ${assertions.length ? `
            <label for="modal-assert-${index}" style="cursor: pointer; font-weight: 500; color: ${failedAssertionCount ? 'var(--danger)' : 'var(--success)'}; text-decoration: underline; text-underline-offset: 4px; font-size: 13px;">
              ${assertions.length} 条 / ${failedAssertionCount ? `${failedAssertionCount} 失败` : '全部通过'}
            </label>
            <input type="checkbox" id="modal-assert-${index}" class="modal-toggle" style="display:none;" />
            <div class="modal-overlay">
              <div class="modal-content">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--divider); padding-bottom: 12px; margin-bottom: 16px;">
                  <span style="font-size: 16px; font-weight: 600; color: var(--text-primary);">断言结果 - ${escapeHtml(stepTitle)}</span>
                  <label for="modal-assert-${index}" style="cursor: pointer; font-size: 18px; color: var(--text-secondary);">&times;</label>
                </div>
                ${assertionsHtml}
              </div>
            </div>
          ` : '<span style="color: var(--text-secondary);">未记录</span>'}
        </td>
        <td style="color: var(--danger); font-size: 13px; word-break: break-all; vertical-align: top; max-width: 300px;">
          ${error ? `
            <label for="modal-err-${index}" style="cursor: pointer; font-weight: 500; color: var(--danger); text-decoration: underline; text-underline-offset: 4px;">查看错误</label>
            <input type="checkbox" id="modal-err-${index}" class="modal-toggle" style="display:none;" />
            <div class="modal-overlay">
              <div class="modal-content">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--divider); padding-bottom: 12px; margin-bottom: 16px;">
                  <span style="font-size: 16px; font-weight: 600; color: var(--danger);">错误详情 - ${escapeHtml(stepTitle)}</span>
                  <label for="modal-err-${index}" style="cursor: pointer; font-size: 18px; color: var(--text-secondary);">&times;</label>
                </div>
                <div style="font-family: 'SFMono-Regular', Consolas, monospace; font-size: 13px; background: #fff9f9; padding: 16px; border-radius: 6px; border: 1px solid var(--danger-light); color: var(--danger); white-space: pre-wrap; overflow: auto;">${escapeHtml(error)}</div>
              </div>
            </div>
          ` : '-'}
        </td>
        <td style="vertical-align: top; max-width: 350px;">
          ${reqResHtml ? `
            <label for="modal-req-${index}" style="cursor: pointer; font-weight: 500; color: var(--primary); text-decoration: underline; text-underline-offset: 4px; font-size: 13px;">查看报文</label>
            <input type="checkbox" id="modal-req-${index}" class="modal-toggle" style="display:none;" />
            <div class="modal-overlay">
              <div class="modal-content">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--divider); padding-bottom: 12px; margin-bottom: 16px;">
                  <span style="font-size: 16px; font-weight: 600; color: var(--text-primary);">请求/响应报文 - ${escapeHtml(stepTitle)}</span>
                  <label for="modal-req-${index}" style="cursor: pointer; font-size: 18px; color: var(--text-secondary);">&times;</label>
                </div>
                <div style="font-family: 'SFMono-Regular', Consolas, monospace; font-size: 13px; color: var(--text-secondary); white-space: pre-wrap; overflow: auto;">${reqResHtml}</div>
              </div>
            </div>
          ` : '-'}
        </td>
      </tr>
    `;
  }).join('');
};

export const buildFailureDiagnostics = (report) => {
  const failedResults = (report?.results || []).filter((result) => result.status !== 'passed');
  if (!failedResults.length) {
    return `
      <div class="mui-paper">
        <div class="panel-title">失败诊断</div>
        <div style="background: var(--success-light); border: 1px solid rgba(30, 142, 62, 0.2); color: var(--success); padding: 16px; border-radius: 8px; display: flex; align-items: center; gap: 8px; font-weight: 500;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>
          本次执行没有失败步骤，无需诊断。
        </div>
      </div>
    `;
  }
  const items = failedResults.map((result) => {
    const failedAssertions = (result.assertions || []).filter((item) => !item.passed);
    const diagnostics = result.diagnostics || [];
    return `
      <div class="diagnostic-card">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
          <span class="method method-${getMethodClass(result.method)}">${escapeHtml(result.method || '-')}</span>
          <strong style="font-size: 15px; color: var(--text-primary);">${escapeHtml(result.name || result.step_id || '未命名步骤')}</strong>
        </div>
        <div style="font-family: 'SFMono-Regular', Consolas, monospace; font-size: 13px; color: var(--text-secondary); margin-bottom: 16px; word-break: break-all; padding-left: 2px;">
          ${escapeHtml(result.url || '')}
        </div>
        ${result.error ? `<div style="color: var(--danger); margin-bottom: 16px; font-weight: 500; display: flex; gap: 6px; align-items: flex-start;"><span style="margin-top: 1px;">❌</span> <span>${escapeHtml(result.error)}</span></div>` : ''}

        ${failedAssertions.length ? `
          <div class="diag-section">
            <div class="diag-section-title">断言失败</div>
            ${failedAssertions.map((assertion) => `
              <div style="margin-bottom: 8px; font-size: 13px;">
                <span style="color: var(--text-secondary); font-weight: 500;">${escapeHtml(getAssertionTypeLabel(assertion.type))}</span>:
                ${assertion.path ? `路径 <code class="inline-code">${escapeHtml(assertion.path)}</code>，` : ''}
                期望 <code class="inline-code">${escapeHtml(safeJsonPreview(assertion.expected))}</code>，
                实际 <code class="inline-code" style="color:var(--danger); background: var(--danger-light);">${escapeHtml(safeJsonPreview(assertion.actual))}</code>
                ${assertion.message ? `<div style="margin-top: 6px; color: var(--text-secondary)">${escapeHtml(assertion.message)}</div>` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${diagnostics.length ? `
          <div class="diag-section" style="margin-top: 16px; background: #f8fbff; border-color: #e1f0fe;">
            <div class="diag-section-title" style="color: var(--primary)">AI 诊断建议</div>
            ${diagnostics.map((diagnostic) => `
              <div style="margin-bottom: 12px;">
                <strong style="color: var(--text-primary); font-size: 13px;">${escapeHtml(diagnostic.category || '诊断')}</strong>
                <p style="margin: 6px 0 10px 0; color: var(--text-secondary); font-size: 13px; line-height: 1.6;">${escapeHtml(diagnostic.explanation || '')}</p>
                ${(diagnostic.suggestions || []).map((suggestion) => `
                  <div style="display: flex; gap: 8px; font-size: 13px; color: var(--text-secondary); margin-top: 6px; align-items: flex-start;">
                    <span style="color: var(--primary); font-size: 14px; margin-top: -1px;">💡</span>
                    <span>${escapeHtml(suggestion)}</span>
                  </div>
                `).join('')}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="mui-paper">
      <div class="panel-title" style="display: flex; justify-content: space-between; align-items: center;">
        <div>失败诊断</div>
        <span class="badge" style="background: var(--danger-light); color: var(--danger); font-size: 12px; font-weight: 600; padding: 4px 10px; border: none;">发现 ${failedResults.length} 个异常</span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 16px;">${items}</div>
    </div>
  `;
};

