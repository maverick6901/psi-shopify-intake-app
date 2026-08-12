import crypto from "node:crypto";
import { config } from "./config.js";

export function verifyShopifyAppProxySignature(query) {
  const signature = query.signature;
  if (!signature || typeof signature !== "string") return false;

  const params = { ...query };
  delete params.signature;

  const message = Object.keys(params)
    .sort()
    .map((key) => {
      const value = Array.isArray(params[key]) ? params[key].join(",") : params[key];
      return `${key}=${value ?? ""}`;
    })
    .join("");

  const calculated = crypto
    .createHmac("sha256", config.sharedSecret)
    .update(message)
    .digest("hex");

  const received = Buffer.from(signature);
  const expected = Buffer.from(calculated);
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(received, expected);
}

export function newRequestId() {
  return `PSI-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;
}

export function makeAcceptanceToken(requestId, path) {
  const payload = `${requestId}:${path}`;
  const signature = crypto.createHmac("sha256", config.sharedSecret).update(payload).digest("hex");
  return Buffer.from(`${payload}:${signature}`).toString("base64url");
}

export function readAcceptanceToken(token) {
  const decoded = Buffer.from(token, "base64url").toString("utf8");
  const [requestId, path, signature] = decoded.split(":");
  if (!requestId || !path || !signature) return null;

  const expected = crypto
    .createHmac("sha256", config.sharedSecret)
    .update(`${requestId}:${path}`)
    .digest("hex");

  const received = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (received.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(received, expectedBuffer)) return null;
  return { requestId, path };
}
