"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section role="alert" style={{ padding: "15vh 8%", background: "#fafaf6" }}>
      <h1>This page couldn’t load.</h1>
      <p>Please try again. Your submitted enquiries are not affected.</p>
      <button onClick={reset}>Try again</button>
      <Link href="/" style={{ marginLeft: 20 }}>
        Return home
      </Link>
    </section>
  );
}
