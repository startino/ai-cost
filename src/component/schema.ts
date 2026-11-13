import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { vPricingData } from "../validators.js";

export default defineSchema({
  costEvents: defineTable({
    type: v.union(v.literal("ai"), v.literal("tool")),
    providerId: v.string(),
    modelId: v.optional(v.string()),
    toolId: v.optional(v.string()),

    amount: v.number(),
    currency: v.string(),

    userAmount: v.number(),
    markupMultiplier: v.optional(v.number()),

    usage: v.any(),

    breakdown: v.optional(v.any()),

    metadata: v.optional(v.any()),
  }),

  costAttributions: defineTable({
    costEventId: v.id("costEvents"),
    attributeType: v.string(),
    attributeId: v.string(),
  })
    .index("by_costEventId", ["costEventId"])
    .index("by_attribute", ["attributeType", "attributeId"]),

  aiPricing: defineTable({
    providerId: v.string(),
    providerName: v.string(),
    modelId: v.string(),
    modelName: v.string(),
    pricing: vPricingData,
    limits: v.object({
      context: v.number(),
      output: v.number(),
    }),
    lastUpdated: v.number(),
  })
    .index("by_model", ["providerId", "modelId"])
    .index("by_provider", ["providerId"]),

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
