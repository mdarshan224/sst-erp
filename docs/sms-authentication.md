# Fast2SMS authentication migration

Open `/auth/setup` or Platform Settings → SMS authentication using the existing platform owner account. Enter the Fast2SMS API key and owner's Indian mobile number. Template `7a563a8ad5` is preconfigured. Submit the SMS code to activate.

Activation is atomic with the verified owner mobile binding and new session. It permanently disables trusted ChatGPT identity headers as a staff sign-in mechanism. The initial owner setup bridge is retained only until activation, because no API key or owner phone was supplied with this change. No real SMS is sent by automated tests.

Staff use the mobile registered on their existing institution membership or pending invitation. Email is retained for existing account IDs and historical attribution. No parent or student account is created by this flow. A mobile that matches multiple unrelated staff emails is rejected. Institution admins must enter mobile numbers for new invitations after activation. Existing staff with blank numbers require their administrator to update them first. Phone ownership is proven via Fast2SMS; phone reassignment and account recovery must be supervised.

Endpoints: `GET /api/auth/status`, `POST /api/auth/configure` (owner setup), `/send`, `/resend`, `/verify`, `/logout`. All writes require same-origin JSON. Six-digit OTPs expire in five minutes, have five local verification attempts and five resends with 60-second spacing. New OTP sends are bounded per IP/minute, per mobile/minute and ten per mobile/day. Provider failure does not create a session. Concurrent verification is locked in D1. OTP values are never stored.

The API key is encrypted using the existing AES-GCM provider encryption key. Local sessions have random 256-bit secrets; only SHA-256 hashes are stored. Cookie: `__Host-sohan_session`, HttpOnly, Secure, SameSite=Lax, Path=/, eight hours. HTTPS is required. Cookie scope is per portal origin; custom-domain sessions do not transfer to another hostname. Logout revokes the session; access resets revoke account sessions. All financial authorization and tenant checks remain authoritative in existing middleware.

Schema additions: `sms_accounts`, `sms_challenges`, `sms_sessions`; migration `0008_sticky_meltdown.sql`. Existing financial tables are unchanged. Authentication activation and successful sign-ins are recorded in immutable platform audit logs without API keys or OTP values.

Run `pnpm typecheck`, `pnpm build`, `node tests/sms-auth.mjs`, `pnpm test:saas`. The OTP integration suite uses disposable D1 and a mocked provider. Live delivery needs a valid Fast2SMS API key, an active approved template and sufficient provider balance; these are not fabricated.
