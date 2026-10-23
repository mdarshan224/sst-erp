"use client";
import { useState } from "react";
export function InstitutionLogo({
  src,
  name,
  className,
}: {
  src?: string | null;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const url = src?.trim();
  if (!url || failed === url)
    return (
      <span
        className={className}
        role="img"
        aria-label={name + " logo placeholder"}
      >
        {name
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((s) => s[0])
          .join("")
          .toUpperCase()}
      </span>
    );
  return (
    <img
      className={className}
      src={url}
      alt={name + " logo"}
      style={{ objectFit: "contain" }}
      onError={() => setFailed(url)}
    />
  );
}
