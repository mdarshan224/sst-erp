import { Contact } from "@/features/website/Pages";
import { websiteConfig } from "@/server/website";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Contact & support | Sohan ERP",
  alternates: { canonical: "https://erp.sohansoft.in/contact" },
};
export default async function Page() {
  return <Contact config={await websiteConfig()} />;
}
