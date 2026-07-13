/**
 * @license
 * Copyright 2025 Felix
 * SPDX-License-Identifier: Apache-2.0
 *
 * Browser automation via Playwright for OA/ERP/web scraping.
 * Ported from Otto project: https://github.com/Felix201209/otto
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  BaseTool, ToolResult, ToolCallConfirmationDetails,
  Icon, ToolLocation,
} from './tools.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { Config, ApprovalMode } from '../config/config.js';

const execAsync = promisify(exec);

export interface WebAutomationToolParams {
  action: 'navigate' | 'fill' | 'click' | 'scrape' | 'screenshot' | 'run_script' | 'wait' | 'list_tabs' | 'extract_table';
  url?: string;
  selector?: string;
  value?: string;
  extract?: 'text' | 'html' | 'href' | 'src' | 'all';
  clear_first?: boolean;
  wait_for_navigation?: boolean;
  output_path?: string;
  full_page?: boolean;
  timeout_ms?: number;
  script?: string;
  browser?: 'chromium' | 'firefox' | 'webkit';
}

export class WebAutomationTool extends BaseTool<WebAutomationToolParams, ToolResult> {
  static readonly Name: string = 'web_automation';

  constructor(private readonly config: Config) {
    const desc = `Browser automation via Playwright for OA/ERP/web scraping.

EXAMPLES:
  Navigate: {action:"navigate", url:"https://oa.company.com/login"}
  Fill: {action:"fill", selector:"#username", value:"zhangxue"}
  Click: {action:"click", selector:"#login-btn", wait_for_navigation:true}
  Scrape: {action:"scrape", selector:".report-table", extract:"text"}
  Extract table: {action:"extract_table", selector:"table.data"}
  Screenshot: {action:"screenshot", output_path:"~/Desktop/page.png", full_page:true}
  Run JS: {action:"run_script", script:"return document.title"}
  Wait: {action:"wait", selector:"#dashboard", timeout_ms:15000}

DEPENDENCIES: npx playwright install chromium (one-time setup)
CROSS-PLATFORM: Works identically on macOS, Windows, Linux.`;

    super(WebAutomationTool.Name, 'WebAutomation', desc, Icon.Globe,
      {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING, description: 'Browser action to perform', enum: ['navigate', 'fill', 'click', 'scrape', 'screenshot', 'run_script', 'wait', 'list_tabs', 'extract_table'] },
          url: { type: Type.STRING, description: 'URL to navigate to' },
          selector: { type: Type.STRING, description: 'CSS selector (e.g. "#username", ".btn-primary", "table.data")' },
          value: { type: Type.STRING, description: 'Text to type into field (for fill action)' },
          extract: { type: Type.STRING, description: 'What to extract', enum: ['text', 'html', 'href', 'src', 'all'] },
          clear_first: { type: Type.BOOLEAN, description: 'Clear field before typing. Default: true' },
          wait_for_navigation: { type: Type.BOOLEAN, description: 'Wait for page load after click. Default: false' },
          output_path: { type: Type.STRING, description: 'Screenshot save path' },
          full_page: { type: Type.BOOLEAN, description: 'Capture full page screenshot. Default: false' },
          timeout_ms: { type: Type.NUMBER, description: 'Wait timeout in ms. Default: 10000' },
          script: { type: Type.STRING, description: 'JavaScript to execute on page (run_script action)' },
          browser: { type: Type.STRING, description: 'Browser engine. Default: chromium', enum: ['chromium', 'firefox', 'webkit'] },
        },
        required: ['action'],
      },
    );
  }

  validateToolParams(p: WebAutomationToolParams): string | null {
    const e = SchemaValidator.validate(this.schema.parameters!, p, WebAutomationTool.Name);
    if (e) return e;
    const a = p.action;
    if (a === 'navigate' && !p.url) return 'web_automation/navigate: url required';
    if (['fill', 'click', 'wait', 'scrape', 'extract_table'].includes(a) && !p.selector) return 'web_automation/' + a + ': selector required';
    if (a === 'fill' && p.value === undefined) return 'web_automation/fill: value required';
    if (a === 'run_script' && !p.script) return 'web_automation/run_script: script required';
    if (a === 'scrape' && !p.extract) return 'web_automation/scrape: extract required (text/html/href/src/all)';
    return null;
  }

  toolLocations(p: WebAutomationToolParams): ToolLocation[] { return p.output_path ? [{ path: p.output_path }] : []; }
  getDescription(p: WebAutomationToolParams): string { return 'web: ' + p.action + (p.url ? ' ' + p.url.substring(0, 50) : '') + (p.selector ? ' ' + p.selector : ''); }

  async shouldConfirmExecute(p: WebAutomationToolParams, _s: AbortSignal): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.YOLO) return false;
    if (this.validateToolParams(p)) return false;
    return { type: 'exec', title: '[WARN] Confirm: ' + this.getDescription(p), command: 'web_automation(' + p.action + ')', rootCommand: 'web_automation', onConfirm: async () => {} };
  }

  private async preflightPlaywright(): Promise<string | null> {
    try { require.resolve('playwright'); return null; } catch {}
    try { require.resolve('playwright-core'); return null; } catch {}
    return 'web_automation FAIL: Playwright not installed.\nInstall: npm install playwright && npx playwright install chromium';
  }

  async execute(p: WebAutomationToolParams, _s: AbortSignal): Promise<ToolResult> {
    const err = this.validateToolParams(p);
    if (err) return { llmContent: err, returnDisplay: err };
    const depErr = await this.preflightPlaywright();
    if (depErr) return { llmContent: depErr, returnDisplay: 'web_automation FAIL: Playwright not installed' };
    try {
      const script = this.buildPlaywrightScript(p);
      const scriptFile = path.join(os.tmpdir(), 'easycode-web-' + Date.now() + '.mjs');
      fs.writeFileSync(scriptFile, script);
      const { stdout } = await execAsync('node "' + scriptFile + '"', { timeout: (p.timeout_ms || 10000) + 30000, maxBuffer: 20 * 1024 * 1024 });
      try { fs.unlinkSync(scriptFile); } catch {}
      const output = stdout.trim();
      if (!output) return { llmContent: 'web_automation FAIL: No output', returnDisplay: 'web_automation FAIL: No output' };
      try {
        const parsed = JSON.parse(output);
        if (parsed.error) return { llmContent: 'web_automation FAIL: ' + parsed.error, returnDisplay: 'web_automation FAIL: ' + parsed.error };
        const summary = parsed.summary || 'completed';
        const data = parsed.data ? '\n\n' + JSON.stringify(parsed.data, null, 2).substring(0, 2000) : '';
        return { llmContent: 'web_automation OK: ' + summary + data, returnDisplay: 'web_automation OK: ' + summary };
      } catch { return { llmContent: 'web_automation OK: ' + output.substring(0, 2000), returnDisplay: 'web_automation OK: ' + output.substring(0, 100) }; }
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : String(e);
      return { llmContent: 'web_automation FAIL: ' + m, returnDisplay: 'web_automation FAIL: ' + m };
    }
  }

  private buildPlaywrightScript(p: WebAutomationToolParams): string {
    const browser = p.browser || 'chromium';
    const timeout = p.timeout_ms || 10000;
    const stateFile = path.join(os.tmpdir(), 'easycode-web-state.json');
    const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    let body = '';
    switch (p.action) {
      case 'navigate': body = `\n  await page.goto('${esc(p.url!)}', { waitUntil: 'networkidle', timeout: ${timeout} });\n  result = { summary: 'Navigated to ${esc(p.url!.substring(0, 80))}', data: { url: page.url(), title: await page.title() } };`; break;
      case 'fill': body = `\n  const el = await page.waitForSelector('${esc(p.selector!)}', { timeout: ${timeout} });\n  ${p.clear_first !== false ? 'await el.fill("");' : ''}\n  await el.fill('${esc(p.value!)}');\n  result = { summary: 'Filled "${esc(p.selector!)}"', data: { selector: '${esc(p.selector!)}' } };`; break;
      case 'click': body = `\n  const el = await page.waitForSelector('${esc(p.selector!)}', { timeout: ${timeout} });\n  ${p.wait_for_navigation ? 'await Promise.all([page.waitForNavigation({ timeout: ' + timeout + ' }), el.click()]);' : 'await el.click();'}\n  result = { summary: 'Clicked "${esc(p.selector!)}"', data: { url: page.url() } };`; break;
      case 'scrape':
        if (p.extract === 'all') { body = `\n  const el = await page.waitForSelector('${esc(p.selector!)}', { timeout: ${timeout} });\n  const text = await el.textContent();\n  const html = await el.innerHTML();\n  const href = await el.getAttribute('href');\n  const src = await el.getAttribute('src');\n  result = { summary: 'Scraped all', data: { text: text?.trim(), html: html?.substring(0, 5000), href, src } };`; }
        else { const ex = { text: 'await el.textContent()', html: 'await el.innerHTML()', href: 'await el.getAttribute("href")', src: 'await el.getAttribute("src")' }[p.extract!] || 'await el.textContent()'; body = `\n  const el = await page.waitForSelector('${esc(p.selector!)}', { timeout: ${timeout} });\n  const data = ${ex};\n  result = { summary: 'Scraped ${p.extract}', data: { ${p.extract}: data } };`; } break;
      case 'extract_table': body = `\n  const tableData = await page.evaluate((sel) => { const table = document.querySelector(sel); if (!table) return null; const rows = Array.from(table.querySelectorAll('tr')); return rows.map(row => Array.from(row.querySelectorAll('td,th')).map(cell => cell.textContent?.trim() || '')); }, '${esc(p.selector!)}');\n  result = { summary: 'Extracted table', data: tableData };`; break;
      case 'screenshot': body = `\n  const outPath = '${esc(p.output_path || path.join(os.homedir(), 'Desktop', 'web_screenshot_' + Date.now() + '.png'))}';\n  await page.screenshot({ path: outPath, fullPage: ${p.full_page || false} });\n  result = { summary: 'Screenshot saved to ' + outPath, data: { path: outPath } };`; break;
      case 'run_script': body = `\n  const data = await page.evaluate(() => { ${esc(p.script!)} });\n  result = { summary: 'Script executed', data };`; break;
      case 'wait': body = `\n  await page.waitForSelector('${esc(p.selector!)}', { timeout: ${timeout} });\n  result = { summary: 'Element "${esc(p.selector!)}" appeared' };`; break;
      case 'list_tabs': body = `\n  const pages = await browser.contexts()[0].pages();\n  const tabs = await Promise.all(pages.map(async (p, i) => ({ index: i, url: p.url(), title: await p.title() })));\n  result = { summary: tabs.length + ' tabs open', data: tabs };`; break;
      default: body = `result = { error: 'Unknown action: ${esc(p.action)}' };`;
    }
    return `import { ${browser} } from 'playwright';\nconst STATE_FILE = '${esc(stateFile).replace(/\\\\/g, '/')}';\nasync function main() {\n  const browser = await ${browser}.launch({ headless: true });\n  let context;\n  try { const fs = await import('fs'); if (fs.existsSync(STATE_FILE)) { context = await browser.newContext({ storageState: STATE_FILE }); } else { context = await browser.newContext(); } } catch { context = await browser.newContext(); }\n  const pages = context.pages();\n  const page = pages.length > 0 ? pages[0] : await context.newPage();\n  let result;\n  try {\n    ${body}\n    try { await context.storageState({ path: STATE_FILE }); } catch {}\n  } catch (err) { result = { error: err.message }; }\n  await browser.close();\n  console.log(JSON.stringify(result));\n}\nmain().catch(err => { console.log(JSON.stringify({ error: err.message })); process.exit(1); });`;
  }
}
