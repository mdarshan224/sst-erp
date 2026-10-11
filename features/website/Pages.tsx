import {
  CampusStory,
  BenefitsSection,
  DaySection,
  ExploreSolutions,
  IntegrationSection,
  FAQSection,
} from "./RichSections";
import { solutions } from "./details";
import Link from "./PublicLink";
import {
  ArrowUpRight,
  Check,
  Layers3,
  ShieldCheck,
  SlidersHorizontal,
  Globe2,
} from "lucide-react";
import { modules } from "./content";
import { WebsiteConfig, policyNames } from "@/lib/website";
import { Shell, Intro, CTA } from "./Shell";
import { CampusSculpture, Messages, ContactForm } from "./interactive";
import s from "./website.module.css";
export function Home({ config }: { config: WebsiteConfig }) {
  return (
    <Shell config={config}>
      <section className={s.hero}>
        <div className={s.heroCopy}>
          <span className={s.eyebrow}>
            <i /> THE OPERATING SYSTEM FOR YOUR INSTITUTION
          </span>
          <h1>{config.headline}</h1>
          <p>{config.description}</p>
          <div className={s.actions}>
            <Link className={s.button} href="/contact">
              Build a better school day <ArrowUpRight size={18} />
            </Link>
            <Link className={s.textLink} href="/features">
              Explore the platform <span>↗</span>
            </Link>
          </div>
          <div className={s.heroFoot}>
            <span>
              <Check size={14} /> Your institution. Your brand.
            </span>
            <span>
              <Check size={14} /> Configured around you.
            </span>
          </div>
        </div>
        <CampusSculpture />
      </section>
      <section className={s.strip}>
        <span>
          BUILT AROUND
          <br />
          <b>THE WAY YOU TEACH.</b>
        </span>
        <p>Schools</p>
        <p>PU & degree colleges</p>
        <p>Academies</p>
        <p>Coaching centres</p>
      </section>
      <CampusStory />
      <section className={s.section}>
        <div className={s.sectionHead}>
          <div>
            <span className={s.eyebrow}>LESS FRICTION. MORE FLOW.</span>
            <h2>
              One campus.
              <br />
              <em>One connected picture.</em>
            </h2>
          </div>
          <p>
            When your office, accounts team and classrooms share a clear
            picture, the whole institution moves forward.
          </p>
        </div>
        <div className={s.editorialGrid}>
          <article className={s.featureDark}>
            <span>01 / FINANCE</span>
            <h3>
              Every rupee.
              <br />
              Every receipt.
              <br />
              <em>In its place.</em>
            </h3>
            <div className={s.receiptArt}>
              <div>
                <b>FEE WORKFLOW</b>
                <span>From due to done</span>
              </div>
              {[
                "Fee structure & instalments",
                "Verified collection",
                "Immutable ledger",
                "Digital receipt",
              ].map((x, i) => (
                <p key={x}>
                  <span>0{i + 1}</span>
                  {x}
                  <Check size={14} />
                </p>
              ))}
            </div>
            <Link href="/features#finance">
              Explore fee management <ArrowUpRight size={18} />
            </Link>
          </article>
          <article className={s.featureLight}>
            <span>02 / ACADEMICS</span>
            <h3>
              A little structure.
              <br />
              <em>A world of potential.</em>
            </h3>
            <div className={s.calendarArt}>
              {["M", "T", "W", "T", "F"].map((x, i) => (
                <div key={i}>
                  <b>{x}</b>
                  <span />
                  <span />
                  <span />
                </div>
              ))}
            </div>
            <p>
              Timetables, attendance, assessments and student records. Connected
              from day one.
            </p>
            <Link href="/features#academics">
              Discover academic operations <ArrowUpRight size={18} />
            </Link>
          </article>
        </div>
      </section>
      <BenefitsSection />
      <section className={s.softSection}>
        <div className={s.sectionHead}>
          <div>
            <span className={s.eyebrow}>
              A PLACE FOR EVERY PART OF YOUR DAY
            </span>
            <h2>Thoughtfully complete.</h2>
          </div>
          <Link className={s.textLink} href="/features">
            All capabilities ↗
          </Link>
        </div>
        <ModuleGrid compact />
      </section>
      <section className={s.section}>
        <Messages />
        <div className={s.actions}>
          <Link className={s.textLink} href="/communication">
            Explore communication & custom workflows ↗
          </Link>
        </div>
      </section>
      <DaySection />
      <section className={s.darkBand}>
        <span className={s.eyebrow}>FLEXIBLE BY DESIGN</span>
        <h2>
          Fits your institution.
          <br />
          <em>Feels like your own.</em>
        </h2>
        <div className={s.controlGrid}>
          {[
            [
              Globe2,
              "Your identity",
              "Logo, colours and verified custom domains.",
            ],
            [
              SlidersHorizontal,
              "Your workflows",
              "Academic structure, fee rules and enabled modules.",
            ],
            [
              ShieldCheck,
              "Your boundaries",
              "Institution isolation, permissions and audit history.",
            ],
          ].map(([Icon, title, text]) => {
            const I = Icon as typeof Globe2;
            return (
              <article key={String(title)}>
                <I />
                <h3>{String(title)}</h3>
                <p>{String(text)}</p>
              </article>
            );
          })}
        </div>
      </section>
      <section className={s.section}>
        <div className={s.sectionHead}>
          <div>
            <span className={s.eyebrow}>A CONSIDERED START</span>
            <h2>
              From your first question
              <br />
              to your everyday rhythm.
            </h2>
          </div>
        </div>
        <div className={s.steps}>
          {[
            [
              "Discover",
              "Tell us about your institution, teams and priorities.",
            ],
            [
              "Configure",
              "Agree on modules, pricing, integrations and the implementation scope.",
            ],
            [
              "Get moving",
              "Validate your imports, onboard your team and begin with confidence.",
            ],
          ].map(([title, text], i) => (
            <article key={title}>
              <span>0{i + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <ExploreSolutions />
      <IntegrationSection />
      <FAQSection />
      <CTA />
    </Shell>
  );
}
export function ModuleGrid({ compact = false }: { compact?: boolean }) {
  return (
    <div className={s.moduleGrid}>
      {modules.map((m, i) => (
        <article
          key={m.name}
          id={i === 0 ? "finance" : i === 3 ? "academics" : undefined}
        >
          <m.icon size={25} />
          <span className={s.moduleNumber}>0{i + 1}</span>
          <h3>{m.name}</h3>
          <p>{m.description}</p>
          {!compact && <small>{m.detail}</small>}
          <Link
            className={s.moduleMore}
            href={
              i === 4
                ? "/communication"
                : "/solutions/" + solutions[[0, 1, 2, 3, 0, 4, 5, 6][i]].slug
            }
          >
            Explore module ↗
          </Link>
        </article>
      ))}
    </div>
  );
}
export function Features({ config }: { config: WebsiteConfig }) {
  return (
    <Shell config={config}>
      <Intro
        eyebrow="THE CONNECTED EDUCATION PLATFORM"
        title="Every team. Every task. A shared rhythm."
        text="Purposeful tools for the people who make an institution work. Explore what connects your admissions desk, classroom and accounts office."
      />
      <section className={s.section}>
        <ModuleGrid />
        <div className={s.notice}>
          <Layers3 />
          <p>
            Modules and usage limits depend on your agreed plan. Provider
            integrations, custom domains and tailored workflows require
            configuration and verification.
          </p>
        </div>
      </section>
      <section className={s.darkBand}>
        <h2>
          Financial detail.
          <br />
          <em>Without the daily friction.</em>
        </h2>
        <div className={s.controlGrid}>
          {[
            [
              "Plan with precision",
              "Academic-year, class and student fee assignments; instalments, due dates, concessions, scholarships and late fees.",
            ],
            [
              "Collect with clarity",
              "Student search, pending dues, partial payments, payment history, receipt PDFs and refund records.",
            ],
            [
              "Close with confidence",
              "Daily collection reports, defaulter lists, payment reconciliation and immutable ledger history.",
            ],
          ].map(([a, b]) => (
            <article key={a}>
              <h3>{a}</h3>
              <p>{b}</p>
            </article>
          ))}
        </div>
      </section>
      <ExploreSolutions />
      <CTA />
    </Shell>
  );
}
export function Communication({ config }: { config: WebsiteConfig }) {
  return (
    <Shell config={config}>
      <Intro
        eyebrow="COMMUNICATION THAT CONNECTS"
        title="Keep everyone in the know."
        text="Custom SMS, WhatsApp and email communication that carries your institution’s voice. From fee reminders and receipts to tailored attendance messages."
      />
      <section className={s.section}>
        <Messages />
        <div className={s.steps}>
          {[
            [
              "Connect",
              "Use supported SMS, WhatsApp and email providers configured for your institution.",
            ],
            [
              "Personalise",
              "Agree on templates, message fields, audiences and consent requirements.",
            ],
            [
              "Follow through",
              "Review delivery history and provider responses. Custom triggers are tested before activation.",
            ],
          ].map(([a, b]) => (
            <article key={a}>
              <h3>{a}</h3>
              <p>{b}</p>
            </article>
          ))}
        </div>
        <div className={s.notice}>
          <ShieldCheck />
          <p>
            Messaging is not included automatically. Delivery depends on
            provider availability, account balance, consent and required
            template approvals. Absence alerts and other custom automations
            require an agreed implementation.
          </p>
        </div>
      </section>
      <CTA />
    </Shell>
  );
}
export function Pricing({ config }: { config: WebsiteConfig }) {
  return (
    <Shell config={config}>
      <Intro
        eyebrow="PLANS & CUSTOMISATION"
        title="Your institution is unique. Your setup should be, too."
        text={config.pricingNote}
      />
      <section className={s.section}>
        <div className={s.pricing}>
          <div>
            <span className={s.eyebrow}>BUILT AROUND YOUR NEEDS</span>
            <h2>
              One considered proposal.
              <br />
              No guesswork.
            </h2>
            <p>
              Tell us your student count, campuses and priorities. We’ll help
              define the right scope.
            </p>
            <Link href="/contact" className={s.button}>
              Request your proposal <ArrowUpRight size={18} />
            </Link>
          </div>
          <ul>
            {[
              "Academic structure & student volume",
              "Enabled modules & team permissions",
              "Data imports & onboarding",
              "Payment & messaging integrations",
              "Branding & custom domains",
              "Support & implementation scope",
            ].map((x) => (
              <li key={x}>
                <Check size={17} />
                {x}
              </li>
            ))}
          </ul>
        </div>
        <div className={s.steps}>
          {[
            [
              "Clear before payment",
              "Your order specifies currency, taxes, subscription duration, limits and any one-time implementation costs.",
            ],
            [
              "Separate provider costs",
              "Gateway transaction charges, messaging credits and other provider fees are disclosed or billed by the relevant provider.",
            ],
            [
              "No surprise renewal",
              "Subscription renewal is manual unless a separate recurring arrangement is explicitly agreed and authorised.",
            ],
          ].map(([a, b]) => (
            <article key={a}>
              <h3>{a}</h3>
              <p>{b}</p>
            </article>
          ))}
        </div>
        <p className={s.small}>
          Review our <Link href="/policies/terms">terms</Link>,{" "}
          <Link href="/policies/refunds">cancellation & refund policy</Link> and{" "}
          <Link href="/policies/delivery">digital delivery policy</Link> before
          purchase.
        </p>
      </section>
    </Shell>
  );
}
export function Contact({ config }: { config: WebsiteConfig }) {
  return (
    <Shell config={config}>
      <Intro
        eyebrow="LET’S TALK"
        title="A better everyday starts with a conversation."
        text="Tell us about your institution, ask about a module or get help with an existing order. Your request goes directly to our administration team."
      />
      <section className={s.contactLayout}>
        <aside>
          <span className={s.eyebrow}>CONTACT & BUSINESS DETAILS</span>
          <h2>{config.legalName}</h2>
          {config.email && (
            <p>
              <b>Email</b>
              <a href={"mailto:" + config.email}>{config.email}</a>
            </p>
          )}
          {config.phone && (
            <p>
              <b>Phone</b>
              <a href={"tel:" + config.phone}>{config.phone}</a>
            </p>
          )}
          {config.address && (
            <p>
              <b>Registered / business address</b>
              {config.address}
            </p>
          )}
          {config.hours && (
            <p>
              <b>Support hours</b>
              {config.hours}
            </p>
          )}
          <p>
            Use the form for demos, customisation, support, payment queries or
            privacy requests.
          </p>
          <div className={s.notice}>
            Student fee enquiries should go to the collecting institution’s
            accounts office.
          </div>
        </aside>
        <ContactForm />
      </section>
    </Shell>
  );
}
export function About({ config }: { config: WebsiteConfig }) {
  return (
    <Shell config={config}>
      <Intro
        eyebrow="ABOUT SOHAN ERP"
        title="Built for the work behind a great education."
        text="A dedicated education ERP from SohanSoft Technologies Private Limited. Designed to connect the everyday work of schools, colleges, academies and coaching institutions."
      />
      <section className={s.about}>
        <span className={s.bigMark}>S.</span>
        <div>
          <h2>
            More clarity.
            <br />
            Less administration.
          </h2>
          <p>
            Our focus is practical: help institutions organise their people,
            academic operations, fee collection and communication in one
            coherent system.
          </p>
          <p>
            Every institution has its own structure. Configurable modules,
            branding and permissions let the software reflect how your team
            works, while preserving clear data boundaries and financial history.
          </p>
          <Link href="/features" className={s.textLink}>
            Get to know the platform ↗
          </Link>
        </div>
      </section>
      <CTA />
    </Shell>
  );
}
export function Policy({
  config,
  slug,
}: {
  config: WebsiteConfig;
  slug: keyof typeof policyNames;
}) {
  return (
    <Shell config={config}>
      <Intro
        eyebrow="CLEAR POLICIES. INFORMED CHOICES."
        title={policyNames[slug]}
        text={"For the ERP services supplied by " + config.legalName + "."}
      />
      <article className={s.policy}>
        {config.policies[slug].split(/\n\s*\n/).map((section, i) => {
          const [heading, ...lines] = section.split("\n");
          return (
            <section key={i}>
              <h2>{heading}</h2>
              <p>{lines.join("\n")}</p>
            </section>
          );
        })}
        <hr />
        <p>
          Questions about this policy?{" "}
          <Link href="/contact">Contact our team</Link>. Your accepted order and
          applicable law govern specific commercial commitments.
        </p>
      </article>
    </Shell>
  );
}
