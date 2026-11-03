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
  pattern = readPattern(DATE_PATTERN, 'Y/m/d'),
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
