import { NextResponse } from "next/server";

/**
 * Where this deployment lives, for the absolute links that go out in mail and
 * WhatsApp. Four files used to carry their own copy of this fallback, so
 * moving the deployment meant finding all four — and the one that was missed
 * kept sending people to the old host.
 */
export const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://laurus-web-theta.vercel.app";

/**
 * A download route answers a browser, not a fetch(): when it cannot serve the
 * file it says why in a page the reader can act on, rather than a JSON body
 * the browser renders as text.
 */
export function errorPage(status: number, title: string, body: string): NextResponse {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<div style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#141a2b">
<h1 style="color:#003399;font-size:1.25rem">${title}</h1><p>${body}</p>
<p><a href="javascript:history.back()" style="color:#5d667a">← Go back</a></p></div>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
