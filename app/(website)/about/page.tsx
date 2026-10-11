import { About } from "@/features/website/Pages";
import { websiteConfig } from "@/server/website";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "About Sohan ERP | Sohan ERP",
  alternates: { canonical: "https://erp.sohansoft.in/about" },
};
export default async function Page() {
  return <About config={await websiteConfig()} />;
}
