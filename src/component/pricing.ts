import { v } from "convex/values";
import { query, action, internalMutation } from "./_generated/server.js";
import { internal } from "./_generated/api.js";

// ============================================================================
// Queries
// ============================================================================

export const getPricing = query({
  args: { providerId: v.string(), modelId: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("aiPricing"),
      _creationTime: v.number(),
      providerId: v.string(),
      providerName: v.string(),
      modelId: v.string(),
      modelName: v.string(),
      pricing: v.object({
        input: v.number(),
        output: v.number(),
        reasoning: v.optional(v.number()),
        cache_read: v.optional(v.number()),
        cache_write: v.optional(v.number()),
      }),
      limits: v.object({ context: v.number(), output: v.number() }),
      lastUpdated: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("aiPricing")
      .withIndex("by_model", (q) => q.eq("providerId", args.providerId).eq("modelId", args.modelId))
      .first();
  },
});

export const getAllPricing = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("aiPricing").collect();
  },
});

export const getPricingByProvider = query({
  args: { providerId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("aiPricing")
      .withIndex("by_provider", (q) => q.eq("providerId", args.providerId))
      .collect();
  },
});

export const searchPricingByModelName = query({
  args: { modelName: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("aiPricing").collect();
    const lower = args.modelName.toLowerCase();
    return all.filter(
      (p) =>
        p.modelName.toLowerCase().includes(lower) ||
        p.modelId.toLowerCase().includes(lower),
    );
  },
});

// ============================================================================
// Tool Pricing Queries
// ============================================================================

export const getToolPricing = query({
  args: { providerId: v.string(), toolId: v.string() },
  handler: async (ctx, args) => {
    // Exact match first
    const exact = await ctx.db
      .query("toolsPricing")
      .withIndex("by_provider_and_tool", (q) => q.eq("providerId", args.providerId).eq("toolId", args.toolId))
      .first();
    if (exact) return exact;

    // Provider-only fallback
    const providerOnly = await ctx.db
      .query("toolsPricing")
      .withIndex("by_provider", (q) => q.eq("providerId", args.providerId))
      .first();
    if (providerOnly) return providerOnly;

    // AI pricing fallback for LLM-based tools
    const aiPricing = await ctx.db
      .query("aiPricing")
      .withIndex("by_model", (q) => q.eq("providerId", args.providerId).eq("modelId", args.toolId))
      .first();
    return aiPricing;
  },
});

export const getAllToolPricing = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("toolsPricing").collect();
  },
});

export const getToolPricingByProvider = query({
  args: { providerId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("toolsPricing")
      .withIndex("by_provider", (q) => q.eq("providerId", args.providerId))
      .collect();
  },
});

// ============================================================================
// Tool Pricing Mutations
// ============================================================================

export const upsertToolPricing = internalMutation({
  args: {
    providerId: v.string(),
    providerName: v.string(),
    toolId: v.string(),
    toolName: v.string(),
    pricing: v.any(),
    limits: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("toolsPricing")
      .withIndex("by_provider_and_tool", (q) => q.eq("providerId", args.providerId).eq("toolId", args.toolId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { ...args, lastUpdated: Date.now() });
      return existing._id;
    }

    return await ctx.db.insert("toolsPricing", { ...args, lastUpdated: Date.now() });
  },
});

export const deleteToolPricing = internalMutation({
  args: { providerId: v.string(), toolId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("toolsPricing")
      .withIndex("by_provider_and_tool", (q) => q.eq("providerId", args.providerId).eq("toolId", args.toolId))
      .first();
    if (existing) await ctx.db.delete(existing._id);
  },
});

// ============================================================================
// Update AI Pricing from models.dev
// ============================================================================

export const updatePricingTable = internalMutation({
  args: {
    pricingData: v.array(
      v.object({
        providerId: v.string(),
        providerName: v.string(),
        modelId: v.string(),
        modelName: v.string(),
        pricing: v.object({
          input: v.number(),
          output: v.number(),
          reasoning: v.optional(v.number()),
          cache_read: v.optional(v.number()),
          cache_write: v.optional(v.number()),
        }),
        limits: v.object({ context: v.number(), output: v.number() }),
        lastUpdated: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;

    for (const data of args.pricingData) {
      const existing = await ctx.db
        .query("aiPricing")
        .withIndex("by_model", (q) => q.eq("providerId", data.providerId).eq("modelId", data.modelId))
        .first();

      if (existing) {
        const changed =
          existing.pricing.input !== data.pricing.input ||
          existing.pricing.output !== data.pricing.output ||
          existing.pricing.reasoning !== data.pricing.reasoning ||
          existing.pricing.cache_read !== data.pricing.cache_read ||
          existing.pricing.cache_write !== data.pricing.cache_write ||
          existing.limits.context !== data.limits.context ||
          existing.limits.output !== data.limits.output ||
          existing.modelName !== data.modelName ||
          existing.providerName !== data.providerName;

        if (changed) {
          await ctx.db.patch(existing._id, data);
          updated++;
        } else {
          unchanged++;
        }
      } else {
        await ctx.db.insert("aiPricing", data);
        inserted++;
      }
    }

    return { inserted, updated, unchanged };
  },
});

export const updatePricingData = action({
  args: {
    apiUrl: v.optional(v.string()),
    apiKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const url = args.apiUrl || "https://models.dev/api.json";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (args.apiKey) headers["Authorization"] = `Bearer ${args.apiKey}`;

    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`Failed to fetch pricing data: ${response.status}`);

    const data = await response.json();

    // Parse the models.dev response
    const pricingUpdates: Array<{
      providerId: string;
      providerName: string;
      modelId: string;
      modelName: string;
      pricing: { input: number; output: number; reasoning?: number; cache_read?: number; cache_write?: number };
      limits: { context: number; output: number };
      lastUpdated: number;
    }> = [];

    for (const [providerId, providerData] of Object.entries(data as Record<string, { name?: string; models?: Record<string, { name?: string; cost?: { input?: number; output?: number; reasoning?: number; cache_read?: number; cache_write?: number }; limit?: { context?: number; output?: number } }> }>)) {
      if (!providerData?.models) continue;
      const providerName = providerData.name || providerId;

      for (const [modelId, modelData] of Object.entries(providerData.models)) {
        if (!modelData) continue;
        pricingUpdates.push({
          providerId,
          providerName,
          modelId,
          modelName: modelData.name || modelId,
          pricing: {
            input: modelData.cost?.input || 0,
            output: modelData.cost?.output || 0,
            reasoning: modelData.cost?.reasoning,
            cache_read: modelData.cost?.cache_read,
            cache_write: modelData.cost?.cache_write,
          },
          limits: {
            context: modelData.limit?.context || 0,
            output: modelData.limit?.output || 0,
          },
          lastUpdated: Date.now(),
        });
      }
    }

    // Batch into chunks of 100 to stay within Convex limits
    const BATCH_SIZE = 100;
    for (let i = 0; i < pricingUpdates.length; i += BATCH_SIZE) {
      const batch = pricingUpdates.slice(i, i + BATCH_SIZE);
      await ctx.runMutation(internal.pricing.updatePricingTable, { pricingData: batch });
    }

    return { total: pricingUpdates.length };
  },
});
