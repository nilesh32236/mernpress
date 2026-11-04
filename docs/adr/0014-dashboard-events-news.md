# ADR 0014 — Dashboard Events and News widget (expanded scope)

- Status: accepted (owner scope decision, 2026-11-04)
- Extends: admin dashboard, `packages/cms-core`, `apps/api`

## Context

WordPress's dashboard ends with a full-width "WordPress Events and News" widget:
upcoming events near a chosen location, the latest headlines from the project
news feed, and footer links to Meetups/WordCamps/News. MERNPress's dashboard had
only Site Health, At a Glance, Activity and Quick Draft.

## Decision

1. **Configured sources, same defaults as WordPress.** The dashboard feed service
   reads the public WordPress.org events API and news feed by default (the same
   endpoints WordPress itself uses) and both can be overridden with
   `EVENTS_API_URL` / `NEWS_FEED_URL`. They are configured services, not
   user-supplied URLs, so no SSRF surface is added.
2. **Real data, short timeouts, cache that can recover.** Both requests use a
   6-second timeout. Successful events are cached per location and news is cached
   independently of location for 10 minutes; failures are never cached, so a
   transient error recovers on the next dashboard load.
3. **Events need a location.** The events endpoint has no "near me" mode without
   coordinates; the widget asks for a location and reports
   "Choose a location to see nearby events." until one is provided, instead of
   showing an empty list or a network error.
4. **The widget matches WordPress.** Title, "Attend an upcoming event near you."
   with a location control, two event rows (calendar icon, title link, location,
   right-aligned date, light-blue rows), "Want more events? Help organize the
   next one!", five news links with dates, and the Meetups | WordCamps | News
   footer. It is registered in Screen Options as "Events and News" and sits under
   Quick Draft on the right, like WordPress.
5. **Visible to every signed-in admin user.** Like WordPress's dashboard widget,
   no capability beyond an authenticated session is required.

## Consequences

- No migration and no new stored data; results are cached in memory per process.
- The dashboard now has the five widgets a fresh WordPress install shows
  (Welcome, Site Health, At a Glance, Activity, Quick Draft, Events and News).
- Appearance → Editor/Fonts remains the last expanded-scope screen.
