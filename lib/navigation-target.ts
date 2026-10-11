// Keep imperative navigation on the current origin. Framework links retain
// native download, hash, external-link and modifier-key behavior.
export function navigationTarget(href: string, currentUrl: string): string {
  const current = new URL(currentUrl);
  const target = new URL(href, current);
  if (
    target.origin !== current.origin ||
    !["http:", "https:"].includes(target.protocol)
  )
    throw new Error("Application navigation must stay on this site.");
  return target.pathname + target.search + target.hash;
}
export function campusHref(basePath: string, href: string): string {
  if (
    !href.startsWith("/") ||
    href.startsWith("//") ||
    /^\/(api|admin|campus|organization|portal|exam-verification|auth|signin-with-chatgpt|signout-with-chatgpt|features|communication|pricing|about|contact|policies|solutions|benefits|implementation|faq)(\/|\?|#|$)/.test(
      href,
    )
  )
    return href;
  return basePath + (href === "/" ? "" : href);
}
