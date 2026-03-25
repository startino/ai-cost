import { v, type Infer } from "convex/values";

// ============================================================================
// Attribution
// ============================================================================

export const vAttribution = v.object({
  type: v.string(),
  id: v.string(),
});

export type Attribution = Infer<typeof vAttribution>;

// ============================================================================
// AI Usage
// ============================================================================

export const vUsage = v.object({
  promptTokens: v.number(),
  completionTokens: v.number(),
  totalTokens: v.number(),
  reasoningTokens: v.optional(v.number()),
  cachedInputTokens: v.optional(v.number()),
});

export type Usage = Infer<typeof vUsage>;

// ============================================================================
// Tool Usage (10 pricing models)
// ============================================================================

export const vToolUsage = v.union(
  v.object({
    type: v.literal("credits"),
    credits: v.number(),
    creditType: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("tokens"),
    inputTokens: v.number(),
    outputTokens: v.number(),
    reasoningTokens: v.optional(v.number()),
    cacheReadTokens: v.optional(v.number()),
    cacheWriteTokens: v.optional(v.number()),
  }),
  v.object({
    type: v.literal("requests"),
    requests: v.number(),
    requestType: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("compute"),
    durationMs: v.number(),
    computeType: v.optional(v.string()),
    tier: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("storage"),
    bytes: v.number(),
    durationSeconds: v.optional(v.number()),
    storageClass: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("bandwidth"),
    bytesIn: v.optional(v.number()),
    bytesOut: v.optional(v.number()),
    region: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("units"),
    units: v.number(),
    unitType: v.string(),
    metadata: v.optional(v.record(v.string(), v.any())),
  }),
  v.object({
    type: v.literal("tiered"),
    quantity: v.number(),
    tierName: v.optional(v.string()),
    unitType: v.string(),
  }),
  v.object({
    type: v.literal("composite"),
    components: v.array(
      v.object({
        name: v.string(),
        quantity: v.number(),
        unitType: v.string(),
        cost: v.optional(v.number()),
      }),
    ),
  }),
  v.object({
    type: v.literal("custom"),
    data: v.any(),
    description: v.optional(v.string()),
  }),
);

export type ToolUsage = Infer<typeof vToolUsage>;

// ============================================================================
// Tool Pricing
// ============================================================================

export const vToolPricing = v.union(
  v.object({
    type: v.literal("credits"),
    costPerCredit: v.number(),
    currency: v.string(),
    creditTypes: v.optional(v.record(v.string(), v.number())),
  }),
  v.object({
    type: v.literal("tokens"),
    input: v.number(),
    output: v.number(),
    reasoning: v.optional(v.number()),
    cache_read: v.optional(v.number()),
    cache_write: v.optional(v.number()),
    currency: v.string(),
  }),
  v.object({
    type: v.literal("requests"),
    costPerRequest: v.number(),
    currency: v.string(),
    requestTypes: v.optional(v.record(v.string(), v.number())),
  }),
  v.object({
    type: v.literal("compute"),
    costPerMs: v.number(),
    currency: v.string(),
    computeTypes: v.optional(v.record(v.string(), v.number())),
    tiers: v.optional(v.record(v.string(), v.number())),
  }),
  v.object({
    type: v.literal("storage"),
    costPerByteSecond: v.number(),
    currency: v.string(),
    storageClasses: v.optional(v.record(v.string(), v.number())),
  }),
  v.object({
    type: v.literal("bandwidth"),
    costPerByteIn: v.optional(v.number()),
    costPerByteOut: v.optional(v.number()),
    currency: v.string(),
    regions: v.optional(v.record(v.string(), v.number())),
  }),
  v.object({
    type: v.literal("units"),
    costPerUnit: v.number(),
    unitType: v.string(),
    currency: v.string(),
  }),
  v.object({
    type: v.literal("tiered"),
    tiers: v.array(
      v.object({
        from: v.number(),
        to: v.optional(v.number()),
        rate: v.number(),
      }),
    ),
    unitType: v.string(),
    currency: v.string(),
  }),
  v.object({
    type: v.literal("composite"),
    components: v.array(
      v.object({
        name: v.string(),
        costPerUnit: v.number(),
        unitType: v.string(),
      }),
    ),
    currency: v.string(),
  }),
  v.object({
    type: v.literal("custom"),
    data: v.any(),
    currency: v.string(),
    description: v.optional(v.string()),
  }),
);

export type ToolPricing = Infer<typeof vToolPricing>;

export const vToolLimits = v.optional(
  v.object({
    maxRequestsPerSecond: v.optional(v.number()),
    maxRequestsPerMinute: v.optional(v.number()),
    maxRequestsPerHour: v.optional(v.number()),
    maxRequestsPerDay: v.optional(v.number()),
    maxRequestsPerMonth: v.optional(v.number()),
    maxConcurrentRequests: v.optional(v.number()),
    maxBytesPerRequest: v.optional(v.number()),
    maxTokensPerRequest: v.optional(v.number()),
  }),
);

export type ToolLimits = Infer<typeof vToolLimits>;

// ============================================================================
// AI Pricing
// ============================================================================

export const vPricingData = v.object({
  input: v.number(),
  output: v.number(),
  reasoning: v.optional(v.number()),
  cache_read: v.optional(v.number()),
  cache_write: v.optional(v.number()),
});

export const vLimits = v.object({
  context: v.number(),
  output: v.number(),
});

export const vPricing = v.object({
  providerId: v.string(),
  providerName: v.string(),
  modelId: v.string(),
  modelName: v.string(),
  pricing: vPricingData,
  limits: vLimits,
  lastUpdated: v.number(),
});

export type Pricing = Infer<typeof vPricing>;

// ============================================================================
// Cost Validators
// ============================================================================

export const vCost = v.object({
  promptTokensCost: v.number(),
  completionTokensCost: v.number(),
  reasoningTokensCost: v.optional(v.number()),
  cachedInputTokensCost: v.optional(v.number()),
  totalCost: v.number(),
});

export type Cost = Infer<typeof vCost>;

export const vToolCost = v.object({
  amount: v.number(),
  currency: v.string(),
  breakdown: v.optional(
    v.union(
      v.object({
        type: v.literal("credits"),
        credits: v.number(),
        costPerCredit: v.number(),
      }),
      v.object({
        type: v.literal("tokens"),
        inputTokensCost: v.optional(v.number()),
        outputTokensCost: v.optional(v.number()),
        reasoningTokensCost: v.optional(v.number()),
        cacheReadTokensCost: v.optional(v.number()),
        cacheWriteTokensCost: v.optional(v.number()),
      }),
      v.object({
        type: v.literal("requests"),
        requests: v.number(),
        costPerRequest: v.number(),
      }),
      v.object({
        type: v.literal("compute"),
        durationMs: v.number(),
        costPerMs: v.number(),
        computeType: v.optional(v.string()),
      }),
      v.object({
        type: v.literal("storage"),
        bytes: v.number(),
        durationSeconds: v.number(),
        costPerByteSecond: v.number(),
      }),
      v.object({
        type: v.literal("bandwidth"),
        bytesInCost: v.optional(v.number()),
        bytesOutCost: v.optional(v.number()),
      }),
      v.object({
        type: v.literal("units"),
        units: v.number(),
        unitType: v.string(),
        costPerUnit: v.number(),
      }),
      v.object({
        type: v.literal("tiered"),
        quantity: v.number(),
        tierApplied: v.string(),
        effectiveRate: v.number(),
      }),
      v.object({
        type: v.literal("composite"),
        components: v.array(
          v.object({
            name: v.string(),
            quantity: v.number(),
            unitCost: v.number(),
            totalCost: v.number(),
          }),
        ),
      }),
      v.object({
        type: v.literal("custom"),
        data: v.any(),
      }),
    ),
  ),
});

export type ToolCostResult = Infer<typeof vToolCost>;

export const vToolCostForUser = v.object({
  amount: v.number(),
  currency: v.string(),
  markupMultiplier: v.optional(v.number()),
  breakdown: v.optional(
    v.union(
      v.object({
        type: v.literal("credits"),
        credits: v.number(),
        costPerCredit: v.number(),
      }),
      v.object({
        type: v.literal("tokens"),
        inputTokensCost: v.optional(v.number()),
        outputTokensCost: v.optional(v.number()),
        reasoningTokensCost: v.optional(v.number()),
        cacheReadTokensCost: v.optional(v.number()),
        cacheWriteTokensCost: v.optional(v.number()),
      }),
      v.object({
        type: v.literal("requests"),
        requests: v.number(),
        costPerRequest: v.number(),
      }),
      v.object({
        type: v.literal("compute"),
        durationMs: v.number(),
        costPerMs: v.number(),
        computeType: v.optional(v.string()),
      }),
      v.object({
        type: v.literal("storage"),
        bytes: v.number(),
        durationSeconds: v.number(),
        costPerByteSecond: v.number(),
      }),
      v.object({
        type: v.literal("bandwidth"),
        bytesInCost: v.optional(v.number()),
        bytesOutCost: v.optional(v.number()),
      }),
      v.object({
        type: v.literal("units"),
        units: v.number(),
        unitType: v.string(),
        costPerUnit: v.number(),
      }),
      v.object({
        type: v.literal("tiered"),
        quantity: v.number(),
        tierApplied: v.string(),
        effectiveRate: v.number(),
      }),
      v.object({
        type: v.literal("composite"),
        components: v.array(
          v.object({
            name: v.string(),
            quantity: v.number(),
            unitCost: v.number(),
            totalCost: v.number(),
          }),
        ),
      }),
      v.object({
        type: v.literal("custom"),
        data: v.any(),
      }),
    ),
  ),
});

export type ToolCostForUser = Infer<typeof vToolCostForUser>;

// ============================================================================
// Markup Validators
// ============================================================================

export const vProviderMarkup = v.object({
  scope: v.literal("provider"),
  providerId: v.string(),
  markupMultiplier: v.number(),
});

export type ProviderMarkup = Infer<typeof vProviderMarkup>;

export const vModelMarkup = v.object({
  scope: v.literal("model"),
  providerId: v.string(),
  modelId: v.string(),
  markupMultiplier: v.number(),
});

export type ModelMarkup = Infer<typeof vModelMarkup>;

export const vToolMarkup = v.object({
  scope: v.literal("tool"),
  providerId: v.string(),
  toolId: v.string(),
  markupMultiplier: v.number(),
});

export type ToolMarkup = Infer<typeof vToolMarkup>;

export const vMarkupMultiplierConfig = v.union(
  vProviderMarkup,
  vModelMarkup,
  vToolMarkup,
);

export type MarkupMultiplierConfig = Infer<typeof vMarkupMultiplierConfig>;

// ============================================================================
// Add Cost Args
// ============================================================================

export const vAddAICostArgs = v.object({
  usage: vUsage,
  modelId: v.string(),
  providerId: v.string(),
  attributions: v.array(vAttribution),
  markupMultiplier: v.optional(v.number()),
  metadata: v.optional(v.any()),
});

export type AddAICostArgs = Infer<typeof vAddAICostArgs>;

export const vAddToolCostArgs = v.object({
  usage: vToolUsage,
  providerId: v.string(),
  toolId: v.string(),
  attributions: v.array(vAttribution),
  markupMultiplier: v.optional(v.number()),
  metadata: v.optional(v.any()),
});

export type AddToolCostArgs = Infer<typeof vAddToolCostArgs>;
