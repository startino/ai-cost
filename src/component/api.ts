import {
  addAICost,
  addToolCost,
  addPreCalculatedCost,
  getCostsByAttribute,
  listCostsByAttribute,
  listCostsByMultipleAttributes,
  getTotalByAttribute,
  getCostEvent,
  getDistinctAttributeValues,
  deleteCostEvent,
  deleteCostsByAttribute,
} from "./costs.js";

import {
  getPricing,
  getAllPricing,
  getPricingByProvider,
  searchPricingByModelName,
  getToolPricing,
  getAllToolPricing,
  getToolPricingByProvider,
  upsertToolPricing,
  deleteToolPricing,
  updatePricingData,
  updatePricingTable,
} from "./pricing.js";

import {
  getMarkupMultipliers,
  getMarkupMultiplier,
  getMarkupMultiplierById,
  upsertProviderMarkup,
  upsertModelMarkup,
  upsertToolMarkup,
  deleteMarkup,
} from "./markup.js";

export const createCostsApi = () => ({
  addAICost,
  addToolCost,
  addPreCalculatedCost,
  getCostsByAttribute,
  listCostsByAttribute,
  listCostsByMultipleAttributes,
  getTotalByAttribute,
  getCostEvent,
  getDistinctAttributeValues,
  deleteCostEvent,
  deleteCostsByAttribute,
});

export const createPricingApi = () => ({
  getPricing,
  getAllPricing,
  getPricingByProvider,
  searchPricingByModelName,
  getToolPricing,
  getAllToolPricing,
  getToolPricingByProvider,
  upsertToolPricing,
  deleteToolPricing,
  updatePricingData,
  updatePricingTable,
});

export const createMarkupApi = () => ({
  getMarkupMultipliers,
  getMarkupMultiplier,
  getMarkupMultiplierById,
  upsertProviderMarkup,
  upsertModelMarkup,
  upsertToolMarkup,
  deleteMarkup,
});
