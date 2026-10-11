import { BenefitsPage } from "@/features/website/RichSections";
import { websiteConfig } from "@/server/website";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Benefits | Sohan ERP",
  alternates: { canonical: "https://erp.sohansoft.in/benefits" },
};
export default async function Page() {
  return <BenefitsPage config={await websiteConfig()} />;
}
