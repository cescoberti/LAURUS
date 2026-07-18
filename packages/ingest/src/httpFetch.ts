/**
 * Byte fetcher for EP hosts based on node:https.
 *
 * Node's global fetch (undici) is rejected with HTTP 500 by the EP WAF at the
 * TLS level — same URL and headers succeed via curl and via node:https, so the
 * WAF fingerprints the client. Verified 2026-07-18 against
 * data.europarl.europa.eu (see [[laurus-project]] memory). Everything that
 * downloads document bytes must go through this helper, not fetch().
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
        res.resume(); // discard body, free the socket
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
