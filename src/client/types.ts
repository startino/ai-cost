import type { Pricing, ProviderMarkup, ModelMarkup, ToolMarkup } from "../validators.js";

// ============================================================================
// Cost Calculation Results
// ============================================================================

export type CalculatedCosts = {
  promptTokensCost: number;
  completionTokensCost: number;
  reasoningTokensCost: number;
  cachedInputTokensCost: number;
  totalCost: number;
};

export type ToolCostBreakdown =
  | { type: "credits"; credits: number; costPerCredit: number }
  | { type: "tokens"; inputTokensCost: number; outputTokensCost: number; reasoningTokensCost?: number; cacheReadTokensCost?: number; cacheWriteTokensCost?: number }
  | { type: "requests"; requests: number; costPerRequest: number }
  | { type: "compute"; durationMs: number; costPerMs: number; computeType?: string }
  | { type: "storage"; bytes: number; durationSeconds: number; costPerByteSecond: number }
  | { type: "bandwidth"; bytesInCost?: number; bytesOutCost?: number }
  | { type: "units"; units: number; unitType: string; costPerUnit: number }
  | { type: "tiered"; quantity: number; tierApplied: string; effectiveRate: number }
  | { type: "composite"; components: Array<{ name: string; quantity: number; unitCost: number; totalCost: number }> }
  | { type: "custom"; data: unknown };

export type CalculatedToolCost = {
  cost: { amount: number; currency: string; breakdown?: ToolCostBreakdown };
  costForUser: { amount: number; currency: string; markupMultiplier?: number; breakdown?: ToolCostBreakdown };
};

// ============================================================================
// models.dev API Types
// ============================================================================

export type ModelsDevModel = {
  name?: string;
  cost?: {
    input?: number;
    output?: number;
    reasoning?: number;
    cache_read?: number;
    cache_write?: number;
  };
  limit?: {
    context?: number;
    output?: number;
  };
};

export type ModelsDevProvider = {
  name?: string;
  models: Record<string, ModelsDevModel>;
};

export type ModelsDevApiResponse = Record<string, ModelsDevProvider>;

// ============================================================================
// Component Options
// ============================================================================

export type AICostOptions = {
  providerMarkupMultiplier?: ProviderMarkup[];
  modelMarkupMultiplier?: ModelMarkup[];
  toolMarkupMultiplier?: ToolMarkup[];
};

// ============================================================================
// Query Results
// ============================================================================

export type CostEvent = {
  _id: string;
  _creationTime: number;
  type: "ai" | "tool";
  providerId: string;
  modelId?: string;
  toolId?: string;
  amount: number;
  currency: string;
  userAmount: number;
  markupMultiplier?: number;
  usage: unknown;
  breakdown?: unknown;
  metadata?: unknown;
};

export type CostAttribution = {
  _id: string;
  _creationTime: number;
  costEventId: string;
  attributeType: string;
  attributeId: string;
};

export type CostTotal = {
  totalAmount: number;
  totalUserAmount: number;
  count: number;
  currency: string;
};

export type CostEventWithAttributions = CostEvent & {
  attributions: Array<{ type: string; id: string }>;
};
