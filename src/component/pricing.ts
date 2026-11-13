import { v } from "convex/values";
import { query, action, internalMutation } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { vPricing } from "../validators.js";
import { hasPricingChanged, MODELS_DEV_API_URL, parseModelsDevResponse } from "../shared.js";
import type { ModelsDevApiResponse } from "../client/types.js";

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

export const getToolPricing = query({
  args: { providerId: v.string(), toolId: v.string() },
  handler: async (ctx, args) => {
    const exact = await ctx.db
      .query("toolsPricing")
      .withIndex("by_provider_and_tool", (q) => q.eq("providerId", args.providerId).eq("toolId", args.toolId))
      .first();
    if (exact) return exact;

    const providerOnly = await ctx.db
      .query("toolsPricing")
      .withIndex("by_provider", (q) => q.eq("providerId", args.providerId))
      .first();
    if (providerOnly) return providerOnly;

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

export const updatePricingTable = internalMutation({
  args: {
    pricingData: v.array(vPricing),
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
        if (hasPricingChanged(existing, data)) {
          await ctx.db.replace(existing._id, data);
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
    const url = args.apiUrl || MODELS_DEV_API_URL;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (args.apiKey) headers["Authorization"] = `Bearer ${args.apiKey}`;

    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`Failed to fetch pricing data: ${response.status}`);

    const pricingUpdates = parseModelsDevResponse((await response.json()) as ModelsDevApiResponse);

    const BATCH_SIZE = 100;
    for (let i = 0; i < pricingUpdates.length; i += BATCH_SIZE) {
      const batch = pricingUpdates.slice(i, i + BATCH_SIZE);
      await ctx.runMutation(internal.pricing.updatePricingTable, { pricingData: batch });
    }

    return { total: pricingUpdates.length };
  },
});
