import { Features } from "@/features/website/Pages";
import { websiteConfig } from "@/server/website";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Platform & features | Sohan ERP",
  alternates: { canonical: "https://erp.sohansoft.in/features" },
};
export default async function Page() {
  return <Features config={await websiteConfig()} />;
}
