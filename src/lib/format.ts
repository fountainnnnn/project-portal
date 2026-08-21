/**
 * Date and duration wording, in one place so the admin and staff dashboards
 * cannot describe the same project two different ways.
 */

import type { Project } from './types';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Splits 'YYYY-MM-DD' by hand rather than through `new Date`. Passing a bare
 * date string to the Date constructor parses it as UTC midnight and then
 * renders it in the viewer's zone, which west of Greenwich shows the day
 * before. These are calendar dates, not instants; they should not move.
 */
function parts(iso: string): { day: number; month: number; year: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;

  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;

  return { year: Number(match[1]), month, day: Number(match[3]) };
}

/** 'YYYY-MM-DD' → '12 Jan 2027'; '' → ''. en-SG month-name style, no locale drift. */
export function formatDate(iso: string): string {
  const p = parts(iso);
  if (!p) return '';
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

/**
 * The one duration renderer, so both dashboards phrase it identically:
 *  - durationNote wins outright when non-empty.
 *  - else both dates:   '12 Jan – 20 Mar 2027' (year elided from start when equal)
 *  - else startsOn only: 'From 12 Jan 2027'
 *  - else endsOn only:   'Until 20 Mar 2027'
 *  - else:               'Timeline to be confirmed'
 */
export function formatDuration(
  p: Pick<Project, 'startsOn' | 'endsOn' | 'durationNote'>,
): string {
  const note = p.durationNote.trim();
  // An admin who typed "two semesters, flexible" meant that instead of the
  // dates, not alongside them.
  if (note) return note;

  const start = parts(p.startsOn);
  const end = parts(p.endsOn);

  if (start && end) {
    const startText =
      start.year === end.year
        ? `${start.day} ${MONTHS[start.month - 1]}` // '12 Jan – 20 Mar 2027'
        : formatDate(p.startsOn);
    return `${startText} – ${formatDate(p.endsOn)}`;
  }

  if (start) return `From ${formatDate(p.startsOn)}`;
  if (end) return `Until ${formatDate(p.endsOn)}`;

  return 'Timeline to be confirmed';
}
