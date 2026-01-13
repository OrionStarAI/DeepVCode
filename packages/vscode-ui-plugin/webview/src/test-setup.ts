import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock acquireVsCodeApi
const mockPostMessage = vi.fn();
const mockGetState = vi.fn();
const mockSetState = vi.fn();

(window as any).acquireVsCodeApi = () => ({
  postMessage: mockPostMessage,
  getState: mockGetState,
  setState: mockSetState,
});

// Mock other browser globals if needed
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
