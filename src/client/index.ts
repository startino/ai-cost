import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";

// Re-export types and calculation functions
export type {
  CalculatedCosts,
  CalculatedToolCost,
  ToolCostBreakdown,
  ModelsDevApiResponse,
  ModelsDevModel,
  AICostOptions,
  CostEvent,
  CostAttribution,
  CostTotal,
  CostEventWithAttributions,
} from "./types.js";

export {
  calculateCosts,
  calculateUserCosts,
  calculateToolCost,
  calculateToolCostFromTokenPricing,
  parseModelsDevResponse,
  parseModelPricing,
  hasPricingChanged,
  resolveMarkupMultiplier,
  MILLION,
  MODELS_DEV_API_URL,
} from "../shared.js";

export type {
  Usage,
  ToolUsage,
  ToolPricing,
  Pricing,
  Cost,
  ToolCostResult,
  ToolCostForUser,
  Attribution,
  AddAICostArgs,
  AddToolCostArgs,
  ProviderMarkup,
  ModelMarkup,
  ToolMarkup,
  MarkupMultiplierConfig,
} from "../validators.js";

export {
  vUsage,
  vToolUsage,
  vToolPricing,
  vPricing,
  vPricingData,
  vLimits,
  vCost,
  vToolCost,
  vToolCostForUser,
  vAttribution,
  vAddAICostArgs,
  vAddToolCostArgs,
  vProviderMarkup,
  vModelMarkup,
  vToolMarkup,
  vMarkupMultiplierConfig,
  vToolLimits,
} from "../validators.js";

// ============================================================================
// Types
// ============================================================================

export type { ComponentApi } from "../component/_generated/component.js";

type RunMutationCtx = { runMutation: GenericMutationCtx<never>["runMutation"] };
type RunQueryCtx = { runQuery: GenericQueryCtx<never>["runQuery"] };
type RunActionCtx = { runAction: GenericActionCtx<never>["runAction"] };

// ============================================================================
// AICost — Main client class
// ============================================================================

export class AICost {
  private component: ComponentApi;

  constructor(component: ComponentApi) {
    this.component = component;
  }

  // ==========================================================================
  // Cost Tracking
  // ==========================================================================

  async addAICost(
    ctx: RunMutationCtx,
    args: {
      usage: { promptTokens: number; completionTokens: number; totalTokens: number; reasoningTokens?: number; cachedInputTokens?: number };
      modelId: string;
      providerId: string;
      attributions: Array<{ type: string; id: string }>;
      markupMultiplier?: number;
      metadata?: unknown;
    },
  ) {
    return await ctx.runMutation(this.component.costs.addAICost, args);
  }

  async addToolCost(
    ctx: RunMutationCtx,
    args: {
      usage: unknown;
      providerId: string;
      toolId: string;
      attributions: Array<{ type: string; id: string }>;
      markupMultiplier?: number;
      metadata?: unknown;
    },
  ) {
    return await ctx.runMutation(this.component.costs.addToolCost, args);
  }

  async addPreCalculatedCost(
    ctx: RunMutationCtx,
    args: {
      type: "ai" | "tool";
      providerId: string;
      modelId?: string;
      toolId?: string;
      amount: number;
      currency: string;
      userAmount: number;
      markupMultiplier?: number;
      usage: unknown;
      breakdown?: unknown;
      metadata?: unknown;
      attributions: Array<{ type: string; id: string }>;
    },
  ) {
    return await ctx.runMutation(this.component.costs.addPreCalculatedCost, args);
  }

  // ==========================================================================
  // Cost Queries
  // ==========================================================================

  async getCostsByAttribute(
    ctx: RunQueryCtx,
    args: {
      attributeType: string;
      attributeId: string;
      paginationOpts: { numItems: number; cursor: string | null };
    },
  ) {
    return await ctx.runQuery(this.component.costs.getCostsByAttribute, args);
  }

  async listCostsByAttribute(
    ctx: RunQueryCtx,
    args: { attributeType: string; attributeId: string; limit?: number },
  ) {
    return await ctx.runQuery(this.component.costs.listCostsByAttribute, args);
  }

  async getTotalByAttribute(
    ctx: RunQueryCtx,
    args: { attributeType: string; attributeId: string },
  ) {
    return await ctx.runQuery(this.component.costs.getTotalByAttribute, args);
  }

  async getCostEvent(ctx: RunQueryCtx, args: { id: string }) {
    return await ctx.runQuery(this.component.costs.getCostEvent, args as never);
  }

  async deleteCostEvent(ctx: RunMutationCtx, args: { id: string }) {
    return await ctx.runMutation(this.component.costs.deleteCostEvent, args as never);
  }

  async deleteCostsByAttribute(
    ctx: RunMutationCtx,
    args: { attributeType: string; attributeId: string },
  ) {
    return await ctx.runMutation(this.component.costs.deleteCostsByAttribute, args);
  }

  // ==========================================================================
  // Pricing
  // ==========================================================================

  async getPricing(ctx: RunQueryCtx, args: { providerId: string; modelId: string }) {
    return await ctx.runQuery(this.component.pricing.getPricing, args);
  }

  async getAllPricing(ctx: RunQueryCtx) {
    return await ctx.runQuery(this.component.pricing.getAllPricing, {});
  }

  async getPricingByProvider(ctx: RunQueryCtx, args: { providerId: string }) {
    return await ctx.runQuery(this.component.pricing.getPricingByProvider, args);
  }

  async searchPricingByModelName(ctx: RunQueryCtx, args: { modelName: string }) {
    return await ctx.runQuery(this.component.pricing.searchPricingByModelName, args);
  }

  async getToolPricing(ctx: RunQueryCtx, args: { providerId: string; toolId: string }) {
    return await ctx.runQuery(this.component.pricing.getToolPricing, args);
  }

  async getAllToolPricing(ctx: RunQueryCtx) {
    return await ctx.runQuery(this.component.pricing.getAllToolPricing, {});
  }

  async getToolPricingByProvider(ctx: RunQueryCtx, args: { providerId: string }) {
    return await ctx.runQuery(this.component.pricing.getToolPricingByProvider, args);
  }

  async updatePricingData(ctx: RunActionCtx, args?: { apiUrl?: string; apiKey?: string }) {
    return await ctx.runAction(this.component.pricing.updatePricingData, args ?? {});
  }

  // ==========================================================================
  // Markup
  // ==========================================================================

  async getMarkupMultipliers(ctx: RunQueryCtx) {
    return await ctx.runQuery(this.component.markup.getMarkupMultipliers, {});
  }

  async getMarkupMultiplier(
    ctx: RunQueryCtx,
    args: { providerId: string; modelId?: string; toolId?: string },
  ) {
    return await ctx.runQuery(this.component.markup.getMarkupMultiplier, args);
  }

  async getMarkupMultiplierById(ctx: RunQueryCtx, args: { id: string }) {
    return await ctx.runQuery(this.component.markup.getMarkupMultiplierById, args as never);
  }

  async upsertProviderMarkup(ctx: RunMutationCtx, args: { providerId: string; markupMultiplier: number }) {
    return await ctx.runMutation(this.component.markup.upsertProviderMarkup, args);
  }

  async upsertModelMarkup(ctx: RunMutationCtx, args: { providerId: string; modelId: string; markupMultiplier: number }) {
    return await ctx.runMutation(this.component.markup.upsertModelMarkup, args);
  }

  async upsertToolMarkup(ctx: RunMutationCtx, args: { providerId: string; toolId: string; markupMultiplier: number }) {
    return await ctx.runMutation(this.component.markup.upsertToolMarkup, args);
  }

  async deleteMarkup(
    ctx: RunMutationCtx,
    args: { scope: "provider" | "model" | "tool"; providerId: string; modelId?: string; toolId?: string },
  ) {
    return await ctx.runMutation(this.component.markup.deleteMarkup, args);
  }

  // ==========================================================================
  // Client API — export component functions for direct use in Convex files
  // ==========================================================================

  clientApi() {
    return {
      // Costs
      addAICost: this.component.costs.addAICost,
      addToolCost: this.component.costs.addToolCost,
      addPreCalculatedCost: this.component.costs.addPreCalculatedCost,
      getCostsByAttribute: this.component.costs.getCostsByAttribute,
      listCostsByAttribute: this.component.costs.listCostsByAttribute,
      getTotalByAttribute: this.component.costs.getTotalByAttribute,
      getCostEvent: this.component.costs.getCostEvent,
      deleteCostEvent: this.component.costs.deleteCostEvent,
      deleteCostsByAttribute: this.component.costs.deleteCostsByAttribute,

      // Pricing
      getPricing: this.component.pricing.getPricing,
      getAllPricing: this.component.pricing.getAllPricing,
      getPricingByProvider: this.component.pricing.getPricingByProvider,
      searchPricingByModelName: this.component.pricing.searchPricingByModelName,
      getToolPricing: this.component.pricing.getToolPricing,
      getAllToolPricing: this.component.pricing.getAllToolPricing,
      getToolPricingByProvider: this.component.pricing.getToolPricingByProvider,
      updatePricingData: this.component.pricing.updatePricingData,

      // Markup
      getMarkupMultipliers: this.component.markup.getMarkupMultipliers,
      getMarkupMultiplier: this.component.markup.getMarkupMultiplier,
      getMarkupMultiplierById: this.component.markup.getMarkupMultiplierById,
      upsertProviderMarkup: this.component.markup.upsertProviderMarkup,
      upsertModelMarkup: this.component.markup.upsertModelMarkup,
      upsertToolMarkup: this.component.markup.upsertToolMarkup,
      deleteMarkup: this.component.markup.deleteMarkup,
    };
  }
}
