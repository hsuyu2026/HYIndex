import {
  BASELINE_SCORE,
  DailyRecord,
  FORMULA_VERSION,
  FullBackupPayload,
  HABIT_DEFINITIONS,
  MarketClosure,
  SystemConfig,
  WeeklySettlement,
} from '../types/hy';
import {
  computeDailySnapshots,
  isRecordDuringClosure,
} from '../engine/calculations';
import { getLogicalTradingDate } from '../utils/taipeiTime';

const DB_NAME = 'hy_index_db';
const DB_VERSION = 1;
const PRE_V120_BACKUP_KEY = 'hy_index_pre_v120_backup';

const STORE_RECORDS = 'records';
const STORE_CLOSURES = 'closures';
const STORE_SETTLEMENTS = 'settlements';
const STORE_CONFIG = 'config';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_RECORDS)) {
        const recordStore = db.createObjectStore(STORE_RECORDS, { keyPath: 'id' });
        recordStore.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_CLOSURES)) {
        db.createObjectStore(STORE_CLOSURES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SETTLEMENTS)) {
        db.createObjectStore(STORE_SETTLEMENTS, { keyPath: 'weekId' });
      }
      if (!db.objectStoreNames.contains(STORE_CONFIG)) {
        db.createObjectStore(STORE_CONFIG, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error('無法開啟本機資料庫 IndexedDB'));
    };
  });
  return dbPromise;
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  });
}

export function createDefaultConfig(): SystemConfig {
  return {
    key: 'main',
    t0: BASELINE_SCORE,
    onboardingCompleted: false,
    customEmotionTags: [],
    customBodyTags: [],
    customNeedTags: [],
    formulaVersion: FORMULA_VERSION,
    createdAt: new Date().toISOString(),
  };
}

export function getPreMigrationBackupJson(): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(PRE_V120_BACKUP_KEY);
  } catch {
    return null;
  }
}

export function clearPreMigrationBackup(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(PRE_V120_BACKUP_KEY);
  } catch {
    // ignore
  }
}

export async function loadAllData(): Promise<{
  config: SystemConfig;
  records: DailyRecord[];
  closures: MarketClosure[];
  settlements: WeeklySettlement[];
  migratedFromVersion: string | null;
}> {
  const db = await openDB();
  const tx = db.transaction(
    [STORE_CONFIG, STORE_RECORDS, STORE_CLOSURES, STORE_SETTLEMENTS],
    'readonly'
  );

  const [rawConfig, rawRecords, closures, settlements] = await Promise.all([
    reqToPromise(tx.objectStore(STORE_CONFIG).get('main')),
    reqToPromise(tx.objectStore(STORE_RECORDS).getAll()),
    reqToPromise(tx.objectStore(STORE_CLOSURES).getAll()),
    reqToPromise(tx.objectStore(STORE_SETTLEMENTS).getAll()),
  ]);

  await txDone(tx);

  let migratedFromVersion: string | null = null;

  let config: SystemConfig = rawConfig
    ? {
        ...rawConfig,
        customNeedTags: Array.isArray(rawConfig.customNeedTags) ? rawConfig.customNeedTags : [],
        formulaVersion: FORMULA_VERSION,
      }
    : createDefaultConfig();

  const records: DailyRecord[] = rawRecords.map((r: DailyRecord) => ({
    ...r,
    needTags: Array.isArray(r.needTags) ? r.needTags : [],
  }));

  if (rawConfig && rawConfig.formulaVersion !== FORMULA_VERSION) {
    const prevVer = rawConfig.formulaVersion || 'unknown';
    // Only snapshot & notify formula-breaking migration from pre-v1.2.0 versions
    if (prevVer !== '1.2.0' && prevVer !== '1.3.0' && prevVer !== '1.1.2' && prevVer !== '1.1.3' && prevVer !== '1.1.4') {
      migratedFromVersion = prevVer;
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const existingBackup = window.localStorage.getItem(PRE_V120_BACKUP_KEY);
          if (!existingBackup) {
            const snapshotPayload = {
              app: 'HY_INDEX',
              migratedAt: new Date().toISOString(),
              fromVersion: migratedFromVersion,
              toVersion: FORMULA_VERSION,
              config: rawConfig,
              records,
              closures,
              settlements,
            };
            window.localStorage.setItem(PRE_V120_BACKUP_KEY, JSON.stringify(snapshotPayload, null, 2));
          }
        }
      } catch {
        // Ignore quota or storage restriction
      }
    }
    await saveConfig(config);
  }

  records.sort((a: DailyRecord, b: DailyRecord) =>
    `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)
  );
  closures.sort((a: MarketClosure, b: MarketClosure) => b.startAt.localeCompare(a.startAt));
  settlements.sort((a: WeeklySettlement, b: WeeklySettlement) =>
    a.weekStart.localeCompare(b.weekStart)
  );

  return { config, records, closures, settlements, migratedFromVersion };
}



export async function saveConfig(config: SystemConfig): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_CONFIG, 'readwrite');
  tx.objectStore(STORE_CONFIG).put(config);
  await txDone(tx);
}

export async function upsertRecord(record: DailyRecord): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_RECORDS, 'readwrite');
  tx.objectStore(STORE_RECORDS).put(record);
  await txDone(tx);
}

export async function upsertRecordsBatch(records: DailyRecord[]): Promise<void> {
  if (records.length === 0) return;
  const db = await openDB();
  const tx = db.transaction(STORE_RECORDS, 'readwrite');
  const store = tx.objectStore(STORE_RECORDS);
  for (const r of records) {
    store.put(r);
  }
  await txDone(tx);
}

export async function deleteRecordById(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_RECORDS, 'readwrite');
  tx.objectStore(STORE_RECORDS).delete(id);
  await txDone(tx);
}

export async function upsertClosure(closure: MarketClosure): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_CLOSURES, 'readwrite');
  tx.objectStore(STORE_CLOSURES).put(closure);
  await txDone(tx);
}

export async function deleteClosureById(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_CLOSURES, 'readwrite');
  tx.objectStore(STORE_CLOSURES).delete(id);
  await txDone(tx);
}

export async function replaceAllSettlements(settlements: WeeklySettlement[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_SETTLEMENTS, 'readwrite');
  const store = tx.objectStore(STORE_SETTLEMENTS);
  store.clear();
  for (const s of settlements) {
    store.put(s);
  }
  await txDone(tx);
}

export async function restoreFullBackup(payload: FullBackupPayload): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(
    [STORE_CONFIG, STORE_RECORDS, STORE_CLOSURES, STORE_SETTLEMENTS],
    'readwrite'
  );

  const configStore = tx.objectStore(STORE_CONFIG);
  const recordStore = tx.objectStore(STORE_RECORDS);
  const closureStore = tx.objectStore(STORE_CLOSURES);
  const settlementStore = tx.objectStore(STORE_SETTLEMENTS);

  configStore.clear();
  recordStore.clear();
  closureStore.clear();
  settlementStore.clear();

  configStore.put(payload.config);

  // Deduplicate by ID during restore
  const seenRecords = new Set<string>();
  for (const r of payload.records) {
    if (!seenRecords.has(r.id)) {
      seenRecords.add(r.id);
      recordStore.put(r);
    }
  }

  const seenClosures = new Set<string>();
  for (const c of payload.closures) {
    if (!seenClosures.has(c.id)) {
      seenClosures.add(c.id);
      closureStore.put(c);
    }
  }

  const seenWeeks = new Set<string>();
  for (const s of payload.settlements) {
    if (!seenWeeks.has(s.weekId)) {
      seenWeeks.add(s.weekId);
      settlementStore.put(s);
    }
  }

  await txDone(tx);
}

export async function resetAllData(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(
    [STORE_CONFIG, STORE_RECORDS, STORE_CLOSURES, STORE_SETTLEMENTS],
    'readwrite'
  );
  tx.objectStore(STORE_CONFIG).clear();
  tx.objectStore(STORE_RECORDS).clear();
  tx.objectStore(STORE_CLOSURES).clear();
  tx.objectStore(STORE_SETTLEMENTS).clear();
  await txDone(tx);
}

export interface BackupValidationResult {
  valid: boolean;
  error?: string;
  payload?: FullBackupPayload;
  recordCount: number;
  closureCount: number;
  settlementCount: number;
  dateRange: string;
}

export function validateBackupJson(rawText: string): BackupValidationResult {
  try {
    const parsed = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object') {
      return {
        valid: false,
        error: 'JSON 根結構無效',
        recordCount: 0,
        closureCount: 0,
        settlementCount: 0,
        dateRange: '--',
      };
    }

    if (parsed.app !== 'HY_INDEX') {
      return {
        valid: false,
        error: '檔案識別碼錯誤（非 HY_INDEX 匯出備份檔）',
        recordCount: 0,
        closureCount: 0,
        settlementCount: 0,
        dateRange: '--',
      };
    }

    if (!parsed.config || typeof parsed.config !== 'object') {
      return {
        valid: false,
        error: '缺少系統設定 (config) 資料',
        recordCount: 0,
        closureCount: 0,
        settlementCount: 0,
        dateRange: '--',
      };
    }

    if (!Array.isArray(parsed.records) || !Array.isArray(parsed.closures)) {
      return {
        valid: false,
        error: '紀錄 (records) 或休市 (closures) 欄位格式錯誤',
        recordCount: 0,
        closureCount: 0,
        settlementCount: 0,
        dateRange: '--',
      };
    }

    // Validate records integrity & deduplicate
    const validRecords: DailyRecord[] = [];
    const seenIds = new Set<string>();
    for (const r of parsed.records) {
      if (!r || typeof r.id !== 'string' || typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) {
        return {
          valid: false,
          error: '存在格式無效的紀錄項目（缺少 ID 或日期格式錯誤）',
          recordCount: 0,
          closureCount: 0,
          settlementCount: 0,
          dateRange: '--',
        };
      }
      if (seenIds.has(r.id)) continue;
      seenIds.add(r.id);

      validRecords.push({
        id: r.id,
        date: r.date,
        time: typeof r.time === 'string' && /^\d{2}:\d{2}/.test(r.time) ? r.time.slice(0, 5) : '12:00',
        metrics: {
          satisfaction: typeof r.metrics?.satisfaction === 'number' ? r.metrics.satisfaction : null,
          performance: typeof r.metrics?.performance === 'number' ? r.metrics.performance : null,
          mood: typeof r.metrics?.mood === 'number' ? r.metrics.mood : null,
          energy: typeof r.metrics?.energy === 'number' ? r.metrics.energy : null,
        },
        notes: {
          events: String(r.notes?.events || ''),
          satisfactionReason: String(r.notes?.satisfactionReason || ''),
          performanceReason: String(r.notes?.performanceReason || ''),
          goodPoints: String(r.notes?.goodPoints || ''),
          improvements: String(r.notes?.improvements || ''),
          moodDiary: String(r.notes?.moodDiary || ''),
        },
        emotionTags: Array.isArray(r.emotionTags) ? r.emotionTags.map(String) : [],
        bodyTags: Array.isArray(r.bodyTags) ? r.bodyTags.map(String) : [],
        needTags: Array.isArray(r.needTags) ? r.needTags.map(String) : [],
        habits: Array.isArray(r.habits) ? r.habits : [],
        createdAt: String(r.createdAt || new Date().toISOString()),
        updatedAt: String(r.updatedAt || new Date().toISOString()),
      });
    }

    const closures: MarketClosure[] = parsed.closures.filter(
      (c: unknown): c is MarketClosure =>
        Boolean(c && typeof c === 'object' && typeof (c as MarketClosure).id === 'string' && typeof (c as MarketClosure).startAt === 'string')
    );

    const settlements: WeeklySettlement[] = Array.isArray(parsed.settlements)
      ? parsed.settlements
      : [];

    const dates = validRecords.map((r) => r.date).sort();
    const dateRange =
      dates.length > 0
        ? dates[0] === dates[dates.length - 1]
          ? dates[0]
          : `${dates[0]} ~ ${dates[dates.length - 1]}`
        : '無紀錄日期';

    const payload: FullBackupPayload = {
      app: 'HY_INDEX',
      exportedAt: String(parsed.exportedAt || new Date().toISOString()),
      formulaVersion: String(parsed.formulaVersion || FORMULA_VERSION),
      config: {
        key: 'main',
        t0: typeof parsed.config.t0 === 'number' && parsed.config.t0 > 0 ? parsed.config.t0 : null,
        onboardingCompleted: Boolean(parsed.config.onboardingCompleted),
        customEmotionTags: Array.isArray(parsed.config.customEmotionTags)
          ? parsed.config.customEmotionTags.map(String)
          : [],
        customBodyTags: Array.isArray(parsed.config.customBodyTags)
          ? parsed.config.customBodyTags.map(String)
          : [],
        customNeedTags: Array.isArray(parsed.config.customNeedTags)
          ? parsed.config.customNeedTags.map(String)
          : [],
        formulaVersion: FORMULA_VERSION,
        createdAt: String(parsed.config.createdAt || new Date().toISOString()),
      },
      records: validRecords,
      closures,
      settlements,
    };

    return {
      valid: true,
      payload,
      recordCount: validRecords.length,
      closureCount: closures.length,
      settlementCount: settlements.length,
      dateRange,
    };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'JSON 解析失敗',
      recordCount: 0,
      closureCount: 0,
      settlementCount: 0,
      dateRange: '--',
    };
  }
}

function escapeCsvCell(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates an Excel-compatible UTF-8 BOM CSV of all numeric records & daily cumulative deviation scores.
 */
export function buildCsvExport(
  records: DailyRecord[],
  closures: MarketClosure[]
): string {
  const snapshots = computeDailySnapshots(records, closures);
  const snapMap = new Map(snapshots.map((s) => [s.date, s]));
  const sorted = [...records].sort((a, b) =>
    `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)
  );

  const habitHeaders = HABIT_DEFINITIONS.map((h) => h.label);
  const headers = [
    '紀錄ID',
    '日期',
    '時間(台北)',
    '歸屬交易日',
    '交易狀態',
    '現狀與未來目標滿意度',
    '自我狀態表現',
    '心情指數',
    '精力值',
    ...habitHeaders,
    '當日四大狀態分數(S)',
    '當日習慣分數(H)',
    '當日綜合分數(St)',
    '固定基準分數',
    '每日偏離分數(Dt)',
    'HY當日變化',
    'HY當日漲跌幅(%)',
    '累積HY指數',
    '情緒標籤',
    '身體狀態標籤',
    '建立時間',
    '最後修改時間',
  ];

  const rows = sorted.map((r) => {
    const duringClosure = isRecordDuringClosure(r, closures);
    const logicalDate = getLogicalTradingDate(r.date, r.time);
    const snap = snapMap.get(logicalDate);
    const habitCols = HABIT_DEFINITIONS.map((h) => (r.habits.includes(h.id) ? 1 : 0));
    const isTrading = !duringClosure && Boolean(snap?.isTradingDay);

    return [
      r.id,
      r.date,
      r.time,
      logicalDate,
      duringClosure ? '休市中(不計入指數)' : '開市有效',
      r.metrics.satisfaction,
      r.metrics.performance,
      r.metrics.mood,
      r.metrics.energy,
      ...habitCols,
      isTrading && snap?.stateScoreS !== null && snap?.stateScoreS !== undefined
        ? snap.stateScoreS.toFixed(2)
        : '',
      isTrading && snap?.habitScoreH !== null && snap?.habitScoreH !== undefined
        ? snap.habitScoreH.toFixed(2)
        : '',
      isTrading && snap?.totalScore !== null && snap?.totalScore !== undefined
        ? snap.totalScore.toFixed(2)
        : '',
      isTrading ? String(BASELINE_SCORE) : '',
      isTrading && snap?.deviationScore !== null && snap?.deviationScore !== undefined
        ? snap.deviationScore.toFixed(2)
        : '',
      isTrading && snap ? snap.dailyChange.toFixed(2) : '',
      isTrading && snap?.changePercent !== null && snap?.changePercent !== undefined
        ? snap.changePercent.toFixed(2)
        : '',
      snap ? snap.hyIndex.toFixed(2) : '',
      r.emotionTags.join(' / '),
      r.bodyTags.join(' / '),
      r.createdAt,
      r.updatedAt,
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  // UTF-8 BOM for Microsoft Excel
  return '\uFEFF' + [headers.map(escapeCsvCell).join(','), ...rows].join('\r\n');
}
