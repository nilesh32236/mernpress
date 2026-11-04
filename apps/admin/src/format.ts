export function formatDateTime(value: string | null): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

const DATE_PATTERN = 'mernpress.dateFormat';
const TIME_PATTERN = 'mernpress.timeFormat';

function readPattern(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function formatSettingsDate(
  date: Date,
  pattern = readPattern(DATE_PATTERN, 'F j, Y'),
): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const map: Record<string, string> = {
    Y: String(date.getFullYear()),
    y: String(date.getFullYear()).slice(-2),
    m: pad(date.getMonth() + 1),
    n: String(date.getMonth() + 1),
    d: pad(date.getDate()),
    j: String(date.getDate()),
    F: months[date.getMonth()]!,
    M: months[date.getMonth()]!.slice(0, 3),
  };
  return pattern.replace(/[YymndjFM]/g, (token) => map[token] ?? token);
}

export function formatSettingsTime(
  date: Date,
  pattern = readPattern(TIME_PATTERN, 'g:i a'),
): string {
  const hours = date.getHours();
  const hours12 = hours % 12 === 0 ? 12 : hours % 12;
  const map: Record<string, string> = {
    g: String(hours12),
    G: String(hours),
    h: String(hours12).padStart(2, '0'),
    H: String(hours).padStart(2, '0'),
    i: String(date.getMinutes()).padStart(2, '0'),
    a: hours < 12 ? 'am' : 'pm',
    A: hours < 12 ? 'AM' : 'PM',
  };
  return pattern.replace(/[gGhHiaA]/g, (token) => map[token] ?? token);
}

export function cacheSiteFormats(dateFormat: string, timeFormat: string): void {
  try {
    window.localStorage.setItem(DATE_PATTERN, dateFormat);
    window.localStorage.setItem(TIME_PATTERN, timeFormat);
  } catch {
    // Storage is optional.
  }
}

/** WordPress-style human time diff for editor meta ("a day ago"). */
export function formatRelativeTime(value: string | null): string {
  if (!value) return 'a few seconds ago';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'a few seconds ago';
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 45) return 'a few seconds ago';
  if (seconds < 90) return 'a minute ago';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;
  if (minutes < 90) return 'an hour ago';
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  if (hours < 36) return 'a day ago';
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks} weeks ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} months ago`;
  const years = Math.round(days / 365);
  return years === 1 ? 'a year ago' : `${years} years ago`;
}
