import Link from "./PublicLink";
import type { CSSProperties, ReactNode } from "react";
import type { WebsiteConfig } from "@/lib/website";
import { policyNames } from "@/lib/website";
import { Nav } from "./interactive";
import s from "./website.module.css";
export function Shell({
  config,
  children,
}: {
  config: WebsiteConfig;
  children: ReactNode;
}) {
  return (
    <div
      className={s.site}
      style={{ "--gold": config.accent } as CSSProperties}
    >
      <a href="#content" className={s.skip}>
        Skip to content
      </a>
      <Nav brand={config.brand} />
      <main id="content">{children}</main>
      <footer className={s.footer}>
        <div className={s.footerTop}>
          <div>
            <Link href="/" className={s.brand}>
              <img src="/brand/sohan-logo.png" width="38" height="38" alt="" />
              {config.brand}
              <span>EDUCATION, CONNECTED.</span>
            </Link>
            <p>
              A little less administration.
              <br />A lot more possibility.
            </p>
          </div>
          <div>
            <b>Explore</b>
            <Link href="/features">The platform</Link>
            <Link href="/communication">Communication</Link>
            <Link href="/pricing">Plans & customisation</Link>
            <Link href="/about">About the ERP</Link>
            <Link href="/contact">Contact & support</Link>
          </div>
          <div>
            <b>Policies</b>
            {Object.entries(policyNames).map(([slug, name]) => (
              <Link key={slug} href={"/policies/" + slug}>
                {name}
              </Link>
            ))}
          </div>
        </div>
        <div className={s.footerBottom}>
          <span>
            © {new Date().getFullYear()} {config.legalName}
          </span>
          <span>Made for the way education works.</span>
        </div>
      </footer>
    </div>
  );
}
export function Intro({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text: string;
}) {
  return (
    <header className={s.intro}>
      <span className={s.eyebrow}>{eyebrow}</span>
      <h1>{title}</h1>
      <p>{text}</p>
    </header>
  );
}
export function CTA() {
  return (
    <section className={s.cta}>
      <span className={s.eyebrow}>YOUR NEXT CHAPTER</span>
      <h2>
        Make space for
        <br />
        <em>what matters.</em>
      </h2>
      <Link className={s.button} href="/contact">
        Let’s shape your campus <span>↗</span>
      </Link>
      <p>Tell us how you work. We’ll start there.</p>
    </section>
  );
}
