import Entry from "@/components/campus/Entry";
export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Entry />
      {children}
    </>
  );
}
