import { config } from "./config.js";

const tokenEndpoint = `https://${config.shopDomain}/admin/oauth/access_token`;

// In-memory cache — fine for a single-instance server. If you scale to
// multiple instances/dynos, move this to Redis or similar shared storage.
let cachedToken = null;
let expiresAt = 0; // epoch ms

async function fetchNewToken() {
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret
    }).toString()
  });

  const json = await response.json();

  if (!response.ok || !json.access_token) {
    throw new Error(
      `Shopify token exchange failed: ${JSON.stringify(json, null, 2)}`
    );
  }

  return json; // { access_token, scope, expires_in }
}

/**
 * Returns a valid Admin API access token, refreshing it if expired
 * or about to expire. Tokens are valid ~24h (expires_in ~86399s).
 */
export async function getAccessToken() {
  const now = Date.now();
  const bufferMs = 5 * 60 * 1000; // refresh 5 min early to avoid edge-of-expiry failures

  if (cachedToken && now < expiresAt - bufferMs) {
    return cachedToken;
  }

  const { access_token, expires_in } = await fetchNewToken();

  cachedToken = access_token;
  expiresAt = now + expires_in * 1000;

  return cachedToken;
}
