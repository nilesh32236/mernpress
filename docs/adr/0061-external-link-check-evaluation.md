# ADR 0061 — External link checking: SSRF evaluation; guard shipped, fetching stays off

- Status: accepted (2026-11-07)
- Related: [broken-link detection ADR 0058](0058-broken-link-detection.md),
  [threat model](../security/threat-model.md)
- Gap: "External links are stored unchecked (SSRF)" in the link-check
  research (Broken Link Checker parity)

## Context

ADR 0058 checks internal links without HTTP and stores external links as
`external / not fetched`, following the project rule that authored URLs are
untrusted input and must not be fetched (AGENTS.md §7: no SSRF, no external
fetch beyond configured services). Editors still ask whether external links
are healthy, so this ADR evaluates outbound checking and ships the guard
half of it.

## Evaluation

| Concern | Assessment |
| --- | --- |
| Value | Dead vendor/documentation links are the main missed signal; internal first is the SEO-critical slice |
| SSRF surface | Authored URLs can point at `169.254.169.254`, `localhost`, private LANs and non-standard ports; a naive HEAD fetch is an SSRF primitive |
| DNS rebinding | A hostname that resolves public on check and private on connect defeats check-then-fetch; every resolved address must be verified and the connect pinned |
| Redirects | Each hop re-enters the same policy (scheme/credentials/port/host) |
| Cost/abuse | Unbounded fetches let a post author turn the site into an outbound scanner; a per-scan budget and operator opt-in are required |
| Ops | Outbound egress may be blocked by the host firewall; failures must be `unreachable`, never a scan error |

## Decision

1. **Ship the pure SSRF guard now** (`packages/contracts/src/external-link.ts`):
   - `checkExternalUrl` allows only http/https, no credentials, default ports
     only, no localhost/`.local`/`.internal`, and no private/loopback/
     link-local/reserved IP literals (v4 and v6, including IPv4-mapped).
   - `isPublicResolution` requires every DNS answer to be public.
   - Both are unit-tested (scheme, credentials, port, host, rebinding).
2. **Do not fetch yet.** The durable `linkcheck.scan` job keeps external URLs
   as `external / not fetched` (ADR 0058). A fetcher will only be added when
   all hold:
   - an operator opt-in (default off), and a per-scan fetch budget;
   - DNS resolved with `dns.lookup({ all: true })`, every address checked with
     `isPublicResolution`, and the connection pinned to the checked address
     (no second resolve);
   - 5s timeout, ≤3 redirects with the guard re-applied per hop, HEAD with a
     `GET Range: bytes=0-0` fallback;
   - results stored as `external` + `httpStatus` (never the body), and the
     UI keeps the "not fetched" label until then.

## Alternatives considered

- **Fetch now without pinning** — rejected: check-then-fetch without pinning
  is rebinding-vulnerable.
- **Fetch via a separate egress proxy** — strongest isolation, but a new
  deployment component for a P2 nicety; deferred to an operator decision.
- **Keep external unchecked forever** — rejected as the end state; the guard
  and triggers above are the path, and internal checks already cover SEO.

## Consequences

- No runtime change: the scan still stores external links unchecked.
- The guard is exported from contracts and can be reused by any future
  fetcher; it cannot be bypassed without changing the exported policy.
- Production currently performs no outbound fetch of authored URLs.
