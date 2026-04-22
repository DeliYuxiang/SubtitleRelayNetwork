/**
 * Unified public-key authentication for SRN with Nonce-based PoW.
 *
 * Authentication flow
 * ───────────────────
 * 1. Client calls GET /v1/challenge.
 *    Server returns { salt, k, vip }.
 *      • VIP (in SRN_PUBKEY_WHITELIST) → k = 0
 *      • Non-VIP → k = SRN_POW_DIFFICULTY + dynamic_increment(IP, PubKey)
 *      • salt = hmac(SRN_POW_SECRET, IP + minute)
 *
 * 2. Client finds a nonce such that:
 *    hex(sha256(salt + pubKey + nonce)).startsWith("0".repeat(k))
 *
 * 3. Client sends request with headers:
 *    X-SRN-PubKey: <hex_pubkey>
 *    X-SRN-Nonce: <nonce_string>
 *    X-SRN-Signature: <signature_of_message>
 */

import type { Context } from "hono";
import type { Bindings } from "../types";
import { hexToBytes, verifySignature, verifyPoW } from "@srn/client";

export { hexToBytes };

/** Generate a stateless salt tied to IP and time. */
export async function getPoWSalt(
  env: Bindings,
  ip: string,
  minute: number,
): Promise<string> {
  const secret = env.SRN_POW_SECRET ?? "default_srn_secret";
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(`${ip}:${minute}`);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export { verifyPoW };

/** VIP check using simple PubKey whitelist. */
export function isVip(pubKeyHex: string, whitelist: string): boolean {
  if (!whitelist) return false;
  const lower = pubKeyHex.toLowerCase();
  return whitelist.split(",").some((k) => k.trim().toLowerCase() === lower);
}

type Challenge = { salt: string; k: number };
type VerifyOk = { ok: true; pubKeyHex: string };
type VerifyFail = {
  ok: false;
  status: 401 | 403;
  error: string;
  challenge: Challenge;
};

/**
 * Compute dynamic difficulty by reading current-minute counters from D1.
 * Only queries DB when baseK > 0 to avoid unnecessary reads on open relays.
 */
async function getDynamicK(
  c: Context<{ Bindings: Bindings }>,
  ip: string,
  pubKeyHex: string,
  minute: number,
  baseK: number,
): Promise<number> {
  if (baseK === 0) return 0;
  const [ipRow, pkRow] = await Promise.all([
    c.env.DB.prepare(
      "SELECT count FROM challenge_counts WHERE counter_key = ? AND minute = ?",
    )
      .bind(`ip:${ip}`, minute)
      .first<{ count: number }>(),
    c.env.DB.prepare(
      "SELECT count FROM challenge_counts WHERE counter_key = ? AND minute = ?",
    )
      .bind(`pk:${pubKeyHex}`, minute)
      .first<{ count: number }>(),
  ]);
  const increment = Math.min(
    Math.floor(Math.max(ipRow?.count ?? 0, pkRow?.count ?? 0) / 5),
    4,
  );
  return baseK + increment;
}

export async function verifySignedRequest(
  c: Context<{ Bindings: Bindings }>,
  canonicalMsg: string,
): Promise<VerifyOk | VerifyFail> {
  const pubKeyHex = c.req.header("X-SRN-PubKey");
  const signatureHex = c.req.header("X-SRN-Signature");
  const nonce = c.req.header("X-SRN-Nonce") ?? "";
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const minute = Math.floor(Date.now() / 60000);
  const baseK = parseInt(c.env.SRN_POW_DIFFICULTY ?? "0", 10) || 0;

  if (!pubKeyHex || !signatureHex) {
    const salt = await getPoWSalt(c.env, ip, minute);
    return {
      ok: false,
      status: 401,
      error: "Missing auth headers",
      challenge: { salt, k: baseK },
    };
  }

  // Compute salt for current and previous minute (±1 min tolerance)
  const [salt, saltPrev, k] = await Promise.all([
    getPoWSalt(c.env, ip, minute),
    getPoWSalt(c.env, ip, minute - 1),
    getDynamicK(c, ip, pubKeyHex, minute, baseK),
  ]);
  const challenge: Challenge = { salt, k };

  // 1. VIP bypass
  if (!isVip(pubKeyHex, c.env.SRN_PUBKEY_WHITELIST ?? "")) {
    // 2. PoW Check
    const powOk =
      (await verifyPoW(pubKeyHex, nonce, k, salt)) ||
      (await verifyPoW(pubKeyHex, nonce, k, saltPrev));

    if (!powOk) {
      return {
        ok: false,
        status: 403,
        error: "PoW verification failed",
        challenge,
      };
    }
  }

  // 3. Signature Check
  return (await verifySignature(pubKeyHex, signatureHex, canonicalMsg))
    ? { ok: true, pubKeyHex }
    : {
        ok: false,
        status: 401,
        error: "Signature verification failed",
        challenge,
      };
}

/** Stricter verify for downloads. */
export async function verifyDownloadRequest(
  c: Context<{ Bindings: Bindings }>,
): Promise<VerifyOk | VerifyFail> {
  // Reuse same logic but can add extra constraints if needed
  const minute = Math.floor(Date.now() / 60000);
  return verifySignedRequest(c, String(minute));
}
