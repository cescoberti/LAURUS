/**
 * Open "Order and lists of votes" in a real (headless) browser and hand the
 * page and the session cookies to the live sync.
 *
 * From datacenter addresses (GitHub runners) the EP's www host fronts the
 * page with an AWS WAF JavaScript challenge: an HTTP 202 with a script that
 * computes a token, sets the `aws-waf-token` cookie and reloads. No plain
 * HTTP client gets past it; Chromium does. So in CI this runs first, writes
 *   $EP_VOTES_PAGE_FILE   the rendered HTML
 *   $EP_WWW_COOKIE_FILE   the Cookie header value for later DOCX downloads
 * and syncLive reads them instead of fetching the page itself. Locally (a
 * residential address) the plain fetch works and this step is not needed.
 *
 *   node --experimental-strip-types src/votesPageBrowser.ts out/votes.html out/cookie.txt
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { VOTES_PAGE_URL, BROWSER_HEADERS } from "./votesPage.ts";

const [htmlOut, cookieOut] = process.argv.slice(2);
if (!htmlOut || !cookieOut) {
  console.error("usage: votesPageBrowser.ts <html-out> <cookie-out>");
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    userAgent: BROWSER_HEADERS["User-Agent"],
    locale: "en-GB",
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(VOTES_PAGE_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  // The challenge page reloads itself once the token is set; the real page
  // has the per-file notice blocks.
  await page.waitForSelector("div.notice", { timeout: 90_000 });
  const html = await page.content();
  const cookies = await context.cookies("https://www.europarl.europa.eu/");
  const cookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

  for (const f of [htmlOut, cookieOut]) mkdirSync(dirname(f), { recursive: true });
  writeFileSync(htmlOut, html);
  writeFileSync(cookieOut, cookie);
  console.log(`votes page: ${html.length} B, ${cookies.length} cookie(s)${cookies.some((c) => c.name === "aws-waf-token") ? " incl. aws-waf-token" : ""}`);
} finally {
  await browser.close();
}
