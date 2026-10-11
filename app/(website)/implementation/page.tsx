import { ImplementationPage } from "@/features/website/RichSections";
import { websiteConfig } from "@/server/website";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Implementation | Sohan ERP",
  alternates: { canonical: "https://erp.sohansoft.in/implementation" },
};
export default async function Page() {
  return <ImplementationPage config={await websiteConfig()} />;
}
