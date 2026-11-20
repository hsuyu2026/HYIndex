export type PageId =
  | 'dashboard'
  | 'record'
  | 'history'
  | 'statistics'
  | 'forecast'
  | 'weekly'
  | 'market'
  | 'settings';

export type AxisKey = 'satisfaction' | 'performance' | 'mood' | 'energy';

export type HabitId =
  | 'regular_sleep'
  | 'reading'
  | 'good_rest'
  | 'late_sleep'
  | 'excess_screen'
  | 'procrastination'
  | 'indulgence'
  | 'late';

export interface AxisDefinition {
  key: AxisKey;
  label: string;
  shortLabel: string;
  rawWeight: number;      // 30, 25, 25, 20
  compositeWeight: number; // 24%, 20%, 20%, 16%
}

export interface HabitDefinition {
  id: HabitId;
  label: string;
  polarity: 'positive' | 'negative';
  points: number;
  iconName:
    | 'sunrise'
    | 'book-open'
    | 'bed'
    | 'moon'
    | 'smartphone'
    | 'clock'
    | 'activity'
    | 'alarm-clock';
}

export const FORMULA_VERSION = '1.1.3';

// Centralized HY Index parameters (fixed, never auto-adjusted by daily scores or weekly settlements)
export const BASELINE_SCORE = 50;
export const INITIAL_HY_INDEX = 100;
export const ACCUMULATION_FACTOR = 1;
export const FOUR_INDEX_WEIGHT = 0.8;
export const HABIT_INDEX_WEIGHT = 0.2;
export const BASE_INDEX = INITIAL_HY_INDEX;

export const AXIS_DEFINITIONS: AxisDefinition[] = [
  {
    key: 'satisfaction',
    label: '現狀與未來目標滿意度',
    shortLabel: '現狀滿意度',
    rawWeight: 30,
    compositeWeight: 0.24,
  },
  {
    key: 'performance',
    label: '自我狀態表現',
    shortLabel: '自我表現',
    rawWeight: 25,
    compositeWeight: 0.20,
  },
  {
    key: 'mood',
    label: '心情指數',
    shortLabel: '心情指數',
    rawWeight: 25,
    compositeWeight: 0.20,
  },
  {
    key: 'energy',
    label: '精力值',
    shortLabel: '精力值',
    rawWeight: 20,
    compositeWeight: 0.16,
  },
];

export const HABIT_DEFINITIONS: HabitDefinition[] = [
  { id: 'regular_sleep', label: '正常作息', polarity: 'positive', points: 2, iconName: 'sunrise' },
  { id: 'reading', label: '閱讀', polarity: 'positive', points: 3, iconName: 'book-open' },
  { id: 'good_rest', label: '好好休息', polarity: 'positive', points: 2, iconName: 'bed' },
  { id: 'late_sleep', label: '晚睡', polarity: 'negative', points: -2, iconName: 'moon' },
  { id: 'excess_screen', label: '3C 使用過量', polarity: 'negative', points: -2, iconName: 'smartphone' },
  { id: 'procrastination', label: '拖延', polarity: 'negative', points: -2, iconName: 'clock' },
  { id: 'indulgence', label: '縱慾', polarity: 'negative', points: -1, iconName: 'activity' },
  { id: 'late', label: '遲到', polarity: 'negative', points: -1, iconName: 'alarm-clock' },
];

export interface TagGroup {
  group: string;
  tags: string[];
}

export const EMOTION_TAG_GROUPS: TagGroup[] = [
  {
    group: '高能量負向 · 憤怒與攻擊性',
    tags: ['憤怒', '暴躁', '煩悶、不爽', '不甘心', '怨恨', '嫉妒', '被背叛的', '充滿敵意', '委屈不平', '氣急敗壞'],
  },
  {
    group: '高能量負向 · 焦慮與恐懼',
    tags: ['焦慮', '恐慌', '害怕', '不安 / 沒安全感', '擔憂', '窒息感', '驚惶失措', '煩躁不安', '疑神疑鬼', '尷尬'],
  },
  {
    group: '低能量負向 · 悲傷與耗竭',
    tags: ['悲傷', '無助', '絕望', '孤獨 / 寂寞', '沮喪', '空虛', '失望', '被遺棄的', '挫折感', '憂鬱', '無聊'],
  },
  {
    group: '正向情緒 · 愉悅 / 開心',
    tags: ['開心', '愉快', '快樂', '喜悅'],
  },
  {
    group: '正向情緒 · 成就 / 自信',
    tags: ['自豪', '自信', '成就感'],
  },
  {
    group: '正向情緒 · 安定 / 安全',
    tags: ['平靜', '踏實', '輕鬆', '安心'],
  },
  {
    group: '正向情緒 · 活力 / 興奮',
    tags: ['興奮', '振奮', '充滿活力', '驚喜'],
  },
  {
    group: '正向情緒 · 人際 / 連結',
    tags: ['溫暖', '幸福', '感動', '感恩'],
  },
  {
    group: '正向情緒 · 希望 / 期待',
    tags: ['有希望', '期待', '滿足'],
  },
];

export const DEFAULT_EMOTION_TAGS: string[] = EMOTION_TAG_GROUPS.flatMap((g) => g.tags);

const POSITIVE_EMOTION_TAG_SET = new Set<string>(
  EMOTION_TAG_GROUPS.filter((g) => g.group.includes('正向')).flatMap((g) => g.tags)
);
const NEGATIVE_EMOTION_TAG_SET = new Set<string>(
  EMOTION_TAG_GROUPS.filter((g) => g.group.includes('負向')).flatMap((g) => g.tags)
);

export type EmotionPolarity = 'positive' | 'negative' | 'neutral';

export function getEmotionPolarity(tag: string): EmotionPolarity {
  if (POSITIVE_EMOTION_TAG_SET.has(tag)) return 'positive';
  if (NEGATIVE_EMOTION_TAG_SET.has(tag)) return 'negative';
  return 'neutral';
}

export const DEFAULT_BODY_TAGS: string[] = [
  '疲憊 / 心累',
  '提不起勁',
  '麻木',
  '緊繃',
  '壓力山大',
  '逞強的',
  '略感疲倦',
  '輕微頭痛',
  '非常疲憊',
];

export const DEFAULT_NEED_TAGS: string[] = [
  '想被陪伴',
  '渴望被抱抱',
  '想獨處',
  '想安靜一下',
  '想逃離目前處境',
  '想找人聊天',
  '想被理解',
  '想休息',
  '想轉移注意力',
];

export interface RecordMetrics {
  satisfaction: number | null;
  performance: number | null;
  mood: number | null;
  energy: number | null;
}

export interface RecordNotes {
  events: string;             // 今天發生的事
  satisfactionReason: string; // 現狀與未來目標滿意度的評估理由
  performanceReason: string;  // 自我狀態表現的評估理由
  goodPoints: string;         // 做得好的地方
  improvements: string;       // 覺得可以改進的地方
  moodDiary: string;          // 心情日記
}

export interface DailyRecord {
  id: string;
  date: string; // YYYY-MM-DD (Asia/Taipei civil date)
  time: string; // HH:mm (Asia/Taipei civil time; < 03:00 belongs to previous logical trading day)
  metrics: RecordMetrics;
  notes: RecordNotes;
  emotionTags: string[];
  bodyTags: string[];
  needTags?: string[]; // 當下需求與調節傾向 (純紀錄，不列入計算與回顧)
  habits: HabitId[];
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export interface MarketClosure {
  id: string;
  startAt: string; // ISO string (representing Asia/Taipei instant)
  endAt: string | null; // ISO string or null if still closed
  reason: string;
  createdAt: string;
}

export type CompletenessLevel = 'none' | 'insufficient' | 'fair' | 'complete';

export interface DailySnapshot {
  date: string;
  isTradingDay: boolean; // True only if not fully closed and totalScore is valid
  openRecordCount: number;
  closedRecordCount: number;
  participatingRecordIds: string[];
  allRecordIds: string[];
  fourAxisAvg: RecordMetrics;
  stateScoreS: number | null; // S (0-100)
  usedWeightW: number;
  dailyHabits: HabitId[];
  habitPointsHp: number | null;
  habitScoreH: number | null; // H (0-100)
  totalScore: number | null; // St: weighted daily composite score
  compositeScoreT: number | null; // Alias for totalScore
  baselineScore: number; // Fixed BASELINE_SCORE = 50
  deviationScore: number | null; // Dt = St - 50 (null on non-trading days)
  dailyChange: number; // Dt * ACCUMULATION_FACTOR (0 on non-trading / closed days)
  hyIndex: number; // Cumulative HY Index: HY_t = HY_{t-1} + dailyChange
  isClosedDay: boolean; // Entire calendar day covered by closure
  changePoints: number | null; // Same as dailyChange for trading days, null/0 otherwise
  changePercent: number | null; // Daily percentage change: dailyChange / |prevHY| * 100
}

export interface CandlestickPoint {
  periodId: string;        // e.g., "2026-W47", "2026-11", "2026"
  label: string;           // X-axis label
  subLabel: string;        // Human-readable period range
  startDate: string;       // Period start YYYY-MM-DD
  endDate: string;         // Period end YYYY-MM-DD
  firstTradingDate: string;
  lastTradingDate: string;
  open: number;            // O_p = HY_first
  high: number;            // H_p = max(HY_1 .. HY_n)
  low: number;             // L_p = min(HY_1 .. HY_n)
  close: number;           // C_p = HY_last
  change: number;          // C_p - O_p
  changePercent: number | null; // R_p = ((C_p - O_p) / |O_p|) * 100 (reference only)
  tradingDaysCount: number;
  isIncomplete: boolean;   // Ongoing week/month/year marked "未完成"
}

export interface WeeklySettlement {
  weekId: string; // e.g., "2026-W47"
  weekStart: string; // YYYY-MM-DD (Monday)
  weekEnd: string;   // YYYY-MM-DD (Sunday)
  settledAt: string; // ISO timestamp
  startHyIndex: number; // 期初 HY（承接上週期末或基期 100）
  endHyIndex: number;   // 期末 HY（= startHyIndex + weeklyDeviation）
  weeklyDeviation: number; // Wt = sum(Dt * factor)
  highHyIndex: number; // 本週最高 HY
  lowHyIndex: number;  // 本週最低 HY
  avgTotalScore: number; // 週均綜合分數 Avg(St)
  baselineScore: number; // 固定基準分數 50
  twScore: number;   // Alias for avgTotalScore
  t0?: number | null; // Legacy compatibility only
  hyIndex: number;   // Alias for endHyIndex (HYw)
  prevWeekId: string | null;
  prevWeekHY: number | null;
  changePoints: number | null; // Weekly net change (= weeklyDeviation)
  changePercent: number | null; // Always null (HY Index never shown in %)
  validDaysCount: number;
  completeness: CompletenessLevel;
  completenessLabel: string;
  fourAxisAvg: RecordMetrics;
  avgHabitScore: number | null;
  habitCounts: Record<HabitId, number>;
  closureDaysCount: number;
  participatingRecordIds: string[];
  participatingDates: string[];
  formulaVersion: string;
}

export interface InfluenceItem {
  key: AxisKey | 'habits';
  label: string;
  fixedWeight: number; // e.g., 0.24
  effectiveWeight: number; // re-normalized weight in comparison
  currentAvg: number;
  previousAvg: number;
  currentContribution: number;
  previousContribution: number;
  deltaCi: number; // Ci = 本週項目貢獻 - 上週項目貢獻
  deltaHYPoints: number; // Ci * ACCUMULATION_FACTOR (daily HY points impact)
  impactSharePi: number; // Pi = |Ci| / sum(|Ci|) * 100
}

export interface ActualInfluenceResult {
  status: 'ok' | 'insufficient' | 'no_change';
  reason?: string;
  items: InfluenceItem[];
  upwardDrivers: InfluenceItem[];
  downwardDrivers: InfluenceItem[];
  totalAbsContribution: number;
  comparedPeriodLabel: string;
}

export interface SystemConfig {
  key: 'main';
  t0?: number | null; // Deprecated legacy field kept only for old backup compatibility
  onboardingCompleted: boolean;
  customEmotionTags: string[];
  customBodyTags: string[];
  customNeedTags?: string[];
  formulaVersion: string;
  createdAt: string;
}

export interface FullBackupPayload {
  app: 'HY_INDEX';
  exportedAt: string;
  formulaVersion: string;
  config: SystemConfig;
  records: DailyRecord[];
  closures: MarketClosure[];
  settlements: WeeklySettlement[];
}
