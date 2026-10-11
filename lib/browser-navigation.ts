"use client";
import {
  useRouter as useNextRouter,
  usePathname as useNextPathname,
  useSearchParams as useNextSearchParams,
} from "next/navigation";
import NextLink from "next/link";
import {
  createElement,
  useMemo,
  useSyncExternalStore,
  type ComponentProps,
} from "react";
import { navigationTarget } from "./navigation-target";
const eventName = "sohan:workspace-navigation";
export function workspaceKey(path: string) {
  if (
    /^\/(?:features|communication|pricing|about|contact|policies)(?:[/?#]|$)/.test(
      path,
    )
  )
    return null;
  if (path.split(/[?#]/)[0] === "/") return null;
  // These URLs share the workspace layout. Entry switches product providers,
  // and CampusApp is keyed by slug so crossing tenants discards cached state.
  if (/^\/(api|portal|organization|exam-verification)(?:\/|$)/.test(path))
    return null;
  return "/workspace";
}
const subscribe = (notify: () => void) => {
  window.addEventListener(eventName, notify);
  window.addEventListener("popstate", notify);
  return () => {
    window.removeEventListener(eventName, notify);
    window.removeEventListener("popstate", notify);
  };
};
export function usePathname() {
  const server = useNextPathname();
  return useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    () => server,
  );
}
export function useSearchParams() {
  const server = useNextSearchParams();
  const search = useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => (server.toString() ? "?" + server.toString() : ""),
  );
  return useMemo(() => new URLSearchParams(search), [search]);
}
export function useRouter() {
  const router = useNextRouter();
  return useMemo(() => {
    function navigate(
      href: string,
      replace: boolean,
      options?: { scroll?: boolean },
    ) {
      const target = navigationTarget(href, window.location.href);
      const key = workspaceKey(window.location.pathname);
      if (
        key &&
        key === workspaceKey(new URL(target, window.location.href).pathname)
      ) {
        // The workspace has one retained layout and client-rendered sections. Native
        // history integrates with Next without fetching a redundant null RSC leaf.
        window.history[replace ? "replaceState" : "pushState"](
          null,
          "",
          target,
        );
        window.dispatchEvent(new Event(eventName));
        if (options?.scroll !== false)
          window.scrollTo({ top: 0, behavior: "instant" });
      } else (replace ? router.replace : router.push)(target, options);
    }
    return {
      ...router,
      push: (href: string, options?: { scroll?: boolean }) =>
        navigate(href, false, options),
      replace: (href: string, options?: { scroll?: boolean }) =>
        navigate(href, true, options),
    };
  }, [router]);
}
export function AppLink({
  href,
  onClick,
  ...props
}: ComponentProps<typeof NextLink>) {
  const router = useRouter();
  return createElement(NextLink, {
    ...props,
    href,
    prefetch: false,
    onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        (props.target && props.target !== "_self") ||
        (props.download !== undefined && props.download !== false)
      )
        return;
      const target = typeof href === "string" ? href : null;
      if (
        !target ||
        !target.startsWith("/") ||
        target.startsWith("//") ||
        /^\/api(?:\/|$)/.test(target)
      )
        return;
      const key = workspaceKey(window.location.pathname);
      if (key && key === workspaceKey(target)) {
        event.preventDefault();
        router.push(target);
      }
    },
  });
}
