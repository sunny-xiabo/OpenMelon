import {
  escapeHtml,
  formatDuration,
  getEnvironmentTypeLabel,
  getPolicyRiskColor,
  getPolicyRiskLabel,
} from './index';

import {
  buildFailureDiagnostics,
  buildMetricCard,
  buildStepRows,
  getReportStatusTheme,
  safeJsonPreview,
} from './reportHtmlParts';

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
