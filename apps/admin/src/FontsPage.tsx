import { useEffect, useState } from 'react';
import { fetchThemes, type AdminTheme } from './api.js';
import { Skeleton } from './components.js';

type FontsTab = 'library' | 'upload' | 'install';

/**
 * Appearance → Fonts (WordPress 7.1 font library).
 *
 * WordPress installs font families into the theme. MERNPress fonts ship with the
 * theme package, so the library lists them with their weights and live samples;
 * Upload and Install Fonts state that the font set is fixed in this build.
 */
export function FontsPage() {
  const [tab, setTab] = useState<FontsTab>('library');
  const [fonts, setFonts] = useState<AdminTheme['fonts'] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchThemes()
      .then((result) => {
        if (!active) return;
        const activeTheme = result.themes.find((theme) => theme.active) ?? result.themes[0];
        const families = activeTheme?.fonts ?? [];
        setFonts(families);
        setOpen(families[0]?.family ?? null);
      })
      .catch(() => {
        if (active) setFonts([]);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="fonts-screen">
      <div className="fonts-panel">
        <h1 className="fonts-title">Fonts</h1>
        <div className="fonts-tabs" role="tablist" aria-label="Font library">
          {(
            [
              ['library', 'Library'],
              ['upload', 'Upload'],
              ['install', 'Install Fonts'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`fonts-tab${tab === id ? ' is-active' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'library' ? (
          <div className="fonts-library">
            <h2 className="fonts-section-label">Theme</h2>
            {fonts === null ? (
              <Skeleton label="Loading fonts…" lines={2} />
            ) : fonts.length === 0 ? (
              <p className="fonts-source">No fonts are registered for the active theme.</p>
            ) : null}
            <ul className="fonts-list">
              {fonts?.map((font) => {
                const expanded = open === font.family;
                return (
                  <li key={font.family} className="fonts-row">
                    <button
                      type="button"
                      className="fonts-row-button"
                      aria-expanded={expanded}
                      onClick={() => setOpen(expanded ? null : font.family)}
                    >
                      <span className="fonts-row-name" style={{ fontFamily: font.family }}>
                        {font.family}
                      </span>
                      <span className="fonts-row-meta">
                        {font.weights.length} of {font.weights.length} active
                        <span className="fonts-row-chevron" aria-hidden="true">
                          {expanded ? '⌄' : '›'}
                        </span>
                      </span>
                    </button>
                    {expanded ? (
                      <div className="fonts-row-detail">
                        <p className="fonts-sample" style={{ fontFamily: font.family }}>
                          The quick brown fox jumps over the lazy dog.
                        </p>
                        <p className="fonts-weights">
                          {font.weights.map((weight) => (
                            <span
                              key={weight}
                              style={{ fontFamily: font.family, fontWeight: weight }}
                            >
                              {weight}
                            </span>
                          ))}
                        </p>
                        <p className="fonts-source">
                          {font.source === 'theme'
                            ? 'Bundled with the MERNPress theme.'
                            : 'System font stack provided by the browser.'}
                        </p>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="fonts-unavailable">
            <p>
              {tab === 'upload'
                ? 'Uploading font files is not enabled in this build.'
                : 'Installing fonts from a font provider is not enabled in this build.'}{' '}
              Theme fonts are bundled with the theme package and ship with releases.
            </p>
          </div>
        )}

        <div className="fonts-footer">
          <button type="button" className="button primary-button" disabled>
            Update
          </button>
        </div>
      </div>
    </div>
  );
}
