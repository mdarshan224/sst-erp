import { Pricing } from "@/features/website/Pages";
import { websiteConfig } from "@/server/website";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Plans & customisation | Sohan ERP",
  alternates: { canonical: "https://erp.sohansoft.in/pricing" },
};
export default async function Page() {
  return <Pricing config={await websiteConfig()} />;
}
