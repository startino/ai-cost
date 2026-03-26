import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server.js";
import { paginationOptsValidator } from "convex/server";

// ============================================================================
// Internal: Save cost event + attributions (used by addAICost/addToolCost)
// ============================================================================

export const saveCostEvent = internalMutation({
  args: {
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
    attributions: v.array(v.object({ type: v.string(), id: v.string() })),
  },
  returns: v.id("costEvents"),
  handler: async (ctx, args) => {
    const { attributions, ...eventData } = args;

    const eventId = await ctx.db.insert("costEvents", eventData);

    for (const attr of attributions) {
      await ctx.db.insert("costAttributions", {
        costEventId: eventId,
        attributeType: attr.type,
        attributeId: attr.id,
      });
    }

    return eventId;
  },
});

// ============================================================================
// Add AI Cost
// ============================================================================

export const addAICost = mutation({
  args: {
    usage: v.object({
      promptTokens: v.number(),
      completionTokens: v.number(),
      totalTokens: v.number(),
      reasoningTokens: v.optional(v.number()),
      cachedInputTokens: v.optional(v.number()),
    }),
    modelId: v.string(),
    providerId: v.string(),
    attributions: v.array(v.object({ type: v.string(), id: v.string() })),
    markupMultiplier: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  returns: v.id("costEvents"),
  handler: async (ctx, args) => {
    // Look up pricing
    const pricing = await ctx.db
      .query("aiPricing")
      .withIndex("by_model", (q) => q.eq("providerId", args.providerId).eq("modelId", args.modelId))
      .first();

    if (!pricing) {
      throw new Error(`No pricing found for provider '${args.providerId}' model '${args.modelId}'. Run updatePricingData first.`);
    }

    // Resolve markup multiplier
    let markup = args.markupMultiplier;
    if (markup === undefined) {
      // Check model-level markup
      const modelMarkup = await ctx.db
        .query("markupMultiplier")
        .withIndex("by_scope_and_provider", (q) => q.eq("scope", "model").eq("providerId", args.providerId))
        .collect();
      const modelMatch = modelMarkup.find((m) => "modelId" in m && m.modelId === args.modelId);

      if (modelMatch) {
        markup = modelMatch.markupMultiplier;
      } else {
        // Fall back to provider-level
        const providerMarkup = await ctx.db
          .query("markupMultiplier")
          .withIndex("by_scope_and_provider", (q) => q.eq("scope", "provider").eq("providerId", args.providerId))
          .first();
        markup = providerMarkup?.markupMultiplier ?? 1;
      }
    }

    // Calculate costs (inline to avoid importing shared.ts in component)
    const MILLION = 1_000_000;
    const round8 = (n: number) => Math.round(n * 1e8) / 1e8;
    const prices = pricing.pricing;

    const promptTokensCost = ((args.usage.promptTokens || 0) / MILLION) * (prices.input || 0);
    const completionTokensCost = ((args.usage.completionTokens || 0) / MILLION) * (prices.output || 0);
    const reasoningPrice = prices.reasoning ?? prices.output ?? 0;
    const reasoningTokensCost = ((args.usage.reasoningTokens || 0) / MILLION) * reasoningPrice;
    const cacheReadPrice = prices.cache_read ?? (prices.input || 0) * 0.25;
    const cachedInputTokensCost = ((args.usage.cachedInputTokens || 0) / MILLION) * cacheReadPrice;

    const totalCost = round8(promptTokensCost + completionTokensCost + reasoningTokensCost + cachedInputTokensCost);
    const userTotalCost = round8(totalCost * markup);

    const breakdown = {
      promptTokensCost: round8(promptTokensCost),
      completionTokensCost: round8(completionTokensCost),
      reasoningTokensCost: round8(reasoningTokensCost),
      cachedInputTokensCost: round8(cachedInputTokensCost),
    };

    // Insert cost event
    const eventId = await ctx.db.insert("costEvents", {
      type: "ai",
      providerId: args.providerId,
      modelId: args.modelId,
      amount: totalCost,
      currency: "USD",
      userAmount: userTotalCost,
      markupMultiplier: markup !== 1 ? markup : undefined,
      usage: args.usage,
      breakdown,
      metadata: args.metadata,
    });

    // Insert attributions
    for (const attr of args.attributions) {
      await ctx.db.insert("costAttributions", {
        costEventId: eventId,
        attributeType: attr.type,
        attributeId: attr.id,
      });
    }

    return eventId;
  },
});

// ============================================================================
// Add Tool Cost
// ============================================================================

export const addToolCost = mutation({
  args: {
    usage: v.any(), // ToolUsage union — validated at client level
    providerId: v.string(),
    toolId: v.string(),
    attributions: v.array(v.object({ type: v.string(), id: v.string() })),
    markupMultiplier: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  returns: v.id("costEvents"),
  handler: async (ctx, args) => {
    // Look up tool pricing
    let toolPricing = await ctx.db
      .query("toolsPricing")
      .withIndex("by_provider_and_tool", (q) => q.eq("providerId", args.providerId).eq("toolId", args.toolId))
      .first();

    // Fallback: provider-only tool pricing
    if (!toolPricing) {
      toolPricing = await ctx.db
        .query("toolsPricing")
        .withIndex("by_provider", (q) => q.eq("providerId", args.providerId))
        .first();
    }

    // Fallback: AI pricing for token-based tool usage
    if (!toolPricing && args.usage?.type === "tokens") {
      const aiPricing = await ctx.db
        .query("aiPricing")
        .withIndex("by_model", (q) => q.eq("providerId", args.providerId).eq("modelId", args.toolId))
        .first();

      if (aiPricing) {
        // Use AI pricing for token-based tool cost
        const MILLION = 1_000_000;
        const round8 = (n: number) => Math.round(n * 1e8) / 1e8;
        const usage = args.usage;
        const prices = aiPricing.pricing;

        const inputCost = round8((usage.inputTokens / MILLION) * prices.input);
        const outputCost = round8((usage.outputTokens / MILLION) * prices.output);
        const reasoningCost = usage.reasoningTokens
          ? round8((usage.reasoningTokens / MILLION) * (prices.reasoning ?? prices.output))
          : undefined;
        const cacheReadCost = usage.cacheReadTokens
          ? round8((usage.cacheReadTokens / MILLION) * (prices.cache_read ?? prices.input * 0.25))
          : undefined;
        const cacheWriteCost = usage.cacheWriteTokens
          ? round8((usage.cacheWriteTokens / MILLION) * (prices.cache_write ?? prices.output))
          : undefined;

        const amount = round8(inputCost + outputCost + (reasoningCost ?? 0) + (cacheReadCost ?? 0) + (cacheWriteCost ?? 0));

        // Resolve markup
        let markup = args.markupMultiplier;
        if (markup === undefined) {
          const toolMarkup = await ctx.db
            .query("markupMultiplier")
            .withIndex("by_scope_and_provider", (q) => q.eq("scope", "tool").eq("providerId", args.providerId))
            .collect();
          const toolMatch = toolMarkup.find((m) => "toolId" in m && m.toolId === args.toolId);
          if (toolMatch) {
            markup = toolMatch.markupMultiplier;
          } else {
            const providerMarkup = await ctx.db
              .query("markupMultiplier")
              .withIndex("by_scope_and_provider", (q) => q.eq("scope", "provider").eq("providerId", args.providerId))
              .first();
            markup = providerMarkup?.markupMultiplier ?? 1;
          }
        }

        const userAmount = markup !== 1 ? round8(amount * markup) : amount;

        const eventId = await ctx.db.insert("costEvents", {
          type: "tool",
          providerId: args.providerId,
          toolId: args.toolId,
          amount,
          currency: "USD",
          userAmount,
          markupMultiplier: markup !== 1 ? markup : undefined,
          usage: args.usage,
          breakdown: { type: "tokens", inputTokensCost: inputCost, outputTokensCost: outputCost, reasoningTokensCost: reasoningCost, cacheReadTokensCost: cacheReadCost, cacheWriteTokensCost: cacheWriteCost },
          metadata: args.metadata,
        });

        for (const attr of args.attributions) {
          await ctx.db.insert("costAttributions", { costEventId: eventId, attributeType: attr.type, attributeId: attr.id });
        }

        return eventId;
      }
    }

    if (!toolPricing) {
      throw new Error(`No pricing found for provider '${args.providerId}' tool '${args.toolId}'.`);
    }

    // Calculate tool cost using the pricing config
    // This is a simplified inline version — the full calculation logic lives in shared.ts
    // for use in the client. Here we handle the most common cases.
    const pricing = toolPricing.pricing as Record<string, unknown>;
    const usageData = args.usage as Record<string, unknown>;
    const usageType = usageData.type as string;
    const pricingType = pricing.type as string;
    const currency = (pricing.currency as string) || "USD";
    const round8 = (n: number) => Math.round(n * 1e8) / 1e8;
    const MILLION = 1_000_000;

    let amount = 0;
    let breakdown: Record<string, unknown> | undefined;

    if (usageType !== pricingType) {
      throw new Error(`Usage type '${usageType}' requires pricing type '${usageType}', got '${pricingType}'`);
    }

    switch (usageType) {
      case "credits": {
        const creditTypes = pricing.creditTypes as Record<string, number> | undefined;
        const specificRate = usageData.creditType ? creditTypes?.[usageData.creditType as string] : undefined;
        const rate = specificRate ?? (pricing.costPerCredit as number);
        amount = round8((usageData.credits as number) * rate);
        breakdown = { type: "credits", credits: usageData.credits, costPerCredit: rate };
        break;
      }
      case "tokens": {
        const inputCost = round8(((usageData.inputTokens as number) / MILLION) * (pricing.input as number));
        const outputCost = round8(((usageData.outputTokens as number) / MILLION) * (pricing.output as number));
        amount = round8(inputCost + outputCost);
        breakdown = { type: "tokens", inputTokensCost: inputCost, outputTokensCost: outputCost };
        break;
      }
      case "requests": {
        const requestTypes = pricing.requestTypes as Record<string, number> | undefined;
        const specificRate = usageData.requestType ? requestTypes?.[usageData.requestType as string] : undefined;
        const rate = specificRate ?? (pricing.costPerRequest as number);
        amount = round8((usageData.requests as number) * rate);
        breakdown = { type: "requests", requests: usageData.requests, costPerRequest: rate };
        break;
      }
      case "units": {
        amount = round8((usageData.units as number) * (pricing.costPerUnit as number));
        breakdown = { type: "units", units: usageData.units, unitType: usageData.unitType, costPerUnit: pricing.costPerUnit };
        break;
      }
      default: {
        // For compute, storage, bandwidth, tiered, composite, custom —
        // the caller should use the client-side calculateToolCost and pass pre-calculated values
        throw new Error(`Tool cost type '${usageType}' must be calculated client-side via calculateToolCost(). Pass the result as metadata.`);
      }
    }

    // Resolve markup
    let markup = args.markupMultiplier;
    if (markup === undefined) {
      const toolMarkupRows = await ctx.db
        .query("markupMultiplier")
        .withIndex("by_scope_and_provider", (q) => q.eq("scope", "tool").eq("providerId", args.providerId))
        .collect();
      const toolMatch = toolMarkupRows.find((m) => "toolId" in m && m.toolId === args.toolId);
      if (toolMatch) {
        markup = toolMatch.markupMultiplier;
      } else {
        const providerMarkup = await ctx.db
          .query("markupMultiplier")
          .withIndex("by_scope_and_provider", (q) => q.eq("scope", "provider").eq("providerId", args.providerId))
          .first();
        markup = providerMarkup?.markupMultiplier ?? 1;
      }
    }

    const userAmount = markup !== 1 ? round8(amount * markup) : amount;

    const eventId = await ctx.db.insert("costEvents", {
      type: "tool",
      providerId: args.providerId,
      toolId: args.toolId,
      amount,
      currency,
      userAmount,
      markupMultiplier: markup !== 1 ? markup : undefined,
      usage: args.usage,
      breakdown,
      metadata: args.metadata,
    });

    for (const attr of args.attributions) {
      await ctx.db.insert("costAttributions", { costEventId: eventId, attributeType: attr.type, attributeId: attr.id });
    }

    return eventId;
  },
});

// ============================================================================
// Add Pre-Calculated Cost (for complex pricing models calculated client-side)
// ============================================================================

export const addPreCalculatedCost = mutation({
  args: {
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
    attributions: v.array(v.object({ type: v.string(), id: v.string() })),
  },
  returns: v.id("costEvents"),
  handler: async (ctx, args) => {
    const { attributions, ...eventData } = args;

    const eventId = await ctx.db.insert("costEvents", eventData);

    for (const attr of attributions) {
      await ctx.db.insert("costAttributions", {
        costEventId: eventId,
        attributeType: attr.type,
        attributeId: attr.id,
      });
    }

    return eventId;
  },
});

// ============================================================================
// Query: Get costs by attribution (paginated)
// ============================================================================

export const getCostsByAttribute = query({
  args: {
    attributeType: v.string(),
    attributeId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(v.object({
      _id: v.id("costEvents"),
      _creationTime: v.number(),
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
      attributions: v.array(v.object({ type: v.string(), id: v.string() })),
    })),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const attributionPage = await ctx.db
      .query("costAttributions")
      .withIndex("by_attribute", (q) =>
        q.eq("attributeType", args.attributeType).eq("attributeId", args.attributeId),
      )
      .order("desc")
      .paginate(args.paginationOpts);

    // Fetch cost events for this page
    const events = await Promise.all(
      attributionPage.page.map(async (attr) => {
        const event = await ctx.db.get(attr.costEventId);
        if (!event) return null;

        // Fetch all attributions for this event
        const allAttrs = await ctx.db
          .query("costAttributions")
          .withIndex("by_costEventId", (q) => q.eq("costEventId", event._id))
          .collect();

        return {
          ...event,
          attributions: allAttrs.map((a) => ({ type: a.attributeType, id: a.attributeId })),
        };
      }),
    );

    return {
      page: events.filter((e): e is NonNullable<typeof e> => e !== null),
      isDone: attributionPage.isDone,
      continueCursor: attributionPage.continueCursor,
    };
  },
});

// ============================================================================
// Query: List costs by attribution (non-paginated, limited)
// ============================================================================

export const listCostsByAttribute = query({
  args: {
    attributeType: v.string(),
    attributeId: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.object({
    _id: v.id("costEvents"),
    _creationTime: v.number(),
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
    attributions: v.array(v.object({ type: v.string(), id: v.string() })),
  })),
  handler: async (ctx, args) => {
    const maxItems = args.limit ?? 50;

    const attributions = await ctx.db
      .query("costAttributions")
      .withIndex("by_attribute", (q) =>
        q.eq("attributeType", args.attributeType).eq("attributeId", args.attributeId),
      )
      .order("desc")
      .take(maxItems);

    const events = await Promise.all(
      attributions.map(async (attr) => {
        const event = await ctx.db.get(attr.costEventId);
        if (!event) return null;

        const allAttrs = await ctx.db
          .query("costAttributions")
          .withIndex("by_costEventId", (q) => q.eq("costEventId", event._id))
          .collect();

        return {
          ...event,
          attributions: allAttrs.map((a) => ({ type: a.attributeType, id: a.attributeId })),
        };
      }),
    );

    return events.filter((e): e is NonNullable<typeof e> => e !== null);
  },
});

// ============================================================================
// Query: Get aggregated totals by attribution
// ============================================================================

export const getTotalByAttribute = query({
  args: {
    attributeType: v.string(),
    attributeId: v.string(),
  },
  returns: v.object({
    totalAmount: v.number(),
    totalUserAmount: v.number(),
    count: v.number(),
    currency: v.string(),
  }),
  handler: async (ctx, args) => {
    const attributions = await ctx.db
      .query("costAttributions")
      .withIndex("by_attribute", (q) =>
        q.eq("attributeType", args.attributeType).eq("attributeId", args.attributeId),
      )
      .collect();

    let totalAmount = 0;
    let totalUserAmount = 0;
    let currency = "USD";

    const eventIds = [...new Set(attributions.map((a) => a.costEventId))];

    for (const eventId of eventIds) {
      const event = await ctx.db.get(eventId);
      if (!event) continue;
      totalAmount += event.amount;
      totalUserAmount += event.userAmount;
      currency = event.currency;
    }

    const round8 = (n: number) => Math.round(n * 1e8) / 1e8;

    return {
      totalAmount: round8(totalAmount),
      totalUserAmount: round8(totalUserAmount),
      count: eventIds.length,
      currency,
    };
  },
});

// ============================================================================
// Query: Get single cost event with attributions
// ============================================================================

export const getCostEvent = query({
  args: { id: v.id("costEvents") },
  returns: v.union(
    v.object({
      _id: v.id("costEvents"),
      _creationTime: v.number(),
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
      attributions: v.array(v.object({ type: v.string(), id: v.string() })),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.id);
    if (!event) return null;

    const attributions = await ctx.db
      .query("costAttributions")
      .withIndex("by_costEventId", (q) => q.eq("costEventId", event._id))
      .collect();

    return {
      ...event,
      attributions: attributions.map((a) => ({ type: a.attributeType, id: a.attributeId })),
    };
  },
});

// ============================================================================
// Mutation: Delete cost event and its attributions
// ============================================================================

export const deleteCostEvent = mutation({
  args: { id: v.id("costEvents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const attributions = await ctx.db
      .query("costAttributions")
      .withIndex("by_costEventId", (q) => q.eq("costEventId", args.id))
      .collect();

    for (const attr of attributions) {
      await ctx.db.delete(attr._id);
    }

    await ctx.db.delete(args.id);
    return null;
  },
});

// ============================================================================
// Mutation: Delete all costs for an attribution (cascade)
// ============================================================================

export const deleteCostsByAttribute = mutation({
  args: {
    attributeType: v.string(),
    attributeId: v.string(),
  },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, args) => {
    const attributions = await ctx.db
      .query("costAttributions")
      .withIndex("by_attribute", (q) =>
        q.eq("attributeType", args.attributeType).eq("attributeId", args.attributeId),
      )
      .collect();

    const eventIds = [...new Set(attributions.map((a) => a.costEventId))];
    let deleted = 0;

    for (const eventId of eventIds) {
      // Delete all attributions for this event
      const allAttrs = await ctx.db
        .query("costAttributions")
        .withIndex("by_costEventId", (q) => q.eq("costEventId", eventId))
        .collect();

      for (const attr of allAttrs) {
        await ctx.db.delete(attr._id);
      }

      await ctx.db.delete(eventId);
      deleted++;
    }

    return { deleted };
  },
});
