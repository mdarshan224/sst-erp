# Navigation and gold theme update — version 26

- Corrected `workspaceKey` in `lib/browser-navigation.ts`: public product/policy routes are no longer classified as retained ERP workspace routes.
- Corrected `campusHref` in `lib/navigation-target.ts`: public pages remain global instead of receiving an institution prefix.
- Public header, footer, feature, policy and CTA links now use ordinary document navigation through `PublicLink`. This deliberately avoids client-router route-group transitions for the marketing site and works before/without JavaScript. ERP section navigation remains client-side.
- Mobile public navigation uses native details/summary. It does not rely on hydration to open.
- Replaced Arial with self-hosted Inter, a 48,256-byte WOFF2 asset with its SIL Open Font License. No Google Fonts request or company-site dependency.
- Replaced green-grey surfaces with warm ivory, champagne/gold highlights and brown-charcoal panels. Buttons, 3D illustration surfaces and mobile menus follow the same palette.

Verification: production build, TypeScript, 23 workspace/public navigation checks, 3 navigation-target tests, 20 website integration checks and 77 SaaS checks. Targeted lint has no errors and two existing local-logo optimisation warnings.

Browser/device automation is unavailable. The route classification bug and corrected route transitions were verified in tests; the user's exact live click failure could not be reproduced in a browser. Native public navigation provides a route-independent fallback. Visual appearance and pointer interaction still need device verification.

Source ZIP includes the tracked build/ directory: it contains required Worker/build plugin source, not generated build output. Installed dependencies, dist, secrets, local state and production data are excluded. Follow README for installation and deployment.
