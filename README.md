# ai-cost

A Convex component for tracking AI and tool costs with flexible, generic attribution.

Fork of [neutral-cost](https://github.com/neutralbase/neutral-cost) by [Neutralbase](https://github.com/neutralbase) — redesigned with a generic attribution model instead of hard-coded entity references.

## What changed from neutral-cost

The original `neutral-cost` component stores costs with fixed `userId`, `threadId`, and `messageId` columns. This fork replaces those with a generic **attributions table** where each cost event can be linked to any number of entities via `attributeType` (string) + `attributeId` (string) pairs.

This means you can attribute costs to orgs, users, experts, playbooks, threads, messages, or any other entity — without changing the schema.

| neutral-cost | ai-cost |
|---|---|
| `costPerAIRequest` + `costPerTools` (separate tables) | `costEvents` (unified, `type: "ai" \| "tool"`) |
| Hard-coded `userId`, `threadId`, `messageId` | `costAttributions` table: `attributeType` + `attributeId` |
| `addAICost` as action (non-atomic) | `addAICost` as mutation (atomic) |
| No pre-calculated cost support | `addPreCalculatedCost` for complex pricing |
| No cascade delete by entity | `deleteCostsByAttribute` |

Everything else is preserved: pricing engine (models.dev API sync), markup multipliers (provider/model/tool), 10 tool pricing models, and all calculation functions.

## Installation

```bash
npm install ai-cost
```

## Setup

### 1. Add the component to your Convex app

```typescript
// convex/convex.config.ts
import { defineApp } from "convex/server";
import aiCost from "ai-cost/convex.config";

const app = defineApp();
app.use(aiCost);

export default app;
```

### 2. Initialize and export the API

```typescript
// convex/costs.ts
import { components } from "./_generated/api";
import { AICost } from "ai-cost";

const costs = new AICost(components.aiCost);

export const {
  addAICost,
  addToolCost,
  addPreCalculatedCost,
  getCostsByAttribute,
  getTotalByAttribute,
  getCostEvent,
  deleteCostEvent,
  deleteCostsByAttribute,
  getPricing,
  getAllPricing,
  updatePricingData,
  getMarkupMultipliers,
  getMarkupMultiplier,
  upsertProviderMarkup,
  upsertModelMarkup,
  upsertToolMarkup,
  deleteMarkup,
} = costs.clientApi();
```

### 3. Populate pricing data

```typescript
// Run once (or on a schedule) to sync model pricing from models.dev:
await costs.updatePricingData(ctx);
```

### 4. Configure markup (optional)

```typescript
// 50% markup on all OpenAI models
await costs.upsertProviderMarkup(ctx, { providerId: "openai", markupMultiplier: 1.5 });

// 2x markup specifically on GPT-4
await costs.upsertModelMarkup(ctx, { providerId: "openai", modelId: "gpt-4", markupMultiplier: 2.0 });
```

## Usage

### Track AI costs

```typescript
await costs.addAICost(ctx, {
  usage: {
    promptTokens: 1000,
    completionTokens: 500,
    totalTokens: 1500,
    reasoningTokens: 200,      // optional
    cachedInputTokens: 100,    // optional
  },
  modelId: "gpt-4",
  providerId: "openai",
  attributions: [
    { type: "org", id: orgId },
    { type: "user", id: userId },
    { type: "expert", id: expertId },
    { type: "playbook", id: playbookId },
    { type: "thread", id: threadId },
  ],
});
```

### Track tool costs

```typescript
await costs.addToolCost(ctx, {
  usage: { type: "credits", credits: 5, creditType: "scrape" },
  providerId: "firecrawl",
  toolId: "web-scraper",
  attributions: [
    { type: "org", id: orgId },
    { type: "user", id: userId },
  ],
});
```

### Query costs by any dimension

```typescript
// All costs for an org (paginated)
const orgCosts = await costs.getCostsByAttribute(ctx, {
  attributeType: "org",
  attributeId: orgId,
  paginationOpts: { numItems: 50, cursor: null },
});

// Total spend by a specific expert
const expertTotal = await costs.getTotalByAttribute(ctx, {
  attributeType: "expert",
  attributeId: expertId,
});
// => { totalAmount: 12.50, totalUserAmount: 18.75, count: 42, currency: "USD" }

// Single cost event with all its attributions
const event = await costs.getCostEvent(ctx, { id: costEventId });
```

### Pre-calculated costs

For complex pricing models (compute, storage, tiered, composite), calculate client-side and pass the result:

```typescript
import { calculateToolCost } from "ai-cost/shared";

const result = calculateToolCost(usage, pricing, markupMultiplier);

await costs.addPreCalculatedCost(ctx, {
  type: "tool",
  providerId: "aws",
  toolId: "s3-storage",
  amount: result.cost.amount,
  currency: result.cost.currency,
  userAmount: result.costForUser.amount,
  markupMultiplier: result.costForUser.markupMultiplier,
  usage,
  breakdown: result.cost.breakdown,
  attributions: [{ type: "org", id: orgId }],
});
```

### Cascade delete

```typescript
// Delete all costs attributed to an org (e.g., on org deletion)
await costs.deleteCostsByAttribute(ctx, { attributeType: "org", attributeId: orgId });
```

## Supported tool pricing models

Credits, tokens, per-request, compute-time, storage, bandwidth, units, tiered, composite, and custom.

See `validators.ts` for the full type definitions.

## Attribution

This project is a derivative work of [neutral-cost](https://github.com/neutralbase/neutral-cost) by [Neutralbase](https://github.com/neutralbase), licensed under FSL-1.1-ALv2.

The pricing engine, cost calculation functions, markup multiplier system, models.dev API integration, and tool pricing model validators are derived from the original work. The attribution/scoping model, atomic mutation design, and pre-calculated cost API are new.

## License

[FSL-1.1-ALv2](./LICENSE) (Functional Source License with Apache License 2.0 future grant).

Becomes Apache 2.0 licensed two years after each version's release date.
