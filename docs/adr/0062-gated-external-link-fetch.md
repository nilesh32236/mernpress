# ADR 0062 — Gated external link fetcher with DNS pinning

- Status: accepted (2026-11-07)
- Supersedes: the "guard only" state in [ADR 0061](0061-external-link-check-evaluation.md)

## Context

ADR 0061 shipped the pure SSRF guard and left outbound fetching off. This ADR
implements the fetcher behind the operator toggle so external link health can
be checked where the host allows egress, without weakening the guard.

## Decision

1. **Toggle.** Reading setting `external_link_check` (boolean, default `false`,
   server-validated). The scan only fetches external URLs when it is `true`;
   otherwise ADR 0058 behaviour (unchecked) is unchanged.
2. **Fetcher** (`packages/cms-core/src/links/external-fetch.ts`):
   - every hop re-enters `checkExternalUrl` (contracts guard);
   - host resolved once with `dns.lookup({ all: true })`; every answer must be
     public (`isPublicResolution`);
   - the connection is pinned to the first answer via a custom `lookup`
     (no second resolve → no rebinding swap), with `servername` kept as the
     hostname for TLS SNI/certificate checks;
   - 5s timeout, ≤3 redirects, HEAD with a `GET Range: bytes=0-0` fallback;
     only the final status is stored, never the body.
3. **Budget.** At most 100 external fetches per scan batch; the rest stay
   `external / not fetched` this batch and are picked up by the next scan.
4. **Mapping.** 2xx–3xx → `ok`, everything else (including blocked DNS,
   timeouts, network errors and >3 redirects) → `broken` with the status when
   known. Guard-blocked URLs are `broken` with `httpStatus: null`.

## Alternatives considered

- **Fetch without pinning** — rejected (rebinding).
- **Egress proxy** — stronger isolation, but a new deployment component;
  deferred. The pinned fetcher is the in-process equivalent for this slice.
- **Always on** — rejected: egress may be blocked and authors could turn the
  site into an outbound scanner; opt-in + budget bound both.

## Consequences

- Default behaviour unchanged (off). When on, the API performs outbound
  requests only to public http/https default-port hosts.
- Operators on locked-down hosts keep the toggle off.
- The fetcher is injectable (`resolveHost`/`doRequest`) and unit-tested
  without network access.
