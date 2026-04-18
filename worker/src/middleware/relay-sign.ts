import { createMiddleware } from "hono/factory";
import type { Bindings } from "../types";
import { hexToBytes } from "../lib/verify-pubkey";

async function md5Hex(data: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("MD5", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// WebCrypto requires PKCS8 DER for Ed25519 private key import — raw format is
// public-key-only. Wrap a 32-byte seed in the minimal OneAsymmetricKey envelope
// (RFC 8410): SEQUENCE { version=0, AlgorithmIdentifier(Ed25519), OCTET STRING { seed } }
function seedToPkcs8(seed: Uint8Array): Uint8Array {
  const header = new Uint8Array([
    0x30,
    0x2e, // SEQUENCE, 46 bytes total inner length
    0x02,
    0x01,
    0x00, // INTEGER 0 (version)
    0x30,
    0x05, // SEQUENCE, 5 bytes (AlgorithmIdentifier)
    0x06,
    0x03,
    0x2b,
    0x65,
    0x70, // OID 1.3.101.112 (Ed25519)
    0x04,
    0x22, // OCTET STRING, 34 bytes
    0x04,
    0x20, // OCTET STRING, 32 bytes (seed)
  ]);
  const pkcs8 = new Uint8Array(header.length + seed.length);
  pkcs8.set(header);
  pkcs8.set(seed, header.length);
  return pkcs8;
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

    // Accept 32-byte seed (Python cryptography) or 64-byte key (Go ed25519).
    const privBytes = hexToBytes(privKeyHex);
    const seed = privBytes.length === 64 ? privBytes.slice(0, 32) : privBytes;

    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      seedToPkcs8(seed),
      { name: "Ed25519" },
      false,
      ["sign"],
    );

    const sigBytes = await crypto.subtle.sign("Ed25519", privateKey, message);
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
