const MERMAID_START = /^(\s*)(graph\s+(TD|TB|BT|RL|LR)|sequenceDiagram|classDiagram|stateDiagram-v2|stateDiagram|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|sankey-beta|xychart-beta|block-beta|packet-beta|c4Context|flowchart\s+(TD|TB|BT|RL|LR))\b/;

function hasAnyMermaidFence(text: string): boolean {
  return /```\s*mermaid\b/i.test(text);
}

function isFenceLine(line: string): boolean {
  return /^\s*```/.test(line);
}

/**
 * Best-effort: wrap common Mermaid blocks in ```mermaid fences if user/model forgot.
 *
 * Rules:
 * - Never touches content already inside triple-backtick fences.
 * - Only wraps blocks that start with a Mermaid directive line (graph TD, sequenceDiagram, etc.).
 * - Ends the block when hitting a blank line (after some content), or an obvious non-diagram marker.
 */
export function autoFenceMermaid(raw: string): string {
  if (!raw || raw.trim().length === 0) return raw;
  // if (hasAnyMermaidFence(raw)) return raw; // Disabled to allow fixing mixed content

  const lines = raw.split(/\r?\n/);
  const out: string[] = [];

  let inFence = false;
  let inMermaid = false;
  let mermaidIndent = '';
  let mermaidLineCount = 0;

  const closeMermaid = () => {
    if (!inMermaid) return;
    out.push('```');
    inMermaid = false;
    mermaidIndent = '';
    mermaidLineCount = 0;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isFenceLine(line)) {
      // entering/leaving a user code fence; do not transform inside
      if (inMermaid) closeMermaid();
      inFence = !inFence;
      out.push(line);
      continue;
    }

    if (inFence) {
      out.push(line);
      continue;
    }

    if (!inMermaid) {
      const m = line.match(MERMAID_START);
      if (m) {
        mermaidIndent = m[1] ?? '';
        out.push(`${mermaidIndent}\n\n`.trimEnd());
        out.push('```mermaid');
        out.push(line.trimEnd());
        inMermaid = true;
        mermaidLineCount = 1;
        continue;
      }

      out.push(line);
      continue;
    }

    // inMermaid
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      // allow a single trailing blank line inside diagram, then close
      if (mermaidLineCount >= 2) {
        closeMermaid();
        out.push(line);
        continue;
      }
    }

    // Heuristic: if indentation drops to 0 and line looks like a new paragraph marker,
    // and we already captured enough diagram lines, close before it.
    if (mermaidLineCount >= 2 && !line.startsWith(mermaidIndent) && /^[A-Za-z\u4e00-\u9fff].*/.test(trimmed)) {
      closeMermaid();
      out.push(line);
      continue;
    }

    out.push(line.trimEnd());
    mermaidLineCount++;
  }

  if (inMermaid) closeMermaid();
  return out.join('\n');
}
