import type { Metadata } from "next";
import { headers } from "next/headers";
import Entry from "@/components/campus/Entry";
import { Home } from "@/features/website/Pages";
import { websiteConfig } from "@/server/website";

export const metadata: Metadata = {
  title: "Sohan Soft Tech ERP | A better school day starts here",
  description:
    "One connected ERP for schools and colleges: fees, digital receipts, attendance, academics and configurable SMS and WhatsApp communication.",
  alternates: { canonical: "https://erp.sohansoft.in" },
  openGraph: {
    title: "Sohan Soft Tech Education ERP",
    description:
      "Bring your institution together. Fees, academics, attendance and communication, in one place.",
    url: "https://erp.sohansoft.in",
    type: "website",
  },
};
export default async function HomePage() {
  const h = await headers();
  const host = (h.get("host") || "").split(":")[0].toLowerCase();
  // A customer hostname keeps its existing branded, tenant-resolved entry.
  // This chooses presentation only; domain/context still authorizes the tenant.
  if (
    h.has("x-sohan-proxy-host") ||
    (host &&
      host !== "erp.sohansoft.in" &&
      !host.endsWith(".chatgpt.site") &&
      !["localhost", "127.0.0.1"].includes(host))
  )
    return <Entry />;
  return <Home config={await websiteConfig()} />;
}
