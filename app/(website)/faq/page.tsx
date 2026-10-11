import { FAQPage } from "@/features/website/RichSections";
import { websiteConfig } from "@/server/website";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Faq | Sohan ERP",
  alternates: { canonical: "https://erp.sohansoft.in/faq" },
};
export default async function Page() {
  return <FAQPage config={await websiteConfig()} />;
}
