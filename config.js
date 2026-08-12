import "dotenv/config";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT || 3000),
  appBaseUrl: required("APP_BASE_URL").replace(/\/$/, ""),
  shopDomain: required("SHOPIFY_SHOP_DOMAIN"),
  adminToken: required("SHOPIFY_ADMIN_ACCESS_TOKEN"),
  apiVersion: process.env.SHOPIFY_API_VERSION || "2026-07",
  sharedSecret: required("SHOPIFY_APP_SHARED_SECRET"),
  psiAdminEmail: process.env.PSI_ADMIN_EMAIL || "admin@purseonalshopper.com",
  cproFactor: Number(process.env.CPRO_FACTOR || 0.8),
  buyoutFactor: Number(process.env.BUYOUT_FACTOR || 0.6),
  roundTo: Number(process.env.ROUND_TO || 25),
  minResaleValue: Number(process.env.MIN_RESALE_VALUE || 750),
  emailDelivery: process.env.EMAIL_DELIVERY || "log",
  resendApiKey: process.env.RESEND_API_KEY,
  fromEmail: process.env.FROM_EMAIL || "Purseonal Shopper Inc. <admin@purseonalshopper.com>",
  agreementUrls: {
    consignment: process.env.CONSIGNMENT_AGREEMENT_URL,
    buyout: process.env.BUYOUT_AGREEMENT_URL
  }
};
