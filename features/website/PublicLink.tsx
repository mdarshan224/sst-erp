import type { ComponentProps } from "react";
// Public pages cross route-group boundaries. Native document navigation avoids
// retained ERP layouts and remains functional before/without hydration.
export default function PublicLink(props: ComponentProps<"a">) {
  return <a {...props} />;
}
