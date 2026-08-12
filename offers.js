import { config } from "./config.js";

export function roundMoney(amount) {
  return Math.round(Number(amount) / config.roundTo) * config.roundTo;
}

export function calculateOffer(resaleLow, resaleHigh) {
  const low = Number(resaleLow);
  const high = Number(resaleHigh);

  if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || high <= 0 || high < low) {
    throw new Error("Enter a valid resale range before calculating an offer.");
  }

  const manualReview = low < config.minResaleValue;

  return {
    resaleLow: roundMoney(low),
    resaleHigh: roundMoney(high),
    cproLow: roundMoney(low * config.cproFactor),
    cproHigh: roundMoney(high * config.cproFactor),
    bpLow: roundMoney(low * config.buyoutFactor),
    bpHigh: roundMoney(high * config.buyoutFactor),
    manualReview
  };
}

export function moneyRange(low, high) {
  const currency = new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0
  });
  return `${currency.format(low)}-${currency.format(high)}`;
}
