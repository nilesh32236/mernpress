import { useEffect, useState, type FormEvent } from 'react';
import { fetchDashboardFeeds, type DashboardFeeds } from './api.js';

function formatEventDate(value: string): string {
  if (!value) return '';
  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatNewsDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * WordPress "Events and News" dashboard widget: upcoming events near a chosen
 * location plus the latest headlines, with WordPress's footer links.
 */
export function EventsNewsWidget() {
  const [feeds, setFeeds] = useState<DashboardFeeds | null>(null);
  const [location, setLocation] = useState('');
  const [draft, setDraft] = useState('');
  const [locationOpen, setLocationOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetchDashboardFeeds('')
      .then((result) => {
        if (active) setFeeds(result);
      })
      .catch(() => {
        if (active) setFeeds(null);
      });
    return () => {
      active = false;
    };
  }, []);

  async function findEvents(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const result = await fetchDashboardFeeds(draft.trim());
      setFeeds(result);
      setLocation(draft.trim());
      setLocationOpen(false);
    } finally {
      setBusy(false);
    }
  }

  const events = feeds?.events ?? [];
  const news = feeds?.news ?? [];

  return (
    <div className="events-news-widget">
      <p className="events-intro">
        Attend an upcoming event near you.{' '}
        <button
          type="button"
          className="button-link events-location-link"
          onClick={() => setLocationOpen((value) => !value)}
          aria-expanded={locationOpen}
        >
          <span className="events-pin" aria-hidden="true">
            ⚲
          </span>{' '}
          {location ? location : 'Select location'}
        </button>
      </p>

      {locationOpen ? (
        <form className="events-location-form" onSubmit={findEvents} aria-label="Find events">
          <label htmlFor="events-location">Location</label>
          <input
            id="events-location"
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="City or country"
            maxLength={120}
          />
          <button type="submit" className="button primary-button" disabled={busy}>
            {busy ? 'Searching…' : 'Find events'}
          </button>
        </form>
      ) : null}

      {feeds?.eventsError ? <p className="events-row-source">{feeds.eventsError}</p> : null}
      {events.length > 0 ? (
        <ul className="events-list">
          {events.map((event) => (
            <li key={event.url || event.title}>
              <span className="events-icon dashicons dashicons-calendar-alt" aria-hidden="true" />
              <div className="events-copy">
                <a href={event.url} target="_blank" rel="noreferrer">
                  {event.title}
                </a>
                {event.location ? (
                  <span className="events-row-source">{event.location}</span>
                ) : null}
              </div>
              <time className="events-date" dateTime={event.date || undefined}>
                {formatEventDate(event.date)}
              </time>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="events-more">
        Want more events?{' '}
        <a
          href="https://make.wordpress.org/community/organize-event-landing-page/"
          target="_blank"
          rel="noreferrer"
        >
          Help organize the next one!
        </a>
      </p>

      {feeds?.newsError ? <p className="events-row-source">{feeds.newsError}</p> : null}
      {news.length > 0 ? (
        <ul className="events-news-list">
          {news.map((item) => (
            <li key={item.url}>
              <a href={item.url} target="_blank" rel="noreferrer">
                {item.title}
              </a>
              {formatNewsDate(item.publishedAt) ? (
                <span className="events-row-source">{formatNewsDate(item.publishedAt)}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="events-footer">
        <a href="https://www.meetup.com/pro/wordpress/" target="_blank" rel="noreferrer">
          Meetups
        </a>{' '}
        |{' '}
        <a href="https://central.wordcamp.org/" target="_blank" rel="noreferrer">
          WordCamps
        </a>{' '}
        |{' '}
        <a href="https://wordpress.org/news/" target="_blank" rel="noreferrer">
          News
        </a>
      </p>
    </div>
  );
}
