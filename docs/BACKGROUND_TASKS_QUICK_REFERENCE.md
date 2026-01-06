# Background Tasks - Quick Reference

## 🎯 What Was Built

A complete **Ctrl+B background task system** for shell commands in DeepV Code.

**Status: ✅ COMPLETE & COMPILED**

---

## 📦 Key Files

### Core (New)
- `packages/core/src/services/backgroundTaskManager.ts` - Task manager
- `packages/core/src/tools/shell.ts` - Added `executeBackground()` method

### CLI (New)
- `packages/cli/src/ui/hooks/useBackgroundTasks.ts` - Task state
- `packages/cli/src/ui/hooks/useBackgroundTasksUI.ts` - UI state & keyboard
- `packages/cli/src/ui/hooks/useShellWithBackgroundSupport.ts` - Shell integration
- `packages/cli/src/ui/components/BackgroundTasksPanel.tsx` - UI panel

### Documentation
- `docs/BACKGROUND_TASKS_IMPLEMENTATION.md` - Completion report (👈 READ THIS FIRST)
- `docs/background-tasks-architecture.md` - System design
- `docs/background-tasks-integration-guide.md` - Step-by-step integration
- `docs/BACKGROUND_TASKS_QUICK_REFERENCE.md` - This file

---

## ⌨️ User Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Ctrl+B** | Toggle background tasks panel |
| **↑** | Previous task (when panel open) |
| **↓** | Next task (when panel open) |
| **Enter** | View task details (when panel open) |
| **k** | Kill selected task (when panel open) |
| **Esc** | Close panel (when panel open) |

---

## 🏗️ Architecture at a Glance

```
User presses Ctrl+B
    ↓
useBackgroundTasksUI detects it
    ↓
setBackgroundMode(true)
    ↓
Shell processor checks shouldExecuteBackground()
    ↓
ShellTool.executeBackground() called
    ↓
BackgroundTaskManager.createTask() returns task ID
    ↓
Process spawned (detached: true)
    ↓
Task output → taskManager.appendOutput()
    ↓
Process exits → taskManager.completeTask()
    ↓
UI updates via task events
```

---

## 💻 Core API Examples

### Get Task Manager
```typescript
import { getBackgroundTaskManager } from 'deepv-code-core';
const manager = getBackgroundTaskManager();
```

### Create Task
```typescript
const task = manager.createTask('npm run build', 'packages/cli');
// Returns: { id: 'task_1', status: 'running', ... }
```

### Update Task
```typescript
manager.appendOutput(task.id, 'Build output...');
manager.completeTask(task.id, { exitCode: 0 });
```

### Listen to Events
```typescript
manager.on('task-completed', (event) => {
  console.log('Task completed:', event.task.id);
});
```

---

## 🪝 Hook Examples

### useBackgroundTasks
```typescript
const { tasks, runningCount, killTask } = useBackgroundTasks();
// tasks = [{ id: 'task_1', status: 'running', ... }]
// runningCount = 1
```

### useBackgroundTasksUI
```typescript
const { isPanelOpen, togglePanel } = useBackgroundTasksUI(tasks.length);
// isPanelOpen = true when user presses Ctrl+B
```

### useShellWithBackgroundSupport
```typescript
const { shouldExecuteBackground } = useShellWithBackgroundSupport();
// Returns true when user pressed Ctrl+B
```

---

## 🔧 Integration Checklist

### Phase 2: Shell Processor
- [ ] Import `useShellWithBackgroundSupport` hook
- [ ] Import `ShellTool` and call `executeBackground()`
- [ ] Check `shouldExecuteBackground()` before executing shell commands
- [ ] Reset background mode after execution

### Phase 3: Main Component
- [ ] Import `useBackgroundTasks` and `useBackgroundTasksUI`
- [ ] Import `BackgroundTasksPanel` component
- [ ] Render panel in footer when `isPanelOpen === true`

### Phase 4: UI Hints
- [ ] Display "Ctrl+B to run in background" during shell execution
- [ ] Update footer to show "↓ to view background tasks" when tasks exist

### Phase 5: AI Response (Optional)
- [ ] Listen to `taskManager.on('task-completed', ...)`
- [ ] Create message with task results
- [ ] Trigger AI to respond with task outcome

---

## 📊 Task Statuses

```
'running'   - Task is currently executing
'completed' - Task finished successfully (exitCode 0)
'failed'    - Task encountered error
'cancelled' - Task was cancelled by user
```

---

## 🎨 UI Components

### BackgroundTasksPanel Props
```typescript
interface BackgroundTasksPanelProps {
  tasks: BackgroundTask[];
  selectedIndex: number;
  onSelectTask: (index: number) => void;
  onKillTask: (taskId: string) => void;
  onClose: () => void;
}
```

### Status Icons
```
⏳ Running
✅ Completed
❌ Failed
⛔ Cancelled
```

---

## 📝 Code Snippets

### In Shell Processor
```typescript
import { useShellWithBackgroundSupport } from './hooks/useShellWithBackgroundSupport.js';

const { shouldExecuteBackground, resetBackgroundMode } = useShellWithBackgroundSupport();

// During shell command execution:
if (shouldExecuteBackground()) {
  const result = shellTool.executeBackground(params, signal);
  resetBackgroundMode();
  return result;
} else {
  return await shellTool.execute(params, signal);
}
```

### In Main Component
```typescript
import { useBackgroundTasks } from './hooks/useBackgroundTasks.js';
import { useBackgroundTasksUI } from './hooks/useBackgroundTasksUI.js';
import { BackgroundTasksPanel } from './components/BackgroundTasksPanel.js';

const { tasks, selectedTaskIndex, setSelectedTaskIndex, killTask } = useBackgroundTasks();
const { isPanelOpen, togglePanel } = useBackgroundTasksUI(tasks.length);

// Render:
{isPanelOpen && (
  <BackgroundTasksPanel
    tasks={tasks}
    selectedIndex={selectedTaskIndex}
    onSelectTask={setSelectedTaskIndex}
    onKillTask={killTask}
    onClose={togglePanel}
  />
)}
```

---

## 🔍 Data Structures

### BackgroundTask
```typescript
{
  id: string;              // 'task_1'
  command: string;         // 'npm run build'
  directory?: string;      // 'packages/cli'
  status: string;          // 'running' | 'completed' | ...
  pid?: number;            // Process ID
  startTime: number;       // Timestamp
  endTime?: number;        // Timestamp
  output: string;          // Accumulated stdout
  stderr: string;          // Accumulated stderr
  exitCode?: number;       // 0, 1, etc.
  signal?: string;         // 'SIGTERM', etc.
  error?: string;          // Error message if failed
}
```

---

## ✅ Compilation Status

```
✔ Core TypeScript: 0 errors
✔ CLI TypeScript: 0 errors
✔ All exports working
✔ Build passed
```

---

## 📚 Full Documentation

1. **Implementation Complete** → `BACKGROUND_TASKS_IMPLEMENTATION.md`
2. **System Design** → `background-tasks-architecture.md`
3. **Integration Guide** → `background-tasks-integration-guide.md`
4. **Quick Ref** → This file (you are here)

---

## 🚀 Ready for Next Steps

All infrastructure is complete. Next phase is integrating hooks into:
1. Shell command processor (`shellCommandProcessor.ts`)
2. Main chat component (likely `ChatInput.tsx` or `Chat.tsx`)

See `background-tasks-integration-guide.md` Phase 2-3 for detailed steps.

---

## 💡 Key Design Principles

1. **Non-blocking** - Doesn't prevent user interaction
2. **Event-driven** - Uses EventEmitter for loose coupling
3. **Extensible** - Easy to add features
4. **Keyboard-friendly** - Single key shortcuts
5. **Type-safe** - Full TypeScript support

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Panel won't open | Check `useBackgroundTasksUI` is initialized |
| Task not visible | Check `executeBackground()` is being called |
| Process not running | Check `detached: true` in spawn options |

---

## 📞 Questions?

- **How it works?** → Read `background-tasks-architecture.md`
- **How to integrate?** → Read `background-tasks-integration-guide.md`
- **Why it's designed this way?** → Check code comments

---

**Status: ✅ READY FOR INTEGRATION**

You have everything you need to integrate background tasks into DeepV Code!
