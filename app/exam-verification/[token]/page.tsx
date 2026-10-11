"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
export default function VerifyCard() {
  const { token } = useParams<{ token: string }>(),
    [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("exams/verify/" + token)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [token]);
  return (
    <main className="login-page">
      <section className="login-card">
        <h1>Admit card verification</h1>
        {error ? (
          <p role="alert">{error}</p>
        ) : data ? (
          <>
            <h2>Valid admit card</h2>
            <p>{data.institution}</p>
            <p>{data.exam}</p>
            <p>Card {data.cardNumber}</p>
            <small>Valid until {data.expiresAt.slice(0, 10)}</small>
          </>
        ) : (
          <p>Verifying…</p>
        )}
        <a href="https://erp.sohansoft.in">Sohan Soft Tech</a>
      </section>
    </main>
  );
}
