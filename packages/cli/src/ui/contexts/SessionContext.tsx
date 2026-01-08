/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useState,
  useMemo,
  useEffect,
} from 'react';

import {
  uiTelemetryService,
  SessionMetrics,
  ModelMetrics,
} from 'deepv-code-core';

// --- Interface Definitions ---

export type { SessionMetrics, ModelMetrics };

export interface SubAgentStats {
  totalApiCalls: number;
  totalErrors: number;
  totalLatencyMs: number;
  totalTokens: number;
  promptTokens: number;
  candidatesTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  thoughtsTokens: number;
  toolTokens: number;
}

export interface SessionStatsState {
  sessionStartTime: Date;
  metrics: SessionMetrics;
  lastPromptTokenCount: number; // 主会话的token计数（保持原有含义）
  promptCount: number;
  subAgentStats: SubAgentStats; // SubAgent的聚合统计
}

export interface ComputedSessionStats {
  totalApiTime: number;
  totalToolTime: number;
  agentActiveTime: number;
  apiTimePercent: number;
  toolTimePercent: number;
  cacheEfficiency: number;
  totalDecisions: number;
  successRate: number;
  agreementRate: number;
  totalCachedTokens: number;
  totalPromptTokens: number;
}

export interface ExtendedSessionStats extends ComputedSessionStats {
  // SubAgent相关的计算统计
  subAgentUsagePercent: number; // SubAgent占总token使用的百分比
  hasSubAgentActivity: boolean; // 是否有SubAgent活动
  // 详细缓存统计
  totalCacheWrites: number; // 总缓存写入tokens
  totalCacheReads: number; // 总缓存读取tokens
  cacheHitRate: number; // 缓存命中率
}

// Defines the final "value" of our context, including the state
// and the functions to update it.
interface SessionStatsContextValue {
  stats: SessionStatsState;
  startNewPrompt: () => void;
  getPromptCount: () => number;
  computedStats: ExtendedSessionStats;
  resetStats: () => void;
}

// --- Helper Functions ---

/**
 * 计算所有模型的SubAgent聚合统计
 */
function computeSubAgentStats(metrics: SessionMetrics): SubAgentStats {
  let totalApiCalls = 0;
  let totalErrors = 0;
  let totalLatencyMs = 0;
  let totalTokens = 0;
  let promptTokens = 0;
  let candidatesTokens = 0;
  let cachedTokens = 0;
  let cacheWriteTokens = 0;
  let cacheReadTokens = 0;
  let thoughtsTokens = 0;
  let toolTokens = 0;

  // 聚合所有模型的SubAgent统计
  Object.values(metrics.models).forEach((modelMetrics) => {
    const { subAgents } = modelMetrics;
    
    totalApiCalls += subAgents.api.totalRequests;
    totalErrors += subAgents.api.totalErrors;
    totalLatencyMs += subAgents.api.totalLatencyMs;
    
    totalTokens += subAgents.tokens.total;
    promptTokens += subAgents.tokens.prompt;
    candidatesTokens += subAgents.tokens.candidates;
    cachedTokens += subAgents.tokens.cached;
    cacheWriteTokens += (subAgents.tokens as any).cacheWrite || 0;
    cacheReadTokens += (subAgents.tokens as any).cacheRead || 0;
    thoughtsTokens += subAgents.tokens.thoughts;
    toolTokens += subAgents.tokens.tool;
  });

  return {
    totalApiCalls,
    totalErrors,
    totalLatencyMs,
    totalTokens,
    promptTokens,
    candidatesTokens,
    cachedTokens,
    cacheWriteTokens,
    cacheReadTokens,
    thoughtsTokens,
    toolTokens,
  };
}

/**
 * 计算包含SubAgent信息的会话统计
 */
export function computeSessionStats(statsState: SessionStatsState): ExtendedSessionStats {
  const { metrics, subAgentStats } = statsState;
  
  // 计算主会话的总token数
  const mainSessionTokens = Object.values(metrics.models).reduce((total, model) => 
    total + model.tokens.total, 0
  );
  
  // 计算SubAgent使用百分比
  const totalAllTokens = mainSessionTokens + subAgentStats.totalTokens;
  const subAgentUsagePercent = totalAllTokens > 0 
    ? (subAgentStats.totalTokens / totalAllTokens) * 100 
    : 0;
  
  // 检查是否有SubAgent活动
  const hasSubAgentActivity = subAgentStats.totalApiCalls > 0;

  // 计算详细缓存统计
  const totalCacheWrites = Object.values(metrics.models).reduce((total, model) => 
    total + ((model.tokens as any).cacheWrite || 0), 0
  );
  const totalCacheReads = Object.values(metrics.models).reduce((total, model) => 
    total + ((model.tokens as any).cacheRead || 0), 0
  );
  const cacheHitRate = totalCacheWrites + totalCacheReads > 0 
    ? (totalCacheReads / (totalCacheWrites + totalCacheReads)) * 100 
    : 0;

  // 计算其他基础统计
  const totalApiTime = Object.values(metrics.models).reduce((total, model) => 
    total + model.api.totalLatencyMs, 0
  );
  
  const toolStats = metrics.tools;
  const totalDecisions = 
    toolStats.totalDecisions.accept + 
    toolStats.totalDecisions.reject + 
    toolStats.totalDecisions.modify;
  
  return {
    totalApiTime,
    totalToolTime: toolStats.totalDurationMs,
    agentActiveTime: totalApiTime + toolStats.totalDurationMs,
    apiTimePercent: totalApiTime + toolStats.totalDurationMs > 0 ? (totalApiTime / (totalApiTime + toolStats.totalDurationMs)) * 100 : 0,
    toolTimePercent: totalApiTime + toolStats.totalDurationMs > 0 ? (toolStats.totalDurationMs / (totalApiTime + toolStats.totalDurationMs)) * 100 : 0,
    cacheEfficiency: mainSessionTokens > 0 ? (Object.values(metrics.models).reduce((total, model) => total + model.tokens.cached, 0) / mainSessionTokens) * 100 : 0,
    totalDecisions,
    successRate: toolStats.totalCalls > 0 ? (toolStats.totalSuccess / toolStats.totalCalls) * 100 : 0,
    agreementRate: totalDecisions > 0 ? (toolStats.totalDecisions.accept / totalDecisions) * 100 : 0,
    totalCachedTokens: Object.values(metrics.models).reduce((total, model) => total + model.tokens.cached, 0),
    totalPromptTokens: Object.values(metrics.models).reduce((total, model) => total + model.tokens.prompt, 0),
    subAgentUsagePercent,
    hasSubAgentActivity,
    totalCacheWrites,
    totalCacheReads,
    cacheHitRate,
  };
}

// --- Context Definition ---

const SessionStatsContext = createContext<SessionStatsContextValue | undefined>(
  undefined,
);

// --- Provider Component ---

export const SessionStatsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [stats, setStats] = useState<SessionStatsState>({
    sessionStartTime: new Date(),
    metrics: uiTelemetryService.getMetrics(),
    lastPromptTokenCount: 0,
    promptCount: 0,
    subAgentStats: computeSubAgentStats(uiTelemetryService.getMetrics()),
  });

  useEffect(() => {
    const handleUpdate = ({
      metrics,
      lastPromptTokenCount,
    }: {
      metrics: SessionMetrics;
      lastPromptTokenCount: number;
    }) => {
      setStats((prevState) => ({
        ...prevState,
        metrics,
        lastPromptTokenCount,
        subAgentStats: computeSubAgentStats(metrics),
      }));
    };

    uiTelemetryService.on('update', handleUpdate);
    // Set initial state
    handleUpdate({
      metrics: uiTelemetryService.getMetrics(),
      lastPromptTokenCount: uiTelemetryService.getLastPromptTokenCount(),
    });

    return () => {
      uiTelemetryService.off('update', handleUpdate);
    };
  }, []);

  const startNewPrompt = useCallback(() => {
    setStats((prevState) => ({
      ...prevState,
      promptCount: prevState.promptCount + 1,
    }));
  }, []);

  const getPromptCount = useCallback(
    () => stats.promptCount,
    [stats.promptCount],
  );

  const resetStats = useCallback(() => {
    setStats({
      sessionStartTime: new Date(), // 重置为当前时间
      metrics: uiTelemetryService.getMetrics(), // 获取最新的全局metrics
      lastPromptTokenCount: 0,
      promptCount: 0, // 重置prompt计数
      subAgentStats: computeSubAgentStats(uiTelemetryService.getMetrics()),
    });
  }, []);

  const value = useMemo(
    () => ({
      stats,
      startNewPrompt,
      getPromptCount,
      computedStats: computeSessionStats(stats),
      resetStats,
    }),
    [stats, startNewPrompt, getPromptCount, resetStats],
  );

  return (
    <SessionStatsContext.Provider value={value}>
      {children}
    </SessionStatsContext.Provider>
  );
};

// --- Consumer Hook ---

export const useSessionStats = () => {
  const context = useContext(SessionStatsContext);
  if (context === undefined) {
    throw new Error(
      'useSessionStats must be used within a SessionStatsProvider',
    );
  }
  return context;
};
