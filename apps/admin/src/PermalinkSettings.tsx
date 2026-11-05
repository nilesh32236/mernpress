import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  PERMALINK_PRESETS,
  presetPattern,
  previewPostPath,
  validatePattern,
  type PermalinkPreset,
} from '@mernpress/contracts';
import { actionErrorMessage, fetchOptions, updateOptions, type OptionValues } from './api.js';
import { Notice, type NoticeMessage } from './components.js';

const DEFAULT_PATTERN = '/posts/%postname%/';

function structureValue(value: unknown): PermalinkPreset {
  return typeof value === 'string' &&
    ['plain', 'day', 'month', 'numeric', 'postname', 'custom'].includes(value)
    ? (value as PermalinkPreset)
    : 'custom';
}

/**
 * Settings → Permalinks.
 *
 * WordPress's six choices map onto the same pattern language used by the API
 * and the edge middleware. Plain permalinks use `?p=<id>`; pretty structures
 * are matched by the middleware and rewritten to the internal post renderer.
 */
export function PermalinkSettings() {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [structure, setStructure] = useState<PermalinkPreset>('custom');
  const [customPattern, setCustomPattern] = useState(DEFAULT_PATTERN);
  const [categoryBase, setCategoryBase] = useState('category');
  const [tagBase, setTagBase] = useState('tag');

  useEffect(() => {
    let active = true;
    fetchOptions('permalinks')
      .then((values: OptionValues) => {
        if (!active) return;
        const legacyBase =
          typeof values.permalink_base === 'string' && values.permalink_base
            ? values.permalink_base
            : 'posts';
        setStructure(structureValue(values.permalink_structure));
        setCustomPattern(
          typeof values.permalink_pattern === 'string' && values.permalink_pattern
            ? values.permalink_pattern
            : `/${legacyBase}/%postname%/`,
        );
        setCategoryBase(
          typeof values.category_base === 'string' && values.category_base
            ? values.category_base
            : 'category',
        );
        setTagBase(
          typeof values.tag_base === 'string' && values.tag_base ? values.tag_base : 'tag',
        );
        setLoaded(true);
      })
      .catch((caught) => {
        if (active) {
          setError(actionErrorMessage(caught));
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const customValidation = useMemo(() => validatePattern(customPattern), [customPattern]);
  const effectivePattern =
    structure === 'custom'
      ? customValidation.ok
        ? customValidation.pattern
        : customPattern
      : presetPattern(structure);
  const previewPath = useMemo(() => {
    try {
      return previewPostPath(effectivePattern);
    } catch {
      return '';
    }
  }, [effectivePattern]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !dirty) return;
    if (structure === 'custom' && !customValidation.ok) {
      // The inline field error is already visible.
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await updateOptions('permalinks', {
        permalink_structure: structure,
        permalink_pattern:
          structure === 'plain'
            ? null
            : structure === 'custom'
              ? customValidation.ok
                ? customValidation.pattern
                : customPattern
              : presetPattern(structure),
        category_base: categoryBase.trim() || 'category',
        tag_base: tagBase.trim() || 'tag',
      });
      setStructure(structureValue(updated.permalink_structure));
      if (typeof updated.permalink_pattern === 'string') {
        setCustomPattern(updated.permalink_pattern);
      }
      if (typeof updated.category_base === 'string') setCategoryBase(updated.category_base);
      if (typeof updated.tag_base === 'string') setTagBase(updated.tag_base);
      setDirty(false);
      setNotice({ tone: 'success', text: 'Permalink structure saved.' });
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <p className="field-help">Loading permalink settings…</p>;

  return (
    <div className="settings-panel option-group-form">
      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <form onSubmit={submit} aria-label="Permalink settings">
        <fieldset className="permalink-structure">
          <legend>Common Settings</legend>
          {PERMALINK_PRESETS.map((preset) => (
            <label className="checkbox-row permalink-choice" key={preset.id}>
              <input
                type="radio"
                name="permalink_structure"
                value={preset.id}
                checked={structure === preset.id}
                onChange={() => {
                  setStructure(preset.id);
                  setDirty(true);
                }}
                disabled={saving}
              />
              <span>
                {preset.label}
                {preset.id === 'plain' ? null : (
                  <code className="permalink-pattern">
                    {preset.id === 'postname' ? '/%postname%' : preset.pattern}
                  </code>
                )}
              </span>
            </label>
          ))}
          <label className="checkbox-row permalink-choice">
            <input
              type="radio"
              name="permalink_structure"
              value="custom"
              checked={structure === 'custom'}
              onChange={() => {
                setStructure('custom');
                setDirty(true);
              }}
              disabled={saving}
            />
            <span>Custom structure</span>
          </label>
          {structure === 'custom' ? (
            <div className="field permalink-custom">
              <label htmlFor="permalink_pattern">Custom structure</label>
              <input
                id="permalink_pattern"
                type="text"
                value={customPattern}
                onChange={(event) => {
                  setCustomPattern(event.target.value);
                  setDirty(true);
                }}
                disabled={saving}
                spellCheck={false}
              />
              <p className="field-help">
                Tokens: %year%, %monthnum%, %day%, %hour%, %minute%, %second%, %post_id%,
                %postname%, %category%. The structure must contain exactly one of %postname% or
                %post_id%.
              </p>
              {!customValidation.ok ? (
                <p className="form-error" role="alert">
                  {customValidation.reason}
                </p>
              ) : null}
            </div>
          ) : null}
        </fieldset>

        <div className="field">
          <label htmlFor="category_base">Category base</label>
          <input
            id="category_base"
            type="text"
            value={categoryBase}
            onChange={(event) => {
              setCategoryBase(event.target.value);
              setDirty(true);
            }}
            disabled={saving}
          />
        </div>
        <div className="field">
          <label htmlFor="tag_base">Tag base</label>
          <input
            id="tag_base"
            type="text"
            value={tagBase}
            onChange={(event) => {
              setTagBase(event.target.value);
              setDirty(true);
            }}
            disabled={saving}
          />
        </div>

        <p className="permalink-preview">
          Post URL preview:{' '}
          <code>
            {typeof window === 'undefined' ? '' : window.location.origin}
            {previewPath}
          </code>
        </p>
        <p className="field-help">
          Changing the structure changes existing post URLs. Old links stop resolving unless you add
          redirects under Tools → Redirects.
        </p>

        <div className="field actions">
          <button type="submit" className="button primary-button" disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
