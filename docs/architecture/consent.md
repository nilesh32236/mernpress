# Cookie consent — developer guide

## Data

`consent_config` (option store, group `consent`) — one JSON object:

| Field | Default | Meaning |
| --- | --- | --- |
| `enabled` | false | Render the banner |
| `version` | 1 | Stored choices only count for this version |
| `title`, `message` | built-in | Banner copy (120/500 chars) |
| `acceptLabel`, `rejectLabel`, `saveLabel` | built-in | Button labels (40 chars) |
| `analyticsEnabled`, `marketingEnabled` | true | Offer the optional categories |
| `analyticsRequired` | false | Gate the local view beacon on analytics consent |

Shared validation/defaults live in `packages/contracts/src/consent.ts`
(`normalizeConsentConfig`, `parseConsentChoice`, `consentAllows`).

## Routes

| Route | Behaviour |
| --- | --- |
| `GET /api/admin/consent` | `manage_options`; returns the normalized config |
| `PUT /api/admin/consent` | `manage_options`; strict Zod shape; normalizes and upserts |
| `GET /api/public/site` | includes `consent` in the public settings payload |

## Public site

- `apps/web/components/ConsentBanner.tsx` — client banner, preferences and the
  “Cookie settings” launcher. Choices go to `localStorage["mernpress.consent"]`;
  no request carries them.
- `apps/web/lib/consent.ts` — `readConsentChoice`, `writeConsentChoice`,
  `hasConsent`, `currentConsentChoice`, plus the `mernpress:consent` event.
- `apps/web/components/ConsentGate.tsx` — render children only after a grant:

```tsx
<ConsentGate config={consent} category="marketing">
  <ThirdPartyEmbed />
</ConsentGate>
```

- `ViewTracker` respects `analyticsRequired`: when true it waits for an analytics
  grant and listens for the consent event; when false the cookieless beacon runs
  as before.

## Admin

Settings → Consent (`apps/admin/src/ConsentPage.tsx`) edits the config, shows a
preview, and explains versioning. The route is `/settings/consent`.

## Limits

- No server-side consent log, no IPs/user ids, no proof-of-consent export.
- No geo-targeting, TCF strings, vendor lists, or automatic script blocking.
- Necessary storage (session, CSRF, the choice itself) is always allowed.
- Bump `version` after changing wording/categories to re-ask visitors.
