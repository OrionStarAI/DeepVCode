import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import BackgroundTasksBar from './BackgroundTasksBar';

vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (_key: string, _params?: Record<string, unknown>, fallback?: string) => fallback || _key,
  }),
}));

describe('BackgroundTasksBar', () => {
  it('renders tasks and handles kill', () => {
    const onKillTask = vi.fn();
    const tasks = [
      {
        id: '1',
        command: 'npm run build',
        status: 'running',
        startTime: Date.now() - 1000,
      },
      {
        id: '2',
        command: 'npm test',
        status: 'completed',
        startTime: Date.now() - 2000,
        endTime: Date.now() - 1000,
      },
    ];

    render(
      <BackgroundTasksBar
        tasks={tasks}
        runningCount={1}
        onKillTask={onKillTask}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Click to view background tasks' }));
    expect(screen.getByText('npm run build')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Stop this task'));
    expect(onKillTask).toHaveBeenCalledWith('1');
  });
});
