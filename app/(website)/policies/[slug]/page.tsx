import { notFound } from "next/navigation";
import { Policy } from "@/features/website/Pages";
import { websiteConfig } from "@/server/website";
import { policyNames } from "@/lib/website";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return {
    title:
      (policyNames[slug as keyof typeof policyNames] || "Policy") +
      " | Sohan ERP",
    alternates: { canonical: "https://erp.sohansoft.in/policies/" + slug },
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!Object.hasOwn(policyNames, slug)) notFound();
  return (
    <Policy
      config={await websiteConfig()}
      slug={slug as keyof typeof policyNames}
    />
  );
}
