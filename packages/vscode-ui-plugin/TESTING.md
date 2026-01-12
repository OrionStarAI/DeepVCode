# VSCode Extension Testing Guide

## Overview

The vscode-ui-plugin package contains two separate test suites:

1. **Extension Tests** (`src/**/*.test.ts`) - Tests for the main VS Code extension code
2. **Webview Tests** (`webview/src/**/*.test.tsx`) - Tests for the React webview UI

## Running Tests

### Run All Tests
```bash
npm test
```

This runs both extension and webview tests.

### Run Extension Tests Only
```bash
npm run test:extension
```

### Run Webview Tests Only
```bash
npm run test:webview
```

### Watch Mode
```bash
npm run test:watch          # Extension tests
npm run test:watch:webview  # Webview tests
```

## Extension Testing Setup

The extension tests are configured in `vitest.config.ts` with the following setup:

- **Environment**: Node.js (for extension code)
- **Setup Files**: `src/test-setup.ts`
- **Globals**: Enabled for `describe`, `it`, `expect`

### Writing Extension Tests

1. Create a `.test.ts` file next to your service/utility file
2. Import the module to test
3. Use the mocked VS Code API available from `test-setup.ts`

### Example:

```typescript
import { describe, it, expect, vi } from 'vitest';
import * as vscode from 'vscode';
import { Logger } from './logger';

describe('Logger', () => {
  it('should create output channel', () => {
    const mockContext = {
      extension: { packageJSON: { version: '1.0.0' } },
    } as any;

    const logger = new Logger(mockContext, vscode.window.createOutputChannel('Test'));
    expect(logger).toBeDefined();
  });
});
```

## Webview Testing Setup

The webview tests are in a separate package with their own:

- **Environment**: JSDOM (for React/DOM)
- **Setup Files**: `webview/src/test-setup.ts`
- **Dependencies**: Testing Library, React Test Utilities

## Best Practices

### For Extension Tests
- Mock VS Code APIs using the setup provided
- Test services and utilities in isolation
- Avoid testing activation logic directly (complex integration test)
- Focus on business logic and error handling

### For Webview Tests
- Test React components with React Testing Library
- Use `screen` queries for user-centric testing
- Mock external services (webViewModelService, etc.)
- Test user interactions and state changes

## Mocked APIs

### VS Code APIs Available in Extension Tests

```typescript
vscode.window.createOutputChannel()
vscode.window.showInformationMessage()
vscode.workspace.getConfiguration()
vscode.commands.registerCommand()
// ... and many more
```

See `src/test-setup.ts` for the complete list.

## Future Improvements

- Add integration tests for extension activation
- Expand service-level unit tests
- Add end-to-end tests for common workflows
- Improve mock coverage for complex VS Code APIs

## Troubleshooting

### Tests not finding setup file?
Ensure you're running from the correct directory:
- Extension: `packages/vscode-ui-plugin`
- Webview: `packages/vscode-ui-plugin/webview`

### Jest-DOM matchers not available?
Make sure `@testing-library/jest-dom` is imported in the setup file (webview tests only).

### VS Code API mocks missing?
Check that your mock import includes the required APIs in `test-setup.ts`.
