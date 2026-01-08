/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook } from '../../test-utils/render.js';
import { vi, type Mock } from 'vitest';
import { useFlickerDetector } from './useFlickerDetector.js';
import { recordFlickerFrame, type Config } from 'deepv-code-core';
import { type DOMElement, measureElement } from 'ink';
import { appEvents, AppEvent } from '../../utils/events.js';

// Mock dependencies
vi.mock('deepv-code-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('deepv-code-core')>();
  return {
    ...actual,
    recordFlickerFrame: vi.fn(),
  };
});
vi.mock('ink', async (importOriginal) => {
  const original = await importOriginal<typeof import('ink')>();
  return {
    ...original,
    measureElement: vi.fn(),
  };
});
vi.mock('../../utils/events.js', () => ({
  appEvents: {
    emit: vi.fn(),
  },
  AppEvent: {
    Flicker: 'flicker',
  },
}));

const mockRecordFlickerFrame = recordFlickerFrame as Mock;
const mockMeasureElement = measureElement as Mock;
const mockAppEventsEmit = appEvents.emit as Mock;

describe('useFlickerDetector', () => {
  const mockConfig = {} as Config;
  let mockRef: React.RefObject<DOMElement | null>;

  beforeEach(() => {
    mockRef = { current: { yogaNode: {} } as DOMElement };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should not record a flicker when height is less than terminal height', () => {
    mockMeasureElement.mockReturnValue({ width: 80, height: 20 });
    renderHook(() => useFlickerDetector(mockRef, 25, mockConfig, true));
    expect(mockRecordFlickerFrame).not.toHaveBeenCalled();
    expect(mockAppEventsEmit).not.toHaveBeenCalled();
  });

  it('should not record a flicker when height is equal to terminal height', () => {
    mockMeasureElement.mockReturnValue({ width: 80, height: 25 });
    renderHook(() => useFlickerDetector(mockRef, 25, mockConfig, true));
    expect(mockRecordFlickerFrame).not.toHaveBeenCalled();
    expect(mockAppEventsEmit).not.toHaveBeenCalled();
  });

  it('should record a flicker when height is greater than terminal height and height is constrained', () => {
    mockMeasureElement.mockReturnValue({ width: 80, height: 30 });
    renderHook(() => useFlickerDetector(mockRef, 25, mockConfig, true));
    expect(mockRecordFlickerFrame).toHaveBeenCalledTimes(1);
    expect(mockRecordFlickerFrame).toHaveBeenCalledWith(mockConfig);
    expect(mockAppEventsEmit).toHaveBeenCalledTimes(1);
    expect(mockAppEventsEmit).toHaveBeenCalledWith(AppEvent.Flicker);
  });

  it('should NOT record a flicker when height is greater than terminal height but height is NOT constrained', () => {
    mockMeasureElement.mockReturnValue({ width: 80, height: 30 });
    renderHook(() => useFlickerDetector(mockRef, 25, mockConfig, false));
    expect(mockRecordFlickerFrame).not.toHaveBeenCalled();
    expect(mockAppEventsEmit).not.toHaveBeenCalled();
  });

  it('should not check for flicker if the ref is not set', () => {
    mockRef.current = null;
    mockMeasureElement.mockReturnValue({ width: 80, height: 30 });
    renderHook(() => useFlickerDetector(mockRef, 25, mockConfig, true));
    expect(mockMeasureElement).not.toHaveBeenCalled();
    expect(mockRecordFlickerFrame).not.toHaveBeenCalled();
    expect(mockAppEventsEmit).not.toHaveBeenCalled();
  });

  it('should re-evaluate on re-render', () => {
    // Start with a valid height
    mockMeasureElement.mockReturnValue({ width: 80, height: 20 });
    const { rerender } = renderHook(() => useFlickerDetector(mockRef, 25, mockConfig, true));
    expect(mockRecordFlickerFrame).not.toHaveBeenCalled();

    // Now, simulate a re-render where the height is too great
    mockMeasureElement.mockReturnValue({ width: 80, height: 30 });
    rerender();

    expect(mockRecordFlickerFrame).toHaveBeenCalledTimes(1);
    expect(mockAppEventsEmit).toHaveBeenCalledTimes(1);
  });
});
