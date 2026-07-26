/**
 * Byte fetcher for EP hosts, based on node:https. SERVER ONLY.
 *
 * Node's global fetch (undici) is rejected with HTTP 500 by the EP WAF at the
 * TLS level — the same URL and headers succeed via node:https, so the WAF
 * fingerprints the client. Mirrors packages/ingest/src/httpFetch.ts; kept as a
 * local copy so the web app doesn't take a workspace dependency on the ingest
 * package (which is CLI-shaped and pulls in the Supabase admin client).
 */
import https from "node:https";

const UA = process.env.EP_USER_AGENT ?? "LAURUS/0.1 (+mailto:francesco.berti.liv@gmail.com)";

export interface FetchBytesResult {
  status: number;
  body: Buffer;
}

/** GET a URL, following up to `maxRedirects` redirects, returning raw bytes. */
export function fetchBytes(url: string, maxRedirects = 5): Promise<FetchBytesResult> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": UA } }, (res) => {
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      if (status >= 300 && status < 400 && location && maxRedirects > 0) {
        res.resume();
        resolve(fetchBytes(new URL(location, url).href, maxRedirects - 1));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(30_000, () => req.destroy(new Error(`timeout fetching ${url}`)));
  });
}

/**
 * Fetch with backoff on the EP rate limiter (429, sometimes 403) and transient
 * network errors. Returns null when the resource genuinely isn't published.
 */
export async function fetchBytesWithBackoff(url: string, attempts = 4): Promise<Buffer | null> {
  let delay = 4_000;
  for (let i = 0; i < attempts; i++) {
    let status: number, body: Buffer;
    try {
      ({ status, body } = await fetchBytes(url));
    } catch {
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 30_000);
      continue;
    }
    if (status === 429 || status === 403) {
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 30_000);
      continue;
    }
    if (status !== 200) return null;
    return body;
  }
  throw new Error(`EP host still throttling: ${url}`);
}
