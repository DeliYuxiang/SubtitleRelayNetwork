import { createMiddleware } from "hono/factory";
import type { Bindings } from "../types";

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
}

async function md5Hex(data: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("MD5", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Signs all responses with the relay's Ed25519 private key.
 *
 * Signed message = UTF-8(`${md5_of_body}:${unix_timestamp}`)
 *
 * Added response headers:
 *   X-SRN-Relay-Sig       — Ed25519 signature (hex)
 *   X-SRN-Relay-PubKey    — Relay public key (hex)
 *   X-SRN-Relay-Timestamp — Unix timestamp used in the signed message
 *
 * If RELAY_PRIVATE_KEY is not configured the middleware is a no-op.
 */
export const relaySignMiddleware = createMiddleware<{ Bindings: Bindings }>(
  async (c, next) => {
    await next();

    const privKeyHex = c.env.RELAY_PRIVATE_KEY;
    if (!privKeyHex) return;

    // Buffer the full response body (max 5 MB per design).
    const body = await c.res.clone().arrayBuffer();
    const md5 = await md5Hex(body);
    const timestamp = Math.floor(Date.now() / 1000).toString();

    // Signed message binds content integrity + timestamp (replay protection).
    const message = new TextEncoder().encode(`${md5}:${timestamp}`);

    // Go ed25519.PrivateKey = 64 bytes (seed || pubkey).
    // WebCrypto NODE-ED25519 importKey("raw") expects the 32-byte seed only.
    const privBytes = hexToBytes(privKeyHex);
    const seed = privBytes.length === 64 ? privBytes.slice(0, 32) : privBytes;

    const privateKey = await crypto.subtle.importKey(
      "raw",
      seed,
      { name: "NODE-ED25519", namedCurve: "NODE-ED25519" },
      false,
      ["sign"],
    );

    const sigBytes = await crypto.subtle.sign(
      "NODE-ED25519",
      privateKey,
      message,
    );
    const sigHex = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const headers = new Headers(c.res.headers);
    headers.set("X-SRN-Relay-Sig", sigHex);
    headers.set("X-SRN-Relay-PubKey", c.env.RELAY_PUBLIC_KEY || "");
    headers.set("X-SRN-Relay-Timestamp", timestamp);

    c.res = new Response(body, { status: c.res.status, headers });
  },
);
