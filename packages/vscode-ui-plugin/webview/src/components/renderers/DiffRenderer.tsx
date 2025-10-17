/**
 * DiffRenderer Component - Web版
 * 用于在VSCode插件中显示文件差异
 */

import React from 'react';
import './LintStyles.css';

interface DiffLine {
  type: 'add' | 'del' | 'context' | 'hunk' | 'other';
  oldLine?: number;
  newLine?: number;
  content: string;
}

interface DiffStats {
  linesAdded: number;
  linesRemoved: number;
  linesChanged: number;
  isNewFile: boolean;
  isDeletedFile: boolean;
}

interface DiffDisplay {
  type?: 'diff_display';
  fileDiff: string;
  fileName?: string;
  originalContent?: string | null;
  newContent?: string;
  // 🎯 新增: 自动lint检查结果
  lintStatus?: string;           // 简洁的lint状态信息 (如 "✅ No lint errors")
  lintDiagnostics?: Array<{      // 详细的lint诊断信息
    file: string;
    line: number;
    column: number;
    severity: 'error' | 'warning' | 'info' | 'hint';
    message: string;
    source: string;
    code?: string;
  }>;
}

interface DiffRendererProps {
  data: DiffDisplay;
  simplified?: boolean;
}

/**
 * 解析diff内容
 */
const parseDiffWithLineNumbers = (diffContent: string): DiffLine[] => {
  const lines = diffContent.split('\n');
  const result: DiffLine[] = [];
  let currentOldLine = 0;
  let currentNewLine = 0;
  let inHunk = false;
  const hunkHeaderRegex = /^@@ -(\d+),?\d* \+(\d+),?\d* @@/;

  for (const line of lines) {
    const hunkMatch = line.match(hunkHeaderRegex);
    if (hunkMatch) {
      currentOldLine = parseInt(hunkMatch[1], 10) - 1;
      currentNewLine = parseInt(hunkMatch[2], 10) - 1;
      inHunk = true;
      result.push({ type: 'hunk', content: line });
      continue;
    }

    if (!inHunk) {
      if (
        line.startsWith('--- ') ||
        line.startsWith('+++ ') ||
        line.startsWith('diff --git') ||
        line.startsWith('index ') ||
        line.startsWith('new file mode') ||
        line.startsWith('deleted file mode')
      ) {
        continue;
      }
      continue;
    }

    if (line.startsWith('+')) {
      currentNewLine++;
      result.push({
        type: 'add',
        newLine: currentNewLine,
        content: line.substring(1),
      });
    } else if (line.startsWith('-')) {
      currentOldLine++;
      result.push({
        type: 'del',
        oldLine: currentOldLine,
        content: line.substring(1),
      });
    } else if (line.startsWith(' ')) {
      currentOldLine++;
      currentNewLine++;
      result.push({
        type: 'context',
        oldLine: currentOldLine,
        newLine: currentNewLine,
        content: line.substring(1),
      });
    } else if (line.startsWith('\\')) {
      result.push({ type: 'other', content: line });
    }
  }
  return result;
};

/**
 * 分析diff统计信息
 */
const analyzeDiffStats = (diffContent: string): DiffStats => {
  const lines = diffContent.split('\n');
  let linesAdded = 0;
  let linesRemoved = 0;
  let isNewFile = false;
  let isDeletedFile = false;

  // 检查文件状态
  if (diffContent.includes('new file mode')) {
    isNewFile = true;
  } else if (diffContent.includes('deleted file mode') ||
             (diffContent.includes('--- a/') && diffContent.includes('+++ /dev/null'))) {
    isDeletedFile = true;
  }

  // 统计增删行数
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      linesAdded++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      linesRemoved++;
    }
  }

  // 计算修改行数（取增删中的较小值作为修改，剩余的作为纯增/删）
  const linesChanged = Math.min(linesAdded, linesRemoved);

  return {
    linesAdded: linesAdded - linesChanged,
    linesRemoved: linesRemoved - linesChanged,
    linesChanged,
    isNewFile,
    isDeletedFile
  };
};

/**
 * 渲染lint状态信息
 */
const renderLintStatus = (lintStatus?: string, lintDiagnostics?: DiffDisplay['lintDiagnostics']): React.ReactNode => {
  console.log('🔍 [LINT-RENDER] renderLintStatus called with:', {
    lintStatus,
    lintDiagnosticsCount: lintDiagnostics?.length || 0,
    lintDiagnostics
  });

  if (!lintStatus && (!lintDiagnostics || lintDiagnostics.length === 0)) {
    console.log('🔍 [LINT-RENDER] No lint data to display, returning null');
    return null;
  }

  // 如果有诊断信息，显示详细信息
  if (lintDiagnostics && lintDiagnostics.length > 0) {
    const errors = lintDiagnostics.filter(d => d.severity === 'error').length;
    const warnings = lintDiagnostics.filter(d => d.severity === 'warning').length;

    return (
      <div className="diff-lint-status">
        <div className="lint-status-header">
          <span className="lint-icon">🔍</span>
          <span className="lint-title">Lint检查结果:</span>
          {errors > 0 && <span className="lint-errors">❌ {errors} 错误</span>}
          {warnings > 0 && <span className="lint-warnings">⚠️ {warnings} 警告</span>}
        </div>
        <div className="lint-diagnostics">
          {lintDiagnostics.slice(0, 3).map((diagnostic, index) => (
            <div key={index} className={`lint-diagnostic lint-${diagnostic.severity}`}>
              <span className="lint-location">行 {diagnostic.line}:{diagnostic.column}</span>
              <span className="lint-message">{diagnostic.message}</span>
              {diagnostic.source && <span className="lint-source">[{diagnostic.source}]</span>}
            </div>
          ))}
          {lintDiagnostics.length > 3 && (
            <div className="lint-more">... 还有 {lintDiagnostics.length - 3} 个问题</div>
          )}
        </div>
      </div>
    );
  }

  // 如果只有状态字符串，显示简单状态
  if (lintStatus) {
    return (
      <div className="diff-lint-status simple">
        <span className="lint-icon">🔍</span>
        <span className="lint-status-text">{lintStatus}</span>
      </div>
    );
  }

  return null;
};

/**
 * 渲染简化的diff统计
 */
const renderSimplifiedDiffStats = (stats: DiffStats, fileName: string): React.ReactNode => {
  if (stats.isNewFile) {
    return (
      <div className="diff-summary-line">
        <span className="diff-file-icon new">📄</span>
        <span className="diff-action new">新建文件</span>
        <span className="diff-filename">{fileName}</span>
        {stats.linesAdded > 0 && (
          <span className="diff-stat added">(+{stats.linesAdded} 行)</span>
        )}
      </div>
    );
  }

  if (stats.isDeletedFile) {
    return (
      <div className="diff-summary-line">
        <span className="diff-file-icon deleted">🗑️</span>
        <span className="diff-action deleted">删除文件</span>
        <span className="diff-filename">{fileName}</span>
        {stats.linesRemoved > 0 && (
          <span className="diff-stat removed">(-{stats.linesRemoved} 行)</span>
        )}
      </div>
    );
  }

  return (
    <div className="diff-summary-line">
      <span className="diff-file-icon modified">📝</span>
      <span className="diff-filename">{fileName}</span>
      <div className="diff-stats">
        {stats.linesAdded > 0 && (
          <span className="diff-stat added">+{stats.linesAdded}</span>
        )}
        {stats.linesRemoved > 0 && (
          <span className="diff-stat removed">-{stats.linesRemoved}</span>
        )}
        {stats.linesChanged > 0 && (
          <span className="diff-stat modified">M {stats.linesChanged}</span>
        )}
        {stats.linesAdded === 0 && stats.linesRemoved === 0 && stats.linesChanged === 0 && (
          <span className="diff-stat no-change">(无变更)</span>
        )}
      </div>
    </div>
  );
};

/**
 * 渲染详细的diff内容
 */
const renderDetailedDiff = (parsedLines: DiffLine[], fileName?: string): React.ReactNode => {
  const displayableLines = parsedLines.filter(
    (l) => l.type !== 'hunk' && l.type !== 'other'
  );

  if (displayableLines.length === 0) {
    return (
      <div className="diff-no-changes">
        <span>无变更检测到</span>
      </div>
    );
  }

  const maxLineNumber = Math.max(
    0,
    ...displayableLines.map((l) => l.oldLine ?? 0),
    ...displayableLines.map((l) => l.newLine ?? 0)
  );
  const gutterWidth = Math.max(1, maxLineNumber.toString().length);

  return (
    <div className="diff-detailed-container">
      {fileName && (
        <div className="diff-file-header">
          <span className="diff-file-name">{fileName}</span>
        </div>
      )}
      <div className="diff-content">
        {displayableLines.map((line, index) => {
          let gutterNumStr = '';
          let prefixSymbol = ' ';
          let lineClass = 'diff-line context';

          switch (line.type) {
            case 'add':
              gutterNumStr = (line.newLine ?? '').toString();
              prefixSymbol = '+';
              lineClass = 'diff-line added';
              break;
            case 'del':
              gutterNumStr = (line.oldLine ?? '').toString();
              prefixSymbol = '-';
              lineClass = 'diff-line removed';
              break;
            case 'context':
              gutterNumStr = (line.newLine ?? '').toString();
              prefixSymbol = ' ';
              lineClass = 'diff-line context';
              break;
            default:
              return null;
          }

          return (
            <div key={index} className={lineClass}>
              <div className="diff-gutter">
                <span className="diff-line-number">
                  {gutterNumStr.padStart(gutterWidth)}
                </span>
              </div>
              <div className="diff-line-content">
                <span className="diff-line-prefix">{prefixSymbol}</span>
                <span className="diff-line-text">{line.content}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const DiffRenderer: React.FC<DiffRendererProps> = ({ data, simplified = false }) => {
  const { fileDiff, fileName = '未知文件' } = data;

  console.log('🎯 [DiffRenderer] Rendering Diff data:', data);

  // 🔍 专门检查lint数据
  console.log('🔍 [LINT-CHECK] DiffRenderer received lint data:', {
    hasLintStatus: !!data.lintStatus,
    hasLintDiagnostics: !!data.lintDiagnostics,
    lintStatus: data.lintStatus,
    lintDiagnosticsCount: data.lintDiagnostics?.length || 0,
    lintDiagnostics: data.lintDiagnostics
  });

  // 处理在编辑器中查看diff的点击事件
  const handleOpenInEditor = () => {
    if (typeof window !== 'undefined' && window.vscode) {
      window.vscode.postMessage({
        type: 'openDiffInEditor',
        payload: {
          fileDiff,
          fileName,
          originalContent: data.originalContent || '',
          newContent: data.newContent || ''
        }
      });
    }
  };

  if (!fileDiff || typeof fileDiff !== 'string') {
    return (
      <div className="diff-display-container">
        <div className="diff-no-content">无差异内容</div>
      </div>
    );
  }

  const parsedLines = parseDiffWithLineNumbers(fileDiff);

  if (simplified) {
    const stats = analyzeDiffStats(fileDiff);
    return (
      <div className="diff-display-container simplified">
        {renderSimplifiedDiffStats(stats, fileName)}
        {renderLintStatus(data.lintStatus, data.lintDiagnostics)}
        <button
          className="diff-open-editor-btn"
          onClick={handleOpenInEditor}
          title="在编辑器中查看完整diff"
        >
          📝 在编辑器中查看
        </button>
      </div>
    );
  }

  return (
    <div className="diff-display-container detailed">
      <div className="diff-header-actions">
        <button
          className="diff-open-editor-btn"
          onClick={handleOpenInEditor}
          title="在编辑器中查看完整diff"
        >
          📝 在编辑器中查看
        </button>
      </div>
      {renderDetailedDiff(parsedLines, fileName)}
      {renderLintStatus(data.lintStatus, data.lintDiagnostics)}
    </div>
  );
};
