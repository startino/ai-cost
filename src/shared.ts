import type {
  ProviderMarkup,
  ModelMarkup,
  ToolMarkup,
  Pricing,
  ToolPricing,
  ToolUsage,
  Usage,
} from "./validators.js";
import type { CalculatedCosts, CalculatedToolCost, ToolCostBreakdown, ModelsDevApiResponse, ModelsDevModel } from "./client/types.js";

// ============================================================================
// Constants
// ============================================================================

export const MILLION = 1_000_000;
export const MODELS_DEV_API_URL = "https://models.dev/api.json";

// ============================================================================
// Precision
// ============================================================================

const round8 = (value: number): number => Math.round(value * 1e8) / 1e8;

// ============================================================================
// AI Cost Calculation
// ============================================================================

export const calculateCosts = (usage: Usage, pricing: Pricing): CalculatedCosts => {
  const { pricing: prices } = pricing;

  const promptTokensCost = ((usage.promptTokens || 0) / MILLION) * (prices.input || 0);
  const completionTokensCost = ((usage.completionTokens || 0) / MILLION) * (prices.output || 0);

  // Reasoning tokens bill at output rate when no separate reasoning price exists
  const reasoningPrice = prices.reasoning ?? prices.output ?? 0;
  const reasoningTokensCost = ((usage.reasoningTokens || 0) / MILLION) * reasoningPrice;

  // Cached input tokens default to 25% of input price
  const cacheReadPrice = prices.cache_read ?? (prices.input || 0) * 0.25;
  const cachedInputTokensCost = ((usage.cachedInputTokens || 0) / MILLION) * cacheReadPrice;

  const totalCost = promptTokensCost + completionTokensCost + reasoningTokensCost + cachedInputTokensCost;

  return {
    promptTokensCost: round8(promptTokensCost),
    completionTokensCost: round8(completionTokensCost),
    reasoningTokensCost: round8(reasoningTokensCost),
    cachedInputTokensCost: round8(cachedInputTokensCost),
    totalCost: round8(totalCost),
  };
};

export const calculateUserCosts = (costs: CalculatedCosts, markupMultiplier: number): CalculatedCosts => ({
  promptTokensCost: round8(costs.promptTokensCost * markupMultiplier),
  completionTokensCost: round8(costs.completionTokensCost * markupMultiplier),
  reasoningTokensCost: round8(costs.reasoningTokensCost * markupMultiplier),
  cachedInputTokensCost: round8(costs.cachedInputTokensCost * markupMultiplier),
  totalCost: round8(costs.totalCost * markupMultiplier),
});

// ============================================================================
// Tool Cost Calculation
// ============================================================================

export const calculateToolCost = (
  usage: ToolUsage,
  pricing: ToolPricing,
  markupMultiplier: number = 1,
): CalculatedToolCost => {
  let amount = 0;
  let breakdown: ToolCostBreakdown | undefined;
  const currency = pricing.currency;

  switch (usage.type) {
    case "credits": {
      if (pricing.type !== "credits") throw new Error(`Usage type 'credits' requires pricing type 'credits', got '${pricing.type}'`);
      const rate = usage.creditType && pricing.creditTypes?.[usage.creditType]
        ? pricing.creditTypes[usage.creditType]!
        : pricing.costPerCredit;
      amount = round8(usage.credits * rate);
      breakdown = { type: "credits", credits: usage.credits, costPerCredit: rate };
      break;
    }
    case "tokens": {
      if (pricing.type !== "tokens") throw new Error(`Usage type 'tokens' requires pricing type 'tokens', got '${pricing.type}'`);
      const inputCost = round8((usage.inputTokens / MILLION) * pricing.input);
      const outputCost = round8((usage.outputTokens / MILLION) * pricing.output);
      const reasoningCost = usage.reasoningTokens
        ? round8((usage.reasoningTokens / MILLION) * (pricing.reasoning ?? pricing.output))
        : undefined;
      const cacheReadCost = usage.cacheReadTokens
        ? round8((usage.cacheReadTokens / MILLION) * (pricing.cache_read ?? pricing.input * 0.25))
        : undefined;
      const cacheWriteCost = usage.cacheWriteTokens
        ? round8((usage.cacheWriteTokens / MILLION) * (pricing.cache_write ?? pricing.output))
        : undefined;
      amount = round8(inputCost + outputCost + (reasoningCost ?? 0) + (cacheReadCost ?? 0) + (cacheWriteCost ?? 0));
      breakdown = { type: "tokens", inputTokensCost: inputCost, outputTokensCost: outputCost, reasoningTokensCost: reasoningCost, cacheReadTokensCost: cacheReadCost, cacheWriteTokensCost: cacheWriteCost };
      break;
    }
    case "requests": {
      if (pricing.type !== "requests") throw new Error(`Usage type 'requests' requires pricing type 'requests', got '${pricing.type}'`);
      const rate = usage.requestType && pricing.requestTypes?.[usage.requestType]
        ? pricing.requestTypes[usage.requestType]!
        : pricing.costPerRequest;
      amount = round8(usage.requests * rate);
      breakdown = { type: "requests", requests: usage.requests, costPerRequest: rate };
      break;
    }
    case "compute": {
      if (pricing.type !== "compute") throw new Error(`Usage type 'compute' requires pricing type 'compute', got '${pricing.type}'`);
      let rate = pricing.costPerMs;
      if (usage.computeType && pricing.computeTypes?.[usage.computeType]) rate = pricing.computeTypes[usage.computeType]!;
      if (usage.tier && pricing.tiers?.[usage.tier]) rate *= pricing.tiers[usage.tier]!;
      amount = round8(usage.durationMs * rate);
      breakdown = { type: "compute", durationMs: usage.durationMs, costPerMs: rate, computeType: usage.computeType };
      break;
    }
    case "storage": {
      if (pricing.type !== "storage") throw new Error(`Usage type 'storage' requires pricing type 'storage', got '${pricing.type}'`);
      let rate = pricing.costPerByteSecond;
      if (usage.storageClass && pricing.storageClasses?.[usage.storageClass]) rate = pricing.storageClasses[usage.storageClass]!;
      const durationSeconds = usage.durationSeconds ?? 1;
      amount = round8(usage.bytes * durationSeconds * rate);
      breakdown = { type: "storage", bytes: usage.bytes, durationSeconds, costPerByteSecond: rate };
      break;
    }
    case "bandwidth": {
      if (pricing.type !== "bandwidth") throw new Error(`Usage type 'bandwidth' requires pricing type 'bandwidth', got '${pricing.type}'`);
      let regionMultiplier = 1;
      if (usage.region && pricing.regions?.[usage.region]) regionMultiplier = pricing.regions[usage.region]!;
      const bytesInCost = usage.bytesIn ? round8(usage.bytesIn * (pricing.costPerByteIn ?? 0) * regionMultiplier) : undefined;
      const bytesOutCost = usage.bytesOut ? round8(usage.bytesOut * (pricing.costPerByteOut ?? 0) * regionMultiplier) : undefined;
      amount = round8((bytesInCost ?? 0) + (bytesOutCost ?? 0));
      breakdown = { type: "bandwidth", bytesInCost, bytesOutCost };
      break;
    }
    case "units": {
      if (pricing.type !== "units") throw new Error(`Usage type 'units' requires pricing type 'units', got '${pricing.type}'`);
      amount = round8(usage.units * pricing.costPerUnit);
      breakdown = { type: "units", units: usage.units, unitType: usage.unitType, costPerUnit: pricing.costPerUnit };
      break;
    }
    case "tiered": {
      if (pricing.type !== "tiered") throw new Error(`Usage type 'tiered' requires pricing type 'tiered', got '${pricing.type}'`);
      let effectiveRate = 0;
      let tierApplied = "default";
      for (const tier of pricing.tiers) {
        if (usage.quantity >= tier.from && (tier.to === undefined || usage.quantity <= tier.to)) {
          effectiveRate = tier.rate;
          tierApplied = `${tier.from}-${tier.to ?? "∞"}`;
          break;
        }
      }
      amount = round8(usage.quantity * effectiveRate);
      breakdown = { type: "tiered", quantity: usage.quantity, tierApplied, effectiveRate };
      break;
    }
    case "composite": {
      if (pricing.type !== "composite") throw new Error(`Usage type 'composite' requires pricing type 'composite', got '${pricing.type}'`);
      const componentCosts = usage.components.map((usageComp) => {
        const pricingComp = pricing.components.find((p) => p.name === usageComp.name);
        const unitCost = pricingComp?.costPerUnit ?? 0;
        const totalCost = round8(usageComp.quantity * unitCost);
        return { name: usageComp.name, quantity: usageComp.quantity, unitCost, totalCost };
      });
      amount = round8(componentCosts.reduce((sum, c) => sum + c.totalCost, 0));
      breakdown = { type: "composite", components: componentCosts };
      break;
    }
    case "custom": {
      if (pricing.type !== "custom") throw new Error(`Usage type 'custom' requires pricing type 'custom', got '${pricing.type}'`);
      amount = 0;
      breakdown = { type: "custom", data: usage.data };
      break;
    }
    default: {
      const _exhaustive: never = usage;
      throw new Error(`Unsupported usage type: ${_exhaustive}`);
    }
  }

  const userAmount = markupMultiplier !== 1 ? round8(amount * markupMultiplier) : amount;

  return {
    cost: { amount, currency, breakdown },
    costForUser: {
      amount: userAmount,
      currency,
      markupMultiplier: markupMultiplier !== 1 ? markupMultiplier : undefined,
      breakdown,
    },
  };
};

// ============================================================================
// Tool Cost from AI Pricing (fallback for LLM-based tools)
// ============================================================================

export const calculateToolCostFromTokenPricing = (
  usage: ToolUsage,
  pricing: Pricing,
  markupMultiplier: number = 1,
): CalculatedToolCost => {
  if (usage.type !== "tokens") throw new Error("Token pricing can only be used with token-based usage");

  const inputCost = round8((usage.inputTokens / MILLION) * pricing.pricing.input);
  const outputCost = round8((usage.outputTokens / MILLION) * pricing.pricing.output);
  const reasoningCost = usage.reasoningTokens
    ? round8((usage.reasoningTokens / MILLION) * (pricing.pricing.reasoning ?? pricing.pricing.output))
    : undefined;
  const cacheReadCost = usage.cacheReadTokens
    ? round8((usage.cacheReadTokens / MILLION) * (pricing.pricing.cache_read ?? pricing.pricing.input * 0.25))
    : undefined;
  const cacheWriteCost = usage.cacheWriteTokens
    ? round8((usage.cacheWriteTokens / MILLION) * (pricing.pricing.cache_write ?? pricing.pricing.output))
    : undefined;

  const amount = round8(inputCost + outputCost + (reasoningCost ?? 0) + (cacheReadCost ?? 0) + (cacheWriteCost ?? 0));
  const userAmount = markupMultiplier !== 1 ? round8(amount * markupMultiplier) : amount;

  const breakdown = {
    type: "tokens" as const,
    inputTokensCost: inputCost,
    outputTokensCost: outputCost,
    reasoningTokensCost: reasoningCost,
    cacheReadTokensCost: cacheReadCost,
    cacheWriteTokensCost: cacheWriteCost,
  };

  return {
    cost: { amount, currency: "USD", breakdown },
    costForUser: {
      amount: userAmount,
      currency: "USD",
      markupMultiplier: markupMultiplier !== 1 ? markupMultiplier : undefined,
      breakdown,
    },
  };
};

// ============================================================================
// Pricing Data Parsing (models.dev)
// ============================================================================

export const parseModelPricing = (
  providerId: string,
  providerName: string,
  modelId: string,
  model: ModelsDevModel,
): Omit<Pricing, "_id" | "_creationTime"> => ({
  providerId,
  providerName,
  modelId,
  modelName: model.name || modelId,
  pricing: {
    input: model.cost?.input || 0,
    output: model.cost?.output || 0,
    reasoning: model.cost?.reasoning,
    cache_read: model.cost?.cache_read,
    cache_write: model.cost?.cache_write,
  },
  limits: {
    context: model.limit?.context || 0,
    output: model.limit?.output || 0,
  },
  lastUpdated: Date.now(),
});

export const parseModelsDevResponse = (
  data: ModelsDevApiResponse,
): Omit<Pricing, "_id" | "_creationTime">[] => {
  const results: Omit<Pricing, "_id" | "_creationTime">[] = [];

  for (const [providerId, providerData] of Object.entries(data)) {
    if (!providerData || typeof providerData !== "object" || !providerData.models) continue;
    const providerName = providerData.name || providerId;
    for (const [modelId, modelData] of Object.entries(providerData.models)) {
      if (!modelData || typeof modelData !== "object") continue;
      results.push(parseModelPricing(providerId, providerName, modelId, modelData));
    }
  }

  return results;
};

export const hasPricingChanged = (
  existing: Pricing,
  updated: Omit<Pricing, "_id" | "_creationTime">,
): boolean =>
  existing.pricing.input !== updated.pricing.input ||
  existing.pricing.output !== updated.pricing.output ||
  existing.pricing.reasoning !== updated.pricing.reasoning ||
  existing.pricing.cache_read !== updated.pricing.cache_read ||
  existing.pricing.cache_write !== updated.pricing.cache_write ||
  existing.limits.context !== updated.limits.context ||
  existing.limits.output !== updated.limits.output ||
  existing.modelName !== updated.modelName ||
  existing.providerName !== updated.providerName;

// ============================================================================
// Markup Resolution
// ============================================================================

export const resolveMarkupMultiplier = ({
  providerId,
  modelId,
  toolId,
  providerMarkups,
  modelMarkups,
  toolMarkups,
}: {
  providerId: string;
  modelId?: string;
  toolId?: string;
  providerMarkups: ProviderMarkup[];
  modelMarkups: ModelMarkup[];
  toolMarkups: ToolMarkup[];
}): number => {
  // Priority: model-specific > tool-specific > provider-specific > 0
  if (modelId) {
    const match = modelMarkups.find((m) => m.providerId === providerId && m.modelId === modelId);
    if (match) return match.markupMultiplier;
  }
  if (toolId) {
    const match = toolMarkups.find((t) => t.providerId === providerId && t.toolId === toolId);
    if (match) return match.markupMultiplier;
  }
  const providerMatch = providerMarkups.find((p) => p.providerId === providerId);
  if (providerMatch) return providerMatch.markupMultiplier;
  return 0;
};
