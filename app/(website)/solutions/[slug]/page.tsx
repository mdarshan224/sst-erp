import { notFound } from "next/navigation";
import { SolutionPage } from "@/features/website/RichSections";
import { solutions } from "@/features/website/details";
import { websiteConfig } from "@/server/website";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = solutions.find((x) => x.slug === slug);
  return {
    title: (item?.title || "Solution") + " | Sohan ERP",
    description: item?.intro,
    alternates: { canonical: "https://erp.sohansoft.in/solutions/" + slug },
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!solutions.some((x) => x.slug === slug)) notFound();
  return <SolutionPage config={await websiteConfig()} slug={slug} />;
}
