import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ========================================================================
  // Cost Events — the core cost record (what happened)
  // ========================================================================
  costEvents: defineTable({
    type: v.union(v.literal("ai"), v.literal("tool")),
    providerId: v.string(),
    modelId: v.optional(v.string()),
    toolId: v.optional(v.string()),

    // Unified cost (raw)
    amount: v.number(),
    currency: v.string(),

    // User-facing cost (with markup)
    userAmount: v.number(),
    markupMultiplier: v.optional(v.number()),

    // Usage details — stored for audit/breakdown
    // AI: { promptTokens, completionTokens, totalTokens, ... }
    // Tool: { type, credits|tokens|requests|..., ... }
    usage: v.any(),

    // Cost breakdown details (varies by type)
    breakdown: v.optional(v.any()),

    metadata: v.optional(v.any()),
  }),

  // ========================================================================
  // Cost Attributions — who/what this cost is associated with
  // ========================================================================
  costAttributions: defineTable({
    costEventId: v.id("costEvents"),
    attributeType: v.string(),
    attributeId: v.string(),
  })
    .index("by_costEventId", ["costEventId"])
    .index("by_attribute", ["attributeType", "attributeId"]),

  // ========================================================================
  // AI Pricing — model pricing data from models.dev API
  // ========================================================================
  aiPricing: defineTable({
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
    limits: v.object({
      context: v.number(),
      output: v.number(),
    }),
    lastUpdated: v.number(),
  })
    .index("by_model", ["providerId", "modelId"])
    .index("by_provider", ["providerId"]),

  // ========================================================================
  // Tool Pricing — tool-specific pricing configurations
  // ========================================================================
  toolsPricing: defineTable({
    providerId: v.string(),
    providerName: v.string(),
    toolId: v.string(),
    toolName: v.string(),
    pricing: v.any(),
    limits: v.optional(v.any()),
    lastUpdated: v.number(),
  })
    .index("by_provider", ["providerId"])
    .index("by_provider_and_tool", ["providerId", "toolId"]),

  // ========================================================================
  // Markup Multipliers — provider/model/tool level markup configs
  // ========================================================================
  markupMultiplier: defineTable(
    v.union(
      v.object({
        scope: v.literal("provider"),
        providerId: v.string(),
        markupMultiplier: v.number(),
      }),
      v.object({
        scope: v.literal("model"),
        providerId: v.string(),
        modelId: v.string(),
        markupMultiplier: v.number(),
      }),
      v.object({
        scope: v.literal("tool"),
        providerId: v.string(),
        toolId: v.string(),
        markupMultiplier: v.number(),
      }),
    ),
  )
    .index("by_provider", ["providerId"])
    .index("by_scope_and_provider", ["scope", "providerId"]),
});
