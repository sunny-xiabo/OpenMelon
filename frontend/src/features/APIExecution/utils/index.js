import { RUN_STATUS_META, ENVIRONMENT_TYPE_OPTIONS, getAssertionTypeLabel } from '../constants';

export const getTagNames = (tags = []) => tags.map((tag) => (typeof tag === 'string' ? tag : tag.name)).filter(Boolean);

export const formatRunTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

export const getRunStatusMeta = (status) => RUN_STATUS_META[status] || { label: status || '未知', color: 'default' };

export const getRunModeLabel = (mode) => {
  if (mode === 'single') return '单步';
  if (mode === 'background') return '后台';
  return '批量';
};

export const getEnvironmentTypeLabel = (value) => ENVIRONMENT_TYPE_OPTIONS.find((item) => item.value === value)?.label || value || '未指定';

export const getPolicyRiskLabel = (riskLevel) => ({
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  blocked: '已阻断',
}[riskLevel] || '未评估');

export const getPolicyRiskColor = (riskLevel) => {
  if (riskLevel === 'blocked' || riskLevel === 'high') return 'error';
  if (riskLevel === 'medium') return 'warning';
  if (riskLevel === 'low') return 'success';
  return 'default';
};

export const normalizeTimeoutMs = (value, fallback = 30000) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return fallback;
  return Math.max(500, Math.round(numberValue));
};

export const mergeScriptVariables = (script, environmentVariables) => ({
  ...script,
  variables: {
    ...(environmentVariables || {}),
    ...(script.variables || {}),
  },
});

export const getRunEnvironmentSnapshot = (run) => run?.execution_options?.environment_snapshot || {};

export const toRunRequestOptions = ({ environment_variables: _environmentVariables, ...options }) => options;

export const parseLineList = (value) => (value || '')
  .split('\n')
  .map((item) => item.trim())
  .filter(Boolean);

export const formatLineList = (value = []) => (Array.isArray(value) ? value : []).join('\n');

export const parseJsonObjectText = (value, fallback = {}) => {
  const raw = (value || '').trim();
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && !Array.isArray(parsed) && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
};

export const normalizeNonNegativeInt = (value, fallback = 0) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) return fallback;
  return Math.round(numberValue);
};

export const maskSensitiveConfig = (data = {}) => Object.fromEntries(
  Object.entries(data || {}).map(([key, value]) => {
    const lowerKey = String(key).toLowerCase();
    if (['authorization', 'token', 'password', 'secret', 'apikey', 'api-key', 'key'].some((item) => lowerKey.includes(item))) {
      return [key, '******'];
    }
    return [key, value];
  }),
);

export const getSeverityColor = (severity) => {
  if (severity === 'high') return 'error';
  if (severity === 'low') return 'info';
  return 'warning';
};

export const buildDownloadTimestamp = () => {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
};

export const buildReportFilename = (extension = 'html') => `api-run-report-${buildDownloadTimestamp()}.${extension}`;

export const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const formatDuration = (durationMs) => {
  const value = Number(durationMs || 0);
  if (!Number.isFinite(value) || value <= 0) return '0 ms';
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60000) return `${(value / 1000).toFixed(2)} s`;
  const minutes = Math.floor(value / 60000);
  const seconds = Math.round((value % 60000) / 1000);
  return `${minutes} min ${seconds} s`;
};

const _formatReportTime = (value) => formatRunTime(value) || '未记录';

const safeJsonPreview = (value) => {
  if (value === null || value === undefined || value === '') return '未记录';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const getReportStatusTheme = (status) => {
  if (status === 'passed') return { label: '通过', color: '#1e8e3e', bg: '#e6f4ea', border: 'rgba(30, 142, 62, 0.2)' };
  if (status === 'running') return { label: '执行中', color: '#1a73e8', bg: '#e8f0fe', border: 'rgba(26, 115, 232, 0.2)' };
  if (status === 'queued') return { label: '排队中', color: '#e37400', bg: '#fef7e0', border: 'rgba(227, 116, 0, 0.2)' };
  if (status === 'cancelled') return { label: '已取消', color: '#5f6368', bg: '#f1f3f4', border: 'rgba(95, 99, 104, 0.2)' };
  return { label: '失败', color: '#d93025', bg: '#fce8e6', border: 'rgba(217, 48, 37, 0.2)' };
};

const getMethodClass = (method = '') => {
  const normalized = String(method).toLowerCase();
  return ['get', 'post', 'put', 'patch', 'delete'].includes(normalized) ? normalized : 'default';
};

const buildMetricCard = (label, value, tone = 'neutral') => `
  <div class="metric-card">
    <div class="metric-label">${escapeHtml(label)}</div>
    <div class="metric-value val-${tone}">${escapeHtml(value)}</div>
  </div>
`;

const buildReqResHtml = (request, response) => {
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

const buildAssertionsHtml = (assertions = []) => {
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

const buildStepRows = (results = []) => {
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

const buildFailureDiagnostics = (report) => {
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

export const buildRunReportHtml = (report) => {
  const statusTheme = getReportStatusTheme(report?.status);
  const options = report?.execution_options || {};
  const environment = options.environment_snapshot || {};
  const policy = options.policy_decision || {};
  const results = report?.results || [];
  const total = report?.progress_total || report?.script?.steps?.length || report?.total || results.length || 0;
  const passed = Number(report?.passed || 0);
  const failed = Number(report?.failed || 0);
  const skipped = Number(report?.skipped || 0);
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
  const caseName = report?.case_name || report?.script?.name || 'API 自动化执行报告';
  const projectName = report?.target_project || report?.script?.target_project || policy.name || '未记录';
  const baseUrl = options.base_url || environment.base_url || report?.script?.base_url || '未记录';
  const generatedAt = new Date().toLocaleString();

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(caseName)} - OpenMelon API 报告</title>
  <style>
    :root {
      --primary: #1a73e8;
      --primary-light: #e8f0fe;
      --success: #1e8e3e;
      --success-light: #e6f4ea;
      --danger: #d93025;
      --danger-light: #fce8e6;
      --warning: #e37400;
      --warning-light: #fef7e0;
      --bg-default: #f5f6fa;
      --bg-paper: #ffffff;
      --text-primary: #202124;
      --text-secondary: #5f6368;
      --text-disabled: #9aa0a6;
      --divider: #e8eaed;
      --radius: 8px;
    }
    body {
      background-color: var(--bg-default);
      color: var(--text-primary);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      margin: 0;
      padding: 40px 20px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    .container { max-width: 1100px; margin: 0 auto; }

    .mui-paper {
      background: var(--bg-paper);
      border: 1px solid var(--divider);
      border-radius: var(--radius);
      padding: 32px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
      margin-bottom: 24px;
    }

    .header-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px solid var(--divider);
      padding-bottom: 24px;
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 20px;
    }
    .header-content h1 {
      margin: 0 0 8px 0; font-size: 28px; font-weight: 600; color: var(--text-primary);
    }
    .header-content p { margin: 0; color: var(--text-secondary); font-size: 14px; }

    .status-badge-lg {
      padding: 10px 20px; border-radius: 6px; font-size: 16px; font-weight: 600;
      display: inline-flex; align-items: center; gap: 8px;
      background: ${statusTheme.bg}; color: ${statusTheme.color};
      border: 1px solid ${statusTheme.border};
    }

    .metrics-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px;
    }
    .metric-card {
      background: var(--bg-default); border: 1px solid var(--divider);
      border-radius: 6px; padding: 20px;
    }
    .metric-label { font-size: 13px; color: var(--text-secondary); font-weight: 500; margin-bottom: 6px; }
    .metric-value { font-size: 28px; font-weight: 600; line-height: 1; }

    .val-success { color: var(--success); } .val-danger { color: var(--danger); }
    .val-warning { color: var(--warning); } .val-info { color: var(--primary); } .val-neutral { color: var(--text-primary); }

    .panel-title { font-size: 18px; font-weight: 600; margin-bottom: 20px; color: var(--text-primary); }

    .table-wrapper { overflow-x: auto; border: 1px solid var(--divider); border-radius: 6px; }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th { color: var(--text-primary); font-weight: 600; font-size: 13px; padding: 14px 16px; border-bottom: 2px solid var(--divider); background: #f8f9fa; white-space: nowrap; }
    td { padding: 14px 16px; border-bottom: 1px solid var(--divider); font-size: 13px; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }

    .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; white-space: nowrap; }
    .method { font-family: 'SFMono-Regular', Consolas, monospace; font-size: 12px; font-weight: 600; padding: 4px 8px; border-radius: 4px; text-transform: uppercase; }
    .method-get { color: var(--success); background: var(--success-light); }
    .method-post { color: var(--primary); background: var(--primary-light); }
    .method-put, .method-patch { color: var(--warning); background: var(--warning-light); }
    .method-delete { color: var(--danger); background: var(--danger-light); }
    .method-default { color: var(--text-secondary); background: var(--divider); }

    .diagnostic-card { border: 1px solid var(--divider); border-radius: 8px; padding: 20px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
    .diag-section { background: var(--bg-default); border-radius: 6px; padding: 16px; border: 1px solid var(--divider); }
    .diag-section-title { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 12px; }
    .inline-code { font-family: 'SFMono-Regular', Consolas, monospace; background: rgba(0,0,0,0.04); padding: 2px 6px; border-radius: 4px; font-size: 12px; border: 1px solid rgba(0,0,0,0.05); }

    .meta-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; }
    .meta-item { display: flex; flex-direction: column; gap: 4px; }
    .meta-item-label { font-size: 12px; color: var(--text-secondary); font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }
    .meta-item-value { font-size: 14px; color: var(--text-primary); font-weight: 500; word-break: break-all; }

    .code-block { font-family: 'SFMono-Regular', Consolas, monospace; background: #f8f9fa; padding: 16px; border-radius: 6px; border: 1px solid var(--divider); font-size: 13px; color: var(--text-secondary); overflow-x: auto; margin-top: 8px; }

    .progress-bar-bg { background: var(--divider); height: 8px; border-radius: 4px; overflow: hidden; margin-top: 24px; }
    .progress-bar-fill { height: 100%; background: ${statusTheme.color}; width: ${passRate}%; }

    .footer { text-align: center; color: var(--text-secondary); font-size: 13px; margin-top: 40px; padding-bottom: 20px; }

    /* CSS Modal */
    .modal-overlay {
      display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.4); z-index: 9999; justify-content: center; align-items: center;
      backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px);
    }
    .modal-toggle:checked + .modal-overlay { display: flex; }
    .modal-content {
      background: var(--bg-paper); width: 800px; max-width: 90vw; max-height: 85vh;
      border-radius: 12px; box-shadow: 0 12px 32px rgba(0,0,0,0.15);
      display: flex; flex-direction: column; overflow: hidden; padding: 24px;
      animation: modalSlideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .modal-content > div:last-child { overflow-y: auto; flex: 1; }
    @keyframes modalSlideIn {
      from { opacity: 0; transform: translateY(20px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="mui-paper" style="border-top: 4px solid var(--primary);">
      <div class="header-section">
        <div class="header-content">
          <h1>${escapeHtml(caseName)}</h1>
          <p>OpenMelon API 自动化执行报告</p>
        </div>
        <div class="status-badge-lg">
          ${escapeHtml(statusTheme.label)}
          <span style="opacity: 0.7; font-weight: 500; margin-left: 4px;">${escapeHtml(`${passRate}%`)}</span>
        </div>
      </div>

      <div class="metrics-grid">
        ${buildMetricCard('总步骤数', total, 'neutral')}
        ${buildMetricCard('执行通过', passed, 'success')}
        ${buildMetricCard('执行失败', failed, 'danger')}
        ${buildMetricCard('已跳过', skipped, 'warning')}
        ${buildMetricCard('总耗时', formatDuration(report?.duration_ms), 'info')}
      </div>

      <div class="progress-bar-bg">
        <div class="progress-bar-fill"></div>
      </div>
    </div>

    <div class="mui-paper">
      <div class="panel-title">步骤执行明细</div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>方法</th>
              <th>URL</th>
              <th>状态码</th>
              <th>耗时</th>
              <th>结果</th>
              <th>断言</th>
              <th>错误信息</th>
              <th>请求/响应</th>
            </tr>
          </thead>
          <tbody>${buildStepRows(results)}</tbody>
        </table>
      </div>
    </div>

    ${buildFailureDiagnostics(report)}

    <div class="mui-paper">
      <div class="panel-title">执行环境与策略</div>
      <div class="meta-list" style="margin-bottom: 24px;">
        <div class="meta-item">
          <span class="meta-item-label">目标项目</span>
          <span class="meta-item-value">${escapeHtml(projectName)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-item-label">Base URL</span>
          <span class="meta-item-value" style="font-family: 'SFMono-Regular', Consolas, monospace;">${escapeHtml(baseUrl)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-item-label">执行环境</span>
          <span class="meta-item-value">${escapeHtml(getEnvironmentTypeLabel(environment.environment_type))}</span>
        </div>
        <div class="meta-item">
          <span class="meta-item-label">报告生成时间</span>
          <span class="meta-item-value">${escapeHtml(generatedAt)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-item-label">策略风险评估</span>
          <span class="meta-item-value" style="color: ${getPolicyRiskColor(policy.risk_level) === 'error' ? 'var(--danger)' : getPolicyRiskColor(policy.risk_level) === 'warning' ? 'var(--warning)' : 'var(--success)'}">
            ${escapeHtml(getPolicyRiskLabel(policy.risk_level))}
          </span>
        </div>
        <div class="meta-item">
          <span class="meta-item-label">AI 自动执行</span>
          <span class="meta-item-value">${escapeHtml(policy.allow_ai_execution ? '允许执行' : '已禁用')}</span>
        </div>
      </div>

      ${Object.keys(environment.headers || {}).length ? `
        <div style="margin-top: 20px;">
          <span style="font-size: 13px; color: var(--text-primary); font-weight: 600;">Headers</span>
          <div class="code-block">${escapeHtml(safeJsonPreview(environment.headers))}</div>
        </div>
      ` : ''}

      ${Object.keys(environment.variables || {}).length ? `
        <div style="margin-top: 20px;">
          <span style="font-size: 13px; color: var(--text-primary); font-weight: 600;">Variables</span>
          <div class="code-block">${escapeHtml(safeJsonPreview(environment.variables))}</div>
        </div>
      ` : ''}

      ${(policy.warnings || []).length ? `
        <div style="margin-top: 20px;">
          <span style="font-size: 13px; color: var(--warning); font-weight: 600;">策略提醒</span>
          <div class="code-block" style="color: var(--warning); border-color: var(--warning-light); background: #fffcf2;">${escapeHtml((policy.warnings || []).join('\n'))}</div>
        </div>
      ` : ''}

      ${(policy.violations || []).length ? `
        <div style="margin-top: 20px;">
          <span style="font-size: 13px; color: var(--danger); font-weight: 600;">阻断原因</span>
          <div class="code-block" style="color: var(--danger); border-color: var(--danger-light); background: #fff9f9;">${escapeHtml((policy.violations || []).join('\n'))}</div>
        </div>
      ` : ''}
    </div>

    <div class="footer">
      Generated by <strong>OpenMelon</strong> · 自动化测试执行报告
    </div>
  </div>
</body>
</html>`;
};

export const validateBaseUrl = (value) => {
  const baseUrl = (value || '').trim();
  if (!baseUrl) return { ok: true, value: '' };
  try {
    const parsed = new URL(baseUrl);
    if (parsed.hostname === 'locahost') {
      return { ok: false, message: 'Base URL 写成了 locahost，请改为 localhost 后再执行。' };
    }
    return { ok: true, value: baseUrl };
  } catch {
    return { ok: false, message: 'Base URL 格式不正确，请填写类似 http://localhost:8000 的完整地址。' };
  }
};

export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
