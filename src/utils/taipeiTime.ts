const TAIPEI_TZ = 'Asia/Taipei';
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_CUTOFF_HOUR = 3; // Trading day ends at 03:00 AM next calendar day (Asia/Taipei)
const DAY_CUTOFF_MS = DAY_CUTOFF_HOUR * 60 * 60 * 1000;

export interface TaipeiNow {
  date: string;        // YYYY-MM-DD (civil date)
  logicalDate: string; // YYYY-MM-DD (trading day date where <03:00 counts as previous day)
  time: string;        // HH:mm
  timeWithSec: string; // HH:mm:ss
  dateTimeSec: string; // YYYY-MM-DD HH:mm:ss
  weekdayLabel: string;
  timestampMs: number;
}

const WEEKDAY_ZH = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

/**
 * Returns the current date/time strictly in Asia/Taipei (UTC+8).
 */
export function getNowTaipei(nowMs: number = Date.now()): TaipeiNow {
  const taipeiShifted = new Date(nowMs + TAIPEI_OFFSET_MS);
  const year = taipeiShifted.getUTCFullYear();
  const month = String(taipeiShifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(taipeiShifted.getUTCDate()).padStart(2, '0');
  const hour = String(taipeiShifted.getUTCHours()).padStart(2, '0');
  const minute = String(taipeiShifted.getUTCMinutes()).padStart(2, '0');
  const second = String(taipeiShifted.getUTCSeconds()).padStart(2, '0');
  const weekday = WEEKDAY_ZH[taipeiShifted.getUTCDay()];

  const date = `${year}-${month}-${day}`;
  const time = `${hour}:${minute}`;
  const timeWithSec = `${hour}:${minute}:${second}`;
  const logicalDate = getLogicalTradingDate(date, time);

  return {
    date,
    logicalDate,
    time,
    timeWithSec,
    dateTimeSec: `${date} ${timeWithSec}`,
    weekdayLabel: weekday,
    timestampMs: nowMs,
  };
}

/**
 * Formats any UTC epoch ms or ISO string into Asia/Taipei display strings.
 */
export function formatIsoToTaipei(isoOrMs: string | number): TaipeiNow {
  const ms = typeof isoOrMs === 'number' ? isoOrMs : Date.parse(isoOrMs);
  return getNowTaipei(Number.isNaN(ms) ? Date.now() : ms);
}

/**
 * Converts a YYYY-MM-DD + HH:mm (or HH:mm:ss) in Asia/Taipei to UTC epoch ms.
 */
export function taipeiDateTimeToMs(dateStr: string, timeStr: string = '00:00'): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const timeParts = timeStr.split(':').map(Number);
  const hh = timeParts[0] || 0;
  const mm = timeParts[1] || 0;
  const ss = timeParts[2] || 0;
  return Date.UTC(y, m - 1, d, hh, mm, ss, 0) - TAIPEI_OFFSET_MS;
}

/**
 * Resolves the logical trading date (YYYY-MM-DD) for a civil date + time in Asia/Taipei.
 * Any record from 00:00 to 02:59 belongs to the previous calendar day.
 * Example: 2026-11-20 00:21 -> 2026-11-19.
 */
export function getLogicalTradingDate(dateStr: string, timeStr: string = '12:00'): string {
  const ms = taipeiDateTimeToMs(dateStr, timeStr);
  const shifted = new Date(ms - DAY_CUTOFF_MS + TAIPEI_OFFSET_MS);
  const yy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Returns the exact [startMs, endMs] for a logical trading day (03:00:00.000 to next day 02:59:59.999 Taipei).
 */
export function getDayBoundsTaipei(logicalDateStr: string): { startMs: number; endMs: number } {
  const startMs = taipeiDateTimeToMs(logicalDateStr, '03:00:00');
  const endMs = startMs + 24 * 60 * 60 * 1000 - 1;
  return { startMs, endMs };
}

export function addDaysTaipei(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function enumerateDates(startDate: string, endDate: string): string[] {
  const result: string[] = [];
  if (startDate > endDate) return result;
  let curr = startDate;
  while (curr <= endDate) {
    result.push(curr);
    curr = addDaysTaipei(curr, 1);
  }
  return result;
}

export interface WeekBounds {
  weekId: string;    // ISO week e.g. "2026-W47"
  weekStart: string; // Monday logical date YYYY-MM-DD
  weekEnd: string;   // Sunday logical date YYYY-MM-DD
  startMs: number;   // Monday 03:00:00.000 Asia/Taipei
  endMs: number;     // Next Monday 02:59:59.999 Asia/Taipei (settlement at Monday 03:00)
}

/**
 * Computes Monday 03:00 to next Monday 02:59:59.999 in Asia/Taipei for a given logical date YYYY-MM-DD.
 * Weekly formal settlement runs after Monday 03:00 AM.
 */
export function getWeekBoundsTaipei(logicalDateStr: string): WeekBounds {
  const [y, m, d] = logicalDateStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = utcDate.getUTCDay(); // 0=Sun, 1=Mon, ...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const mondayStr = addDaysTaipei(logicalDateStr, diffToMonday);
  const sundayStr = addDaysTaipei(mondayStr, 6);
  const nextMondayStr = addDaysTaipei(mondayStr, 7);

  // ISO week number calculation based on Thursday of the week
  const thursdayStr = addDaysTaipei(mondayStr, 3);
  const [ty, tm, td] = thursdayStr.split('-').map(Number);
  const thursdayDate = new Date(Date.UTC(ty, tm - 1, td));
  const isoYear = thursdayDate.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const firstMonday = new Date(jan4.getTime() - (jan4Day - 1) * 86400000);
  const weekNum = Math.floor((thursdayDate.getTime() - firstMonday.getTime()) / (7 * 86400000)) + 1;
  const weekId = `${isoYear}-W${String(weekNum).padStart(2, '0')}`;

  const startMs = taipeiDateTimeToMs(mondayStr, '03:00:00');
  const endMs = taipeiDateTimeToMs(nextMondayStr, '03:00:00') - 1;

  return {
    weekId,
    weekStart: mondayStr,
    weekEnd: sundayStr,
    startMs,
    endMs,
  };
}

/**
 * Enumerates all Monday-Sunday weeks from startDateStr up to the week containing endDateStr.
 */
export function enumerateWeeks(startDateStr: string, endDateStr: string): WeekBounds[] {
  if (startDateStr > endDateStr) return [];
  const firstWeek = getWeekBoundsTaipei(startDateStr);
  const lastWeek = getWeekBoundsTaipei(endDateStr);
  const weeks: WeekBounds[] = [];
  let cursorMonday = firstWeek.weekStart;
  while (cursorMonday <= lastWeek.weekStart) {
    weeks.push(getWeekBoundsTaipei(cursorMonday));
    cursorMonday = addDaysTaipei(cursorMonday, 7);
  }
  return weeks;
}

export function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // YYYY-MM
}

export function getYearKey(dateStr: string): string {
  return dateStr.slice(0, 4); // YYYY
}

export { TAIPEI_TZ };
