/**
 * Delivery email for a verified voting list: the .docx plus the verification
 * report, so the advisor can see exactly what was checked before voting off it.
 * The subject line states the outcome up front — a list with open issues must
 * never look like a clean one in the inbox.
 */
import { sendEmail } from "./email";
import type { VlVerificationReport, VlCheck } from "@/lib/vlVerify";

const BRAND = "#1f5138";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function checkRow(c: VlCheck): string {
  const mark = c.status === "ok" ? "✓" : c.status === "issue" ? "✗" : "—";
  const color = c.status === "ok" ? BRAND : c.status === "issue" ? "#b3261e" : "#8a6608";
  return `<tr>
    <td style="padding:6px 8px 6px 0;vertical-align:top;color:${color};font-weight:600;width:18px">${mark}</td>
    <td style="padding:6px 0;vertical-align:top">
      <div style="color:#1a2b22;font-size:14px">${esc(c.label)}
        <span style="color:#8a9a92;font-size:12px">· pass ${c.pass}</span></div>
      <div style="color:${c.status === "ok" ? "#6b7a72" : color};font-size:13px;margin-top:2px">${esc(c.detail)}</div>
    </td>
  </tr>`;
}

export function renderVlReportHtml(report: VlVerificationReport, opts: { attached: boolean }): string {
  const { counts } = report;
  const headline = report.verified
    ? `<div style="background:#e8f0ea;border-left:4px solid ${BRAND};padding:12px 16px;border-radius:0 6px 6px 0">
         <strong style="color:${BRAND}">Verified.</strong>
         <span style="color:#1a2b22">Both passes ran and every check passed.</span>
       </div>`
    : `<div style="background:#fdeeec;border-left:4px solid #b3261e;padding:12px 16px;border-radius:0 6px 6px 0">
         <strong style="color:#b3261e">Not verified.</strong>
         <span style="color:#1a2b22">Read the checks below before using this list${
           opts.attached ? " — the draft is attached, but it has not been confirmed clean" : ""
         }.</span>
       </div>`;

  const rcv = report.rollCalls.length
    ? `<h3 style="font-size:14px;color:#1a2b22;margin:22px 0 6px">Roll-call requests (deliberately not on the list)</h3>
       <ul style="margin:0;padding-left:18px;color:#6b7a72;font-size:13px">
         ${report.rollCalls.map((r) => `<li>${esc(r.targets)} — ${esc(r.group)}</li>`).join("")}
       </ul>
       <p style="color:#8a9a92;font-size:12px;margin:6px 0 0">
         Roll-call votes are already flagged on the voting list itself, so LAURUS does not add rows for them.
       </p>`
    : "";

  return `<!doctype html><meta charset="utf-8">
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:40rem;margin:0 auto;padding:24px;color:#1a2b22">
  <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:${BRAND};font-weight:600">LAURUS</div>
  <h1 style="font-size:20px;margin:6px 0 4px">Annotated voting list · ${esc(report.itemCode)}</h1>
  <p style="color:#6b7a72;font-size:13px;margin:0 0 16px">Language ${esc(report.language.toUpperCase())}</p>

  ${headline}

  <table style="width:100%;border-collapse:collapse;margin:20px 0 4px">
    <tr>
      ${[
        ["Rows", counts.rows],
        ["Amendments", counts.amendments],
        ["Splits", counts.splits],
        ["Separates", counts.separates],
      ]
        .map(
          ([label, n]) => `<td style="padding:0 8px 0 0">
            <div style="font-size:22px;font-weight:600;color:${BRAND}">${n}</div>
            <div style="font-size:12px;color:#6b7a72">${label}</div>
          </td>`,
        )
        .join("")}
    </tr>
  </table>

  <h3 style="font-size:14px;margin:22px 0 4px">Checks</h3>
  <table style="width:100%;border-collapse:collapse">${report.checks.map(checkRow).join("")}</table>

  ${rcv}

  <p style="color:#8a9a92;font-size:12px;margin:24px 0 0;border-top:1px solid #e4e9e6;padding-top:12px">
    Pass 1 checks the list against the data LAURUS holds. Pass 2 re-downloads the official VOT and the
    published amendment files and compares them, text by text, with the list. The Vote column is left
    empty by design — that call is yours.<br>
    Checks run on ${new Date(report.generatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
    — an identical list already checked against final sources is not re-checked.
  </p>
</div>`;
}

export async function sendVlEmail(opts: {
  to: string;
  report: VlVerificationReport;
  filename: string;
  docx: Buffer | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { report } = opts;
  const status = report.verified ? "verified" : "NOT verified";
  return sendEmail({
    to: opts.to,
    subject: `Voting list ${report.itemCode} (${report.language.toUpperCase()}) — ${status}`,
    html: renderVlReportHtml(report, { attached: !!opts.docx }),
    attachments: opts.docx ? [{ filename: opts.filename, content: opts.docx }] : undefined,
  });
}
