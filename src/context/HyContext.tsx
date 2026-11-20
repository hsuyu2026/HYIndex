import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ActualInfluenceResult,
  BASELINE_SCORE,
  DailyRecord,
  DailySnapshot,
  FORMULA_VERSION,
  FullBackupPayload,
  HabitId,
  MarketClosure,
  PageId,
  SystemConfig,
  WeeklySettlement,
} from '../types/hy';
import {
  ChartTimeframe,
  CurrentWeekSummary,
  MarketQuote,
  computeActualInfluence,
  computeCurrentMarketQuote,
  computeCurrentWeekProvisional,
  computeDailySnapshots,
  computeWeeklySettlements,
} from '../engine/calculations';
import {
  buildCsvExport,
  clearPreMigrationBackup,
  createDefaultConfig,
  deleteClosureById,
  deleteRecordById,
  getPreMigrationBackupJson,
  loadAllData,
  replaceAllSettlements,
  resetAllData,
  restoreFullBackup,
  saveConfig,
  upsertClosure,
  upsertRecord,
  upsertRecordsBatch,
} from '../storage/db';
import { loadUiPreferences, saveUiPreferences } from '../storage/localPrefs';
import { getLogicalTradingDate, getNowTaipei, getWeekBoundsTaipei } from '../utils/taipeiTime';

interface HyContextValue {
  isLoading: boolean;
  error: string | null;
  config: SystemConfig;
  records: DailyRecord[];
  closures: MarketClosure[];
  settlements: WeeklySettlement[];
  dailySnapshots: DailySnapshot[];
  marketQuote: MarketQuote;
  currentWeek: CurrentWeekSummary;
  latestInfluence: ActualInfluenceResult;
  activePage: PageId;
  setActivePage: (page: PageId) => void;
  editingRecordId: string | null;
  setEditingRecordId: (id: string | null) => void;
  openEditRecord: (id: string) => void;
  chartTimeframe: ChartTimeframe;
  setChartTimeframe: (tf: ChartTimeframe) => void;
  systemBanner: { id: string; type: 'info' | 'warning' | 'success'; message: string } | null;
  dismissBanner: () => void;
  preMigrationBackupJson: string | null;
  dismissPreMigrationBackup: () => void;
  completeOnboarding: () => Promise<void>;
  saveRecord: (
    payload: Omit<DailyRecord, 'id' | 'createdAt' | 'updatedAt'>,
    existingId?: string | null,
    syncRemovedDayHabits?: HabitId[]
  ) => Promise<{ affectedSettledWeek: boolean }>;
  deleteRecord: (id: string) => Promise<void>;
  closeMarket: (startAtIso: string, reason: string) => Promise<void>;
  reopenMarket: (closureId: string, endAtIso: string) => Promise<void>;
  deleteClosure: (closureId: string) => Promise<void>;
  addCustomEmotionTag: (tag: string) => Promise<void>;
  addCustomBodyTag: (tag: string) => Promise<void>;
  addCustomNeedTag: (tag: string) => Promise<void>;
  exportJsonBackup: () => FullBackupPayload;
  exportCsvString: () => string;
  importJsonBackup: (payload: FullBackupPayload) => Promise<void>;
  clearAllSystemData: () => Promise<void>;
}

const HyContext = createContext<HyContextValue | null>(null);

export function HyProvider({ children }: { children: React.ReactNode }) {
  const initialPrefs = useMemo(() => loadUiPreferences(), []);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [config, setConfig] = useState<SystemConfig>(createDefaultConfig);
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [closures, setClosures] = useState<MarketClosure[]>([]);
  const [settlements, setSettlements] = useState<WeeklySettlement[]>([]);

  const [activePage, setActivePageState] = useState<PageId>(initialPrefs.lastPage);
  const [chartTimeframe, setChartTimeframeState] = useState<ChartTimeframe>(
    initialPrefs.chartTimeframe
  );
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [systemBanner, setSystemBanner] = useState<{
    id: string;
    type: 'info' | 'warning' | 'success';
    message: string;
  } | null>(null);
  const [preMigrationBackupJson, setPreMigrationBackupJson] = useState<string | null>(() =>
    getPreMigrationBackupJson()
  );

  const dismissPreMigrationBackup = useCallback(() => {
    clearPreMigrationBackup();
    setPreMigrationBackupJson(null);
  }, []);

  const showBanner = useCallback(
    (type: 'info' | 'warning' | 'success', message: string) => {
      setSystemBanner({ id: String(Date.now()), type, message });
    },
    []
  );

  const dismissBanner = useCallback(() => setSystemBanner(null), []);

  const setActivePage = useCallback((page: PageId) => {
    setActivePageState(page);
    saveUiPreferences({ lastPage: page });
  }, []);

  const setChartTimeframe = useCallback((tf: ChartTimeframe) => {
    setChartTimeframeState(tf);
    saveUiPreferences({ chartTimeframe: tf });
  }, []);

  const openEditRecord = useCallback(
    (id: string) => {
      setEditingRecordId(id);
      setActivePage('record');
    },
    [setActivePage]
  );

  // Reconcile weekly settlements and persist if changed
  const reconcileSettlements = useCallback(
    async (
      nextRecords: DailyRecord[],
      nextClosures: MarketClosure[],
      currentSettlements: WeeklySettlement[]
    ): Promise<WeeklySettlement[]> => {
      const nowMs = Date.now();
      const computed = computeWeeklySettlements(
        nextRecords,
        nextClosures,
        currentSettlements,
        nowMs
      );

      const changed =
        computed.length !== currentSettlements.length ||
        computed.some((c, i) => {
          const prev = currentSettlements[i];
          if (!prev) return true;
          return (
            c.weekId !== prev.weekId ||
            c.formulaVersion !== prev.formulaVersion ||
            typeof prev.startHyIndex !== 'number' ||
            typeof prev.endHyIndex !== 'number' ||
            Math.abs(c.startHyIndex - prev.startHyIndex) > 1e-9 ||
            Math.abs(c.endHyIndex - prev.endHyIndex) > 1e-9 ||
            Math.abs(c.weeklyDeviation - prev.weeklyDeviation) > 1e-9 ||
            c.validDaysCount !== prev.validDaysCount ||
            c.closureDaysCount !== prev.closureDaysCount ||
            c.participatingRecordIds.join(',') !== prev.participatingRecordIds.join(',')
          );
        });

      if (changed) {
        await replaceAllSettlements(computed);
      }
      return computed;
    },
    []
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await loadAllData();
        if (!active) return;

        const reconciled = await reconcileSettlements(
          data.records,
          data.closures,
          data.settlements
        );
        if (!active) return;

        setConfig(data.config);
        setRecords(data.records);
        setClosures(data.closures);
        setSettlements(reconciled);
        setPreMigrationBackupJson(getPreMigrationBackupJson());

        if (data.migratedFromVersion) {
          showBanner(
            'info',
            `已從系統版本 v${data.migratedFromVersion} 自動升級至 v${FORMULA_VERSION}（每日偏離基準分數累積制），並於本機保留升級前原始資料備份，歷史紀錄已重新計算完成。`
          );
        } else if (reconciled.length > data.settlements.length && data.config.onboardingCompleted) {
          const newlySettled = reconciled.filter(
            (r) => !data.settlements.some((old) => old.weekId === r.weekId)
          );
          if (newlySettled.length > 0) {
            showBanner(
              'info',
              `已完成延遲週結算：${newlySettled.map((w) => w.weekId).join('、')}，共 ${
                newlySettled.length
              } 週正式週報已建立。`
            );
          }
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : '初始化本機資料庫失敗');
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [reconcileSettlements, showBanner]);

  const completeOnboarding = useCallback(async () => {
    const nextConfig: SystemConfig = {
      ...config,
      t0: BASELINE_SCORE,
      onboardingCompleted: true,
      formulaVersion: FORMULA_VERSION,
    };
    await saveConfig(nextConfig);
    setConfig(nextConfig);
    const reconciled = await reconcileSettlements(records, closures, settlements);
    setSettlements(reconciled);
    setActivePage('dashboard');
  }, [closures, config, reconcileSettlements, records, setActivePage, settlements]);

  const saveRecord = useCallback(
    async (
      payload: Omit<DailyRecord, 'id' | 'createdAt' | 'updatedAt'>,
      existingId?: string | null,
      syncRemovedDayHabits: HabitId[] = []
    ): Promise<{ affectedSettledWeek: boolean }> => {
      const nowIso = new Date().toISOString();
      const existing = existingId ? records.find((r) => r.id === existingId) : undefined;
      const recordToSave: DailyRecord = existing
        ? {
            ...existing,
            ...payload,
            updatedAt: nowIso,
          }
        : {
            id:
              typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            ...payload,
            createdAt: nowIso,
            updatedAt: nowIso,
          };

      await upsertRecord(recordToSave);

      // If user unchecked a habit that was checked on other records of the same logical trading date, sync removal across that day
      const targetLogicalDate = getLogicalTradingDate(recordToSave.date, recordToSave.time);
      const updatedOthers: DailyRecord[] = [];
      if (syncRemovedDayHabits.length > 0) {
        const removeSet = new Set(syncRemovedDayHabits);
        for (const r of records) {
          if (
            r.id !== recordToSave.id &&
            getLogicalTradingDate(r.date, r.time) === targetLogicalDate
          ) {
            const hasAny = r.habits.some((h) => removeSet.has(h));
            if (hasAny) {
              updatedOthers.push({
                ...r,
                habits: r.habits.filter((h) => !removeSet.has(h)),
                updatedAt: nowIso,
              });
            }
          }
        }
        if (updatedOthers.length > 0) {
          await upsertRecordsBatch(updatedOthers);
        }
      }

      const otherMap = new Map(updatedOthers.map((r) => [r.id, r]));
      const nextRecords = existing
        ? records.map((r) =>
            r.id === recordToSave.id ? recordToSave : otherMap.get(r.id) || r
          )
        : [
            recordToSave,
            ...records.map((r) => otherMap.get(r.id) || r),
          ];

      nextRecords.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));

      // Check if existing record or target logical date affects a settled week
      const affectedWeekIds = new Set<string>();
      affectedWeekIds.add(getWeekBoundsTaipei(targetLogicalDate).weekId);
      if (existing) {
        affectedWeekIds.add(
          getWeekBoundsTaipei(getLogicalTradingDate(existing.date, existing.time)).weekId
        );
      }
      const hadSettledBefore = settlements.some((s) => affectedWeekIds.has(s.weekId));

      const nextSettlements = await reconcileSettlements(
        nextRecords,
        closures,
        settlements
      );
      setRecords(nextRecords);
      setSettlements(nextSettlements);

      if (hadSettledBefore) {
        showBanner(
          'warning',
          `已修改歷史結算週期資料，受影響的每週結算報告與統計已自動重新計算並覆蓋更新。`
        );
      } else {
        showBanner('success', existing ? '紀錄已更新並重新計算當日綜合分數與累積指數。' : '新紀錄已儲存並更新累積指數。');
      }

      return { affectedSettledWeek: hadSettledBefore };
    },
    [closures, reconcileSettlements, records, settlements, showBanner]
  );

  const deleteRecord = useCallback(
    async (id: string) => {
      const target = records.find((r) => r.id === id);
      if (!target) return;

      await deleteRecordById(id);
      const nextRecords = records.filter((r) => r.id !== id);
      const targetWeekId = getWeekBoundsTaipei(
        getLogicalTradingDate(target.date, target.time)
      ).weekId;
      const wasInSettledWeek = settlements.some((s) => s.weekId === targetWeekId);

      const nextSettlements = await reconcileSettlements(
        nextRecords,
        closures,
        settlements
      );
      setRecords(nextRecords);
      setSettlements(nextSettlements);

      if (editingRecordId === id) {
        setEditingRecordId(null);
      }

      if (wasInSettledWeek) {
        showBanner(
          'warning',
          `已刪除歷史結算週期 (${targetWeekId}) 內的紀錄，受影響週報與統計已重新計算。`
        );
      } else {
        showBanner('info', '已刪除該筆紀錄並重新計算累積指數。');
      }
    },
    [closures, editingRecordId, reconcileSettlements, records, settlements, showBanner]
  );

  const closeMarket = useCallback(
    async (startAtIso: string, reason: string) => {
      const hasActive = closures.some((c) => c.endAt === null);
      if (hasActive) {
        throw new Error('目前已經處於休市狀態，請先執行開市');
      }
      const closure: MarketClosure = {
        id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `cls_${Date.now()}`,
        startAt: startAtIso,
        endAt: null,
        reason: reason.trim(),
        createdAt: new Date().toISOString(),
      };
      await upsertClosure(closure);
      const nextClosures = [closure, ...closures].sort((a, b) =>
        b.startAt.localeCompare(a.startAt)
      );
      const nextSettlements = await reconcileSettlements(
        records,
        nextClosures,
        settlements
      );
      setClosures(nextClosures);
      setSettlements(nextSettlements);
      showBanner('warning', '系統已進入手動休市狀態，指數已凍結於最後有效開市指數，休市期間不累積偏離。');
    },
    [closures, reconcileSettlements, records, settlements, showBanner]
  );

  const reopenMarket = useCallback(
    async (closureId: string, endAtIso: string) => {
      const target = closures.find((c) => c.id === closureId);
      if (!target) return;
      if (Date.parse(endAtIso) < Date.parse(target.startAt)) {
        throw new Error('開市時間不可早於休市開始時間');
      }
      const updated: MarketClosure = {
        ...target,
        endAt: endAtIso,
      };
      await upsertClosure(updated);
      const nextClosures = closures.map((c) => (c.id === closureId ? updated : c));
      const nextSettlements = await reconcileSettlements(
        records,
        nextClosures,
        settlements
      );
      setClosures(nextClosures);
      setSettlements(nextSettlements);
      showBanner('success', '市場已重新開市。休市期間紀錄已保留，且不會納入指數計算。');
    },
    [closures, reconcileSettlements, records, settlements, showBanner]
  );

  const deleteClosure = useCallback(
    async (closureId: string) => {
      await deleteClosureById(closureId);
      const nextClosures = closures.filter((c) => c.id !== closureId);
      const nextSettlements = await reconcileSettlements(
        records,
        nextClosures,
        settlements
      );
      setClosures(nextClosures);
      setSettlements(nextSettlements);
      showBanner('info', '已移除休市紀錄並重新計算受影響的指數與週報。');
    },
    [closures, reconcileSettlements, records, settlements, showBanner]
  );

  const addCustomEmotionTag = useCallback(
    async (tag: string) => {
      const clean = tag.trim();
      if (!clean) return;
      if (config.customEmotionTags.includes(clean)) return;
      const nextConfig: SystemConfig = {
        ...config,
        customEmotionTags: [...config.customEmotionTags, clean],
      };
      await saveConfig(nextConfig);
      setConfig(nextConfig);
    },
    [config]
  );

  const addCustomBodyTag = useCallback(
    async (tag: string) => {
      const clean = tag.trim();
      if (!clean) return;
      if (config.customBodyTags.includes(clean)) return;
      const nextConfig: SystemConfig = {
        ...config,
        customBodyTags: [...config.customBodyTags, clean],
      };
      await saveConfig(nextConfig);
      setConfig(nextConfig);
    },
    [config]
  );

  const addCustomNeedTag = useCallback(
    async (tag: string) => {
      const clean = tag.trim();
      if (!clean) return;
      const currentList = config.customNeedTags || [];
      if (currentList.includes(clean)) return;
      const nextConfig: SystemConfig = {
        ...config,
        customNeedTags: [...currentList, clean],
      };
      await saveConfig(nextConfig);
      setConfig(nextConfig);
    },
    [config]
  );

  const exportJsonBackup = useCallback((): FullBackupPayload => {
    return {
      app: 'HY_INDEX',
      exportedAt: new Date().toISOString(),
      formulaVersion: FORMULA_VERSION,
      config,
      records,
      closures,
      settlements,
    };
  }, [closures, config, records, settlements]);

  const exportCsvString = useCallback((): string => {
    return buildCsvExport(records, closures);
  }, [closures, records]);

  const importJsonBackup = useCallback(
    async (payload: FullBackupPayload) => {
      await restoreFullBackup(payload);
      const nextSettlements = await reconcileSettlements(
        payload.records,
        payload.closures,
        payload.settlements
      );
      const sortedRecords = [...payload.records].sort((a, b) =>
        `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)
      );
      const sortedClosures = [...payload.closures].sort((a, b) =>
        b.startAt.localeCompare(a.startAt)
      );
      setConfig(payload.config);
      setRecords(sortedRecords);
      setClosures(sortedClosures);
      setSettlements(nextSettlements);
      setEditingRecordId(null);
      showBanner(
        'success',
        `備份還原完成：共載入 ${sortedRecords.length} 筆紀錄，並依 v${FORMULA_VERSION} 公式重新計算 ${nextSettlements.length} 份週結算報告。`
      );
    },
    [reconcileSettlements, showBanner]
  );

  const clearAllSystemData = useCallback(async () => {
    await resetAllData();
    clearPreMigrationBackup();
    const fresh = createDefaultConfig();
    setConfig(fresh);
    setRecords([]);
    setClosures([]);
    setSettlements([]);
    setPreMigrationBackupJson(null);
    setEditingRecordId(null);
    showBanner('info', '所有本機資料已清除，系統已重設為初始狀態。');
  }, [showBanner]);

  const dailySnapshots = useMemo(
    () => computeDailySnapshots(records, closures),
    [records, closures]
  );

  const marketQuote = useMemo(
    () => computeCurrentMarketQuote(dailySnapshots, closures, settlements),
    [dailySnapshots, closures, settlements]
  );

  const currentWeek = useMemo(
    () => computeCurrentWeekProvisional(dailySnapshots, closures),
    [dailySnapshots, closures]
  );

  const latestInfluence = useMemo(() => {
    if (settlements.length >= 2) {
      const curr = settlements[settlements.length - 1];
      const prev = settlements[settlements.length - 2];
      return computeActualInfluence(
        { label: curr.weekId, fourAxisAvg: curr.fourAxisAvg, avgHabitScore: curr.avgHabitScore },
        { label: prev.weekId, fourAxisAvg: prev.fourAxisAvg, avgHabitScore: prev.avgHabitScore }
      );
    }
    if (settlements.length === 1 && currentWeek.validDaysCount > 0) {
      const prev = settlements[0];
      return computeActualInfluence(
        {
          label: `${currentWeek.weekId}(暫估)`,
          fourAxisAvg: currentWeek.fourAxisAvg,
          avgHabitScore: currentWeek.avgHabitScore,
        },
        { label: prev.weekId, fourAxisAvg: prev.fourAxisAvg, avgHabitScore: prev.avgHabitScore }
      );
    }
    return computeActualInfluence(null, null);
  }, [currentWeek, settlements]);

  const value: HyContextValue = {
    isLoading,
    error,
    config,
    records,
    closures,
    settlements,
    dailySnapshots,
    marketQuote,
    currentWeek,
    latestInfluence,
    activePage,
    setActivePage,
    editingRecordId,
    setEditingRecordId,
    openEditRecord,
    chartTimeframe,
    setChartTimeframe,
    systemBanner,
    dismissBanner,
    preMigrationBackupJson,
    dismissPreMigrationBackup,
    completeOnboarding,
    saveRecord,
    deleteRecord,
    closeMarket,
    reopenMarket,
    deleteClosure,
    addCustomEmotionTag,
    addCustomBodyTag,
    addCustomNeedTag,
    exportJsonBackup,
    exportCsvString,
    importJsonBackup,
    clearAllSystemData,
  };

  return <HyContext.Provider value={value}>{children}</HyContext.Provider>;
}

export function useHy(): HyContextValue {
  const ctx = useContext(HyContext);
  if (!ctx) {
    throw new Error('useHy must be used inside HyProvider');
  }
  return ctx;
}

export function useTaipeiClock(): ReturnType<typeof getNowTaipei> {
  const [now, setNow] = useState(() => getNowTaipei());
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(getNowTaipei());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}
