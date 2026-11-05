/**
 * Local editor preferences (WordPress's Options → Preferences, bounded to
 * settings this editor actually implements). Stored in localStorage; no server
 * round-trip and no personal data.
 */
export interface EditorPreferences {
  /** Comfortable (WordPress default) or compact spacing. */
  density: 'comfortable' | 'compact';
  /** Open previews in a new tab or reuse the current one. */
  previewTarget: 'new-tab' | 'same-tab';
  /** Open the Welcome guide when the editor loads. */
  showWelcomeGuide: boolean;
  /** Show the word count / reading time summary above the publish panel. */
  showWordCount: boolean;
}

export const EDITOR_PREFERENCES_KEY = 'mernpress.editorPreferences';

export const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = {
  density: 'comfortable',
  previewTarget: 'new-tab',
  showWelcomeGuide: false,
  showWordCount: true,
};

export function readEditorPreferences(): EditorPreferences {
  try {
    const raw = window.localStorage.getItem(EDITOR_PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_EDITOR_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<EditorPreferences>;
    return {
      density: parsed.density === 'compact' ? 'compact' : 'comfortable',
      previewTarget: parsed.previewTarget === 'same-tab' ? 'same-tab' : 'new-tab',
      showWelcomeGuide: parsed.showWelcomeGuide === true,
      showWordCount: parsed.showWordCount !== false,
    };
  } catch {
    return { ...DEFAULT_EDITOR_PREFERENCES };
  }
}

export function writeEditorPreferences(preferences: EditorPreferences): void {
  try {
    window.localStorage.setItem(EDITOR_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Storage is optional; the session keeps the in-memory value.
  }
}
