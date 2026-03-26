/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    costs: {
      addAICost: FunctionReference<
        "mutation",
        "internal",
        {
          attributions: Array<{ id: string; type: string }>;
          markupMultiplier?: number;
          metadata?: any;
          modelId: string;
          providerId: string;
          usage: {
            cachedInputTokens?: number;
            completionTokens: number;
            promptTokens: number;
            reasoningTokens?: number;
            totalTokens: number;
          };
        },
        string,
        Name
      >;
      addPreCalculatedCost: FunctionReference<
        "mutation",
        "internal",
        {
          amount: number;
          attributions: Array<{ id: string; type: string }>;
          breakdown?: any;
          currency: string;
          markupMultiplier?: number;
          metadata?: any;
          modelId?: string;
          providerId: string;
          toolId?: string;
          type: "ai" | "tool";
          usage: any;
          userAmount: number;
        },
        string,
        Name
      >;
      addToolCost: FunctionReference<
        "mutation",
        "internal",
        {
          attributions: Array<{ id: string; type: string }>;
          markupMultiplier?: number;
          metadata?: any;
          providerId: string;
          toolId: string;
          usage: any;
        },
        string,
        Name
      >;
      deleteCostEvent: FunctionReference<
        "mutation",
        "internal",
        { id: string },
        null,
        Name
      >;
      deleteCostsByAttribute: FunctionReference<
        "mutation",
        "internal",
        { attributeId: string; attributeType: string },
        { deleted: number },
        Name
      >;
      getCostEvent: FunctionReference<
        "query",
        "internal",
        { id: string },
        {
          _creationTime: number;
          _id: string;
          amount: number;
          attributions: Array<{ id: string; type: string }>;
          breakdown?: any;
          currency: string;
          markupMultiplier?: number;
          metadata?: any;
          modelId?: string;
          providerId: string;
          toolId?: string;
          type: "ai" | "tool";
          usage: any;
          userAmount: number;
        } | null,
        Name
      >;
      getCostsByAttribute: FunctionReference<
        "query",
        "internal",
        {
          attributeId: string;
          attributeType: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            _creationTime: number;
            _id: string;
            amount: number;
            attributions: Array<{ id: string; type: string }>;
            breakdown?: any;
            currency: string;
            markupMultiplier?: number;
            metadata?: any;
            modelId?: string;
            providerId: string;
            toolId?: string;
            type: "ai" | "tool";
            usage: any;
            userAmount: number;
          }>;
        },
        Name
      >;
      getTotalByAttribute: FunctionReference<
        "query",
        "internal",
        { attributeId: string; attributeType: string },
        {
          count: number;
          currency: string;
          totalAmount: number;
          totalUserAmount: number;
        },
        Name
      >;
      listCostsByAttribute: FunctionReference<
        "query",
        "internal",
        { attributeId: string; attributeType: string; limit?: number },
        Array<{
          _creationTime: number;
          _id: string;
          amount: number;
          attributions: Array<{ id: string; type: string }>;
          breakdown?: any;
          currency: string;
          markupMultiplier?: number;
          metadata?: any;
          modelId?: string;
          providerId: string;
          toolId?: string;
          type: "ai" | "tool";
          usage: any;
          userAmount: number;
        }>,
        Name
      >;
    };
    markup: {
      deleteMarkup: FunctionReference<
        "mutation",
        "internal",
        {
          modelId?: string;
          providerId: string;
          scope: "provider" | "model" | "tool";
          toolId?: string;
        },
        any,
        Name
      >;
      getMarkupMultiplier: FunctionReference<
        "query",
        "internal",
        { modelId?: string; providerId: string; toolId?: string },
        number,
        Name
      >;
      getMarkupMultiplierById: FunctionReference<
        "query",
        "internal",
        { id: string },
        any,
        Name
      >;
      getMarkupMultipliers: FunctionReference<
        "query",
        "internal",
        {},
        any,
        Name
      >;
      upsertModelMarkup: FunctionReference<
        "mutation",
        "internal",
        { markupMultiplier: number; modelId: string; providerId: string },
        any,
        Name
      >;
      upsertProviderMarkup: FunctionReference<
        "mutation",
        "internal",
        { markupMultiplier: number; providerId: string },
        any,
        Name
      >;
      upsertToolMarkup: FunctionReference<
        "mutation",
        "internal",
        { markupMultiplier: number; providerId: string; toolId: string },
        any,
        Name
      >;
    };
    pricing: {
      getAllPricing: FunctionReference<"query", "internal", {}, any, Name>;
      getAllToolPricing: FunctionReference<"query", "internal", {}, any, Name>;
      getPricing: FunctionReference<
        "query",
        "internal",
        { modelId: string; providerId: string },
        {
          _creationTime: number;
          _id: string;
          lastUpdated: number;
          limits: { context: number; output: number };
          modelId: string;
          modelName: string;
          pricing: {
            cache_read?: number;
            cache_write?: number;
            input: number;
            output: number;
            reasoning?: number;
          };
          providerId: string;
          providerName: string;
        } | null,
        Name
      >;
      getPricingByProvider: FunctionReference<
        "query",
        "internal",
        { providerId: string },
        any,
        Name
      >;
      getToolPricing: FunctionReference<
        "query",
        "internal",
        { providerId: string; toolId: string },
        any,
        Name
      >;
      getToolPricingByProvider: FunctionReference<
        "query",
        "internal",
        { providerId: string },
        any,
        Name
      >;
      searchPricingByModelName: FunctionReference<
        "query",
        "internal",
        { modelName: string },
        any,
        Name
      >;
      updatePricingData: FunctionReference<
        "action",
        "internal",
        { apiKey?: string; apiUrl?: string },
        any,
        Name
      >;
    };
  };
