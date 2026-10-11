"use client";
import Link from "./PublicLink";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Menu,
  ArrowUpRight,
  Check,
  Bell,
  ReceiptText,
  CalendarCheck,
  Layers3,
  ShieldCheck,
  GraduationCap,
} from "lucide-react";
import s from "./website.module.css";
export function Nav({ brand }: { brand: string }) {
  const path = usePathname();
  const links = (
    <>
      {[
        ["/features", "Platform"],
        ["/communication", "Communication"],
        ["/pricing", "Plans"],
        ["/about", "About"],
      ].map(([url, label]) => (
        <Link
          key={url}
          href={url}
          aria-current={path === url ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
      <Link href="/contact" className={s.navCta}>
        Let’s talk <ArrowUpRight size={16} />
      </Link>
    </>
  );
  return (
    <header className={s.header}>
      <Link href="/" className={s.brand}>
        <img src="/brand/sohan-logo.png" width="38" height="38" alt="" />
        {brand}
        <span>EDUCATION, CONNECTED.</span>
      </Link>
      <nav className={s.desktopNav} aria-label="Main navigation">
        {links}
      </nav>
      <details className={s.mobileMenu}>
        <summary aria-label="Toggle navigation">
          <Menu size={22} />
          <span>Menu</span>
        </summary>
        <nav aria-label="Mobile navigation">{links}</nav>
      </details>
    </header>
  );
}
export function CampusSculpture() {
  return (
    <div
      className={s.sculpture}
      role="img"
      aria-label="Three dimensional illustration of connected campus modules"
    >
      <div className={s.artGrid} />
      <div className={s.halo} />
      <div className={s.stack}>
        <div className={s.slab + " " + s.slabBottom}>
          <span>ONE SHARED FOUNDATION</span>
        </div>
        <div className={s.slab + " " + s.slabMiddle}>
          <div className={s.tile}>
            <GraduationCap />
            <span>Academics</span>
          </div>
          <div className={s.tile}>
            <CalendarCheck />
            <span>Attendance</span>
          </div>
          <div className={s.tile}>
            <ReceiptText />
            <span>Finance</span>
          </div>
          <div className={s.tile}>
            <Bell />
            <span>Connect</span>
          </div>
        </div>
        <div className={s.core}>
          <Layers3 size={50} />
          <b>SOHAN</b>
          <small>CONNECTED CAMPUS</small>
        </div>
      </div>
      <div className={s.artLabel + " " + s.labelOne}>
        <ReceiptText />
        <div>
          Every payment.<strong>A clear record.</strong>
        </div>
        <Check size={15} />
      </div>
      <div className={s.artLabel + " " + s.labelTwo}>
        <ShieldCheck />
        <div>
          Your campus.<strong>Your control.</strong>
        </div>
      </div>
      <span className={s.artCaption}>ONE PLATFORM. EVERYTHING IN SYNC.</span>
    </div>
  );
}
const messages = [
  {
    label: "Fee reminders",
    title: "A helpful nudge. Right on time.",
    message:
      "Dear parent, your child’s next fee instalment is due on the date shared by your institution. Please review the fee notice or contact the accounts office.",
    note: "Configured templates, selected academic year and outstanding balances.",
  },
  {
    label: "Digital receipts",
    title: "Paid. Recorded. Shared.",
    message:
      "Your payment has been recorded. Your institution can share the digital receipt with its reference, amount and payment date. Thank you.",
    note: "Receipt communication through the institution’s configured providers.",
  },
  {
    label: "Absence messages",
    title: "Keep parents in the loop.",
    message:
      "Dear parent, your child has been marked absent for today’s session. Please contact the class teacher if you need to update the attendance record.",
    note: "Example of a custom workflow. Absence-trigger automation requires setup and validation.",
  },
  {
    label: "School updates",
    title: "The whole campus, connected.",
    message:
      "A quick update from your institution: please review the upcoming timetable and holiday information shared by the administration team.",
    note: "Custom messaging scope, recipient consent and approved templates are agreed during setup.",
  },
];
export function Messages() {
  const [selected, setSelected] = useState(0),
    m = messages[selected];
  return (
    <div className={s.messageStudio}>
      <div>
        <span className={s.eyebrow}>SMALL MESSAGES. BIG DIFFERENCE.</span>
        <h2>{m.title}</h2>
        <div className={s.tabs} role="group" aria-label="Message examples">
          {messages.map((x, i) => (
            <button
              key={x.label}
              aria-pressed={selected === i}
              onClick={() => setSelected(i)}
            >
              {x.label}
              <span>↗</span>
            </button>
          ))}
        </div>
        <p>{m.note}</p>
      </div>
      <div className={s.phone}>
        <div className={s.phoneNotch} />
        <div className={s.phoneHead}>
          <div>S</div>
          <b>
            Your institution<small>SMS / WhatsApp example</small>
          </b>
        </div>
        <div className={s.bubble} aria-live="polite">
          <b>{m.label}</b>
          <p>{m.message}</p>
          <span>Illustrative message · no message sent</span>
        </div>
        <div className={s.phoneBottom}>
          <ShieldCheck size={14} /> Consent-aware communication
        </div>
      </div>
    </div>
  );
}
export function ContactForm() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reference, setReference] = useState(""),
    [id, setId] = useState("");
  return (
    <form
      className={s.contactForm}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const form = e.currentTarget;
        setBusy(true);
        setError("");
        const data = new FormData(form),
          requestId = id || crypto.randomUUID();
        setId(requestId);
        try {
          const response = await fetch("/api/website/enquiries", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...Object.fromEntries(data),
              id: requestId,
              consent: data.get("consent") === "on",
            }),
          });
          const result = (await response.json()) as {
            error?: { message?: string };
            message?: string;
            data?: { reference?: string };
          };
          if (!response.ok)
            throw new Error(
              result.error?.message ||
                result.message ||
                "Your request could not be saved. Please retry.",
            );
          setReference(result.data?.reference || requestId);
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to connect. Please retry.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      {reference ? (
        <div role="status" className={s.success}>
          <Check />
          <h2>Your request is in.</h2>
          <p>
            It has been saved for our team to review. Keep this reference for
            follow-up:
          </p>
          <code>{reference}</code>
          <button
            type="button"
            onClick={() => {
              setReference("");
              setId("");
            }}
          >
            Send another request
          </button>
        </div>
      ) : (
        <>
          <h2>Let’s start a conversation.</h2>
          <p>Demo, customisation or support — tell us what you need.</p>
          <div className={s.formGrid}>
            <label>
              Your name
              <input
                name="name"
                autoComplete="name"
                required
                minLength={2}
                maxLength={100}
              />
            </label>
            <label>
              Work email
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={180}
              />
            </label>
            <label>
              Institution / organisation
              <input
                name="institution"
                autoComplete="organization"
                required
                minLength={2}
                maxLength={160}
              />
            </label>
            <label>
              Phone (optional)
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                maxLength={30}
              />
            </label>
          </div>
          <label>
            How can we help?
            <select name="topic">
              {messages.length &&
                [
                  "Demo request",
                  "Customisation",
                  "Billing & refunds",
                  "Support",
                  "Privacy request",
                ].map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label>
            Your requirements
            <textarea
              name="message"
              rows={5}
              required
              minLength={10}
              maxLength={3000}
            />
          </label>
          <label className={s.trap} aria-hidden="true">
            Leave this empty
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
          <label className={s.consent}>
            <input type="checkbox" name="consent" required />
            <span>
              I agree to the{" "}
              <Link href="/policies/privacy">privacy policy</Link> and consent
              to being contacted about this request.
            </span>
          </label>
          <p className={s.small}>
            Please don’t include student records, passwords, payment credentials
            or OTPs.
          </p>
          {error && (
            <p role="alert" className={s.error}>
              {error}
            </p>
          )}
          <button className={s.button} disabled={busy}>
            {busy ? "Saving your request…" : "Send request"}{" "}
            <ArrowUpRight size={18} />
          </button>
        </>
      )}
    </form>
  );
}
