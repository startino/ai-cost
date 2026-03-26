import { v } from "convex/values";
import { query, mutation } from "./_generated/server.js";

// ============================================================================
// Queries
// ============================================================================

export const getMarkupMultipliers = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("markupMultiplier").collect();

    const providers = all.filter((m) => m.scope === "provider");
    const models = all.filter((m) => m.scope === "model");
    const tools = all.filter((m) => m.scope === "tool");

    return { providers, models, tools };
  },
});

export const getMarkupMultiplier = query({
  args: {
    providerId: v.string(),
    modelId: v.optional(v.string()),
    toolId: v.optional(v.string()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    // Priority: model > tool > provider > 0
    if (args.modelId) {
      const modelMarkups = await ctx.db
        .query("markupMultiplier")
        .withIndex("by_scope_and_provider", (q) => q.eq("scope", "model").eq("providerId", args.providerId))
        .collect();
      const match = modelMarkups.find((m) => "modelId" in m && m.modelId === args.modelId);
      if (match) return match.markupMultiplier;
    }

    if (args.toolId) {
      const toolMarkups = await ctx.db
        .query("markupMultiplier")
        .withIndex("by_scope_and_provider", (q) => q.eq("scope", "tool").eq("providerId", args.providerId))
        .collect();
      const match = toolMarkups.find((m) => "toolId" in m && m.toolId === args.toolId);
      if (match) return match.markupMultiplier;
    }

    const providerMarkup = await ctx.db
      .query("markupMultiplier")
      .withIndex("by_scope_and_provider", (q) => q.eq("scope", "provider").eq("providerId", args.providerId))
      .first();

    return providerMarkup?.markupMultiplier ?? 0;
  },
});

export const getMarkupMultiplierById = query({
  args: { id: v.id("markupMultiplier") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// ============================================================================
// Mutations
// ============================================================================

export const upsertProviderMarkup = mutation({
  args: {
    providerId: v.string(),
    markupMultiplier: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("markupMultiplier")
      .withIndex("by_scope_and_provider", (q) => q.eq("scope", "provider").eq("providerId", args.providerId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { markupMultiplier: args.markupMultiplier });
      return existing._id;
    }

    return await ctx.db.insert("markupMultiplier", {
      scope: "provider",
      providerId: args.providerId,
      markupMultiplier: args.markupMultiplier,
    });
  },
});

export const upsertModelMarkup = mutation({
  args: {
    providerId: v.string(),
    modelId: v.string(),
    markupMultiplier: v.number(),
  },
  handler: async (ctx, args) => {
    const candidates = await ctx.db
      .query("markupMultiplier")
      .withIndex("by_scope_and_provider", (q) => q.eq("scope", "model").eq("providerId", args.providerId))
      .collect();
    const existing = candidates.find((m) => "modelId" in m && m.modelId === args.modelId);

    if (existing) {
      await ctx.db.patch(existing._id, { markupMultiplier: args.markupMultiplier });
      return existing._id;
    }

    return await ctx.db.insert("markupMultiplier", {
      scope: "model",
      providerId: args.providerId,
      modelId: args.modelId,
      markupMultiplier: args.markupMultiplier,
    });
  },
});

export const upsertToolMarkup = mutation({
  args: {
    providerId: v.string(),
    toolId: v.string(),
    markupMultiplier: v.number(),
  },
  handler: async (ctx, args) => {
    const candidates = await ctx.db
      .query("markupMultiplier")
      .withIndex("by_scope_and_provider", (q) => q.eq("scope", "tool").eq("providerId", args.providerId))
      .collect();
    const existing = candidates.find((m) => "toolId" in m && m.toolId === args.toolId);

    if (existing) {
      await ctx.db.patch(existing._id, { markupMultiplier: args.markupMultiplier });
      return existing._id;
    }

    return await ctx.db.insert("markupMultiplier", {
      scope: "tool",
      providerId: args.providerId,
      toolId: args.toolId,
      markupMultiplier: args.markupMultiplier,
    });
  },
});

export const deleteMarkup = mutation({
  args: {
    scope: v.union(v.literal("provider"), v.literal("model"), v.literal("tool")),
    providerId: v.string(),
    modelId: v.optional(v.string()),
    toolId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const candidates = await ctx.db
      .query("markupMultiplier")
      .withIndex("by_scope_and_provider", (q) => q.eq("scope", args.scope).eq("providerId", args.providerId))
      .collect();

    for (const entry of candidates) {
      if (args.scope === "provider") {
        await ctx.db.delete(entry._id);
      } else if (args.scope === "model" && "modelId" in entry && entry.modelId === args.modelId) {
        await ctx.db.delete(entry._id);
      } else if (args.scope === "tool" && "toolId" in entry && entry.toolId === args.toolId) {
        await ctx.db.delete(entry._id);
      }
    }
  },
});
