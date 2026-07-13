/**
 * @license
 * Copyright 2025 Felix
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cross-platform desktop automation tool.
 * Ported from Otto project: https://github.com/Felix201209/otto
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import {
  BaseTool, ToolResult, ToolCallConfirmationDetails,
  Icon, ToolLocation,
} from './tools.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { Config, ApprovalMode } from '../config/config.js';

const execAsync = promisify(exec);

const CLICLICK_ACTIONS: ReadonlySet<string> = new Set([
  'keyboard', 'type_text', 'mouse', 'drag', 'scroll',
]);

const WIN32_PINVOKE = `
Add-Type -ErrorAction SilentlyContinue @"
using System; using System.Runtime.InteropServices; using System.Text;
public class Win32Api {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nW, int nH, bool bRepaint);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint procId);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int nIndex);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, ref RECT rect);
}
"@`.trim();

export interface DesktopAutomationToolParams {
  action: 'launch_app'|'quit_app'|'window_manager'|'keyboard'|'type_text'|'hotkey'|'mouse'|'drag'|'scroll'|'screenshot'|'clipboard'|'run_script'|'get_active_app'|'list_windows'|'screen_info'|'wait_for_app'|'get_window_position';
  app_name?: string; app_path?: string; script?: string;
  keys?: string; text?: string;
  x?: number; y?: number; to_x?: number; to_y?: number;
  button?: 'left'|'right'|'middle'; click_type?: 'single'|'double';
  duration?: number; modifiers?: string;
  window_operation?: 'minimize'|'maximize'|'restore'|'close'|'front'|'tile_left'|'tile_right'|'tile_top'|'tile_bottom'|'fullscreen';
  output_path?: string; clipboard_text?: string;
  scroll_amount?: number; timeout_ms?: number;
}

function ok<T extends ToolResult>(result: string): T {
  return { llmContent: result, returnDisplay: result } as T;
}
function fail<T extends ToolResult>(action: string, reason: string): T {
  return { llmContent: action+' FAIL: '+reason, returnDisplay: action+' FAIL: '+reason } as T;
}

export class DesktopAutomationTool extends BaseTool<DesktopAutomationToolParams, ToolResult> {
  static readonly Name: string = 'desktop_automation';

  constructor(private readonly config: Config) {
    const desc = `Cross-platform desktop automation (macOS+Windows). 17 actions.

EXAMPLES:
  launch_app: {action:"launch_app", app_name:"Safari"}
  quit_app: {action:"quit_app", app_name:"chrome"}
  window_manager: {action:"window_manager", app_name:"Finder", window_operation:"tile_left"}
    operations: minimize, maximize, restore, close, front, tile_left, tile_right, tile_top, tile_bottom, fullscreen
  keyboard: {action:"keyboard", keys:"cmd+c"}  -- modifier+key combo
  type_text: {action:"type_text", text:"Hello World\\nNew line"}
  hotkey: {action:"hotkey", keys:"ctrl+shift+esc"}  -- global hotkey
  mouse: {action:"mouse", x:500, y:300, button:"left", click_type:"single"}
  drag: {action:"drag", x:100, y:100, to_x:500, to_y:300, duration:300}
  scroll: {action:"scroll", scroll_amount:3}  -- positive=up, negative=down
  screenshot: {action:"screenshot", output_path:"/Users/me/Desktop/screen.png"}
  clipboard: {action:"clipboard", clipboard_text:"read"}  -- or text to set
  run_script: {action:"run_script", script:"tell app \\"Safari\\" to activate"}
  get_active_app: {action:"get_active_app"}
  list_windows: {action:"list_windows"}
  screen_info: {action:"screen_info"}
  wait_for_app: {action:"wait_for_app", app_name:"Safari", timeout_ms:10000}
  get_window_position: {action:"get_window_position", app_name:"Safari"}

DEPENDENCIES: macOS needs cliclick (brew install cliclick). Windows needs nothing extra.`;
    super(DesktopAutomationTool.Name, 'DesktopAutomation', desc, Icon.Terminal,
      {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING, enum: ['launch_app','quit_app','window_manager','keyboard','type_text','hotkey','mouse','drag','scroll','screenshot','clipboard','run_script','get_active_app','list_windows','screen_info','wait_for_app','get_window_position'], description: 'What to do (see EXAMPLES in tool description)' },
          app_name: { type: Type.STRING, description: 'App name. macOS: "Safari","Finder","Visual Studio Code". Windows: "notepad","chrome","firefox"' },
          app_path: { type: Type.STRING, description: 'Full path. macOS: /Applications/Safari.app. Windows: C:\\Program Files\\...\\app.exe' },
          script: { type: Type.STRING, description: 'AppleScript/JXA (macOS) or PowerShell (Windows) script text' },
          keys: { type: Type.STRING, description: 'Modifier+key: "ctrl+c","cmd+shift+n","alt+f4". SendKeys shorthand: "^a","%{F4}"' },
          text: { type: Type.STRING, description: 'Raw text to type. Newline with \\n. Handles Unicode.' },
          x: { type: Type.NUMBER, description: 'Pixel X from left edge of primary screen' },
          y: { type: Type.NUMBER, description: 'Pixel Y from top edge of primary screen' },
          to_x: { type: Type.NUMBER, description: 'Drag destination X' },
          to_y: { type: Type.NUMBER, description: 'Drag destination Y' },
          button: { type: Type.STRING, enum: ['left','right','middle'], description: 'Mouse button. Default: left' },
          click_type: { type: Type.STRING, enum: ['single','double'], description: 'Single or double click. Default: single' },
          duration: { type: Type.NUMBER, description: 'Drag/scroll duration in ms. Default: 200' },
          modifiers: { type: Type.STRING, description: 'Extra modifiers for keyboard action: "cmd,shift" (comma-separated)' },
          window_operation: { type: Type.STRING, enum: ['minimize','maximize','restore','close','front','tile_left','tile_right','tile_top','tile_bottom','fullscreen'], description: 'Window operation. Must combine with app_name.' },
          output_path: { type: Type.STRING, description: 'Screenshot save path. Default: Desktop/screenshot_<ts>.png' },
          clipboard_text: { type: Type.STRING, description: '"read" to get clipboard, or text string to set clipboard' },
          scroll_amount: { type: Type.NUMBER, description: 'Number of scroll wheel clicks. Positive=up (toward top), negative=down' },
          timeout_ms: { type: Type.NUMBER, description: 'Max wait time for wait_for_app in ms. Default: 10000' },
        },
        required: ['action'],
      },
    );
  }

  validateToolParams(p: DesktopAutomationToolParams): string | null {
    const e = SchemaValidator.validate(this.schema.parameters!, p, DesktopAutomationTool.Name);
    if (e) return e;
    if (os.platform() !== 'darwin' && os.platform() !== 'win32') return 'desktop_automation: macOS or Windows only. Current OS: '+os.platform();
    const a = p.action;
    const combo = ['launch_app','quit_app','window_manager','wait_for_app','get_window_position'];
    if (combo.includes(a) && !p.app_name && !p.app_path) return 'desktop_automation/'+a+': must provide app_name or app_path';
    if (a==='keyboard' && !p.keys) return 'desktop_automation/keyboard: keys required (e.g. "ctrl+c", "cmd+shift+n")';
    if (a==='type_text' && !p.text) return 'desktop_automation/type_text: text required';
    if (a==='hotkey' && !p.keys) return 'desktop_automation/hotkey: keys required';
    if (a==='mouse' && (p.x===undefined||p.y===undefined)) return 'desktop_automation/mouse: x and y coordinates required';
    if (a==='drag' && (p.x===undefined||p.y===undefined||p.to_x===undefined||p.to_y===undefined)) return 'desktop_automation/drag: x, y, to_x, to_y all required';
    if (a==='scroll' && p.scroll_amount===undefined) return 'desktop_automation/scroll: scroll_amount required (e.g. 3 for up, -3 for down)';
    if (a==='run_script' && !p.script) return 'desktop_automation/run_script: script required';
    if (a==='window_manager' && !p.window_operation) return 'desktop_automation/window_manager: window_operation required (e.g. tile_left, maximize)';
    return null;
  }

  toolLocations(): ToolLocation[] { return []; }
  getDescription(p: DesktopAutomationToolParams): string {
    return p.action+(p.app_name?' '+p.app_name:'')+(p.keys?' '+p.keys:'')+(p.text?' typing text':'');
  }

  async shouldConfirmExecute(p: DesktopAutomationToolParams, _s: AbortSignal): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.YOLO) return false;
    if (this.validateToolParams(p)) return false;
    const danger = p.action==='run_script'||p.action==='quit_app'||p.action==='drag';
    const prefix = danger ? '[WARN] ' : '';
    return { type:'exec', title: prefix+'Confirm: '+this.getDescription(p),
      command:'desktop_automation('+p.action+')', rootCommand:'desktop_automation', onConfirm: async ()=>{}};
  }

  private async preflightCliclick(): Promise<string | null> {
    try {
      await execAsync('which cliclick', { timeout: 3000 });
      return null;
    } catch {
      return 'cliclick not installed (required for keyboard/mouse on macOS). Install: brew install cliclick';
    }
  }

  async execute(p: DesktopAutomationToolParams, _s: AbortSignal): Promise<ToolResult> {
    const err = this.validateToolParams(p);
    if (err) return fail(p.action, err);

    const isMac = os.platform()==='darwin';
    if (isMac && CLICLICK_ACTIONS.has(p.action)) {
      const depErr = await this.preflightCliclick();
      if (depErr) return fail(p.action, depErr);
    }

    try {
      let r = '';
      switch (p.action) {
        case 'launch_app': r=isMac?await this.macLaunch(p):await this.winLaunch(p); break;
        case 'quit_app': r=isMac?await this.macQuit(p):await this.winQuit(p); break;
        case 'window_manager': r=isMac?await this.macWindow(p.app_name!,p.window_operation!):await this.winWindow(p.app_name!,p.window_operation!); break;
        case 'keyboard': r=isMac?await this.macKeys(p.keys!,p.modifiers):await this.winKeys(p.keys!); break;
        case 'type_text': r=isMac?await this.macTypeText(p.text!):await this.winTypeText(p.text!); break;
        case 'hotkey': r=isMac?await this.macHotkey(p.keys!):await this.winHotkey(p.keys!); break;
        case 'mouse': r=isMac?await this.macClick(p.x!,p.y!,p.button||'left',p.click_type||'single'):await this.winClick(p.x!,p.y!,p.button||'left',p.click_type||'single'); break;
        case 'drag': r=isMac?await this.macDrag(p.x!,p.y!,p.to_x!,p.to_y!,p.duration||200):await this.winDrag(p.x!,p.y!,p.to_x!,p.to_y!,p.duration||200); break;
        case 'scroll': r=isMac?await this.macScroll(p.scroll_amount||0):await this.winScroll(p.scroll_amount||0); break;
        case 'screenshot': r=isMac?await this.macScreenshot(p.output_path):await this.winScreenshot(p.output_path); break;
        case 'clipboard': r=isMac?await this.macClipboard(p.clipboard_text):await this.winClipboard(p.clipboard_text); break;
        case 'run_script': r=isMac?await this.macScript(p.script!):await this.winScript(p.script!); break;
        case 'get_active_app': r=isMac?await this.macActiveApp():await this.winActiveApp(); break;
        case 'list_windows': r=isMac?await this.macListWindows():await this.winListWindows(); break;
        case 'screen_info': r=isMac?await this.macScreenInfo():await this.winScreenInfo(); break;
        case 'wait_for_app': r=isMac?await this.macWaitForApp(p.app_name!,p.timeout_ms||10000):await this.winWaitForApp(p.app_name!,p.timeout_ms||10000); break;
        case 'get_window_position': r=isMac?await this.macGetWinPos(p.app_name!):await this.winGetWinPos(p.app_name!); break;
        default: return fail(p.action, 'unknown action');
      }
      return ok(p.action+' OK: '+r);
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : String(e);
      return fail(p.action, m);
    }
  }

  // ============================ macOS ============================
  private esc(s: string): string { return s.replace(/"/g,'\\"'); }
  private async osa(script: string, jxa=false): Promise<string> {
    const cmd = 'osascript '+(jxa?'-l JavaScript ':'')+" -e '"+script.replace(/'/g,"'\\''")+"'";
    const { stdout } = await execAsync(cmd, { maxBuffer: 10*1024*1024, timeout: 15000 });
    return stdout.trim();
  }
  private async macScreenSize(): Promise<{w:number;h:number}> {
    try { const o=await this.osa('tell application "Finder" to get bounds of window of desktop'); const m=o.match(/(\d+),\s*(\d+)$/); if(m) return {w:+m[1],h:+m[2]}; } catch {}
    return {w:1920,h:1080};
  }
  private async macLaunch(p: DesktopAutomationToolParams): Promise<string> {
    const t=p.app_path||p.app_name!;
    await execAsync(p.app_path?'open "'+this.esc(t)+'"':'open -a "'+this.esc(t)+'"');
    return 'Launched: '+t;
  }
  private async macQuit(p: DesktopAutomationToolParams): Promise<string> {
    await this.osa('tell application "'+this.esc(p.app_name!)+'" to quit');
    return 'Quit: '+p.app_name;
  }
  private async macWindow(app: string, op: string): Promise<string> {
    const a=this.esc(app);
    const {w,h}=await this.macScreenSize();
    const hw=Math.floor(w/2), hh=Math.floor(h/2), m=25;
    const scripts: Record<string,string> = {
      minimize: 'tell application "System Events" to set miniaturized of every window of process "'+a+'" to true',
      maximize: 'tell application "'+a+'" to activate',
      restore: 'tell application "System Events"\ntell process "'+a+'"\nset position of window 1 to {100,100}\nset size of window 1 to {'+(w-200)+','+(h-200)+'}\nend tell\nend tell',
      close: 'tell application "System Events"\ntell process "'+a+'"\nif (count of windows) > 0 then tell window 1 to if it is closeable then click button 1\nend tell\nend tell',
      front: 'tell application "'+a+'" to activate',
      fullscreen: 'tell application "'+a+'" to activate\ndelay 0.3\ntell application "System Events" to keystroke "f" using {command down, control down}',
      tile_left: 'tell application "System Events"\ntell process "'+a+'"\nset position of window 1 to {0,'+m+'}\nset size of window 1 to {'+hw+','+(h-m)+'}\nend tell\nend tell',
      tile_right: 'tell application "System Events"\ntell process "'+a+'"\nset position of window 1 to {'+hw+','+m+'}\nset size of window 1 to {'+hw+','+(h-m)+'}\nend tell\nend tell',
      tile_top: 'tell application "System Events"\ntell process "'+a+'"\nset position of window 1 to {0,0}\nset size of window 1 to {'+w+','+hh+'}\nend tell\nend tell',
      tile_bottom: 'tell application "System Events"\ntell process "'+a+'"\nset position of window 1 to {0,'+hh+'}\nset size of window 1 to {'+w+','+hh+'}\nend tell\nend tell',
    };
    const sc=scripts[op];
    if(!sc) throw new Error('Unknown window operation: '+op);
    try { await this.osa(sc); }
    catch(e) { throw new Error('App not running or has no windows: '+app+' ('+(e instanceof Error?e.message:'')+')'); }
    return 'Window '+op+': '+app;
  }
  private async macKeys(keys: string, modifiers?: string): Promise<string> {
    const combo = modifiers ? modifiers.replace(/\s+/g,'').split(',').filter(Boolean).join(',') : '';
    const isCombo = /^(cmd|ctrl|alt|option|shift|win|meta|command|control)(\+(cmd|ctrl|alt|option|shift|win|meta|command|control))*\+[a-z0-9]$/i.test(keys);
    if (isCombo) {
      await execAsync('cliclick kp:'+combo.replace(/,/g,'+')+keys.toLowerCase().replace(/\s+/g,''));
    } else {
      await execAsync('cliclick t:"'+keys.replace(/"/g,'\\"')+'"');
    }
    return 'Keys: '+(modifiers?modifiers+'+':'')+keys;
  }
  private async macTypeText(t: string): Promise<string> {
    await execAsync('cliclick t:"'+t.replace(/"/g,'\\"')+'"');
    return 'Typed: '+t.substring(0,80);
  }
  private async macHotkey(keys: string): Promise<string> {
    const parts=keys.toLowerCase().replace(/\s+/g,'').split('+');
    const key=parts.pop()!;
    const modMap: Record<string,string>={cmd:'command',ctrl:'control',alt:'option',shift:'shift'};
    const modParts=parts.map(m=>modMap[m]||m).map(m=>m+' down');
    const modStr=modParts.length>0?' using {'+modParts.join(', ')+'}':'';
    await this.osa('tell application "System Events" to keystroke "'+this.esc(key)+'"'+modStr);
    return 'Hotkey: '+keys;
  }
  private async macClick(x:number,y:number,b:string,ct:string): Promise<string> {
    const pre=b==='right'?'rc:':b==='middle'?'mc:':ct==='double'?'dc:':'c:';
    await execAsync('cliclick '+pre+x+','+y);
    return 'Click '+b+' '+ct+' at ('+x+','+y+')';
  }
  private async macDrag(x:number,y:number,tx:number,ty:number,dur:number): Promise<string> {
    await execAsync('cliclick dd:'+x+','+y);
    const steps=Math.max(Math.ceil(dur/30),5);
    for(let i=1;i<=steps;i++){
      const cx=x+Math.round((tx-x)*i/steps), cy=y+Math.round((ty-y)*i/steps);
      await execAsync('cliclick dm:'+cx+','+cy);
      await new Promise(r=>setTimeout(r,Math.floor(dur/steps)));
    }
    await execAsync('cliclick du:'+tx+','+ty);
    return 'Drag ('+x+','+y+') -> ('+tx+','+ty+')';
  }
  private async macScroll(amount: number): Promise<string> {
    const dir = amount > 0 ? 'wu:' : 'wd:';
    for (let i=0;i<Math.abs(amount);i++) await execAsync('cliclick '+dir+'0,0');
    return 'Scrolled '+(amount>0?'up':'down')+' '+Math.abs(amount)+' clicks';
  }
  private async macScreenshot(out?: string): Promise<string> {
    const p=out||os.homedir()+'/Desktop/screenshot_'+Date.now()+'.png';
    await execAsync('screencapture -x "'+p+'"');
    return 'Screenshot saved: '+p;
  }
  private async macClipboard(text?: string): Promise<string> {
    if(!text||text==='read') {
      const {stdout}=await execAsync('pbpaste');
      return 'Clipboard read: '+stdout.trim().substring(0,200);
    }
    const child=exec('pbcopy'); child.stdin!.write(text); child.stdin!.end();
    await new Promise<void>((res,rej)=>{ child.on('close',c=>c===0?res():rej(new Error('pbcopy exit '+c))); child.on('error',rej); });
    return 'Clipboard set: '+text.substring(0,80);
  }
  private async macScript(script: string): Promise<string> {
    const jxa=script.includes('Application(')||script.trim().startsWith('//');
    const out = await this.osa(script,jxa);
    return 'Script output: '+(out||'(empty)');
  }
  private async macActiveApp(): Promise<string> {
    const o=await this.osa('tell application "System Events" to get name of first process whose frontmost is true');
    return 'Active app: '+o;
  }
  private async macListWindows(): Promise<string> {
    const sc='tell application "System Events"\nset w to ""\nrepeat with p in every process whose visible is true\nset pn to name of p\nrepeat with win in every window of p\nset w to w & pn & " - " & (name of win) & "\\n"\nend repeat\nend repeat\nreturn w\nend tell';
    return await this.osa(sc)||'No visible windows';
  }
  private async macScreenInfo(): Promise<string> {
    const {w,h}=await this.macScreenSize();
    try { const o=await execAsync('system_profiler SPDisplaysDataType 2>/dev/null',{maxBuffer:1024*1024}); return 'Primary: '+w+'x'+h+'\n'+o.stdout.trim(); }
    catch { return 'Primary: '+w+'x'+h; }
  }
  private async macWaitForApp(app: string, timeout: number): Promise<string> {
    const deadline=Date.now()+timeout;
    while(Date.now()<deadline){
      try { await execAsync('pgrep -x "'+this.esc(app)+'"'); return 'App running: '+app; } catch {}
      await new Promise(r=>setTimeout(r,500));
    }
    throw new Error('Timeout after '+timeout+'ms: '+app+' did not start');
  }
  private async macGetWinPos(app: string): Promise<string> {
    const sc='tell application "System Events"\ntell process "'+this.esc(app)+'"\n'+
      'set p to position of window 1\nset s to size of window 1\n'+
      'return (item 1 of p) & "," & (item 2 of p) & "," & (item 1 of s) & "," & (item 2 of s) & "\\n"\nend tell\nend tell';
    try { return 'Position: '+await this.osa(sc); }
    catch { throw new Error('Cannot get position. App not running? '+app); }
  }

  // ============================ Windows ============================
  private async ps(cmd: string): Promise<string> {
    const enc=Buffer.from(WIN32_PINVOKE+'\n'+cmd,'utf16le').toString('base64');
    const { stdout } = await execAsync('powershell -NoProfile -NonInteractive -EncodedCommand '+enc, { maxBuffer: 10*1024*1024, timeout: 60000 });
    return stdout.trim();
  }
  private pe(s: string): string { return s.replace(/`/g,'``').replace(/"/g,'`"').replace(/\$/g,'`$'); }
  private wpn(n: string): string { return n.replace(/\.exe$/i,''); }

  private async winLaunch(p: DesktopAutomationToolParams): Promise<string> {
    const t=p.app_path||p.app_name!;
    await this.ps(p.app_path?'Start-Process -FilePath "'+this.pe(t)+'"':'Start-Process "'+this.pe(this.wpn(t))+'"');
    return 'Launched: '+t;
  }
  private async winQuit(p: DesktopAutomationToolParams): Promise<string> {
    await this.ps('Get-Process "'+this.pe(this.wpn(p.app_name!))+'" -ErrorAction SilentlyContinue | Stop-Process -Force');
    return 'Quit: '+p.app_name;
  }
  private async winWindow(app: string, op: string): Promise<string> {
    const n=this.wpn(app);
    const fw = `$t=Get-Process -Name "${this.pe(n)}" -ErrorAction SilentlyContinue|Select -First 1
if(-not$t){throw "App not running: ${this.pe(n)}"}
$h=$t.MainWindowHandle; if($h -eq [IntPtr]::Zero){throw "No main window: ${this.pe(n)}"}`;
    const ops: Record<string,string> = {
      minimize:fw+'\n[Win32Api]::ShowWindow($h,6);"minimized"',
      maximize:fw+'\n[Win32Api]::ShowWindow($h,3);[Win32Api]::SetForegroundWindow($h);"maximized"',
      restore:fw+'\n[Win32Api]::ShowWindow($h,9);[Win32Api]::SetForegroundWindow($h);"restored"',
      close:fw+'\n$t.CloseMainWindow()|Out-Null;Start-Sleep -ms 200;if(-not$t.HasExited){$t.Kill()};"closed"',
      front:fw+'\n[Win32Api]::SetForegroundWindow($h);"focused"',
      fullscreen:fw+'\n$w=[Win32Api]::GetSystemMetrics(0);$h2=[Win32Api]::GetSystemMetrics(1);[Win32Api]::MoveWindow($h,0,0,$w,$h2,$true);"fullscreen"',
      tile_left:fw+'\n$w=[Math]::Floor([Win32Api]::GetSystemMetrics(0)/2);$h2=[Win32Api]::GetSystemMetrics(1);[Win32Api]::MoveWindow($h,0,0,$w,$h2,$true);"tiled-left"',
      tile_right:fw+'\n$w=[Math]::Floor([Win32Api]::GetSystemMetrics(0)/2);$h2=[Win32Api]::GetSystemMetrics(1);[Win32Api]::MoveWindow($h,$w,0,$w,$h2,$true);"tiled-right"',
      tile_top:fw+'\n$w=[Win32Api]::GetSystemMetrics(0);$h2=[Math]::Floor([Win32Api]::GetSystemMetrics(1)/2);[Win32Api]::MoveWindow($h,0,0,$w,$h2,$true);"tiled-top"',
      tile_bottom:fw+'\n$w=[Win32Api]::GetSystemMetrics(0);$h2=[Math]::Floor([Win32Api]::GetSystemMetrics(1)/2);[Win32Api]::MoveWindow($h,0,$h2,$w,$h2,$true);"tiled-bottom"',
    };
    const sc=ops[op]; if(!sc) throw new Error('Unknown op: '+op);
    const out=await this.ps(sc);
    return 'Window '+op+': '+app+' ('+out+')';
  }
  private async winKeys(keys: string): Promise<string> {
    await this.ps('Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("'+this.pe(keys)+'")');
    return 'Keys: '+keys;
  }
  private async winTypeText(t: string): Promise<string> {
    const esc=t.replace(/[+^%~(){}]/g,'{$&}').replace(/\n/g,'~');
    await this.ps('Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("'+this.pe(esc)+'")');
    return 'Typed: '+t.substring(0,80);
  }
  private async winHotkey(keys: string): Promise<string> {
    const VK: Record<string,number>={ctrl:0x11,alt:0x12,shift:0x10,win:0x5B,cmd:0x5B,enter:0x0D,tab:0x09,esc:0x1B,space:0x20,left:0x25,up:0x26,right:0x27,down:0x28,delete:0x2E,f1:0x70,f2:0x71,f3:0x72,f4:0x73,f5:0x74,f6:0x75,f7:0x76,f8:0x77,f9:0x78,f10:0x79,f11:0x7A,f12:0x7B};
    const parts=keys.toLowerCase().replace(/\s+/g,'').split('+'); const key=parts.pop()!; const mods=parts;
    const pd=mods.map(m=>'[Win32Api]::keybd_event('+(VK[m]||m.charCodeAt(0))+',0,0,[UIntPtr]::Zero)').join(';');
    const pu=mods.reverse().map(m=>'[Win32Api]::keybd_event('+(VK[m]||m.charCodeAt(0))+',0,2,[UIntPtr]::Zero)').join(';');
    const kd='[Win32Api]::keybd_event('+(VK[key]||key.toUpperCase().charCodeAt(0))+',0,0,[UIntPtr]::Zero)';
    const ku='[Win32Api]::keybd_event('+(VK[key]||key.toUpperCase().charCodeAt(0))+',0,2,[UIntPtr]::Zero)';
    await this.ps(`${pd};Start-Sleep -ms 30;${kd};Start-Sleep -ms 50;${ku};Start-Sleep -ms 30;${pu}`);
    return 'Hotkey: '+keys;
  }
  private async winClick(x:number,y:number,b:string,ct:string): Promise<string> {
    const f: Record<string,string>={left:'0x0002',right:'0x0008',middle:'0x0020'};
    const d=f[b]||'0x0002'; const u=(parseInt(d)*2).toString();
    const clicks=ct==='double'?2:1;
    await this.ps(`[Win32Api]::SetCursorPos(${x},${y});1..${clicks}|%{[Win32Api]::mouse_event(${d},0,0,0,[UIntPtr]::Zero);Start-Sleep -ms 20;[Win32Api]::mouse_event(${u},0,0,0,[UIntPtr]::Zero);Start-Sleep -ms 30}`);
    return 'Click '+b+' '+ct+' at ('+x+','+y+')';
  }
  private async winDrag(x:number,y:number,tx:number,ty:number,dur:number): Promise<string> {
    await this.ps(`[Win32Api]::SetCursorPos(${x},${y});[Win32Api]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero);$s=[Math]::Max([Math]::Ceiling(${dur}/30),5);for($i=1;$i -le $s;$i++){$cx=${x}+[Math]::Round((${tx}-${x})*$i/$s);$cy=${y}+[Math]::Round((${ty}-${y})*$i/$s);[Win32Api]::SetCursorPos($cx,$cy);Start-Sleep -ms [Math]::Floor(${dur}/$s)}[Win32Api]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero)`);
    return 'Drag ('+x+','+y+') -> ('+tx+','+ty+')';
  }
  private async winScroll(amount: number): Promise<string> {
    const flag='0x0800';
    const delta=amount>0?120:-120;
    for(let i=0;i<Math.abs(amount);i++) await this.ps(`[Win32Api]::mouse_event(${flag},0,0,${delta},[UIntPtr]::Zero);Start-Sleep -ms 10`);
    return 'Scrolled '+(amount>0?'up':'down')+' '+Math.abs(amount)+' clicks';
  }
  private async winScreenshot(out?: string): Promise<string> {
    const p=out||os.homedir()+'\\Desktop\\screenshot_'+Date.now()+'.png';
    await this.ps('Add-Type -AssemblyName System.Windows.Forms,System.Drawing;'+
      '$s=[System.Windows.Forms.Screen]::PrimaryScreen;$b=New-Object System.Drawing.Bitmap($s.Bounds.Width,$s.Bounds.Height);'+
      '$g=[System.Drawing.Graphics]::FromImage($b);$g.CopyFromScreen(0,0,0,0,$b.Size);'+
      '$b.Save("'+this.pe(p)+'",[System.Drawing.Imaging.ImageFormat]::Png);$g.Dispose();$b.Dispose()');
    return 'Screenshot saved: '+p;
  }
  private async winClipboard(text?: string): Promise<string> {
    if (!text||text==='read') {
      const o=await this.ps('Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::GetText()');
      return 'Clipboard read: '+(o||'(empty)').substring(0,200);
    }
    const b64=Buffer.from(text,'utf8').toString('base64');
    await this.ps('Add-Type -AssemblyName System.Windows.Forms; $t=[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("'+b64+'")); [System.Windows.Forms.Clipboard]::SetText($t)');
    return 'Clipboard set: '+text.substring(0,80);
  }
  private async winScript(script: string): Promise<string> {
    const out = await this.ps(script);
    return 'Script output: '+(out||'(empty)');
  }
  private async winActiveApp(): Promise<string> {
    const o=await this.ps('$h=[Win32Api]::GetForegroundWindow();$sb=New-Object System.Text.StringBuilder(256);[Win32Api]::GetWindowText($h,$sb,256);$t=$sb.ToString();$pid=0;[Win32Api]::GetWindowThreadProcessId($h,[ref]$pid);$p=Get-Process -Id $pid -ErrorAction SilentlyContinue;"$($p.ProcessName) - $t"');
    return 'Active app: '+(o||'(unknown)');
  }
  private async winListWindows(): Promise<string> {
    return await this.ps('Get-Process|?{$_.MainWindowTitle -ne ""}|Select ProcessName,MainWindowTitle|Format-Table -AutoSize|Out-String -Width 200')||'No visible windows';
  }
  private async winScreenInfo(): Promise<string> {
    return await this.ps('Add-Type -AssemblyName System.Windows.Forms;'+
      '$a=[System.Windows.Forms.Screen]::AllScreens|%{$p=if($_.Primary){"(primary)"}else{""};"$($_.Bounds.Width)x$($_.Bounds.Height)@($($_.Bounds.X),$($_.Bounds.Y))$p"};'+
      '$a -join [Environment]::NewLine');
  }
  private async winWaitForApp(app: string, timeout: number): Promise<string> {
    try {
      const o=await this.ps('$d='+timeout+';$sw=[Diagnostics.Stopwatch]::StartNew();'+
      'while($sw.ElapsedMilliseconds -lt $d){$p=Get-Process "'+this.pe(this.wpn(app))+'" -ErrorAction SilentlyContinue;if($p){$p.ProcessName;exit}}'+
      'throw "timeout"');
      return 'App running: '+app;
    } catch(e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('timeout')) throw new Error('Timeout: '+app+' not started within '+timeout+'ms');
      throw e;
    }
  }
  private async winGetWinPos(app: string): Promise<string> {
    const o=await this.ps('$t=Get-Process "'+this.pe(this.wpn(app))+'" -ErrorAction SilentlyContinue|Select -First 1;'+
      'if(-not$t){throw "App not running"}$h=$t.MainWindowHandle;if($h -eq [IntPtr]::Zero){throw "No window"}'+
      '$r=New-Object Win32Api+RECT;[Win32Api]::GetWindowRect($h,[ref]$r);"$($r.Left),$($r.Top),$($r.Right-$r.Left),$($r.Bottom-$r.Top)"');
    return 'Position: '+(o||'unknown');
  }
}
