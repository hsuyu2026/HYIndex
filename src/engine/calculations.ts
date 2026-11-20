import {
  ACCUMULATION_FACTOR,
  AXIS_DEFINITIONS,
  ActualInfluenceResult,
  AxisKey,
  BASELINE_SCORE,
  CandlestickPoint,
  CompletenessLevel,
  DailyRecord,
  DailySnapshot,
  EmotionPolarity,
  FORMULA_VERSION,
  FOUR_INDEX_WEIGHT,
  HABIT_DEFINITIONS,
  HABIT_INDEX_WEIGHT,
  HabitId,
  INITIAL_HY_INDEX,
  InfluenceItem,
  MarketClosure,
  RecordMetrics,
  WeeklySettlement,
  getEmotionPolarity,
} from '../types/hy';
import {
  WeekBounds,
  addDaysTaipei,
  enumerateDates,
  enumerateWeeks,
  getDayBoundsTaipei,
  getLogicalTradingDate,
  getMonthKey,
  getNowTaipei,
  getWeekBoundsTaipei,
  getYearKey,
  taipeiDateTimeToMs,
} from '../utils/taipeiTime';

const HABIT_MAP: Record<HabitId, (typeof HABIT_DEFINITIONS)[number]> = HABIT_DEFINITIONS.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<HabitId, (typeof HABIT_DEFINITIONS)[number]>
);

export function formatIndex(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '--';
  return val.toFixed(2);
}

export function formatSigned(val: number | null | undefined, digits = 2): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '--';
  const rounded = Math.abs(val) < 1e-9 ? 0 : val;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(digits)}`;
}

export function isValidScore(val: number | null | undefined): val is number {
  return typeof val === 'number' && !Number.isNaN(val) && val >= 0 && val <= 100;
}

/**
 * Merges overlapping or adjacent closure intervals into sorted disjoint [startMs, endMs].
 */
export function getMergedClosureIntervals(
  closures: MarketClosure[],
  nowMs: number = Date.now()
): Array<{ startMs: number; endMs: number }> {
  if (closures.length === 0) return [];
  const intervals = closures
    .map((c) => {
      const startMs = Date.parse(c.startAt);
      const endMs = c.endAt ? Date.parse(c.endAt) : Math.max(nowMs, startMs);
      return { startMs, endMs };
    })
    .filter((i) => !Number.isNaN(i.startMs) && !Number.isNaN(i.endMs) && i.endMs >= i.startMs)
    .sort((a, b) => a.startMs - b.startMs);

  const merged: Array<{ startMs: number; endMs: number }> = [];
  for (const iv of intervals) {
    if (merged.length === 0) {
      merged.push({ ...iv });
    } else {
      const last = merged[merged.length - 1];
      if (iv.startMs <= last.endMs) {
        last.endMs = Math.max(last.endMs, iv.endMs);
      } else {
        merged.push({ ...iv });
      }
    }
  }
  return merged;
}

/**
 * Checks whether a specific timestamp falls inside any market closure interval [start, end).
 */
export function isTimestampClosed(timestampMs: number, closures: MarketClosure[]): boolean {
  for (const c of closures) {
    const startMs = Date.parse(c.startAt);
    if (Number.isNaN(startMs)) continue;
    if (c.endAt === null) {
      if (timestampMs >= startMs) return true;
    } else {
      const endMs = Date.parse(c.endAt);
      if (!Number.isNaN(endMs) && timestampMs >= startMs && timestampMs < endMs) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Checks whether an entire interval [rangeStartMs, rangeEndMs] is covered by closures.
 */
export function isIntervalFullyClosed(
  rangeStartMs: number,
  rangeEndMs: number,
  closures: MarketClosure[],
  nowMs: number = Date.now()
): boolean {
  const merged = getMergedClosureIntervals(closures, nowMs);
  for (const iv of merged) {
    if (iv.startMs <= rangeStartMs && iv.endMs >= rangeEndMs) {
      return true;
    }
  }
  return false;
}

export function isDateFullyClosed(
  dateStr: string,
  closures: MarketClosure[],
  nowMs: number = Date.now()
): boolean {
  const { startMs, endMs } = getDayBoundsTaipei(dateStr);
  return isIntervalFullyClosed(startMs, endMs, closures, nowMs);
}

export function isWeekFullyClosed(
  week: WeekBounds,
  closures: MarketClosure[],
  nowMs: number = Date.now()
): boolean {
  return isIntervalFullyClosed(week.startMs, week.endMs, closures, nowMs);
}

export function countClosedDaysInRange(
  startDate: string,
  endDate: string,
  closures: MarketClosure[],
  nowMs: number = Date.now()
): number {
  const dates = enumerateDates(startDate, endDate);
  let count = 0;
  for (const d of dates) {
    if (isDateFullyClosed(d, closures, nowMs)) count++;
  }
  return count;
}

export function getClosureDurationDays(closure: MarketClosure, nowMs: number = Date.now()): number {
  const startMs = Date.parse(closure.startAt);
  const endMs = closure.endAt ? Date.parse(closure.endAt) : Math.max(nowMs, startMs);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return 0;
  return Math.max(0, (endMs - startMs) / 86400000);
}

export function isRecordDuringClosure(record: DailyRecord, closures: MarketClosure[]): boolean {
  const ts = taipeiDateTimeToMs(record.date, record.time);
  return isTimestampClosed(ts, closures);
}

/**
 * Computes Four State Score S from four-axis averages.
 * Unfilled axes (null) are excluded; remaining weights are re-normalized.
 * 0 is a valid numeric value.
 */
export function computeStateScoreS(avg: RecordMetrics): { s: number | null; usedWeightW: number } {
  let weightedSum = 0;
  let usedWeightW = 0;

  for (const axis of AXIS_DEFINITIONS) {
    const val = avg[axis.key];
    if (isValidScore(val)) {
      weightedSum += axis.rawWeight * val;
      usedWeightW += axis.rawWeight;
    }
  }

  if (usedWeightW === 0) {
    return { s: null, usedWeightW: 0 };
  }

  return {
    s: weightedSum / usedWeightW,
    usedWeightW,
  };
}

/**
 * Computes Habit Score H = min(100, max(0, 50 + 10 * Hp)).
 * If no habits are checked, returns null (not calculated).
 */
export function computeHabitScoreH(habits: Iterable<HabitId>): {
  hp: number | null;
  h: number | null;
  uniqueHabits: HabitId[];
} {
  const uniqueSet = new Set<HabitId>();
  for (const id of habits) {
    if (HABIT_MAP[id]) uniqueSet.add(id);
  }
  if (uniqueSet.size === 0) {
    return { hp: null, h: null, uniqueHabits: [] };
  }
  let hp = 0;
  for (const id of uniqueSet) {
    hp += HABIT_MAP[id].points;
  }
  const h = Math.min(100, Math.max(0, 50 + 10 * hp));
  return {
    hp,
    h,
    uniqueHabits: Array.from(uniqueSet),
  };
}

/**
 * Computes Daily Composite Score St (v1.2.0):
 * - If S is null: St is null (even if habits are checked).
 * - If H is not null: St = FOUR_INDEX_WEIGHT * S + HABIT_INDEX_WEIGHT * H.
 * - If H is null: St = S.
 */
export function computeCompositeScoreT(s: number | null, h: number | null): number | null {
  if (s === null) return null;
  if (h !== null) {
    return FOUR_INDEX_WEIGHT * s + HABIT_INDEX_WEIGHT * h;
  }
  return s;
}

/**
 * Computes Daily Deviation Score Dt = St - BASELINE_SCORE (50).
 */
export function computeDeviationScore(totalScore: number | null): number | null {
  if (totalScore === null || Number.isNaN(totalScore)) return null;
  return totalScore - BASELINE_SCORE;
}

/**
 * Computes Daily HY Change = Dt * ACCUMULATION_FACTOR.
 */
export function computeDailyChange(deviationScore: number | null): number {
  if (deviationScore === null || Number.isNaN(deviationScore)) return 0;
  return deviationScore * ACCUMULATION_FACTOR;
}

/**
 * Computes Daily Snapshots for all dates that have records under v1.2.0 Cumulative Deviation Index:
 * - Starts from INITIAL_HY_INDEX (100).
 * - Only open-market records participate.
 * - Each valid trading day accumulates: HY_t = HY_{t-1} + (S_t - 50) * ACCUMULATION_FACTOR.
 * - Closed days or incomplete days (no 4-axis score) carry forward previous HY without adding deviation.
 */
export function computeDailySnapshots(
  records: DailyRecord[],
  closures: MarketClosure[],
  nowMs: number = Date.now()
): DailySnapshot[] {
  const byDate = new Map<string, DailyRecord[]>();
  for (const r of records) {
    const logicalDate = getLogicalTradingDate(r.date, r.time);
    const list = byDate.get(logicalDate) || [];
    list.push(r);
    byDate.set(logicalDate, list);
  }

  const dates = Array.from(byDate.keys()).sort();
  const snapshots: DailySnapshot[] = [];
  let cumulativeHY = INITIAL_HY_INDEX;

  for (const date of dates) {
    const dayRecords = byDate.get(date)!;
    const openRecords: DailyRecord[] = [];
    let closedRecordCount = 0;

    for (const r of dayRecords) {
      if (isRecordDuringClosure(r, closures)) {
        closedRecordCount++;
      } else {
        openRecords.push(r);
      }
    }

    const sums: Record<AxisKey, number> = {
      satisfaction: 0,
      performance: 0,
      mood: 0,
      energy: 0,
    };
    const counts: Record<AxisKey, number> = {
      satisfaction: 0,
      performance: 0,
      mood: 0,
      energy: 0,
    };
    const habitSet = new Set<HabitId>();

    for (const r of openRecords) {
      for (const axis of AXIS_DEFINITIONS) {
        const val = r.metrics[axis.key];
        if (isValidScore(val)) {
          sums[axis.key] += val;
          counts[axis.key] += 1;
        }
      }
      for (const hId of r.habits) {
        habitSet.add(hId);
      }
    }

    const fourAxisAvg: RecordMetrics = {
      satisfaction: counts.satisfaction > 0 ? sums.satisfaction / counts.satisfaction : null,
      performance: counts.performance > 0 ? sums.performance / counts.performance : null,
      mood: counts.mood > 0 ? sums.mood / counts.mood : null,
      energy: counts.energy > 0 ? sums.energy / counts.energy : null,
    };

    const { s, usedWeightW } = computeStateScoreS(fourAxisAvg);
    const { hp, h, uniqueHabits } = computeHabitScoreH(habitSet);
    const totalScore = computeCompositeScoreT(s, h);
    const isClosedDay = isDateFullyClosed(date, closures, nowMs);
    const isTradingDay = !isClosedDay && totalScore !== null;

    const deviationScore = isTradingDay ? computeDeviationScore(totalScore) : null;
    const dailyChange = isTradingDay ? computeDailyChange(deviationScore) : 0;
    const prevHY = cumulativeHY;

    if (isTradingDay) {
      cumulativeHY += dailyChange;
    }

    const changePercent =
      isTradingDay && prevHY !== 0 ? (dailyChange / Math.abs(prevHY)) * 100 : null;

    snapshots.push({
      date,
      isTradingDay,
      openRecordCount: openRecords.length,
      closedRecordCount,
      participatingRecordIds: openRecords.map((r) => r.id),
      allRecordIds: dayRecords.map((r) => r.id),
      fourAxisAvg,
      stateScoreS: s,
      usedWeightW,
      dailyHabits: uniqueHabits,
      habitPointsHp: hp,
      habitScoreH: h,
      totalScore,
      compositeScoreT: totalScore,
      baselineScore: BASELINE_SCORE,
      deviationScore,
      dailyChange,
      hyIndex: cumulativeHY,
      isClosedDay,
      changePoints: isTradingDay ? dailyChange : null,
      changePercent,
    });
  }

  return snapshots;
}

export function getCompletenessInfo(validDaysCount: number): {
  level: CompletenessLevel;
  label: string;
} {
  if (validDaysCount <= 0) return { level: 'none', label: '無有效資料，不結算' };
  if (validDaysCount <= 3) return { level: 'insufficient', label: '資料不足' };
  if (validDaysCount <= 5) return { level: 'fair', label: '資料尚可' };
  return { level: 'complete', label: '資料較完整' };
}

function emptyHabitCounts(): Record<HabitId, number> {
  return {
    regular_sleep: 0,
    reading: 0,
    good_rest: 0,
    late_sleep: 0,
    excess_screen: 0,
    procrastination: 0,
    indulgence: 0,
    late: 0,
  };
}

function buildPeriodAggregation(snapshots: DailySnapshot[]): {
  validDays: DailySnapshot[];
  avgTotalScore: number | null;
  weeklyDeviation: number;
  fourAxisAvg: RecordMetrics;
  avgHabitScore: number | null;
  habitCounts: Record<HabitId, number>;
  participatingRecordIds: string[];
  participatingDates: string[];
} {
  const validDays = snapshots.filter((d) => d.isTradingDay && d.totalScore !== null);
  const habitCounts = emptyHabitCounts();
  const axisSums: Record<AxisKey, number> = {
    satisfaction: 0,
    performance: 0,
    mood: 0,
    energy: 0,
  };
  const axisCounts: Record<AxisKey, number> = {
    satisfaction: 0,
    performance: 0,
    mood: 0,
    energy: 0,
  };

  let habitScoreSum = 0;
  let habitScoreDays = 0;
  let scoreSum = 0;
  let deviationSum = 0;
  const participatingRecordIds: string[] = [];
  const participatingDates: string[] = [];

  for (const day of validDays) {
    scoreSum += day.totalScore!;
    deviationSum += day.dailyChange;
    participatingDates.push(day.date);
    participatingRecordIds.push(...day.participatingRecordIds);

    for (const axis of AXIS_DEFINITIONS) {
      const val = day.fourAxisAvg[axis.key];
      if (isValidScore(val)) {
        axisSums[axis.key] += val;
        axisCounts[axis.key] += 1;
      }
    }

    if (day.habitScoreH !== null) {
      habitScoreSum += day.habitScoreH;
      habitScoreDays += 1;
    }

    for (const hId of day.dailyHabits) {
      habitCounts[hId] = (habitCounts[hId] || 0) + 1;
    }
  }

  const avgTotalScore = validDays.length > 0 ? scoreSum / validDays.length : null;
  const fourAxisAvg: RecordMetrics = {
    satisfaction: axisCounts.satisfaction > 0 ? axisSums.satisfaction / axisCounts.satisfaction : null,
    performance: axisCounts.performance > 0 ? axisSums.performance / axisCounts.performance : null,
    mood: axisCounts.mood > 0 ? axisSums.mood / axisCounts.mood : null,
    energy: axisCounts.energy > 0 ? axisSums.energy / axisCounts.energy : null,
  };
  const avgHabitScore = habitScoreDays > 0 ? habitScoreSum / habitScoreDays : null;

  return {
    validDays,
    avgTotalScore,
    weeklyDeviation: deviationSum,
    fourAxisAvg,
    avgHabitScore,
    habitCounts,
    participatingRecordIds,
    participatingDates,
  };
}

/**
 * Computes all formal weekly settlements for completed Monday-Sunday weeks (v1.2.0).
 * Weekly settlements do NOT reset the HY Index; they track:
 * - startHyIndex (carried over from previous week or 100)
 * - endHyIndex = startHyIndex + weeklyDeviation
 * - weeklyDeviation = sum(Dt * factor)
 * - highHyIndex / lowHyIndex across trading days in the week
 */
export function computeWeeklySettlements(
  records: DailyRecord[],
  closures: MarketClosure[],
  existingSettlements: WeeklySettlement[] = [],
  nowMs: number = Date.now()
): WeeklySettlement[] {
  if (records.length === 0) return [];

  const dailySnapshots = computeDailySnapshots(records, closures, nowMs);
  const snapshotByDate = new Map(dailySnapshots.map((s) => [s.date, s]));

  let minDate = getLogicalTradingDate(records[0].date, records[0].time);
  for (const r of records) {
    const ld = getLogicalTradingDate(r.date, r.time);
    if (ld < minDate) minDate = ld;
  }

  const todayTaipei = getNowTaipei(nowMs).logicalDate;
  const allWeeks = enumerateWeeks(minDate, todayTaipei);
  const existingMap = new Map(existingSettlements.map((w) => [w.weekId, w]));
  const settledAtFallback = new Date(nowMs).toISOString();

  const results: WeeklySettlement[] = [];
  let runningHY = INITIAL_HY_INDEX;

  for (const week of allWeeks) {
    if (week.endMs >= nowMs) continue;
    if (isWeekFullyClosed(week, closures, nowMs)) continue;

    const weekDates = enumerateDates(week.weekStart, week.weekEnd);
    const weekSnapshots = weekDates
      .map((d) => snapshotByDate.get(d))
      .filter((s): s is DailySnapshot => Boolean(s));

    const agg = buildPeriodAggregation(weekSnapshots);
    if (agg.validDays.length === 0 || agg.avgTotalScore === null) {
      continue;
    }

    const startHyIndex = runningHY;
    const weeklyDeviation = agg.weeklyDeviation;
    const endHyIndex = startHyIndex + weeklyDeviation;
    runningHY = endHyIndex;

    const dayHYs = agg.validDays.map((d) => d.hyIndex);
    const highHyIndex = Math.max(...dayHYs);
    const lowHyIndex = Math.min(...dayHYs);

    const closureDaysCount = countClosedDaysInRange(week.weekStart, week.weekEnd, closures, nowMs);
    const completenessInfo = getCompletenessInfo(agg.validDays.length);

    const prevSettlement = results.length > 0 ? results[results.length - 1] : null;
    const prevWeekId = prevSettlement ? prevSettlement.weekId : null;
    const prevWeekHY = prevSettlement ? prevSettlement.endHyIndex : null;

    const existing = existingMap.get(week.weekId);
    const isSameResult =
      existing &&
      existing.formulaVersion === FORMULA_VERSION &&
      Math.abs(existing.startHyIndex - startHyIndex) < 1e-9 &&
      Math.abs(existing.endHyIndex - endHyIndex) < 1e-9 &&
      Math.abs(existing.weeklyDeviation - weeklyDeviation) < 1e-9 &&
      Math.abs(existing.highHyIndex - highHyIndex) < 1e-9 &&
      Math.abs(existing.lowHyIndex - lowHyIndex) < 1e-9 &&
      Math.abs(existing.avgTotalScore - agg.avgTotalScore) < 1e-9 &&
      existing.validDaysCount === agg.validDays.length &&
      existing.closureDaysCount === closureDaysCount &&
      existing.participatingRecordIds.join(',') === agg.participatingRecordIds.join(',');

    results.push({
      weekId: week.weekId,
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      settledAt: isSameResult && existing ? existing.settledAt : settledAtFallback,
      startHyIndex,
      endHyIndex,
      weeklyDeviation,
      highHyIndex,
      lowHyIndex,
      avgTotalScore: agg.avgTotalScore,
      baselineScore: BASELINE_SCORE,
      twScore: agg.avgTotalScore,
      hyIndex: endHyIndex,
      prevWeekId,
      prevWeekHY,
      changePoints: weeklyDeviation,
      changePercent: null,
      validDaysCount: agg.validDays.length,
      completeness: completenessInfo.level,
      completenessLabel: completenessInfo.label,
      fourAxisAvg: agg.fourAxisAvg,
      avgHabitScore: agg.avgHabitScore,
      habitCounts: agg.habitCounts,
      closureDaysCount,
      participatingRecordIds: agg.participatingRecordIds,
      participatingDates: agg.participatingDates,
      formulaVersion: FORMULA_VERSION,
    });
  }

  return results;
}

export interface CurrentWeekSummary {
  weekId: string;
  weekStart: string;
  weekEnd: string;
  validDaysCount: number;
  completeness: CompletenessLevel;
  completenessLabel: string;
  startHyIndex: number;
  endHyIndex: number;
  weeklyDeviation: number;
  highHyIndex: number;
  lowHyIndex: number;
  avgTotalScore: number | null;
  twScore: number | null;
  hyIndex: number;
  fourAxisAvg: RecordMetrics;
  avgHabitScore: number | null;
  habitCounts: Record<HabitId, number>;
  closureDaysCount: number;
  isFullyClosed: boolean;
}

export function computeCurrentWeekProvisional(
  dailySnapshots: DailySnapshot[],
  closures: MarketClosure[],
  nowMs: number = Date.now()
): CurrentWeekSummary {
  const todayStr = getNowTaipei(nowMs).logicalDate;
  const week = getWeekBoundsTaipei(todayStr);
  const weekDates = enumerateDates(week.weekStart, week.weekEnd);
  const snapshotMap = new Map(dailySnapshots.map((s) => [s.date, s]));
  const weekSnapshots = weekDates
    .map((d) => snapshotMap.get(d))
    .filter((s): s is DailySnapshot => Boolean(s));

  let startHyIndex = INITIAL_HY_INDEX;
  for (const s of dailySnapshots) {
    if (s.date < week.weekStart && s.isTradingDay) {
      startHyIndex = s.hyIndex;
    }
  }

  const agg = buildPeriodAggregation(weekSnapshots);
  const weeklyDeviation = agg.weeklyDeviation;
  const endHyIndex = startHyIndex + weeklyDeviation;
  const dayHYs = agg.validDays.map((d) => d.hyIndex);
  const highHyIndex = dayHYs.length > 0 ? Math.max(...dayHYs) : startHyIndex;
  const lowHyIndex = dayHYs.length > 0 ? Math.min(...dayHYs) : startHyIndex;

  const completenessInfo = getCompletenessInfo(agg.validDays.length);
  const closureDaysCount = countClosedDaysInRange(week.weekStart, todayStr, closures, nowMs);
  const isFullyClosed = isWeekFullyClosed(week, closures, nowMs);

  return {
    weekId: week.weekId,
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    validDaysCount: agg.validDays.length,
    completeness: completenessInfo.level,
    completenessLabel: completenessInfo.label,
    startHyIndex,
    endHyIndex,
    weeklyDeviation,
    highHyIndex,
    lowHyIndex,
    avgTotalScore: agg.avgTotalScore,
    twScore: agg.avgTotalScore,
    hyIndex: endHyIndex,
    fourAxisAvg: agg.fourAxisAvg,
    avgHabitScore: agg.avgHabitScore,
    habitCounts: agg.habitCounts,
    closureDaysCount,
    isFullyClosed,
  };
}

export interface MarketQuote {
  isMarketClosed: boolean;
  activeClosure: MarketClosure | null;
  currentHY: number;
  previousHY: number;
  changePoints: number;
  changePercent: number | null;
  latestTotalScore: number | null;
  latestDeviation: number | null;
  quoteDate: string | null;
  isTodayQuote: boolean;
  hasAnyTradingDay: boolean;
  todaySnapshot: DailySnapshot | null;
  latestValidSnapshot: DailySnapshot | null;
  latestSettlement: WeeklySettlement | null;
}

export function computeCurrentMarketQuote(
  dailySnapshots: DailySnapshot[],
  closures: MarketClosure[],
  settlements: WeeklySettlement[],
  nowMs: number = Date.now()
): MarketQuote {
  const activeClosure = closures.find((c) => c.endAt === null) || null;
  const isMarketClosed = activeClosure !== null;
  const todayStr = getNowTaipei(nowMs).logicalDate;

  const todaySnapshot = dailySnapshots.find((s) => s.date === todayStr) || null;
  const validSnapshots = dailySnapshots.filter((s) => s.isTradingDay);
  const latestValidSnapshot =
    validSnapshots.length > 0 ? validSnapshots[validSnapshots.length - 1] : null;
  const latestSettlement =
    settlements.length > 0 ? settlements[settlements.length - 1] : null;

  if (!latestValidSnapshot) {
    return {
      isMarketClosed,
      activeClosure,
      currentHY: INITIAL_HY_INDEX,
      previousHY: INITIAL_HY_INDEX,
      changePoints: 0,
      changePercent: isMarketClosed ? 0 : null,
      latestTotalScore: null,
      latestDeviation: null,
      quoteDate: null,
      isTodayQuote: false,
      hasAnyTradingDay: false,
      todaySnapshot,
      latestValidSnapshot: null,
      latestSettlement,
    };
  }

  const isTodayQuote = !isMarketClosed && latestValidSnapshot.date === todayStr;
  const previousHY =
    validSnapshots.length >= 2
      ? validSnapshots[validSnapshots.length - 2].hyIndex
      : INITIAL_HY_INDEX;

  return {
    isMarketClosed,
    activeClosure,
    currentHY: latestValidSnapshot.hyIndex,
    previousHY,
    changePoints: isMarketClosed ? 0 : latestValidSnapshot.dailyChange,
    changePercent: isMarketClosed ? 0 : latestValidSnapshot.changePercent,
    latestTotalScore: latestValidSnapshot.totalScore,
    latestDeviation: latestValidSnapshot.deviationScore,
    quoteDate: latestValidSnapshot.date,
    isTodayQuote,
    hasAnyTradingDay: true,
    todaySnapshot,
    latestValidSnapshot,
    latestSettlement,
  };
}

export interface ComparablePeriod {
  label: string;
  fourAxisAvg: RecordMetrics;
  avgHabitScore: number | null;
}

/**
 * Actual Influence calculation comparing two periods (v1.2.0):
 * - Uses ONLY items valid in both periods.
 * - Re-normalizes four-axis weights across common valid axes.
 * - Includes habits (20%) only if both periods have valid habit scores.
 * - Under v1.2.0 cumulative deviation, deltaHYPoints = deltaCi * ACCUMULATION_FACTOR.
 */
export function computeActualInfluence(
  current: ComparablePeriod | null,
  previous: ComparablePeriod | null
): ActualInfluenceResult {
  if (!current || !previous) {
    return {
      status: 'insufficient',
      reason: '缺少可供比較的兩期有效資料（需至少兩週有效紀錄）',
      items: [],
      upwardDrivers: [],
      downwardDrivers: [],
      totalAbsContribution: 0,
      comparedPeriodLabel: '',
    };
  }

  const commonAxes = AXIS_DEFINITIONS.filter(
    (axis) =>
      isValidScore(current.fourAxisAvg[axis.key]) &&
      isValidScore(previous.fourAxisAvg[axis.key])
  );

  if (commonAxes.length === 0) {
    return {
      status: 'insufficient',
      reason: '兩週之間無共同有效填寫的四大狀態指數，無法比較實際影響力',
      items: [],
      upwardDrivers: [],
      downwardDrivers: [],
      totalAbsContribution: 0,
      comparedPeriodLabel: `${current.label} vs ${previous.label}`,
    };
  }

  const bothHaveHabits =
    current.avgHabitScore !== null &&
    previous.avgHabitScore !== null &&
    !Number.isNaN(current.avgHabitScore) &&
    !Number.isNaN(previous.avgHabitScore);

  const commonRawWeightSum = commonAxes.reduce((acc, a) => acc + a.rawWeight, 0);
  const fourAxisTotalShare = bothHaveHabits ? FOUR_INDEX_WEIGHT : 1.0;

  const items: InfluenceItem[] = [];

  for (const axis of commonAxes) {
    const effectiveWeight = fourAxisTotalShare * (axis.rawWeight / commonRawWeightSum);
    const currAvg = current.fourAxisAvg[axis.key]!;
    const prevAvg = previous.fourAxisAvg[axis.key]!;
    const currContrib = effectiveWeight * currAvg;
    const prevContrib = effectiveWeight * prevAvg;
    const deltaCi = currContrib - prevContrib;

    items.push({
      key: axis.key,
      label: axis.shortLabel,
      fixedWeight: axis.compositeWeight,
      effectiveWeight,
      currentAvg: currAvg,
      previousAvg: prevAvg,
      currentContribution: currContrib,
      previousContribution: prevContrib,
      deltaCi,
      deltaHYPoints: deltaCi * ACCUMULATION_FACTOR,
      impactSharePi: 0,
    });
  }

  if (bothHaveHabits) {
    const effectiveWeight = HABIT_INDEX_WEIGHT;
    const currAvg = current.avgHabitScore!;
    const prevAvg = previous.avgHabitScore!;
    const currContrib = effectiveWeight * currAvg;
    const prevContrib = effectiveWeight * prevAvg;
    const deltaCi = currContrib - prevContrib;

    items.push({
      key: 'habits',
      label: '習慣紀錄',
      fixedWeight: HABIT_INDEX_WEIGHT,
      effectiveWeight,
      currentAvg: currAvg,
      previousAvg: prevAvg,
      currentContribution: currContrib,
      previousContribution: prevContrib,
      deltaCi,
      deltaHYPoints: deltaCi * ACCUMULATION_FACTOR,
      impactSharePi: 0,
    });
  }

  const totalAbsContribution = items.reduce((acc, item) => acc + Math.abs(item.deltaCi), 0);

  if (totalAbsContribution < 1e-9) {
    return {
      status: 'no_change',
      reason: '兩週共同項目的加權貢獻總和無變動',
      items,
      upwardDrivers: [],
      downwardDrivers: [],
      totalAbsContribution: 0,
      comparedPeriodLabel: `${current.label} vs ${previous.label}`,
    };
  }

  for (const item of items) {
    item.impactSharePi = (Math.abs(item.deltaCi) / totalAbsContribution) * 100;
  }

  const upwardDrivers = items
    .filter((i) => i.deltaCi > 1e-9)
    .sort((a, b) => b.deltaCi - a.deltaCi);
  const downwardDrivers = items
    .filter((i) => i.deltaCi < -1e-9)
    .sort((a, b) => a.deltaCi - b.deltaCi);

  return {
    status: 'ok',
    items: [...items].sort((a, b) => b.impactSharePi - a.impactSharePi),
    upwardDrivers,
    downwardDrivers,
    totalAbsContribution,
    comparedPeriodLabel: `${current.label} vs ${previous.label}`,
  };
}

export type ChartTimeframe = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type ChartMetric = 'hy' | AxisKey;

export interface ChartDataPoint {
  date?: string;
  label: string;
  subLabel: string;
  hyIndex: number | null;
  changePoints: number | null;
  changePercent?: number | null;
  totalScore: number | null;
  deviationScore: number | null;
  highHyIndex?: number | null;
  lowHyIndex?: number | null;
  isClosedSegment: boolean;
  isCarryForward: boolean;
  isIncomplete: boolean;
  validDaysInfo: string;
}

export interface ChartDateRange {
  startDate?: string;
  endDate?: string;
}

function extractSnapshotMetricValue(snap: DailySnapshot | undefined, metric: ChartMetric): number | null {
  if (!snap) return null;
  if (metric === 'hy') {
    return snap.isTradingDay ? snap.hyIndex : null;
  }
  return snap.fourAxisAvg[metric];
}

function extractSettlementMetricValue(
  settlement: WeeklySettlement | undefined,
  metric: ChartMetric
): number | null {
  if (!settlement) return null;
  return metric === 'hy' ? settlement.endHyIndex : settlement.fourAxisAvg[metric];
}

function getMonthEndDate(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${monthKey}-${String(lastDay).padStart(2, '0')}`;
}

/**
 * Computes default trailing 7-day range for the Daily Chart:
 * Defaults to the trailing 7 days up to today (Asia/Taipei logical date).
 * If the user only has older historical data outside the trailing 7 days, anchors to the latest valid trading day.
 */
export function getDefaultDailyDateRange(
  dailySnapshots: DailySnapshot[],
  nowMs: number = Date.now(),
  metric: ChartMetric = 'hy'
): { startDate: string; endDate: string } {
  const todayStr = getNowTaipei(nowMs).logicalDate;
  const sevenDaysStart = addDaysTaipei(todayStr, -6);
  const validSnaps = dailySnapshots.filter(
    (s) => extractSnapshotMetricValue(s, metric) !== null
  );

  if (validSnaps.length === 0) {
    return { startDate: sevenDaysStart, endDate: todayStr };
  }

  const hasRecent = validSnaps.some((s) => s.date >= sevenDaysStart && s.date <= todayStr);
  if (hasRecent) {
    return { startDate: sevenDaysStart, endDate: todayStr };
  }

  const latestDate = validSnaps[validSnaps.length - 1].date;
  return {
    startDate: addDaysTaipei(latestDate, -6),
    endDate: latestDate,
  };
}

/**
 * Aggregates official daily HY snapshots into Weekly, Monthly, or Yearly Candlestick OHLC points (v1.3.0):
 * - Single source of truth: ONLY valid open-market trading day snapshots participate.
 * - O_p = HY_first, H_p = max(HY_1..HY_n), L_p = min(HY_1..HY_n), C_p = HY_last.
 * - Groups strictly by natural Monday-Sunday week, natural calendar month (YYYY-MM), or calendar year (YYYY).
 * - Closed days and missing dates never fabricate independent points.
 * - Ongoing periods are marked with isIncomplete: true ("未完成").
 */
export function buildCandlestickSeries(
  timeframe: 'weekly' | 'monthly' | 'yearly',
  dailySnapshots: DailySnapshot[],
  nowMs: number = Date.now(),
  metric: ChartMetric = 'hy',
  dateRange?: ChartDateRange
): CandlestickPoint[] {
  const validSnaps = dailySnapshots
    .filter((s) => extractSnapshotMetricValue(s, metric) !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (validSnaps.length === 0) return [];

  const nowTaipei = getNowTaipei(nowMs);
  const currentMonthKey = getMonthKey(nowTaipei.logicalDate);
  const currentYearKey = getYearKey(nowTaipei.logicalDate);

  type BucketMeta = {
    periodId: string;
    label: string;
    subLabel: string;
    startDate: string;
    endDate: string;
    isIncomplete: boolean;
    snaps: DailySnapshot[];
  };

  const buckets = new Map<string, BucketMeta>();

  for (const snap of validSnaps) {
    if (timeframe === 'weekly') {
      const wb = getWeekBoundsTaipei(snap.date);
      let bucket = buckets.get(wb.weekId);
      if (!bucket) {
        bucket = {
          periodId: wb.weekId,
          label: wb.weekId,
          subLabel: `${wb.weekId}（${wb.weekStart} ~ ${wb.weekEnd}）`,
          startDate: wb.weekStart,
          endDate: wb.weekEnd,
          isIncomplete: wb.endMs >= nowMs,
          snaps: [],
        };
        buckets.set(wb.weekId, bucket);
      }
      bucket.snaps.push(snap);
    } else if (timeframe === 'monthly') {
      const mk = getMonthKey(snap.date);
      let bucket = buckets.get(mk);
      if (!bucket) {
        const startDate = `${mk}-01`;
        const endDate = getMonthEndDate(mk);
        bucket = {
          periodId: mk,
          label: mk,
          subLabel: `${mk} 月 K 線（${startDate} ~ ${endDate}）`,
          startDate,
          endDate,
          isIncomplete: mk >= currentMonthKey,
          snaps: [],
        };
        buckets.set(mk, bucket);
      }
      bucket.snaps.push(snap);
    } else {
      const yk = getYearKey(snap.date);
      let bucket = buckets.get(yk);
      if (!bucket) {
        const startDate = `${yk}-01-01`;
        const endDate = `${yk}-12-31`;
        bucket = {
          periodId: yk,
          label: yk,
          subLabel: `${yk} 年 K 線（${startDate} ~ ${endDate}）`,
          startDate,
          endDate,
          isIncomplete: yk >= currentYearKey,
          snaps: [],
        };
        buckets.set(yk, bucket);
      }
      bucket.snaps.push(snap);
    }
  }

  const candles: CandlestickPoint[] = [];
  const sortedBuckets = Array.from(buckets.values()).sort((a, b) =>
    a.startDate.localeCompare(b.startDate)
  );

  for (const bucket of sortedBuckets) {
    const vals = bucket.snaps
      .map((s) => extractSnapshotMetricValue(s, metric))
      .filter((v): v is number => v !== null);
    if (vals.length === 0) continue;

    const firstTradingDate = bucket.snaps[0].date;
    const lastTradingDate = bucket.snaps[bucket.snaps.length - 1].date;

    if (dateRange?.startDate && lastTradingDate < dateRange.startDate) continue;
    if (dateRange?.endDate && firstTradingDate > dateRange.endDate) continue;

    const open = vals[0];
    const high = Math.max(...vals);
    const low = Math.min(...vals);
    const close = vals[vals.length - 1];
    const change = close - open;
    const changePercent = open !== 0 ? (change / Math.abs(open)) * 100 : null;

    candles.push({
      periodId: bucket.periodId,
      label: bucket.label,
      subLabel: bucket.subLabel,
      startDate: bucket.startDate,
      endDate: bucket.endDate,
      firstTradingDate,
      lastTradingDate,
      open,
      high,
      low,
      close,
      change,
      changePercent,
      tradingDaysCount: bucket.snaps.length,
      isIncomplete: bucket.isIncomplete,
    });
  }

  return candles;
}

export function buildChartSeries(
  timeframe: ChartTimeframe,
  dailySnapshots: DailySnapshot[],
  settlements: WeeklySettlement[],
  closures: MarketClosure[],
  nowMs: number = Date.now(),
  metric: ChartMetric = 'hy',
  dateRange?: ChartDateRange
): ChartDataPoint[] {
  const todayStr = getNowTaipei(nowMs).logicalDate;

  if (timeframe === 'daily') {
    const validSnaps = dailySnapshots.filter(
      (s) => extractSnapshotMetricValue(s, metric) !== null
    );
    if (validSnaps.length === 0) return [];

    const minDate = validSnaps[0].date;
    const maxDate =
      dateRange?.endDate && dateRange.endDate > todayStr ? dateRange.endDate : todayStr;
    const dates = enumerateDates(minDate, maxDate);
    const snapMap = new Map(dailySnapshots.map((s) => [s.date, s]));
    const points: ChartDataPoint[] = [];

    let lastValidVal: number | null = metric === 'hy' ? INITIAL_HY_INDEX : null;
    for (const d of dates) {
      const snap = snapMap.get(d);
      const closed = isDateFullyClosed(d, closures, nowMs);
      const val = extractSnapshotMetricValue(snap, metric);

      if (closed) {
        points.push({
          date: d,
          label: d.slice(5),
          subLabel: `${d}（休市凍結）`,
          hyIndex: lastValidVal,
          changePoints: 0,
          changePercent: 0,
          totalScore: null,
          deviationScore: null,
          isClosedSegment: true,
          isCarryForward: false,
          isIncomplete: false,
          validDaysInfo: '休市期間不累積偏離',
        });
      } else if (val !== null && snap) {
        const delta =
          metric === 'hy'
            ? snap.dailyChange
            : lastValidVal !== null
              ? val - lastValidVal
              : null;
        const pct =
          metric === 'hy'
            ? snap.changePercent
            : lastValidVal !== null && lastValidVal !== 0 && delta !== null
              ? (delta / Math.abs(lastValidVal)) * 100
              : null;
        lastValidVal = val;
        points.push({
          date: d,
          label: d.slice(5),
          subLabel: `${d}（開市交易日）`,
          hyIndex: val,
          changePoints: delta,
          changePercent: pct,
          totalScore: metric === 'hy' ? snap.totalScore : val,
          deviationScore: metric === 'hy' ? snap.deviationScore : null,
          isClosedSegment: false,
          isCarryForward: false,
          isIncomplete: false,
          validDaysInfo: `開市有效紀錄 ${snap.openRecordCount} 筆`,
        });
      } else {
        points.push({
          date: d,
          label: d.slice(5),
          subLabel: `${d}（無紀錄 · 沿用前值）`,
          hyIndex: lastValidVal,
          changePoints: 0,
          changePercent: 0,
          totalScore: null,
          deviationScore: null,
          isClosedSegment: false,
          isCarryForward: true,
          isIncomplete: false,
          validDaysInfo: '當日無有效數值紀錄，維持前值',
        });
      }
    }

    if (dateRange?.startDate || dateRange?.endDate) {
      return points.filter((p) => {
        if (!p.date) return true;
        if (dateRange.startDate && p.date < dateRange.startDate) return false;
        if (dateRange.endDate && p.date > dateRange.endDate) return false;
        return true;
      });
    }
    return points;
  }

  if (timeframe === 'weekly') {
    const validSettlements = settlements.filter(
      (s) => extractSettlementMetricValue(s, metric) !== null
    );
    if (validSettlements.length === 0) return [];
    const firstWeekStart = validSettlements[0].weekStart;
    const lastWeekEnd = validSettlements[validSettlements.length - 1].weekEnd;
    const allWeeks = enumerateWeeks(firstWeekStart, lastWeekEnd);
    const settledMap = new Map(settlements.map((s) => [s.weekId, s]));

    let lastValidVal: number | null = metric === 'hy' ? INITIAL_HY_INDEX : null;
    return allWeeks.map((w) => {
      const settled = settledMap.get(w.weekId);
      const fullyClosed = isWeekFullyClosed(w, closures, nowMs);
      const val = extractSettlementMetricValue(settled, metric);

      if (fullyClosed) {
        return {
          label: w.weekId,
          subLabel: `${w.weekStart} ~ ${w.weekEnd}（整週休市）`,
          hyIndex: lastValidVal,
          changePoints: 0,
          totalScore: null,
          deviationScore: null,
          isClosedSegment: true,
          isCarryForward: false,
          isIncomplete: false,
          validDaysInfo: '整週休市（維持前值）',
        };
      }
      if (settled && val !== null) {
        const delta =
          metric === 'hy'
            ? settled.weeklyDeviation
            : lastValidVal !== null
              ? val - lastValidVal
              : null;
        lastValidVal = val;
        return {
          label: w.weekId,
          subLabel: `${settled.weekStart} ~ ${settled.weekEnd}`,
          hyIndex: val,
          changePoints: delta,
          totalScore: metric === 'hy' ? settled.avgTotalScore : val,
          deviationScore: metric === 'hy' ? settled.weeklyDeviation : null,
          highHyIndex: metric === 'hy' ? settled.highHyIndex : null,
          lowHyIndex: metric === 'hy' ? settled.lowHyIndex : null,
          isClosedSegment: settled.closureDaysCount > 0,
          isCarryForward: false,
          isIncomplete: settled.completeness === 'insufficient',
          validDaysInfo: `有效 ${settled.validDaysCount} 天 · ${settled.completenessLabel}`,
        };
      }
      return {
        label: w.weekId,
        subLabel: `${w.weekStart} ~ ${w.weekEnd}（無紀錄 · 沿用前週）`,
        hyIndex: lastValidVal,
        changePoints: 0,
        totalScore: null,
        deviationScore: null,
        isClosedSegment: false,
        isCarryForward: true,
        isIncomplete: false,
        validDaysInfo: '該週無有效開市資料，維持前週數值',
      };
    });
  }

  if (timeframe === 'monthly') {
    const validSnaps = dailySnapshots.filter(
      (s) => extractSnapshotMetricValue(s, metric) !== null
    );
    if (validSnaps.length === 0) return [];
    const byMonth = new Map<string, DailySnapshot[]>();
    for (const s of validSnaps) {
      const mk = getMonthKey(s.date);
      const list = byMonth.get(mk) || [];
      list.push(s);
      byMonth.set(mk, list);
    }
    const months = Array.from(byMonth.keys()).sort();
    let prevVal: number | null = metric === 'hy' ? INITIAL_HY_INDEX : null;
    return months.map((m) => {
      const list = byMonth.get(m)!;
      if (metric === 'hy') {
        const closeHY = list[list.length - 1].hyIndex;
        const monthDev = list.reduce((acc, s) => acc + s.dailyChange, 0);
        const avgSt = list.reduce((acc, s) => acc + (s.totalScore ?? 0), 0) / list.length;
        const highHY = Math.max(...list.map((s) => s.hyIndex));
        const lowHY = Math.min(...list.map((s) => s.hyIndex));
        prevVal = closeHY;
        return {
          label: m,
          subLabel: `${m}（月末累積 HY）`,
          hyIndex: closeHY,
          changePoints: monthDev,
          totalScore: avgSt,
          deviationScore: monthDev,
          highHyIndex: highHY,
          lowHyIndex: lowHY,
          isClosedSegment: false,
          isCarryForward: false,
          isIncomplete: list.length < 10,
          validDaysInfo: `有效開市 ${list.length} 天${list.length < 10 ? ' · 資料較少' : ''}`,
        };
      }

      const vals = list.map((s) => extractSnapshotMetricValue(s, metric)!);
      const avgVal = vals.reduce((acc, v) => acc + v, 0) / vals.length;
      const delta = prevVal !== null ? avgVal - prevVal : null;
      prevVal = avgVal;
      return {
        label: m,
        subLabel: `${m}（月均）`,
        hyIndex: avgVal,
        changePoints: delta,
        totalScore: avgVal,
        deviationScore: null,
        isClosedSegment: false,
        isCarryForward: false,
        isIncomplete: list.length < 10,
        validDaysInfo: `有效開市 ${list.length} 天${list.length < 10 ? ' · 資料較少' : ''}`,
      };
    });
  }

  // yearly
  const validSnaps = dailySnapshots.filter(
    (s) => extractSnapshotMetricValue(s, metric) !== null
  );
  if (validSnaps.length === 0) return [];
  const byYear = new Map<string, DailySnapshot[]>();
  for (const s of validSnaps) {
    const yk = getYearKey(s.date);
    const list = byYear.get(yk) || [];
    list.push(s);
    byYear.set(yk, list);
  }
  const years = Array.from(byYear.keys()).sort();
  let prevVal: number | null = metric === 'hy' ? INITIAL_HY_INDEX : null;
  return years.map((y) => {
    const list = byYear.get(y)!;
    if (metric === 'hy') {
      const closeHY = list[list.length - 1].hyIndex;
      const yearDev = list.reduce((acc, s) => acc + s.dailyChange, 0);
      const avgSt = list.reduce((acc, s) => acc + (s.totalScore ?? 0), 0) / list.length;
      const highHY = Math.max(...list.map((s) => s.hyIndex));
      const lowHY = Math.min(...list.map((s) => s.hyIndex));
      prevVal = closeHY;
      return {
        label: y,
        subLabel: `${y}（年末累積 HY）`,
        hyIndex: closeHY,
        changePoints: yearDev,
        totalScore: avgSt,
        deviationScore: yearDev,
        highHyIndex: highHY,
        lowHyIndex: lowHY,
        isClosedSegment: false,
        isCarryForward: false,
        isIncomplete: list.length < 30,
        validDaysInfo: `有效開市 ${list.length} 天${list.length < 30 ? ' · 資料較少' : ''}`,
      };
    }

    const vals = list.map((s) => extractSnapshotMetricValue(s, metric)!);
    const avgVal = vals.reduce((acc, v) => acc + v, 0) / vals.length;
    const delta = prevVal !== null ? avgVal - prevVal : null;
    prevVal = avgVal;
    return {
      label: y,
      subLabel: `${y}（年均）`,
      hyIndex: avgVal,
      changePoints: delta,
      totalScore: avgVal,
      deviationScore: null,
      isClosedSegment: false,
      isCarryForward: false,
      isIncomplete: list.length < 30,
      validDaysInfo: `有效開市 ${list.length} 天${list.length < 30 ? ' · 資料較少' : ''}`,
    };
  });
}

/**
 * Generates full AI Analysis Prompt for a Weekly Settlement (v1.2.0 Cumulative Deviation).
 * Never presents HY Index or HY changes in percentages.
 */
export function generateWeeklyAIPrompt(
  settlement: WeeklySettlement,
  prevSettlement: WeeklySettlement | null,
  weekRecords: DailyRecord[],
  influence: ActualInfluenceResult
): string {
  const openRecordSet = new Set(settlement.participatingRecordIds);
  const participatingRecords = weekRecords
    .filter((r) => openRecordSet.has(r.id))
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

  const axisLines = AXIS_DEFINITIONS.map((axis) => {
    const currVal = settlement.fourAxisAvg[axis.key];
    const prevVal = prevSettlement ? prevSettlement.fourAxisAvg[axis.key] : null;
    const diff =
      currVal !== null && prevVal !== null ? formatSigned(currVal - prevVal, 2) : '--';
    return `- ${axis.label}（權重 ${(axis.compositeWeight * 100).toFixed(0)}%）：本週 ${
      currVal !== null ? currVal.toFixed(2) : '未記錄'
    } ｜ 上週 ${prevVal !== null ? prevVal.toFixed(2) : '無資料'} ｜ 變化 ${diff}`;
  }).join('\n');

  const habitLines = HABIT_DEFINITIONS.map((h) => {
    const count = settlement.habitCounts[h.id] || 0;
    const ptsStr = h.points > 0 ? `+${h.points}` : `${h.points}`;
    return `- ${h.label}（${ptsStr} 分）：本週出現 ${count} 天`;
  }).join('\n');

  const influenceLines =
    influence.status === 'ok'
      ? influence.items
          .map(
            (item) =>
              `- ${item.label}：實際影響力佔比 ${item.impactSharePi.toFixed(1)}% ｜ 項目貢獻變化 ${formatSigned(
                item.deltaCi,
                2
              )} 分（日均影響 ${formatSigned(item.deltaHYPoints, 2)} HY 點）`
          )
          .join('\n')
      : `- ${influence.reason || '資料不足，無法計算兩週實際影響力比較'}`;

  const emotionMap = new Map<string, number>();
  const bodyMap = new Map<string, number>();
  for (const r of participatingRecords) {
    for (const e of r.emotionTags) emotionMap.set(e, (emotionMap.get(e) || 0) + 1);
    for (const b of r.bodyTags) bodyMap.set(b, (bodyMap.get(b) || 0) + 1);
  }

  const emotionSummary =
    emotionMap.size > 0
      ? Array.from(emotionMap.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${k}(${v})`)
          .join('、')
      : '無';
  const bodySummary =
    bodyMap.size > 0
      ? Array.from(bodyMap.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${k}(${v})`)
          .join('、')
      : '無';

  const notesText = participatingRecords
    .map((r) => {
      const parts: string[] = [];
      if (r.notes.events.trim()) parts.push(`  今天發生的事：${r.notes.events.trim()}`);
      if (r.notes.satisfactionReason.trim())
        parts.push(`  現狀滿意度評估理由：${r.notes.satisfactionReason.trim()}`);
      if (r.notes.performanceReason.trim())
        parts.push(`  自我表現評估理由：${r.notes.performanceReason.trim()}`);
      if (r.notes.goodPoints.trim()) parts.push(`  做得好的地方：${r.notes.goodPoints.trim()}`);
      if (r.notes.improvements.trim())
        parts.push(`  覺得可以改進的地方：${r.notes.improvements.trim()}`);
      if (r.notes.moodDiary.trim()) parts.push(`  心情日記：${r.notes.moodDiary.trim()}`);
      if (parts.length === 0) return null;
      return `[${r.date} ${r.time}]\n${parts.join('\n')}`;
    })
    .filter(Boolean)
    .join('\n\n');

  return `【角色設定】
你是一位客觀、冷靜且具備量化思維的個人生活狀態分析顧問，擅長解讀「HY綜合指數（HY INDEX · 每日偏離基準分數累積制 v${FORMULA_VERSION}）」週報數據與主觀紀錄。請以分析報告的語氣回應，避免說教、避免過度樂觀或悲觀，並嚴格遵守數據與事實。

【本週結算總覽（${settlement.weekId}｜${settlement.weekStart} 至 ${settlement.weekEnd}）】
- 固定參數：初始基期 HY = ${INITIAL_HY_INDEX.toFixed(2)}，每日基準分數 = ${BASELINE_SCORE.toFixed(2)}，累積係數 = ${ACCUMULATION_FACTOR}
- 本週期初 HY 指數：${settlement.startHyIndex.toFixed(2)}
- 本週期末正式 HY 指數：${settlement.endHyIndex.toFixed(2)}
- 本週累積偏離點數 (Wt = ΣDt)：${formatSigned(settlement.weeklyDeviation, 2)} 點
- 本週最高 / 最低 HY：${settlement.highHyIndex.toFixed(2)} / ${settlement.lowHyIndex.toFixed(2)}
- 本週日均綜合分數 (Avg St)：${settlement.avgTotalScore.toFixed(2)}（相對於基準 ${BASELINE_SCORE}）
- 有效紀錄天數：${settlement.validDaysCount} 天（資料完整度：${settlement.completenessLabel}）
- 休市天數：${settlement.closureDaysCount} 天（休市期間不產生偏離分數，維持前值）

【四大狀態指數變化（佔每日綜合分數 80%）】
${axisLines}

【習慣紀錄統計（佔每日綜合分數 20%，當週習慣平均分數：${
    settlement.avgHabitScore !== null ? settlement.avgHabitScore.toFixed(2) : '未記錄'
  }）】
${habitLines}

【各項目實際影響力分析（與前週比較）】
${influenceLines}

【標籤統計】
- 情緒標籤：${emotionSummary}
- 身體狀態標籤：${bodySummary}

【本週文字紀錄明細】
${notesText || '（本週無文字紀錄）'}

【AI 分析任務要求】
請根據以上完整資料，依序完成以下 9 項分析任務：
1. 說明本週累積偏離點數（正偏離／負偏離）與 HY 指數變化的主要原因。
2. 找出四大狀態指數中變化最大的項目，並說明其變化脈絡。
3. 分析正面習慣與負面習慣的出現情況，以及對狀態的實際關聯。
4. 從文字紀錄與標籤中，找出可能的情緒或狀態觸發因素。
5. 比較本週與前一週的整體狀態差異（若無上週資料請明確說明）。
6. 根據「覺得可以改進的地方」提出具體、可執行的改善方式。
7. 明確區分「客觀數據／文字事實」與「你的推測假設」。
8. 嚴禁進行任何醫療或心理疾病診斷。
9. 秉持中性原則：不可將指數上漲視為必然的成功，也不可將指數下跌視為個人的失敗。`;
}

export interface ForecastTimelinePoint {
  date: string;
  label: string;
  actualHY: number | null;
  forecastHY: number | null;
  isForecast: boolean;
  isClosedSegment: boolean;
  isCarryForward: boolean;
  deviationScore: number | null;
  totalScore: number | null;
}

export interface ForecastFactorDriver {
  key: AxisKey | 'habits';
  label: string;
  recordedDays: number;
  avgScore: number | null;
  avgDailyDeviation: number; // Contribution to (St - 50) averaged across valid days
  projected7dImpact: number; // avgDailyDeviation * 7 * ACCUMULATION_FACTOR
  impactSharePercent: number;
}

export interface ForecastHabitDriver {
  id: HabitId;
  label: string;
  polarity: 'positive' | 'negative';
  points: number;
  days: number;
  totalPointsImpact: number;
}

export interface ForecastEmotionStat {
  tag: string;
  count: number;
  polarity: EmotionPolarity;
}

export interface ForecastEvidenceClue {
  recordId: string;
  date: string;
  time: string;
  logicalDate: string;
  deviationScore: number;
  totalScore: number;
  highlights: Array<{ label: string; text: string }>;
}

export interface TrendForecastResult {
  hasEnoughData: boolean;
  windowStart: string;
  windowEnd: string;
  todayDate: string;
  validDaysCount: number;
  avgTotalScore30d: number | null;
  avgDeviation30d: number | null;
  projectedDailyChange: number;
  anchorHY: number;
  projectedEndHY: number;
  projected7dChange: number;
  projected7dPercent: number | null;
  trendDirection: 'up' | 'down' | 'flat';
  timeline: ForecastTimelinePoint[];
  factorDrivers: ForecastFactorDriver[];
  habitDrivers: ForecastHabitDriver[];
  emotionStats: ForecastEmotionStat[];
  bodyStats: Array<{ tag: string; count: number }>;
  evidenceClues: ForecastEvidenceClue[];
  causeSummaryLines: string[];
}

/**
 * Computes 7-day potential HY Index forecast based on the trailing 30-day average deviation score (v1.1.3),
 * and extracts deterministic historical root causes (4-axis/habit contributions, tags, and text clues).
 */
export function computeTrendForecast(
  dailySnapshots: DailySnapshot[],
  records: DailyRecord[],
  closures: MarketClosure[],
  nowMs: number = Date.now()
): TrendForecastResult {
  const todayDate = getNowTaipei(nowMs).logicalDate;
  const windowStart = addDaysTaipei(todayDate, -29);
  const windowEnd = todayDate;

  const windowValidSnaps = dailySnapshots
    .filter(
      (s) =>
        s.date >= windowStart &&
        s.date <= windowEnd &&
        s.isTradingDay &&
        s.deviationScore !== null &&
        s.totalScore !== null
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const validDaysCount = windowValidSnaps.length;

  if (validDaysCount === 0) {
    return {
      hasEnoughData: false,
      windowStart,
      windowEnd,
      todayDate,
      validDaysCount: 0,
      avgTotalScore30d: null,
      avgDeviation30d: null,
      projectedDailyChange: 0,
      anchorHY: INITIAL_HY_INDEX,
      projectedEndHY: INITIAL_HY_INDEX,
      projected7dChange: 0,
      projected7dPercent: null,
      trendDirection: 'flat',
      timeline: [],
      factorDrivers: [],
      habitDrivers: [],
      emotionStats: [],
      bodyStats: [],
      evidenceClues: [],
      causeSummaryLines: [],
    };
  }

  const avgTotalScore30d =
    windowValidSnaps.reduce((acc, s) => acc + (s.totalScore ?? 0), 0) / validDaysCount;
  const avgDeviation30d =
    windowValidSnaps.reduce((acc, s) => acc + (s.deviationScore ?? 0), 0) / validDaysCount;
  const projectedDailyChange = avgDeviation30d * ACCUMULATION_FACTOR;

  const latestValidSnap = windowValidSnaps[windowValidSnaps.length - 1];
  const anchorHY = latestValidSnap.hyIndex;
  const projected7dChange = projectedDailyChange * 7;
  const projectedEndHY = anchorHY + projected7dChange;
  const projected7dPercent = anchorHY !== 0 ? (projected7dChange / Math.abs(anchorHY)) * 100 : null;
  const trendDirection: 'up' | 'down' | 'flat' =
    projectedDailyChange > 1e-6 ? 'up' : projectedDailyChange < -1e-6 ? 'down' : 'flat';

  // Build 30-day actual timeline + 7-day dashed forecast timeline
  const snapMap = new Map(dailySnapshots.map((s) => [s.date, s]));
  const historyStart =
    windowValidSnaps[0].date > windowStart ? windowValidSnaps[0].date : windowStart;

  // Determine HY carried into historyStart from any prior trading days
  let lastValidHY = INITIAL_HY_INDEX;
  for (const s of dailySnapshots) {
    if (s.date < historyStart && s.isTradingDay) {
      lastValidHY = s.hyIndex;
    }
  }

  const timeline: ForecastTimelinePoint[] = [];
  const histDates = enumerateDates(historyStart, todayDate);
  for (const d of histDates) {
    const snap = snapMap.get(d);
    const closed = isDateFullyClosed(d, closures, nowMs);
    if (closed) {
      timeline.push({
        date: d,
        label: d.slice(5),
        actualHY: lastValidHY,
        forecastHY: d === todayDate ? anchorHY : null,
        isForecast: false,
        isClosedSegment: true,
        isCarryForward: false,
        deviationScore: null,
        totalScore: null,
      });
    } else if (snap && snap.isTradingDay) {
      lastValidHY = snap.hyIndex;
      timeline.push({
        date: d,
        label: d.slice(5),
        actualHY: snap.hyIndex,
        forecastHY: d === todayDate ? anchorHY : null,
        isForecast: false,
        isClosedSegment: false,
        isCarryForward: false,
        deviationScore: snap.deviationScore,
        totalScore: snap.totalScore,
      });
    } else {
      timeline.push({
        date: d,
        label: d.slice(5),
        actualHY: lastValidHY,
        forecastHY: d === todayDate ? anchorHY : null,
        isForecast: false,
        isClosedSegment: false,
        isCarryForward: true,
        deviationScore: null,
        totalScore: null,
      });
    }
  }

  // Append 7 future days seamlessly anchored at todayDate's anchorHY
  for (let k = 1; k <= 7; k++) {
    const futureDate = addDaysTaipei(todayDate, k);
    timeline.push({
      date: futureDate,
      label: futureDate.slice(5),
      actualHY: null,
      forecastHY: anchorHY + k * projectedDailyChange,
      isForecast: true,
      isClosedSegment: false,
      isCarryForward: false,
      deviationScore: avgDeviation30d,
      totalScore: avgTotalScore30d,
    });
  }

  // Factor attribution: decompose daily deviation Dt = St - 50 across 4 axes & habits
  const factorStats: Record<
    AxisKey | 'habits',
    { label: string; scoreSum: number; recordedDays: number; contribSum: number }
  > = {
    satisfaction: { label: '現狀滿意度', scoreSum: 0, recordedDays: 0, contribSum: 0 },
    performance: { label: '自我表現', scoreSum: 0, recordedDays: 0, contribSum: 0 },
    mood: { label: '心情指數', scoreSum: 0, recordedDays: 0, contribSum: 0 },
    energy: { label: '精力值', scoreSum: 0, recordedDays: 0, contribSum: 0 },
    habits: { label: '習慣紀錄', scoreSum: 0, recordedDays: 0, contribSum: 0 },
  };

  const habitDayCounts = emptyHabitCounts();

  for (const snap of windowValidSnaps) {
    const hasHabits = snap.habitScoreH !== null;
    const fourShare = hasHabits ? FOUR_INDEX_WEIGHT : 1.0;

    if (snap.usedWeightW > 0) {
      for (const axis of AXIS_DEFINITIONS) {
        const val = snap.fourAxisAvg[axis.key];
        if (isValidScore(val)) {
          const effWeight = fourShare * (axis.rawWeight / snap.usedWeightW);
          factorStats[axis.key].scoreSum += val;
          factorStats[axis.key].recordedDays += 1;
          factorStats[axis.key].contribSum += effWeight * (val - BASELINE_SCORE);
        }
      }
    }

    if (hasHabits && snap.habitScoreH !== null) {
      factorStats.habits.scoreSum += snap.habitScoreH;
      factorStats.habits.recordedDays += 1;
      factorStats.habits.contribSum += HABIT_INDEX_WEIGHT * (snap.habitScoreH - BASELINE_SCORE);
    }

    for (const hId of snap.dailyHabits) {
      habitDayCounts[hId] = (habitDayCounts[hId] || 0) + 1;
    }
  }

  const rawDrivers: ForecastFactorDriver[] = (
    ['satisfaction', 'performance', 'mood', 'energy', 'habits'] as Array<AxisKey | 'habits'>
  ).map((key) => {
    const st = factorStats[key];
    const avgDailyDeviation = st.contribSum / validDaysCount;
    return {
      key,
      label: st.label,
      recordedDays: st.recordedDays,
      avgScore: st.recordedDays > 0 ? st.scoreSum / st.recordedDays : null,
      avgDailyDeviation,
      projected7dImpact: avgDailyDeviation * 7 * ACCUMULATION_FACTOR,
      impactSharePercent: 0,
    };
  });

  const totalAbsContrib = rawDrivers.reduce((acc, d) => acc + Math.abs(d.avgDailyDeviation), 0);
  const factorDrivers = rawDrivers
    .map((d) => ({
      ...d,
      impactSharePercent: totalAbsContrib > 1e-9 ? (Math.abs(d.avgDailyDeviation) / totalAbsContrib) * 100 : 0,
    }))
    .sort((a, b) => Math.abs(b.avgDailyDeviation) - Math.abs(a.avgDailyDeviation));

  const habitDrivers: ForecastHabitDriver[] = HABIT_DEFINITIONS.map((h) => {
    const days = habitDayCounts[h.id] || 0;
    return {
      id: h.id,
      label: h.label,
      polarity: h.polarity,
      points: h.points,
      days,
      totalPointsImpact: days * h.points,
    };
  })
    .filter((h) => h.days > 0)
    .sort((a, b) => Math.abs(b.totalPointsImpact) - Math.abs(a.totalPointsImpact));

  // Tag & qualitative text clues from open-market records in [windowStart, windowEnd]
  const emotionMap = new Map<string, number>();
  const bodyMap = new Map<string, number>();
  const windowSnapByDate = new Map(windowValidSnaps.map((s) => [s.date, s]));
  const candidateClues: ForecastEvidenceClue[] = [];

  for (const r of records) {
    if (isRecordDuringClosure(r, closures)) continue;
    const ld = getLogicalTradingDate(r.date, r.time);
    if (ld < windowStart || ld > windowEnd) continue;

    for (const e of r.emotionTags) emotionMap.set(e, (emotionMap.get(e) || 0) + 1);
    for (const b of r.bodyTags) bodyMap.set(b, (bodyMap.get(b) || 0) + 1);

    const daySnap = windowSnapByDate.get(ld);
    if (!daySnap || daySnap.deviationScore === null || daySnap.totalScore === null) continue;

    const highlights: Array<{ label: string; text: string }> = [];
    if (r.notes.satisfactionReason.trim())
      highlights.push({ label: '滿意度評估理由', text: r.notes.satisfactionReason.trim() });
    if (r.notes.performanceReason.trim())
      highlights.push({ label: '自我表現評估理由', text: r.notes.performanceReason.trim() });
    if (trendDirection === 'down' && r.notes.improvements.trim())
      highlights.push({ label: '可改進處', text: r.notes.improvements.trim() });
    else if (trendDirection === 'up' && r.notes.goodPoints.trim())
      highlights.push({ label: '做得好', text: r.notes.goodPoints.trim() });
    if (r.notes.events.trim())
      highlights.push({ label: '發生事件', text: r.notes.events.trim() });
    if (r.notes.moodDiary.trim() && highlights.length < 3)
      highlights.push({ label: '心情日記', text: r.notes.moodDiary.trim() });

    if (highlights.length > 0) {
      candidateClues.push({
        recordId: r.id,
        date: r.date,
        time: r.time,
        logicalDate: ld,
        deviationScore: daySnap.deviationScore,
        totalScore: daySnap.totalScore,
        highlights: highlights.slice(0, 3),
      });
    }
  }

  const emotionStats: ForecastEmotionStat[] = Array.from(emotionMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count, polarity: getEmotionPolarity(tag) }));

  const bodyStats = Array.from(bodyMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }));

  const evidenceClues = candidateClues
    .sort((a, b) => {
      if (trendDirection === 'up') return b.deviationScore - a.deviationScore;
      if (trendDirection === 'down') return a.deviationScore - b.deviationScore;
      return `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`);
    })
    .slice(0, 5);

  // Deterministic plain-language causal summary
  const causeSummaryLines: string[] = [];
  causeSummaryLines.push(
    `過去 30 天（${windowStart} ~ ${windowEnd}）共計 ${validDaysCount} 個有效開市日，日均綜合分數為 ${avgTotalScore30d.toFixed(
      2
    )} 分，相較固定基準 ${BASELINE_SCORE} 分之平均每日偏離為 ${formatSigned(
      avgDeviation30d,
      2
    )} 點。`
  );

  const primaryDrivers = factorDrivers.filter((d) =>
    trendDirection === 'up'
      ? d.avgDailyDeviation > 0.05
      : trendDirection === 'down'
        ? d.avgDailyDeviation < -0.05
        : Math.abs(d.avgDailyDeviation) > 0.05
  );
  if (primaryDrivers.length > 0) {
    const topStr = primaryDrivers
      .slice(0, 2)
      .map(
        (d) =>
          `「${d.label}」（均分 ${d.avgScore !== null ? d.avgScore.toFixed(2) : '--'}，日均偏離貢獻 ${formatSigned(
            d.avgDailyDeviation,
            2
          )} 點）`
      )
      .join('與');
    causeSummaryLines.push(
      `驅動此走勢的最主要量化來源為${topStr}。`
    );
  }

  const topPosHabit = habitDrivers.find((h) => h.polarity === 'positive');
  const topNegHabit = habitDrivers.find((h) => h.polarity === 'negative');
  if (topPosHabit || topNegHabit) {
    const habitParts: string[] = [];
    if (topPosHabit) {
      habitParts.push(
        `正面習慣以「${topPosHabit.label}」最常出現（${topPosHabit.days} 天，累計 ${formatSigned(
          topPosHabit.totalPointsImpact,
          0
        )} 分）`
      );
    }
    if (topNegHabit) {
      habitParts.push(
        `負面習慣以「${topNegHabit.label}」影響最顯著（${topNegHabit.days} 天，累計 ${formatSigned(
          topNegHabit.totalPointsImpact,
          0
        )} 分）`
      );
    }
    causeSummaryLines.push(`習慣面向：${habitParts.join('；')}。`);
  }

  if (emotionStats.length > 0) {
    const topEmotions = emotionStats
      .slice(0, 3)
      .map((e) => `${e.tag}（${e.count} 次）`)
      .join('、');
    causeSummaryLines.push(`近 30 天高頻情緒標籤為：${topEmotions}。`);
  }

  return {
    hasEnoughData: true,
    windowStart,
    windowEnd,
    todayDate,
    validDaysCount,
    avgTotalScore30d,
    avgDeviation30d,
    projectedDailyChange,
    anchorHY,
    projectedEndHY,
    projected7dChange,
    projected7dPercent,
    trendDirection,
    timeline,
    factorDrivers,
    habitDrivers,
    emotionStats,
    bodyStats,
    evidenceClues,
    causeSummaryLines,
  };
}

