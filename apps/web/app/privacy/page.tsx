import Link from "next/link";
import { Wordmark } from "@/components/Logo";
import { CONTACT_EMAIL } from "@/lib/committees";

export const metadata = { title: "Privacy — LAURUS" };

const UPDATED = "24 November 2026";

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 text-lg font-bold text-ink-900">{children}</h2>;
}
function L({ children }: { children: React.ReactNode }) {
  return <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[0.9375rem] leading-relaxed text-ink-700">{children}</ul>;
}

/**
 * What LAURUS keeps about the people who use it, and who it passes it to.
 * Written from what the code and the database actually do: when a new kind of
 * personal data, or a new provider, is added to LAURUS, this page changes with it.
 */
export default function PrivacyPage() {
  return (
    <div className="min-h-screen px-6 py-14">
      <div className="mx-auto w-full max-w-2xl">
        <Link href="/login" aria-label="LAURUS">
          <Wordmark size={30} />
        </Link>

        <h1 className="display mt-10 text-display-md font-bold text-eu-900">Privacy</h1>
        <p className="mt-3 text-sm text-ink-400">Last updated {UPDATED}</p>
        <p className="lede mt-6">
          LAURUS is a private tool for people who follow the plenary sessions of the European Parliament. It is invite-only and it is not
          a service of the European Parliament or of any other institution. This page says what it keeps about you and why.
        </p>

        <H>Who is responsible</H>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-700">
          LAURUS is run by its administrator, who decides what is kept and why. For any question about your data, write to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-eu-700 hover:underline">
            {CONTACT_EMAIL}
          </a>
          .
        </p>

        <H>What LAURUS keeps about you</H>
        <L>
          <li>
            <b>Your account:</b> email address, name, role, political group, committees, the languages you work in and the language of your voting lists.
          </li>
          <li>
            <b>Your choices:</b> the files you follow, your notification settings and, only if you turn WhatsApp on, your WhatsApp number.
          </li>
          <li>
            <b>Your use:</b> a log of what you do in LAURUS (which voting lists you request or download, which files you open, when you sign in) and the history of your voting-list
            requests. It is used to run the service, to keep spending under control and to see that nothing is abused.
          </li>
          <li>
            <b>If you ask for access:</b> the name, email address and note you write in the request form, until an administrator has decided.
          </li>
          <li>
            <b>If you write to LAURUS by email:</b> the message, its attachments and the sender's name and address.
          </li>
        </L>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-700">
          Passwords are never stored in readable form. If you sign in with Google, LAURUS receives only your email address and name from Google, never your Google password.
        </p>

        <H>Who it is passed to</H>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-700">
          LAURUS does not sell personal data and does not use it for advertising. It uses these providers, each only for the job named:
        </p>
        <L>
          <li>
            <b>Supabase</b> — the database and the sign-in system, where all the data above is stored.
          </li>
          <li>
            <b>Vercel</b> — hosting of the website.
          </li>
          <li>
            <b>Resend</b> — sending and receiving the emails of LAURUS (invitations, voting lists, notices to administrators).
          </li>
          <li>
            <b>Twilio</b> — WhatsApp messages, only for members who turned them on.
          </li>
          <li>
            <b>Google</b> — the &ldquo;Continue with Google&rdquo; sign-in, only if you use it.
          </li>
          <li>
            <b>Anthropic</b> — an AI model reads the text of the public documents of the Parliament to prepare voting lists, and reads the emails that arrive at LAURUS&rsquo;s own
            addresses to propose a reply to the administrator. It never acts alone on people&rsquo;s data: an administrator approves what comes of it.
          </li>
        </L>

        <H>How long, and your rights</H>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-700">
          Your data is kept while you have an account. An administrator can delete an account; this removes the sign-in, the profile, the files you follow and your alert history. The usage log
          keeps its entries without your name attached. You can ask to see, correct or delete what LAURUS holds about you, or to object to how it is used, by writing to the address above.
        </p>

        <p className="mt-12 text-sm text-ink-400">
          <Link href="/login" className="font-semibold text-eu-700 hover:underline">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
