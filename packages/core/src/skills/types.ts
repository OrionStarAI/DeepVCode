/**
 * Skills system type definitions
 */

export interface SkillsSettings {
  enabledPlugins: Record<string, boolean>;
  marketplaces: Marketplace[];
  security: SecuritySettings;
  performance: PerformanceSettings;
  lastUpdated: string;
}

export interface Marketplace {
  id: string;
  name: string;
  source: string;
  location: string;
  enabled: boolean;
  addedAt: string;
}

export interface SecuritySettings {
  enableAudit: boolean;
  trustLevel: string;
  trustedSources: string[];
  requireReview: boolean;
}

export interface PerformanceSettings {
  enableCache: boolean;
  cacheTTL: number;
  maxParallelLoads: number;
  maxStartupTime: number;
}

export interface InstalledPlugins {
  plugins: Record<string, PluginInfo>;
  lastUpdated: string;
}

export interface PluginInfo {
  id: string;
  name: string;
  marketplaceId: string;
  installedAt: string;
  enabled: boolean;
  skillCount: number;
}

export interface MarketplaceManifest {
  name: string;
  owner: {
    name: string;
    email: string;
  };
  metadata: {
    description: string;
    version: string;
  };
  plugins: PluginDefinition[];
}

export interface PluginDefinition {
  name: string;
  description: string;
  source: string;
  strict: boolean;
  skills: string[];
}

export interface SkillInfo {
  id: string;
  name: string;
  pluginId: string;
  marketplaceId: string;
  description: string;
  path: string;
  skillMdPath: string;
  enabled: boolean;
}

export interface SkillsContext {
  available: boolean;
  skills: SkillInfo[];
  summary: string;
}
