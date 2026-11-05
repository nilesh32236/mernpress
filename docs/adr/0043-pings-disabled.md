# ADR 0043 — Pingbacks and trackbacks stay disabled

- Status: accepted (owner-facing limitation, 2026-11-05)
- Resolves the "Allow Pings" item in the design-parity audit

## Context

WordPress exposes "Allow link notifications from other blogs (pingbacks and
trackbacks)" in Settings → Discussion, the editor's Discussion panel, Quick Edit
and Bulk Edit. Implementing it means accepting inbound XML-RPC (`pingback.ping`)
or fetching and verifying arbitrary sender URLs. Both are security-sensitive:
XML-RPC is a long-standing brute-force, amplification and injection surface, and
link verification requires outbound requests to untrusted hosts, which conflicts
with the project's no-untrusted-fetch rule. MERNPress never had a ping endpoint;
the previous option `default_ping_status` was stored but consumed by nothing.

## Decision

1. **No pingback/trackback runtime.** MERNPress does not expose XML-RPC, inspect
   inbound ping requests or verify sender links. Outgoing update-service pings
   also stay unsent (Writing → Update Services already states this).
2. **Remove the dead option.** `default_ping_status` is removed from the option
   registry so the API cannot report a ping state that has no effect. Any stored
   row from an older release is inert and ignored.
3. **State the limitation where WordPress shows the control.** A disabled,
   explained control appears in:
   - the editor's Discussion panel ("Pings — Not available"),
   - Quick Edit ("Allow Pings" with a note),
   - Bulk Edit ("Pings — Not available"),
   - Settings → Discussion (the WordPress checkbox text plus a security note).
   The explanation is the same everywhere: pingbacks and trackbacks require an
   inbound XML-RPC endpoint or link verification, which this build does not
   expose for security; comments are unaffected.
4. **Keep WXR compatible.** The exporter still writes `wp:ping_status`
   (`open` for posts, `closed` for attachments) so files remain importable by
   WordPress. That is metadata for the importer, not evidence of a runtime
   feature.
5. **Record the residual risk.** `docs/security/threat-model.md` lists the
   missing ping endpoint and the reason.

## Consequences

- No inbound XML-RPC or ping-verification attack surface; no new outbound fetch.
- A site that depends on trackbacks cannot use MERNPress for that feature. The
  product says so instead of silently dropping pings or shipping an inert
  checkbox.
- Comments, comment moderation and the local spam guard are unaffected.
- No migration: removing an option spec only changes validation/read behaviour.
