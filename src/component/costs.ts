import { v } from "convex/values";
import { mutation, query, internalMutation, type MutationCtx } from "./_generated/server.js";
import type { Doc } from "./_generated/dataModel.js";
import { calculateTokenCosts, type TokenUsage } from "../shared.js";

export const version0115 = query({
  args: {},
  returns: v.string(),
  handler: async () => "ai-cost@0.1.15",
});

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

const resolveAIMarkup = async (ctx: MutationCtx, providerId: string, modelId: string) => {
  const modelMarkup = await ctx.db
    .query("markupMultiplier")
    .withIndex("by_scope_and_provider", (q) => q.eq("scope", "model").eq("providerId", providerId))
    .collect();
  const modelMatch = modelMarkup.find((m) => "modelId" in m && m.modelId === modelId);
  if (modelMatch) return modelMatch.markupMultiplier;

  const providerMarkup = await ctx.db
    .query("markupMultiplier")
    .withIndex("by_scope_and_provider", (q) => q.eq("scope", "provider").eq("providerId", providerId))
    .first();
  return providerMarkup?.markupMultiplier ?? 1;
};

const calculateAICost = (prices: Doc<"aiPricing">["pricing"], usage: TokenUsage, markup: number) => {
  const { totalCost, ...breakdown } = calculateTokenCosts(prices, usage);
  return { totalCost, userTotalCost: Math.round(totalCost * markup * 1e8) / 1e8, breakdown };
};

export const addAICost = mutation({
  args: {
    usage: v.object({
      promptTokens: v.number(),
      completionTokens: v.number(),
      totalTokens: v.number(),
      reasoningTokens: v.optional(v.number()),
      cachedInputTokens: v.optional(v.number()),
      cacheWriteTokens: v.optional(v.number()),
    }),
    modelId: v.string(),
    providerId: v.string(),
    attributions: v.array(v.object({ type: v.string(), id: v.string() })),
    markupMultiplier: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  returns: v.id("costEvents"),
  handler: async (ctx, args) => {
    const pricing = await ctx.db
      .query("aiPricing")
      .withIndex("by_model", (q) => q.eq("providerId", args.providerId).eq("modelId", args.modelId))
      .first();

    if (!pricing) {
      console.warn(`[ai-cost] MISSING PRICING: provider='${args.providerId}' model='${args.modelId}' — recorded with $0 cost`);
      const eventId = await ctx.db.insert("costEvents", {
        type: "ai",
        providerId: args.providerId,
        modelId: args.modelId,
        amount: 0,
        currency: "USD",
        userAmount: 0,
        usage: args.usage,
        metadata: { ...((args.metadata as Record<string, unknown>) ?? {}), _pricingMissing: true },
      });
      for (const attr of args.attributions) {
        await ctx.db.insert("costAttributions", {
          costEventId: eventId,
          attributeType: attr.type,
          attributeId: attr.id,
        });
      }
      return eventId;
    }

    const markup = args.markupMultiplier ?? (await resolveAIMarkup(ctx, args.providerId, args.modelId));
    const { totalCost, userTotalCost, breakdown } = calculateAICost(pricing.pricing, args.usage, markup);

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

export const addToolCost = mutation({
  args: {
    usage: v.any(),
    providerId: v.string(),
    toolId: v.string(),
    attributions: v.array(v.object({ type: v.string(), id: v.string() })),
    markupMultiplier: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  returns: v.id("costEvents"),
  handler: async (ctx, args) => {
    let toolPricing = await ctx.db
      .query("toolsPricing")
      .withIndex("by_provider_and_tool", (q) => q.eq("providerId", args.providerId).eq("toolId", args.toolId))
      .first();

    if (!toolPricing) {
      toolPricing = await ctx.db
        .query("toolsPricing")
        .withIndex("by_provider", (q) => q.eq("providerId", args.providerId))
        .first();
    }

    if (!toolPricing && args.usage?.type === "tokens") {
      const aiPricing = await ctx.db
        .query("aiPricing")
        .withIndex("by_model", (q) => q.eq("providerId", args.providerId).eq("modelId", args.toolId))
        .first();

      if (aiPricing) {
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
        throw new Error(`Tool cost type '${usageType}' must be calculated client-side via calculateToolCost(). Pass the result as metadata.`);
      }
    }

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

export const getCostsByAttribute = query({
  args: {
    attributeType: v.string(),
    attributeId: v.string(),
    paginationOpts: v.object({
      numItems: v.number(),
      cursor: v.union(v.number(), v.null()),
    }),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
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
    continueCursor: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const { numItems, cursor } = args.paginationOpts;

    const upperBound = cursor ?? args.endTime;
    const attributions = await ctx.db
      .query("costAttributions")
      .withIndex("by_attribute", (q) => {
        const eqs = q.eq("attributeType", args.attributeType).eq("attributeId", args.attributeId);
        if (args.startTime !== undefined && upperBound != null)
          return eqs.gte("_creationTime", args.startTime).lt("_creationTime", upperBound);
        if (args.startTime !== undefined)
          return eqs.gte("_creationTime", args.startTime);
        if (upperBound != null)
          return eqs.lt("_creationTime", upperBound);
        return eqs;
      })
      .order("desc")
      .take(numItems + 1);

    const hasMore = attributions.length > numItems;
    const pageAttributions = hasMore ? attributions.slice(0, numItems) : attributions;

    const events = await Promise.all(
      pageAttributions.map(async (attr) => {
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

    const lastAttr = pageAttributions[pageAttributions.length - 1];
    return {
      page: events.filter((e): e is NonNullable<typeof e> => e !== null),
      isDone: !hasMore,
      continueCursor: lastAttr ? lastAttr._creationTime : null,
    };
  },
});

export const listCostsByAttribute = query({
  args: {
    attributeType: v.string(),
    attributeId: v.string(),
    limit: v.optional(v.number()),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
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
      .withIndex("by_attribute", (q) => {
        const eqs = q.eq("attributeType", args.attributeType).eq("attributeId", args.attributeId);
        if (args.startTime !== undefined && args.endTime !== undefined)
          return eqs.gte("_creationTime", args.startTime).lt("_creationTime", args.endTime);
        if (args.startTime !== undefined) return eqs.gte("_creationTime", args.startTime);
        if (args.endTime !== undefined) return eqs.lt("_creationTime", args.endTime);
        return eqs;
      })
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

export const getTotalByAttribute = query({
  args: {
    attributeType: v.string(),
    attributeId: v.string(),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
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
      .withIndex("by_attribute", (q) => {
        const eqs = q.eq("attributeType", args.attributeType).eq("attributeId", args.attributeId);
        if (args.startTime !== undefined && args.endTime !== undefined)
          return eqs.gte("_creationTime", args.startTime).lt("_creationTime", args.endTime);
        if (args.startTime !== undefined) return eqs.gte("_creationTime", args.startTime);
        if (args.endTime !== undefined) return eqs.lt("_creationTime", args.endTime);
        return eqs;
      })
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

export const getDistinctAttributeValues = query({
  args: {
    attributeType: v.string(),
    scopeType: v.optional(v.string()),
    scopeId: v.optional(v.string()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const attributions = await ctx.db
      .query("costAttributions")
      .withIndex("by_attribute", (q) => q.eq("attributeType", args.attributeType))
      .collect();

    if (!args.scopeType || !args.scopeId) {
      return [...new Set(attributions.map((a) => a.attributeId))];
    }

    const scopeAttrs = await ctx.db
      .query("costAttributions")
      .withIndex("by_attribute", (q) =>
        q.eq("attributeType", args.scopeType!).eq("attributeId", args.scopeId!),
      )
      .collect();
    const scopeEventIds = new Set(scopeAttrs.map((a) => a.costEventId));

    const filtered = attributions.filter((a) => scopeEventIds.has(a.costEventId));
    return [...new Set(filtered.map((a) => a.attributeId))];
  },
});

export const listCostsByMultipleAttributes = query({
  args: {
    filters: v.array(v.object({ type: v.string(), id: v.string() })),
    limit: v.optional(v.number()),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.filters.length === 0) return [];
    const maxItems = args.limit ?? 100;

    const [primaryFilter, ...restFilters] = args.filters;

    const intersectionSets: Set<string>[] = [];
    for (const filter of restFilters) {
      const attrs = await ctx.db
        .query("costAttributions")
        .withIndex("by_attribute", (q) => {
          const eqs = q.eq("attributeType", filter.type).eq("attributeId", filter.id);
          if (args.startTime !== undefined && args.endTime !== undefined)
            return eqs.gte("_creationTime", args.startTime).lt("_creationTime", args.endTime);
          if (args.startTime !== undefined) return eqs.gte("_creationTime", args.startTime);
          if (args.endTime !== undefined) return eqs.lt("_creationTime", args.endTime);
          return eqs;
        })
        .collect();
      intersectionSets.push(new Set(attrs.map((a) => a.costEventId as string)));
    }

    const primaryAttrs = await ctx.db
      .query("costAttributions")
      .withIndex("by_attribute", (q) => {
        const eqs = q.eq("attributeType", primaryFilter.type).eq("attributeId", primaryFilter.id);
        if (args.startTime !== undefined && args.endTime !== undefined)
          return eqs.gte("_creationTime", args.startTime).lt("_creationTime", args.endTime);
        if (args.startTime !== undefined) return eqs.gte("_creationTime", args.startTime);
        if (args.endTime !== undefined) return eqs.lt("_creationTime", args.endTime);
        return eqs;
      })
      .order("desc")
      .collect();

    const events = [];
    const seen = new Set<string>();

    for (const attr of primaryAttrs) {
      const eventIdStr = attr.costEventId as string;
      if (seen.has(eventIdStr)) continue;
      seen.add(eventIdStr);

      if (!intersectionSets.every((set) => set.has(eventIdStr))) continue;

      const event = await ctx.db.get(attr.costEventId);
      if (!event) continue;

      const allAttrs = await ctx.db
        .query("costAttributions")
        .withIndex("by_costEventId", (q) => q.eq("costEventId", event._id))
        .collect();

      events.push({
        ...event,
        attributions: allAttrs.map((a) => ({ type: a.attributeType, id: a.attributeId })),
      });

      if (events.length >= maxItems) break;
    }

    return events;
  },
});

export const recalculateMissingPricingBatch = mutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    continueCursor: v.union(v.string(), v.null()),
    isDone: v.boolean(),
    processed: v.number(),
    fixed: v.number(),
  }),
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 100;
    const cursor = args.cursor;
    const events = await ctx.db
      .query("costEvents")
      .withIndex("by_creation_time", (q) => (cursor === null ? q : q.gte("_creationTime", Number(cursor))))
      .order("asc")
      .take(batchSize + 1);

    const hasMore = events.length > batchSize;
    const batch = hasMore ? events.slice(0, batchSize) : events;
    let fixed = 0;

    for (const event of batch) {
      if (event.type !== "ai" || !event.modelId || event.metadata?._pricingMissing !== true) continue;

      const pricing = await ctx.db
        .query("aiPricing")
        .withIndex("by_model", (q) => q.eq("providerId", event.providerId).eq("modelId", event.modelId!))
        .first();
      if (!pricing) continue;

      const markup = await resolveAIMarkup(ctx, event.providerId, event.modelId);
      const { totalCost, userTotalCost, breakdown } = calculateAICost(pricing.pricing, event.usage, markup);
      const { _pricingMissing, ...metadata } = event.metadata as Record<string, unknown>;

      await ctx.db.patch(event._id, {
        amount: totalCost,
        userAmount: userTotalCost,
        markupMultiplier: markup !== 1 ? markup : undefined,
        breakdown,
        metadata: { ...metadata, _pricingBackfilledAt: Date.now() },
      });
      fixed++;
    }

    return {
      continueCursor: hasMore ? String(events[batchSize]._creationTime) : null,
      isDone: !hasMore,
      processed: batch.length,
      fixed,
    };
  },
});

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
