/**
 * @license
 * Copyright 2025 Felix
 * SPDX-License-Identifier: Apache-2.0
 *
 * Memory Manager - Auto-learning knowledge base + HR lifecycle.
 * Ported from Otto project: https://github.com/Felix201209/otto
 *
 * 6 core capabilities:
 * 1. Learn: auto-extract knowledge from task execution
 * 2. Recall: retrieve relevant knowledge before task
 * 3. Onboard: new employee inherits department + role knowledge
 * 4. Offboard: departing employee's experience auto-merges into department
 * 5. Report: token spend, time saved, ROI
 * 6. List/Export: view and export all knowledge
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { BaseTool, ToolResult, ToolCallConfirmationDetails, Icon, ToolLocation } from './tools.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { Config, ApprovalMode } from '../config/config.js';

const MEMORY_DIR = path.join(os.homedir(), '.easycode', 'memory');
const WORKFLOWS_DIR = path.join(MEMORY_DIR, 'workflows');
const REPORTS_DIR = path.join(MEMORY_DIR, 'reports');

export interface MemoryManagerToolParams {
  action: 'learn' | 'recall' | 'onboard' | 'offboard' | 'report' | 'update' | 'sync' | 'export' | 'list';
  task_type?: string;
  context?: string;
  task_result?: string;
  employee_id?: string;
  department_id?: string;
  role_id?: string;
  target?: 'employee' | 'department' | 'role' | 'workflow';
  content?: string;
  output_path?: string;
  period?: string;
  viewer?: 'employee' | 'manager';
}

export class MemoryManagerTool extends BaseTool<MemoryManagerToolParams, ToolResult> {
  static readonly Name: string = 'memory_manager';

  constructor(private readonly config: Config) {
    const desc = `Memory Manager - Knowledge base + HR lifecycle.

ACTIONS:
  learn:    Auto-extract knowledge after task execution.
            {action:"learn", task_type:"listing_entry", context:"...", task_result:"success 3.2min"}
  recall:   Retrieve relevant knowledge before executing a task.
            {action:"recall", task_type:"listing_entry"}
  onboard:  New employee inherits ALL department + role knowledge instantly.
            {action:"onboard", employee_id:"new_hire_001", role_id:"agent", department_id:"sales"}
  offboard: Departing employee's experience auto-merges into department knowledge.
            {action:"offboard", employee_id:"zhangxue"}
  report:   Dashboard: token spend, time saved, ROI.
            {action:"report", period:"30d", viewer:"manager"}
  update:   Manually update knowledge file.
            {action:"update", target:"department", content:"## new SOP..."}
  sync:     Prepare anonymized knowledge for cloud upload.
  export:   Export all knowledge to single file.
  list:     Show all knowledge files and sizes.

FILES:
  ~/.easycode/memory/employee.markdown   - Personal habits (LOCAL)
  ~/.easycode/memory/department.markdown - SOPs + templates (CLOUD SYNC)
  ~/.easycode/memory/role.markdown       - Role workflows (CLOUD SYNC)
  ~/.easycode/memory/workflows/*.md      - Task-specific templates
  ~/.easycode/memory/reports/*.md        - Token + efficiency reports`;

    super(MemoryManagerTool.Name, 'MemoryManager', desc, Icon.Info,
      {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING, description: 'Memory operation', enum: ['learn', 'recall', 'onboard', 'offboard', 'report', 'update', 'sync', 'export', 'list'] },
          task_type: { type: Type.STRING, description: 'Task type: listing_entry, contract_generation, etc.' },
          context: { type: Type.STRING, description: 'What was done (for learn)' },
          task_result: { type: Type.STRING, description: 'Task outcome + duration (for learn)' },
          employee_id: { type: Type.STRING, description: 'Employee ID (defaults to OS username)' },
          department_id: { type: Type.STRING, description: 'Department ID' },
          role_id: { type: Type.STRING, description: 'Role ID' },
          target: { type: Type.STRING, description: 'Which file to update', enum: ['employee', 'department', 'role', 'workflow'] },
          content: { type: Type.STRING, description: 'Content to write' },
          output_path: { type: Type.STRING, description: 'Export output path' },
          period: { type: Type.STRING, description: 'Report period: 7d, 30d, 90d. Default: 30d' },
          viewer: { type: Type.STRING, description: 'Report viewer: employee or manager', enum: ['employee', 'manager'] },
        },
        required: ['action'],
      },
    );
  }

  validateToolParams(p: MemoryManagerToolParams): string | null {
    const e = SchemaValidator.validate(this.schema.parameters!, p, MemoryManagerTool.Name);
    if (e) return e;
    if (p.action === 'learn' && !p.task_type) return 'memory_manager/learn: task_type required';
    if (p.action === 'recall' && !p.task_type) return 'memory_manager/recall: task_type required';
    if (p.action === 'onboard' && !p.employee_id) return 'memory_manager/onboard: employee_id required';
    if (p.action === 'offboard' && !p.employee_id) return 'memory_manager/offboard: employee_id required';
    if (p.action === 'update' && (!p.target || !p.content)) return 'memory_manager/update: target and content required';
    return null;
  }

  toolLocations(): ToolLocation[] { return []; }
  getDescription(p: MemoryManagerToolParams): string { return 'memory: ' + p.action + (p.task_type ? ' ' + p.task_type : ''); }
  async shouldConfirmExecute(_p: MemoryManagerToolParams, _s: AbortSignal): Promise<ToolCallConfirmationDetails | false> { return false; }

  async execute(p: MemoryManagerToolParams, _s: AbortSignal): Promise<ToolResult> {
    const err = this.validateToolParams(p);
    if (err) return { llmContent: err, returnDisplay: err };
    this.ensureDirs();
    try {
      let r = '';
      switch (p.action) {
        case 'learn': r = this.learn(p); break;
        case 'recall': r = this.recall(p); break;
        case 'onboard': r = this.onboard(p); break;
        case 'offboard': r = this.offboard(p); break;
        case 'report': r = this.report(p); break;
        case 'update': r = this.update(p); break;
        case 'sync': r = this.sync(p); break;
        case 'export': r = this.export(p); break;
        case 'list': r = this.list(); break;
        default: return { llmContent: 'memory FAIL: unknown action', returnDisplay: 'memory FAIL: unknown action' };
      }
      return { llmContent: 'memory OK: ' + r, returnDisplay: 'memory OK: ' + r.split('\n')[0] };
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : String(e);
      return { llmContent: 'memory FAIL: ' + m, returnDisplay: 'memory FAIL: ' + m };
    }
  }

  private learn(p: MemoryManagerToolParams): string {
    const empId = p.employee_id || os.userInfo().username;
    const now = new Date().toISOString().split('T')[0];
    const durationMatch = p.task_result?.match(/(\d+\.?\d*)\s*min/);
    const duration = durationMatch ? parseFloat(durationMatch[1]) : 0;
    const success = p.task_result?.includes('fail') ? false : true;
    const empFile = path.join(MEMORY_DIR, 'employee.markdown');
    let empContent = fs.existsSync(empFile) ? fs.readFileSync(empFile, 'utf8') : `# Employee: ${empId}\n\n## Task History\n`;
    empContent += `- [${now}] ${p.task_type}: ${(p.context || '').substring(0, 200)} -> ${p.task_result || 'ok'}${duration ? ' (' + duration + 'min)' : ''}\n`;
    this.updateEfficiencyTrend(empFile, empContent, p.task_type!, duration, success);
    fs.writeFileSync(empFile, empContent);
    const wfFile = path.join(WORKFLOWS_DIR, p.task_type! + '.markdown');
    if (!fs.existsSync(wfFile)) {
      fs.writeFileSync(wfFile, `# Workflow: ${p.task_type}\n\n## First Execution\n- Date: ${now}\n- Employee: ${empId}\n- Context: ${(p.context || '').substring(0, 500)}\n- Result: ${p.task_result || 'success'}\n- Duration: ${duration || 'unknown'}min\n`);
    } else {
      const wfContent = fs.readFileSync(wfFile, 'utf8');
      const execCount = (wfContent.match(/## Execution/g) || []).length + 1;
      fs.writeFileSync(wfFile, wfContent + `\n## Execution ${execCount} [${now}]\n- Employee: ${empId}\n- Context: ${(p.context || '').substring(0, 300)}\n- Result: ${p.task_result || 'success'}\n- Duration: ${duration || 'unknown'}min\n`);
      if (execCount >= 3) this.discoverPatterns(wfFile);
    }
    return `Learned: task=${p.task_type}, duration=${duration || 'unknown'}min, success=${success}, employee=${empId}`;
  }

  private recall(p: MemoryManagerToolParams): string {
    const parts: string[] = [];
    const empFile = path.join(MEMORY_DIR, 'employee.markdown');
    if (fs.existsSync(empFile)) {
      const emp = fs.readFileSync(empFile, 'utf8');
      const lines = emp.split('\n').filter(l => l.includes(p.task_type!));
      if (lines.length > 0) { parts.push('## Your History (last 3)\n' + lines.slice(-3).join('\n')); }
      const trendMatch = emp.match(new RegExp(`- ${p.task_type}: (.+)`));
      if (trendMatch) parts.push(`## Your Efficiency Trend: ${trendMatch[1]}`);
    }
    const deptFile = path.join(MEMORY_DIR, 'department.markdown');
    if (fs.existsSync(deptFile)) {
      const dept = fs.readFileSync(deptFile, 'utf8');
      const sections = dept.split('\n## ').filter(s => s.toLowerCase().includes(p.task_type!.toLowerCase()) || s.toLowerCase().includes('sop'));
      if (sections.length > 0) parts.push('## Department Knowledge\n' + sections.slice(0, 3).map(s => '## ' + s).join('\n\n'));
    }
    const wfFile = path.join(WORKFLOWS_DIR, p.task_type! + '.markdown');
    if (fs.existsSync(wfFile)) parts.push('## Workflow Template\n' + fs.readFileSync(wfFile, 'utf8').substring(0, 1000));
    return parts.length > 0 ? parts.join('\n\n') : `No prior knowledge for task_type=${p.task_type}. First execution.`;
  }

  private onboard(p: MemoryManagerToolParams): string {
    const empId = p.employee_id!;
    const empFile = path.join(MEMORY_DIR, 'employee.markdown');
    let profile = `# Employee: ${empId}\n\n## Profile\n- Role: ${p.role_id || 'unassigned'}\n- Department: ${p.department_id || 'unassigned'}\n- Onboarded: ${new Date().toISOString().split('T')[0]}\n- Status: ACTIVE\n\n## Task History\n(No tasks yet)\n\n## Inherited Knowledge\n`;
    const deptFile = path.join(MEMORY_DIR, 'department.markdown');
    if (fs.existsSync(deptFile)) profile += `### Department SOPs (inherited)\n${fs.readFileSync(deptFile, 'utf8').substring(0, 2000)}\n\n`;
    const roleFile = path.join(MEMORY_DIR, 'role.markdown');
    if (fs.existsSync(roleFile)) profile += `### Role Workflows (inherited)\n${fs.readFileSync(roleFile, 'utf8').substring(0, 2000)}\n\n`;
    if (fs.existsSync(WORKFLOWS_DIR)) {
      const wfs = fs.readdirSync(WORKFLOWS_DIR).filter(f => f.endsWith('.markdown'));
      if (wfs.length > 0) profile += `### Available Workflow Templates\n${wfs.map(w => '- ' + w.replace('.markdown', '')).join('\n')}\n`;
    }
    fs.writeFileSync(empFile, profile);
    return `Onboarded: ${empId}\nRole: ${p.role_id || 'unassigned'}\nDept: ${p.department_id || 'unassigned'}\nInherited: department SOPs + role workflows`;
  }

  private offboard(p: MemoryManagerToolParams): string {
    const empId = p.employee_id!;
    const empFile = path.join(MEMORY_DIR, 'employee.markdown');
    if (!fs.existsSync(empFile)) return `Employee ${empId} has no profile. Nothing to offboard.`;
    const empContent = fs.readFileSync(empFile, 'utf8');
    const now = new Date().toISOString().split('T')[0];
    const taskLines = empContent.split('\n').filter(l => l.startsWith('- ['));
    const efficiencyLines = empContent.split('\n').filter(l => l.includes('avg:'));
    const deptFile = path.join(MEMORY_DIR, 'department.markdown');
    let deptContent = fs.existsSync(deptFile) ? fs.readFileSync(deptFile, 'utf8') : `# Department Knowledge Base\n`;
    deptContent += `\n## Offboarded Experience [${empId}] [${now}]\n### Task Patterns\n${taskLines.slice(-20).join('\n')}\n### Efficiency Benchmarks\n${efficiencyLines.join('\n')}\n`;
    fs.writeFileSync(deptFile, deptContent);
    const archiveDir = path.join(MEMORY_DIR, 'archive');
    if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, `${empId}_${now}.markdown`), empContent);
    fs.writeFileSync(empFile, `# Employee: (vacant)\n- Previous: ${empId} (offboarded ${now})\n- Experience merged to department\n`);
    return `Offboarded: ${empId}\n- ${taskLines.length} task records merged\n- Profile archived`;
  }

  private report(p: MemoryManagerToolParams): string {
    const period = p.period || '30d';
    const viewer = p.viewer || 'employee';
    const empId = p.employee_id || os.userInfo().username;
    const empFile = path.join(MEMORY_DIR, 'employee.markdown');
    if (!fs.existsSync(empFile)) return 'No employee profile found.';
    const emp = fs.readFileSync(empFile, 'utf8');
    const taskLines = emp.split('\n').filter(l => l.startsWith('- ['));
    const tasks = taskLines.map(l => { const dm = l.match(/(\d+\.?\d*)\s*min/); const tm = l.match(/\]\s+(\w+):/); return { type: tm ? tm[1] : 'unknown', duration: dm ? parseFloat(dm[1]) : 0 }; });
    const totalTasks = tasks.length;
    const totalMin = tasks.reduce((s, t) => s + t.duration, 0);
    const byType: Record<string, { count: number; min: number }> = {};
    for (const t of tasks) { if (!byType[t.type]) byType[t.type] = { count: 0, min: 0 }; byType[t.type].count++; byType[t.type].min += t.duration; }
    const savedMin = totalMin * 2;
    const savedHrs = (savedMin / 60).toFixed(1);
    const tokens = totalTasks * 2000;
    const tokenCost = (tokens / 1000 * 0.014).toFixed(2);
    const moneySaved = ((savedMin / 60) * 50).toFixed(0);
    let r = viewer === 'employee'
      ? `## Your Report (${period})\nTasks: ${totalTasks}\nTime saved: ${savedHrs} hours\n\n| Task | Count | Avg |\n|------|-------|-----|\n`
      : `## Management Report (${period})\nROI: ${moneySaved} CNY saved / ${tokenCost} CNY tokens\n\n| Task | Count | Tokens | Cost |\n|------|-------|---------|------|\n`;
    for (const [type, d] of Object.entries(byType)) {
      r += viewer === 'employee' ? `| ${type} | ${d.count} | ${(d.min/d.count).toFixed(1)}min |\n` : `| ${type} | ${d.count} | ${(d.count*2000).toLocaleString()} | ${(d.count*2000/1000*0.014).toFixed(2)} |\n`;
    }
    if (viewer === 'manager') { const rf = path.join(REPORTS_DIR, `report_${period}_${new Date().toISOString().split('T')[0]}.md`); fs.writeFileSync(rf, r); r += `\nSaved: ${rf}`; }
    return r;
  }

  private update(p: MemoryManagerToolParams): string {
    const map: Record<string, string> = { 'employee': path.join(MEMORY_DIR, 'employee.markdown'), 'department': path.join(MEMORY_DIR, 'department.markdown'), 'role': path.join(MEMORY_DIR, 'role.markdown'), 'workflow': path.join(WORKFLOWS_DIR, (p.task_type || 'general') + '.markdown') };
    const fp = map[p.target!]; if (!fp) return 'Invalid target';
    const existing = fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : '';
    fs.writeFileSync(fp, existing + '\n' + p.content + '\n');
    return `Updated ${p.target}.markdown (+${p.content!.length} chars)`;
  }

  private sync(p: MemoryManagerToolParams): string {
    const files: string[] = [];
    for (const [name, fp] of [['department', path.join(MEMORY_DIR, 'department.markdown')], ['role', path.join(MEMORY_DIR, 'role.markdown')]]) {
      if (fs.existsSync(fp)) {
        let c = fs.readFileSync(fp, 'utf8').replace(/1[3-9]\d{9}/g, '[PHONE]').replace(/[\w.-]+@[\w.-]+\.\w+/g, '[EMAIL]').replace(/Employee:\s*\w+/g, 'Employee: [REDACTED]');
        const tmp = path.join(os.tmpdir(), `easycode_sync_${name}_${Date.now()}.md`);
        fs.writeFileSync(tmp, c); files.push(`${name}: ${tmp} (${c.length} chars)`);
      }
    }
    return files.length > 0 ? `Sync prepared:\n${files.join('\n')}` : 'No files to sync.';
  }

  private export(p: MemoryManagerToolParams): string {
    const out = p.output_path || path.join(os.homedir(), 'Desktop', 'easycode_knowledge_export.md');
    const parts: string[] = ['# Knowledge Export', `Generated: ${new Date().toISOString()}`, ''];
    for (const d of [MEMORY_DIR, WORKFLOWS_DIR, REPORTS_DIR]) {
      if (!fs.existsSync(d)) continue;
      for (const f of fs.readdirSync(d)) { const fp = path.join(d, f); if (fs.statSync(fp).isFile() && f.endsWith('.markdown')) { parts.push(`---\n# ${f}\n`); parts.push(fs.readFileSync(fp, 'utf8')); parts.push(''); } }
    }
    fs.writeFileSync(out, parts.join('\n'));
    return `Exported to: ${out} (${fs.statSync(out).size} bytes)`;
  }

  private list(): string {
    const parts: string[] = ['## Memory Files\n'];
    for (const [n, f] of [['employee (LOCAL)', path.join(MEMORY_DIR, 'employee.markdown')], ['department (CLOUD)', path.join(MEMORY_DIR, 'department.markdown')], ['role (CLOUD)', path.join(MEMORY_DIR, 'role.markdown')]]) {
      if (fs.existsSync(f)) { const s = fs.statSync(f); parts.push(`- ${n}: ${Math.round(s.size/1024)}KB, ${fs.readFileSync(f,'utf8').split('\n').length} lines`); }
    }
    if (fs.existsSync(WORKFLOWS_DIR)) { const wfs = fs.readdirSync(WORKFLOWS_DIR).filter(f => f.endsWith('.markdown')); if (wfs.length > 0) { parts.push('\n### Workflows:'); wfs.forEach(w => parts.push(`- ${w}: ${Math.round(fs.statSync(path.join(WORKFLOWS_DIR,w)).size/1024)}KB`)); } }
    if (fs.existsSync(REPORTS_DIR)) { const rps = fs.readdirSync(REPORTS_DIR).filter(f => f.endsWith('.md')); if (rps.length > 0) { parts.push('\n### Reports:'); rps.forEach(r => parts.push(`- ${r}`)); } }
    return parts.join('\n');
  }

  private ensureDirs(): void { for (const d of [MEMORY_DIR, WORKFLOWS_DIR, REPORTS_DIR]) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); } }
  private updateEfficiencyTrend(empFile: string, content: string, taskType: string, duration: number, _success: boolean): void {
    if (duration <= 0) return;
    let c = content; const header = '## Efficiency Trends';
    if (!c.includes(header)) c += `\n${header}\n`;
    const pat = new RegExp(`- ${taskType}: (.+)`, 'g'); const m = pat.exec(c);
    if (m) { const pts = m[1].split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n)); pts.push(duration); const recent = pts.slice(-10); const avg = recent.reduce((a,b)=>a+b,0)/recent.length; c = c.replace(pat, `- ${taskType}: ${recent.join(', ')} (avg: ${avg.toFixed(1)}min, ${recent.length>1&&recent[recent.length-1]<avg?'improving':'stable'})`); }
    else c += `- ${taskType}: ${duration} (first record)\n`;
    fs.writeFileSync(empFile, c);
  }
  private discoverPatterns(wfFile: string): void {
    const content = fs.readFileSync(wfFile, 'utf8'); const execs = content.split('## Execution').filter(s => s.trim());
    if (execs.length < 3) return;
    const durations: number[] = []; for (const e of execs) { const m = e.match(/Duration:\s*(\d+\.?\d*)\s*min/); if (m) durations.push(parseFloat(m[1])); }
    if (durations.length >= 3 && !content.includes('## Discovered Patterns')) {
      const avg = durations.reduce((a,b)=>a+b,0)/durations.length;
      fs.writeFileSync(wfFile, content + `\n## Discovered Patterns\n- Executions: ${durations.length}\n- Average: ${avg.toFixed(1)}min\n- Fastest: ${Math.min(...durations)}min\n- Slowest: ${Math.max(...durations)}min\n`);
    }
  }
}
