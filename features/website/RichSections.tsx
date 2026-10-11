import {
  Check,
  ArrowUpRight,
  ShieldCheck,
  Layers3,
  ReceiptText,
  CalendarDays,
  MessagesSquare,
  GraduationCap,
} from "lucide-react";
import Link from "./PublicLink";
import { benefits, faqs, solutions } from "./details";
import { Shell, Intro, CTA } from "./Shell";
import type { WebsiteConfig } from "@/lib/website";
import s from "./website.module.css";
export function CampusStory() {
  return (
    <section className={s.campusStory}>
      <figure>
        <img
          src="/images/connected-campus.webp"
          width={1536}
          height={1024}
          loading="lazy"
          decoding="async"
          alt="Conceptual gold-and-ivory campus illustration with classrooms, library and school transport"
        />
        <figcaption>Original conceptual campus illustration</figcaption>
      </figure>
      <div>
        <span className={s.eyebrow}>MORE THAN A COLLECTION OF MODULES</span>
        <h2>
          Your entire campus.
          <br />
          <em>Connected by design.</em>
        </h2>
        <p>
          The front office knows the student. Accounts knows the balance.
          Teachers know the class. Sohan ERP brings that context into connected
          workflows, with each team seeing what it is authorised to use.
        </p>
        <ul className={s.checkList}>
          <li>
            <Check /> Student records connected to academic placement
          </li>
          <li>
            <Check /> Fees connected to receipts and financial history
          </li>
          <li>
            <Check /> Timetables connected to attendance and holidays
          </li>
          <li>
            <Check /> Transport and hostel allocations connected to dues
          </li>
        </ul>
        <Link href="/benefits" className={s.textLink}>
          See the benefits for your team ↗
        </Link>
      </div>
    </section>
  );
}
export function BenefitsSection() {
  return (
    <section className={s.softSection}>
      <div className={s.sectionHead}>
        <div>
          <span className={s.eyebrow}>A BETTER EVERYDAY, FOR EVERY TEAM</span>
          <h2>
            Less chasing.
            <br />
            <em>More clarity.</em>
          </h2>
        </div>
        <p>
          Practical benefits built around the people doing the work—not just a
          longer list of software features.
        </p>
      </div>
      <div className={s.benefitGrid}>
        {benefits.map(([role, title, text], i) => (
          <article key={role}>
            <span>
              0{i + 1} / {role}
            </span>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
export function ExploreSolutions() {
  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <div>
          <span className={s.eyebrow}>GO A LITTLE DEEPER</span>
          <h2>
            Know what your ERP
            <br />
            can do for you.
          </h2>
        </div>
        <p>
          Explore the details, the day-to-day workflow and the setup
          requirements of each part of the platform.
        </p>
      </div>
      <div className={s.solutionLinks}>
        {solutions.map((x, i) => (
          <Link key={x.slug} href={"/solutions/" + x.slug}>
            <span>0{i + 1}</span>
            <div>
              <h3>{x.title}</h3>
              <p>{x.benefit}</p>
            </div>
            <ArrowUpRight size={20} />
          </Link>
        ))}
      </div>
    </section>
  );
}
export function DaySection() {
  const steps = [
    [
      GraduationCap,
      "01 / PREPARE",
      "Start with the right context",
      "Review the timetable, current academic year, student placement and any holiday exceptions.",
    ],
    [
      CalendarDays,
      "02 / RECORD",
      "Keep the day up to date",
      "Record attendance, review teaching assignments and manage assessment work.",
    ],
    [
      ReceiptText,
      "03 / COLLECT",
      "Bring clarity to the accounts desk",
      "Find pending dues, record or verify payments and generate receipts.",
    ],
    [
      MessagesSquare,
      "04 / CONNECT",
      "Close the loop with a message",
      "Use configured reminders and receipt communication, then review delivery and pending follow-ups.",
    ],
  ];
  return (
    <section className={s.workday}>
      <div className={s.workdayImage}>
        <img
          src="/images/connected-workday.webp"
          width={1536}
          height={1024}
          loading="lazy"
          decoding="async"
          alt="Conceptual school administration desk with laptop, phone, books and receipts connected by gold arcs"
        />
        <span>ILLUSTRATION · NOT A PRODUCT SCREENSHOT</span>
      </div>
      <div className={s.workdayCopy}>
        <span className={s.eyebrow}>FROM FIRST BELL TO FINAL RECEIPT</span>
        <h2>
          A more organised
          <br />
          <em>school day.</em>
        </h2>
        <div className={s.daySteps}>
          {steps.map(([Icon, label, title, text]) => {
            const I = Icon as typeof CalendarDays;
            return (
              <article key={String(label)}>
                <I size={20} />
                <div>
                  <small>{String(label)}</small>
                  <h3>{String(title)}</h3>
                  <p>{String(text)}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
export function IntegrationSection() {
  return (
    <section className={s.integrationSection}>
      <div>
        <span className={s.eyebrow}>
          CONNECT THE SERVICES YOU ALREADY RELY ON
        </span>
        <h2>
          Your providers.
          <br />
          <em>A connected experience.</em>
        </h2>
        <p>
          Keep payment and communication integrations aligned with your
          institution’s own accounts and approved configuration.
        </p>
        <Link href="/implementation" className={s.textLink}>
          Explore setup & onboarding ↗
        </Link>
      </div>
      <div className={s.integrationGrid}>
        {[
          [
            "Razorpay",
            "Institution fee collection and platform subscription payments use separate merchant settings.",
          ],
          [
            "Cashfree",
            "Verified payment callbacks and provider checks for pending or failed orders.",
          ],
          [
            "SMS & WhatsApp",
            "Configured delivery providers, approved templates, consent and delivery history.",
          ],
          [
            "Cloudflare",
            "Custom hostname ownership, hosting and SSL verification for institution branding.",
          ],
        ].map(([title, text]) => (
          <article key={title}>
            <h3>{title}</h3>
            <p>{text}</p>
            <small>Requires configuration</small>
          </article>
        ))}
      </div>
    </section>
  );
}
export function FAQSection({ all = false }: { all?: boolean }) {
  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <div>
          <span className={s.eyebrow}>USEFUL QUESTIONS. STRAIGHT ANSWERS.</span>
          <h2>Before you get started.</h2>
        </div>
        {!all && (
          <Link href="/faq" className={s.textLink}>
            Read all FAQs ↗
          </Link>
        )}
      </div>
      <div className={s.richFaq}>
        {(all ? faqs : faqs.slice(0, 6)).map(([q, a]) => (
          <details key={q}>
            <summary>
              {q}
              <span>+</span>
            </summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
export function SolutionPage({
  config,
  slug,
}: {
  config: WebsiteConfig;
  slug: string;
}) {
  const x = solutions.find((x) => x.slug === slug)!;
  return (
    <Shell config={config}>
      <Intro eyebrow={x.eyebrow} title={x.title} text={x.intro} />
      <div className={s.pageJump}>
        <Link href="/features">← All features</Link>
        <a href="#capabilities">Capabilities</a>
        <a href="#workflow">Workflow</a>
        <Link href="/contact">Discuss your setup ↗</Link>
      </div>
      <section className={s.detailHero}>
        <figure>
          <img
            src={
              [
                "transport-hostel",
                "attendance-timetable",
                "students-admissions",
              ].includes(slug)
                ? "/images/connected-campus.webp"
                : "/images/connected-workday.webp"
            }
            width={1536}
            height={1024}
            loading="lazy"
            alt="Conceptual illustration of connected education administration"
          />
          <figcaption>
            Concept illustration, not a live institution or product screen
          </figcaption>
        </figure>
        <div>
          <ShieldCheck size={30} />
          <h2>{x.benefit}</h2>
          <p>
            Give your team a clear process, the right context and a record it
            can return to.
          </p>
          <Link className={s.button} href="/contact">
            Discuss this module <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>
      <section className={s.section} id="capabilities">
        <span className={s.eyebrow}>WHAT YOUR TEAM CAN DO</span>
        <div className={s.detailGrid}>
          {x.groups.map(([title, text], i) => (
            <article key={title}>
              <span>0{i + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className={s.softSection} id="workflow">
        <span className={s.eyebrow}>A CLEAR PATH THROUGH THE WORK</span>
        <h2>From setup to everyday use.</h2>
        <ol className={s.flowSteps}>
          {x.flow.map((step, i) => (
            <li key={step}>
              <span>0{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
        <div className={s.notice}>
          <Layers3 size={22} />
          <p>{x.note}</p>
        </div>
      </section>
      <section className={s.related}>
        <h3>Keep exploring</h3>
        {solutions
          .filter((y) => y.slug !== slug)
          .slice(0, 3)
          .map((y) => (
            <Link key={y.slug} href={"/solutions/" + y.slug}>
              {y.title} ↗
            </Link>
          ))}
      </section>
      <CTA />
    </Shell>
  );
}
export function BenefitsPage({ config }: { config: WebsiteConfig }) {
  return (
    <Shell config={config}>
      <Intro
        eyebrow="WHY SOHAN ERP"
        title="Built around real institutional work."
        text="The value of an ERP is in the work it helps people do: finding a record, collecting the right amount, preparing a timetable or following up with clarity."
      />
      <CampusStory />
      <BenefitsSection />
      <DaySection />
      <IntegrationSection />
      <CTA />
    </Shell>
  );
}
export function ImplementationPage({ config }: { config: WebsiteConfig }) {
  return (
    <Shell config={config}>
      <Intro
        eyebrow="IMPLEMENTATION & CUSTOMISATION"
        title="A thoughtful start. A clearer way forward."
        text="Plan the transition around your institution’s data, people and daily work. Agree on the scope first, then validate each stage before going live."
      />
      <section className={s.section}>
        <div className={s.detailGrid}>
          {[
            [
              "Discover your requirements",
              "Share institution type, campuses, student volume, academic structure, fee rules and the workflows you want to improve.",
            ],
            [
              "Agree on the scope",
              "Confirm enabled modules, limits, pricing, taxes, implementation responsibilities and support arrangements in your proposal.",
            ],
            [
              "Prepare your records",
              "Review import templates and required fields. Clean student records, guardian contacts and academic assignments; agree how historical balances will be handled.",
            ],
            [
              "Configure the workspace",
              "Set academic years, classes, subjects, fee structures, branding and users. Assign permissions according to each team’s responsibilities.",
            ],
            [
              "Connect approved providers",
              "Configure supported payment and messaging accounts. Complete required merchant approvals, templates, DNS and SSL steps.",
            ],
            [
              "Validate before launch",
              "Review sample imports, fees, receipts, attendance and permissions with your team. Reconcile opening balances and confirm the operational handover.",
            ],
          ].map(([a, b], i) => (
            <article key={a}>
              <span>0{i + 1}</span>
              <h3>{a}</h3>
              <p>{b}</p>
            </article>
          ))}
        </div>
      </section>
      <section className={s.softSection}>
        <h2>Bring these to your first conversation.</h2>
        <ul className={s.prepList}>
          {[
            "Approximate student and staff count",
            "Institution type, campuses and academic years",
            "Priority modules and existing pain points",
            "Sample import field names, without personal records",
            "Fee rules, instalments and concessions",
            "Required SMS or WhatsApp workflows",
            "Payment gateway and domain requirements",
            "Preferred onboarding schedule and support needs",
          ].map((x) => (
            <li key={x}>
              <Check size={18} />
              {x}
            </li>
          ))}
        </ul>
        <p className={s.small}>
          Do not send passwords, API keys, OTPs or production student data
          through the public enquiry form. Timelines are agreed after scope and
          dependencies are reviewed.
        </p>
      </section>
      <IntegrationSection />
      <CTA />
    </Shell>
  );
}
export function FAQPage({ config }: { config: WebsiteConfig }) {
  return (
    <Shell config={config}>
      <Intro
        eyebrow="ERP KNOWLEDGE CENTRE"
        title="Get the details before you decide."
        text="Answers about modules, payment gateways, communication, data imports, custom branding and getting started."
      />
      <FAQSection all />
      <CTA />
    </Shell>
  );
}
