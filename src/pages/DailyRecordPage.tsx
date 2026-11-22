import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlarmClock,
  AlertTriangle,
  Bed,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  EyeOff,
  Moon,
  Plus,
  RotateCcw,
  Save,
  Smartphone,
  Sunrise,
  Trash2,
} from 'lucide-react';
import { getDirectionTone } from '../components/IndexDisplay';
import { useHy } from '../context/HyContext';
import {
  computeCompositeScoreT,
  computeDailyChange,
  computeDeviationScore,
  computeHabitScoreH,
  computeStateScoreS,
  formatIndex,
  formatSigned,
  isTimestampClosed,
} from '../engine/calculations';
import {
  AXIS_DEFINITIONS,
  AxisKey,
  BASELINE_SCORE,
  DEFAULT_BODY_TAGS,
  DEFAULT_EMOTION_TAGS,
  DEFAULT_NEED_TAGS,
  EMOTION_TAG_GROUPS,
  HABIT_DEFINITIONS,
  HabitDefinition,
  HabitId,
  INITIAL_HY_INDEX,
  RecordMetrics,
  RecordNotes,
  getEmotionPolarity,
} from '../types/hy';
import { getLogicalTradingDate, getNowTaipei, taipeiDateTimeToMs } from '../utils/taipeiTime';

const HABIT_ICONS: Record<HabitId, React.ComponentType<{ className?: string }>> = {
  regular_sleep: Sunrise,
  reading: BookOpen,
  good_rest: Bed,
  late_sleep: Moon,
  excess_screen: Smartphone,
  procrastination: Clock,
  indulgence: Activity,
  late: AlarmClock,
};

const EMPTY_NOTES: RecordNotes = {
  events: '',
  satisfactionReason: '',
  performanceReason: '',
  goodPoints: '',
  improvements: '',
  moodDiary: '',
};

const EMPTY_METRICS: RecordMetrics = {
  satisfaction: null,
  performance: null,
  mood: null,
  energy: null,
};

export function DailyRecordPage() {
  const {
    config,
    records,
    closures,
    dailySnapshots,
    editingRecordId,
    setEditingRecordId,
    setActivePage,
    saveRecord,
    deleteRecord,
    addCustomEmotionTag,
    addCustomBodyTag,
    addCustomNeedTag,
  } = useHy();

  const editingRecord = useMemo(
    () => (editingRecordId ? records.find((r) => r.id === editingRecordId) || null : null),
    [editingRecordId, records]
  );

  const initialNow = useMemo(() => getNowTaipei(), []);
  const [date, setDate] = useState(initialNow.date);
  const [time, setTime] = useState(initialNow.time);
  const [metrics, setMetrics] = useState<RecordMetrics>(EMPTY_METRICS);
  const [notes, setNotes] = useState<RecordNotes>(EMPTY_NOTES);
  const [emotionTags, setEmotionTags] = useState<string[]>([]);
  const [bodyTags, setBodyTags] = useState<string[]>([]);
  const [needTags, setNeedTags] = useState<string[]>([]);
  const [habits, setHabits] = useState<HabitId[]>([]);

  // All three tag lists collapsed by default
  const [emotionOpen, setEmotionOpen] = useState(false);
  const [bodyOpen, setBodyOpen] = useState(false);
  const [needOpen, setNeedOpen] = useState(false);

  const [activeHabitHint, setActiveHabitHint] = useState<{
    habit: HabitDefinition;
    checked: boolean;
  } | null>(null);
  const [hoveredHabit, setHoveredHabit] = useState<HabitDefinition | null>(null);

  const [newEmotionInput, setNewEmotionInput] = useState('');
  const [newBodyInput, setNewBodyInput] = useState('');
  const [newNeedInput, setNewNeedInput] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPreviewData, setShowPreviewData] = useState(false);

  const logicalDate = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    return getLogicalTradingDate(date, time || '12:00');
  }, [date, time]);

  // Habits already checked on other records for the same logical trading date
  const otherRecordHabitsForDate = useMemo(() => {
    const set = new Set<HabitId>();
    for (const r of records) {
      if (
        r.id !== editingRecordId &&
        getLogicalTradingDate(r.date, r.time) === logicalDate
      ) {
        for (const h of r.habits) set.add(h);
      }
    }
    return set;
  }, [editingRecordId, logicalDate, records]);

  useEffect(() => {
    if (editingRecord) {
      setDate(editingRecord.date);
      setTime(editingRecord.time);
      setMetrics({ ...editingRecord.metrics });
      setNotes({ ...editingRecord.notes });
      setEmotionTags([...editingRecord.emotionTags]);
      setBodyTags([...editingRecord.bodyTags]);
      setNeedTags([...(editingRecord.needTags || [])]);
      setHabits([...editingRecord.habits]);
      setConfirmDelete(false);
      setActiveHabitHint(null);
    } else {
      const now = getNowTaipei();
      setDate(now.date);
      setTime(now.time);
      setMetrics({ ...EMPTY_METRICS });
      setNotes({ ...EMPTY_NOTES });
      setEmotionTags([]);
      setBodyTags([]);
      setNeedTags([]);
      setHabits([]);
      setConfirmDelete(false);
      setActiveHabitHint(null);
    }
  }, [editingRecord]);

  const [removedSharedHabits, setRemovedSharedHabits] = useState<HabitId[]>([]);
  useEffect(() => {
    setRemovedSharedHabits([]);
  }, [logicalDate, editingRecordId]);

  const effectiveDayHabits = useMemo(() => {
    const set = new Set<HabitId>();
    for (const h of otherRecordHabitsForDate) {
      if (!removedSharedHabits.includes(h)) set.add(h);
    }
    for (const h of habits) {
      set.add(h);
    }
    return Array.from(set);
  }, [habits, otherRecordHabitsForDate, removedSharedHabits]);

  const timestampClosed = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const ms = taipeiDateTimeToMs(date, time || '00:00');
    return isTimestampClosed(ms, closures);
  }, [closures, date, time]);

  const priorHyBeforeDate = useMemo(() => {
    let base = INITIAL_HY_INDEX;
    for (const snap of dailySnapshots) {
      if (snap.date < logicalDate && snap.isTradingDay) {
        base = snap.hyIndex;
      }
    }
    return base;
  }, [dailySnapshots, logicalDate]);

  const previewCalc = useMemo(() => {
    const { s } = computeStateScoreS(metrics);
    const { hp, h } = computeHabitScoreH(effectiveDayHabits);
    const st = computeCompositeScoreT(s, h);
    const dt = computeDeviationScore(st);
    const dailyChange = computeDailyChange(dt);
    const hy = dt !== null ? priorHyBeforeDate + dailyChange : priorHyBeforeDate;
    return { s, hp, h, st, dt, dailyChange, hy };
  }, [effectiveDayHabits, metrics, priorHyBeforeDate]);

  // Previous chronological record before the current form date/time (excluding the record being edited)
  const previousRecord = useMemo(() => {
    const currentKey = `${date} ${time || '23:59'}`;
    const sortedOthers = records
      .filter((r) => r.id !== editingRecordId)
      .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));

    if (editingRecordId) {
      return sortedOthers.find((r) => `${r.date} ${r.time}` < currentKey) || null;
    }
    return sortedOthers.find((r) => `${r.date} ${r.time}` <= currentKey) || null;
  }, [date, time, editingRecordId, records]);

  const customEmotionOnly = useMemo(
    () => config.customEmotionTags.filter((t) => !DEFAULT_EMOTION_TAGS.includes(t)),
    [config.customEmotionTags]
  );

  const allBodyOptions = useMemo(
    () => Array.from(new Set([...DEFAULT_BODY_TAGS, ...config.customBodyTags])),
    [config.customBodyTags]
  );

  const allNeedOptions = useMemo(
    () => Array.from(new Set([...DEFAULT_NEED_TAGS, ...(config.customNeedTags || [])])),
    [config.customNeedTags]
  );

  const handleAxisInput = (key: AxisKey, raw: string) => {
    if (raw.trim() === '') {
      setMetrics((prev) => ({ ...prev, [key]: null }));
      return;
    }
    const num = Number(raw);
    if (Number.isNaN(num)) return;
    const clamped = Math.min(100, Math.max(0, num));
    setMetrics((prev) => ({ ...prev, [key]: clamped }));
  };

  const handleToggleHabit = (habitDef: HabitDefinition) => {
    const isCurrentlyEffective = effectiveDayHabits.includes(habitDef.id);
    if (isCurrentlyEffective) {
      setHabits((prev) => prev.filter((id) => id !== habitDef.id));
      if (otherRecordHabitsForDate.has(habitDef.id)) {
        setRemovedSharedHabits((prev) =>
          prev.includes(habitDef.id) ? prev : [...prev, habitDef.id]
        );
      }
      setActiveHabitHint({ habit: habitDef, checked: false });
    } else {
      setHabits((prev) => (prev.includes(habitDef.id) ? prev : [...prev, habitDef.id]));
      setRemovedSharedHabits((prev) => prev.filter((id) => id !== habitDef.id));
      setActiveHabitHint({ habit: habitDef, checked: true });
    }
  };

  const handleToggleTag = (tag: string, list: string[], setter: (next: string[]) => void) => {
    if (list.includes(tag)) {
      setter(list.filter((t) => t !== tag));
    } else {
      setter([...list, tag]);
    }
  };

  const handleAddCustomEmotion = async () => {
    const clean = newEmotionInput.trim();
    if (!clean) return;
    await addCustomEmotionTag(clean);
    if (!emotionTags.includes(clean)) setEmotionTags([...emotionTags, clean]);
    setNewEmotionInput('');
  };

  const handleAddCustomBody = async () => {
    const clean = newBodyInput.trim();
    if (!clean) return;
    await addCustomBodyTag(clean);
    if (!bodyTags.includes(clean)) setBodyTags([...bodyTags, clean]);
    setNewBodyInput('');
  };

  const handleAddCustomNeed = async () => {
    const clean = newNeedInput.trim();
    if (!clean) return;
    await addCustomNeedTag(clean);
    if (!needTags.includes(clean)) setNeedTags([...needTags, clean]);
    setNewNeedInput('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveRecord(
        {
          date,
          time,
          metrics,
          notes,
          emotionTags,
          bodyTags,
          needTags,
          habits,
        },
        editingRecordId,
        removedSharedHabits
      );
      setEditingRecordId(null);
      setActivePage('dashboard');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingRecordId) return;
    await deleteRecord(editingRecordId);
    setEditingRecordId(null);
    setActivePage('history');
  };

  const positiveHabits = HABIT_DEFINITIONS.filter((h) => h.polarity === 'positive');
  const negativeHabits = HABIT_DEFINITIONS.filter((h) => h.polarity === 'negative');
  const displayedHint = hoveredHabit
    ? { habit: hoveredHabit, checked: effectiveDayHabits.includes(hoveredHabit.id) }
    : activeHabitHint;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1E2530] pb-4">
        <div>
          <h1 className="text-lg font-bold text-white">
            {editingRecord ? '修改紀錄' : '新增每日紀錄'}
          </h1>
          <p className="text-xs text-[#94A3B8] mt-1">
            所有數值與文字欄位皆為自由選填 · 每日結束時間為隔日凌晨 03:00（00:00–02:59 計入前一日）
          </p>
        </div>

        <div className="flex items-center gap-2">
          {editingRecord && (
            <>
              <button
                type="button"
                onClick={() => setEditingRecordId(null)}
                className="px-3 py-2 border border-[#2B3544] text-xs text-[#CBD5E1] hover:text-white rounded-sm inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                改為新增模式
              </button>
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="px-3 py-2 border border-[#EF4444]/40 text-xs text-[#F87171] hover:bg-[#EF4444]/10 rounded-sm inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  刪除紀錄
                </button>
              ) : (
                <div className="flex items-center gap-1.5 bg-[#EF4444]/10 border border-[#EF4444]/40 px-2.5 py-1 rounded-sm">
                  <span className="text-xs text-[#F87171]">確認永久刪除？</span>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="px-2 py-1 bg-[#EF4444] text-white text-xs rounded-sm cursor-pointer"
                  >
                    確定刪除
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-2 py-1 text-xs text-[#CBD5E1] hover:text-white cursor-pointer"
                  >
                    取消
                  </button>
                </div>
              )}
            </>
          )}
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 bg-[#EF4444] hover:bg-[#DC2626] disabled:opacity-50 text-white text-xs font-medium rounded-sm inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? '儲存中...' : editingRecord ? '更新紀錄' : '儲存紀錄'}
          </button>
        </div>
      </div>

      {/* Closure Notice if Timestamp is in Closure */}
      {timestampClosed && (
        <div className="border border-[#F59E0B]/40 bg-[#F59E0B]/10 rounded p-3.5 flex items-start gap-2.5 text-xs text-[#FCD34D]">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            此紀錄時間（{date} {time}）位於手動休市區間內。儲存後紀錄與日記仍會完整保存，但不會納入即時暫估指數或每週正式結算。
          </div>
        </div>
      )}

      {/* Date, Time & Live Calculation Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 border border-[#1E2530] bg-[#0E1218] rounded p-4 space-y-2.5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="rec-date" className="block text-xs text-[#94A3B8] mb-1.5">
                日期（台北時間）
              </label>
              <input
                id="rec-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-[#090B0E] border border-[#2B3544] focus:border-[#EF4444] outline-none px-3 py-2 text-sm font-mono tabular-nums text-white rounded-sm"
              />
            </div>
            <div>
              <label htmlFor="rec-time" className="block text-xs text-[#94A3B8] mb-1.5">
                時間（台北時間）
              </label>
              <input
                id="rec-time"
                type="time"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full bg-[#090B0E] border border-[#2B3544] focus:border-[#EF4444] outline-none px-3 py-2 text-sm font-mono tabular-nums text-white rounded-sm"
              />
            </div>
          </div>
          {logicalDate !== date && (
            <div className="text-[11px] font-mono text-[#FCD34D]">
              歸屬交易日：{logicalDate}（凌晨 03:00 前計入前一日）
            </div>
          )}
        </div>

        <div className="lg:col-span-7 border border-[#1E2530] bg-[#0E1218] rounded p-4 flex flex-col justify-between gap-3 text-xs">
          <div className="flex items-center justify-between gap-2 border-b border-[#1E2530]/80 pb-2">
            <span className="text-[#94A3B8]">即時試算數據預覽</span>
            <button
              type="button"
              onClick={() => setShowPreviewData((v) => !v)}
              aria-pressed={showPreviewData}
              className="px-2.5 py-1 border border-[#2B3544] bg-[#090B0E] hover:border-[#475569] text-[#CBD5E1] hover:text-white rounded-sm inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {showPreviewData ? (
                <>
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>隱藏數據</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5" />
                  <span>顯示數據</span>
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <div className="text-[#64748B]">本筆狀態 S</div>
              <div className="font-mono tabular-nums text-lg font-semibold text-white mt-1">
                {!showPreviewData ? (
                  <span className="text-[#475569]">••••</span>
                ) : previewCalc.s !== null ? (
                  previewCalc.s.toFixed(2)
                ) : (
                  '未計分'
                )}
              </div>
            </div>
            <div>
              <div className="text-[#64748B]">當日習慣 H</div>
              <div className="font-mono tabular-nums text-lg font-semibold text-white mt-1">
                {!showPreviewData ? (
                  <span className="text-[#475569]">••••</span>
                ) : previewCalc.h !== null ? (
                  previewCalc.h.toFixed(2)
                ) : (
                  '未勾選'
                )}
              </div>
            </div>
            <div>
              <div className="text-[#64748B]">綜合分數 St</div>
              <div className="font-mono tabular-nums text-lg font-semibold text-white mt-1">
                {!showPreviewData ? (
                  <span className="text-[#475569]">••••</span>
                ) : previewCalc.st !== null ? (
                  previewCalc.st.toFixed(2)
                ) : (
                  '--'
                )}
              </div>
            </div>
            <div>
              <div className="text-[#64748B]">偏離 (St-{BASELINE_SCORE})</div>
              <div
                className={`font-mono tabular-nums text-lg font-semibold mt-1 ${
                  !showPreviewData || timestampClosed
                    ? 'text-[#64748B]'
                    : getDirectionTone(previewCalc.dt).textClass
                }`}
              >
                {!showPreviewData ? (
                  <span className="text-[#475569]">••••</span>
                ) : timestampClosed ? (
                  '不計'
                ) : previewCalc.dt !== null ? (
                  formatSigned(previewCalc.dt, 2)
                ) : (
                  '--'
                )}
              </div>
            </div>
            <div>
              <div className="text-[#64748B]">
                {timestampClosed ? '休市維持前值' : '預估累積 HY'}
              </div>
              <div
                className={`font-mono tabular-nums text-lg font-bold mt-1 ${
                  !showPreviewData || timestampClosed
                    ? 'text-[#64748B]'
                    : getDirectionTone(previewCalc.dt).textClass
                }`}
              >
                {!showPreviewData ? (
                  <span className="text-[#475569]">••••</span>
                ) : timestampClosed ? (
                  formatIndex(priorHyBeforeDate)
                ) : (
                  formatIndex(previewCalc.hy)
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5.1 Numeric Metrics */}
      <section className="border border-[#1E2530] bg-[#0E1218] rounded p-5">
        <div className="flex items-center justify-between border-b border-[#1E2530] pb-3 mb-4">
          <h2 className="text-sm font-semibold text-white">
            四大狀態數值紀錄（0–100 分，0 分為有效數值）
          </h2>
          <span className="text-xs text-[#64748B]">空白代表未填寫，不納入計算</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {AXIS_DEFINITIONS.map((axis) => {
            const val = metrics[axis.key];
            const isFilled = val !== null;
            const prevVal = previousRecord ? previousRecord.metrics[axis.key] : null;
            const hasPrevVal =
              typeof prevVal === 'number' && !Number.isNaN(prevVal) && prevVal >= 0 && prevVal <= 100;
            return (
              <div
                key={axis.key}
                className="border border-[#1E2530] bg-[#090B0E] p-4 rounded-sm space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-medium text-white">{axis.label}</span>
                    <span className="text-xs font-mono text-[#64748B] ml-2">
                      權重 {axis.rawWeight}% (佔綜合 {(axis.compositeWeight * 100).toFixed(0)}%)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMetrics((prev) => ({ ...prev, [axis.key]: null }))}
                    disabled={!isFilled}
                    className={`text-xs px-2 py-0.5 rounded-sm border transition-colors ${
                      isFilled
                        ? 'border-[#2B3544] text-[#94A3B8] hover:text-white cursor-pointer'
                        : 'border-transparent text-[#475569] cursor-default'
                    }`}
                  >
                    {isFilled ? '清除為未填' : '未填寫'}
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <div className="relative flex-1 flex items-center pb-5 pt-1">
                    {hasPrevVal && (
                      <>
                        <span
                          aria-hidden="true"
                          style={{
                            left: `calc(7px + (100% - 14px) * ${prevVal / 100})`,
                          }}
                          className="pointer-events-none absolute top-1/2 -translate-y-[calc(50%+8px)] -translate-x-1/2 w-2 h-3.5 rounded-[1px] border border-[#CBD5E1]/50 bg-[#94A3B8]/35 z-20"
                        />
                        <span
                          style={{
                            left: `calc(7px + (100% - 14px) * ${prevVal / 100})`,
                            transform: `translateX(-${prevVal}%)`,
                          }}
                          className="pointer-events-none absolute bottom-0 text-[10px] font-mono tabular-nums text-[#CBD5E1]/60 bg-[#11161E]/75 border border-[#334155]/45 px-1.5 py-0.5 rounded-[2px] whitespace-nowrap leading-none"
                        >
                          上一筆 {prevVal}
                        </span>
                      </>
                    )}
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={val ?? 50}
                      onChange={(e) => handleAxisInput(axis.key, e.target.value)}
                      aria-label={`${axis.label} 滑桿`}
                      className="hy-slider w-full relative z-10"
                    />
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    placeholder="未填"
                    value={val === null ? '' : val}
                    onChange={(e) => handleAxisInput(axis.key, e.target.value)}
                    aria-label={`${axis.label} 數值輸入`}
                    className="w-24 bg-[#11161E] border border-[#2B3544] focus:border-[#EF4444] outline-none px-2.5 py-1.5 text-right font-mono tabular-nums text-sm text-white rounded-sm"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 5.5 Habit Icon Interface */}
      <section className="border border-[#1E2530] bg-[#0E1218] rounded p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E2530] pb-3">
          <div>
            <h2 className="text-sm font-semibold text-white">
              習慣紀錄勾選（每日每項限計算一次）
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              點擊圖示切換勾選狀態，將同步顯示項目名稱與加減分 · 未勾選代表未記錄
            </p>
          </div>
          <div className="text-xs font-mono tabular-nums text-[#CBD5E1]">
            當日有效習慣：{effectiveDayHabits.length} 項 · Hp：
            {previewCalc.hp !== null ? formatSigned(previewCalc.hp, 0) : '--'}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-[#1E2530] bg-[#090B0E] p-4 rounded-sm">
            <div className="text-xs text-[#94A3B8] mb-3">正面習慣（點擊圖示選取）</div>
            <div className="flex flex-wrap items-center gap-3">
              {positiveHabits.map((h) => {
                const Icon = HABIT_ICONS[h.id];
                const isSelected = effectiveDayHabits.includes(h.id);
                const fromOther =
                  otherRecordHabitsForDate.has(h.id) && !habits.includes(h.id) && isSelected;
                return (
                  <button
                    key={h.id}
                    type="button"
                    title={`${h.label} (+${h.points})`}
                    aria-label={`${h.label} (+${h.points})`}
                    aria-pressed={isSelected}
                    onClick={() => handleToggleHabit(h)}
                    onMouseEnter={() => setHoveredHabit(h)}
                    onMouseLeave={() => setHoveredHabit(null)}
                    className={`relative w-12 h-12 flex items-center justify-center rounded-sm border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#EF4444]/15 border-[#EF4444] text-[#F87171]'
                        : 'bg-[#11161E] border-[#232B36] text-[#94A3B8] hover:text-white hover:border-[#334155]'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {isSelected && (
                      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#EF4444] text-white rounded-sm flex items-center justify-center">
                        <Check className="w-2.5 h-2.5" />
                      </span>
                    )}
                    {fromOther && <span className="sr-only">當日其他紀錄已勾選</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border border-[#1E2530] bg-[#090B0E] p-4 rounded-sm">
            <div className="text-xs text-[#94A3B8] mb-3">負面習慣（點擊圖示選取）</div>
            <div className="flex flex-wrap items-center gap-3">
              {negativeHabits.map((h) => {
                const Icon = HABIT_ICONS[h.id];
                const isSelected = effectiveDayHabits.includes(h.id);
                return (
                  <button
                    key={h.id}
                    type="button"
                    title={`${h.label} (${h.points})`}
                    aria-label={`${h.label} (${h.points})`}
                    aria-pressed={isSelected}
                    onClick={() => handleToggleHabit(h)}
                    onMouseEnter={() => setHoveredHabit(h)}
                    onMouseLeave={() => setHoveredHabit(null)}
                    className={`relative w-12 h-12 flex items-center justify-center rounded-sm border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#22C55E]/15 border-[#22C55E] text-[#4ADE80]'
                        : 'bg-[#11161E] border-[#232B36] text-[#94A3B8] hover:text-white hover:border-[#334155]'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {isSelected && (
                      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#22C55E] text-[#090B0E] rounded-sm flex items-center justify-center">
                        <Check className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="min-h-[38px] border border-[#1E2530] bg-[#090B0E] px-3.5 py-2 rounded-sm flex items-center justify-between text-xs">
          {displayedHint ? (
            <div className="flex items-center gap-3">
              <span className="font-semibold text-white">{displayedHint.habit.label}</span>
              <span
                className={`font-mono tabular-nums font-medium ${
                  displayedHint.habit.points > 0 ? 'text-[#EF4444]' : 'text-[#22C55E]'
                }`}
              >
                {displayedHint.habit.points > 0
                  ? `+${displayedHint.habit.points} 分`
                  : `${displayedHint.habit.points} 分`}
              </span>
              <span className="text-[#94A3B8]">
                · {displayedHint.checked ? '已勾選納入當日習慣分數' : '未勾選'}
              </span>
            </div>
          ) : (
            <span className="text-[#64748B]">
              移動滑鼠或點擊上方圖示，即可即時查看該習慣名稱與加減分
            </span>
          )}

          {effectiveDayHabits.length > 0 && (
            <span className="text-[#94A3B8] font-mono hidden sm:inline">
              已選：
              {HABIT_DEFINITIONS.filter((h) => effectiveDayHabits.includes(h.id))
                .map((h) => h.label)
                .join('、')}
            </span>
          )}
        </div>
      </section>

      {/* Collapsible Tag Lists: Emotion, Body State, and Current Needs & Regulation Tendency */}
      <section className="space-y-3">
        {/* Emotion Tags (Collapsed by default) */}
        <div className="border border-[#1E2530] bg-[#0E1218] rounded overflow-hidden">
          <button
            type="button"
            onClick={() => setEmotionOpen((v) => !v)}
            className="w-full px-5 py-3.5 flex items-center justify-between gap-4 text-left hover:bg-[#121720] transition-colors cursor-pointer"
          >
            <div className="flex flex-wrap items-center gap-3 min-w-0">
              <span className="text-sm font-semibold text-white">情緒標籤（可多選）</span>
              <span className="text-xs font-mono text-[#94A3B8]">
                已選 {emotionTags.length} 項
              </span>
              {emotionTags.length > 0 && (
                <span className="text-xs truncate max-w-[420px]">
                  ·{' '}
                  {emotionTags.map((tag, idx) => {
                    const pol = getEmotionPolarity(tag);
                    const cls =
                      pol === 'positive'
                        ? 'text-[#EF4444]'
                        : pol === 'negative'
                          ? 'text-[#22C55E]'
                          : 'text-[#CBD5E1]';
                    return (
                      <span key={tag} className={cls}>
                        {tag}
                        {idx < emotionTags.length - 1 && (
                          <span className="text-[#64748B]">、</span>
                        )}
                      </span>
                    );
                  })}
                </span>
              )}
            </div>
            <span className="text-xs text-[#94A3B8] inline-flex items-center gap-1 shrink-0">
              {emotionOpen ? '收合清單' : '展開清單'}
              {emotionOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </span>
          </button>

          {emotionOpen && (
            <div className="px-5 pb-5 pt-3 border-t border-[#1E2530] space-y-4">
              {EMOTION_TAG_GROUPS.map((group) => {
                const groupIsPos = group.group.includes('正向');
                const groupIsNeg = group.group.includes('負向');
                const headerTone = groupIsPos
                  ? 'text-[#F87171]'
                  : groupIsNeg
                    ? 'text-[#4ADE80]'
                    : 'text-[#94A3B8]';
                return (
                  <div key={group.group} className="space-y-2">
                    <div className={`text-xs ${headerTone}`}>{group.group}</div>
                    <div className="flex flex-wrap gap-2">
                      {group.tags.map((tag) => {
                        const active = emotionTags.includes(tag);
                        const pol = getEmotionPolarity(tag);
                        const activeStyle =
                          pol === 'negative'
                            ? 'bg-[#22C55E]/15 border-[#22C55E] text-[#4ADE80]'
                            : 'bg-[#EF4444]/15 border-[#EF4444] text-[#F87171]';
                        const inactiveStyle =
                          pol === 'positive'
                            ? 'bg-[#090B0E] border-[#232B36] text-[#EF4444]/85 hover:text-[#EF4444] hover:border-[#EF4444]/50'
                            : pol === 'negative'
                              ? 'bg-[#090B0E] border-[#232B36] text-[#22C55E]/85 hover:text-[#22C55E] hover:border-[#22C55E]/50'
                              : 'bg-[#090B0E] border-[#232B36] text-[#94A3B8] hover:text-white';
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => handleToggleTag(tag, emotionTags, setEmotionTags)}
                            className={`px-2.5 py-1 text-xs rounded-sm border transition-colors cursor-pointer ${
                              active ? activeStyle : inactiveStyle
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {customEmotionOnly.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs text-[#94A3B8]">自訂情緒標籤</div>
                  <div className="flex flex-wrap gap-2">
                    {customEmotionOnly.map((tag) => {
                      const active = emotionTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleToggleTag(tag, emotionTags, setEmotionTags)}
                          className={`px-2.5 py-1 text-xs rounded-sm border transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#EF4444]/15 border-[#EF4444] text-white'
                              : 'bg-[#090B0E] border-[#232B36] text-[#94A3B8] hover:text-white'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="pt-2 flex items-center gap-2">
                <input
                  type="text"
                  value={newEmotionInput}
                  onChange={(e) => setNewEmotionInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomEmotion();
                    }
                  }}
                  placeholder="新增自訂情緒標籤..."
                  className="flex-1 bg-[#090B0E] border border-[#2B3544] focus:border-[#EF4444] outline-none px-3 py-1.5 text-xs text-white rounded-sm"
                />
                <button
                  type="button"
                  onClick={handleAddCustomEmotion}
                  className="px-3 py-1.5 border border-[#2B3544] bg-[#131820] hover:bg-[#1C232E] text-xs text-[#E2E8F0] rounded-sm inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  新增
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Body State Tags (Collapsed by default) */}
        <div className="border border-[#1E2530] bg-[#0E1218] rounded overflow-hidden">
          <button
            type="button"
            onClick={() => setBodyOpen((v) => !v)}
            className="w-full px-5 py-3.5 flex items-center justify-between gap-4 text-left hover:bg-[#121720] transition-colors cursor-pointer"
          >
            <div className="flex flex-wrap items-center gap-3 min-w-0">
              <span className="text-sm font-semibold text-white">身體狀態標籤（可多選）</span>
              <span className="text-xs font-mono text-[#94A3B8]">
                已選 {bodyTags.length} 項
              </span>
              {bodyTags.length > 0 && (
                <span className="text-xs text-[#CBD5E1] truncate max-w-[420px]">
                  · {bodyTags.join('、')}
                </span>
              )}
            </div>
            <span className="text-xs text-[#94A3B8] inline-flex items-center gap-1 shrink-0">
              {bodyOpen ? '收合清單' : '展開清單'}
              {bodyOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </span>
          </button>

          {bodyOpen && (
            <div className="px-5 pb-5 pt-3 border-t border-[#1E2530] space-y-3">
              <div className="flex flex-wrap gap-2">
                {allBodyOptions.map((tag) => {
                  const active = bodyTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleToggleTag(tag, bodyTags, setBodyTags)}
                      className={`px-2.5 py-1 text-xs rounded-sm border transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#EF4444]/15 border-[#EF4444] text-white'
                          : 'bg-[#090B0E] border-[#232B36] text-[#94A3B8] hover:text-white'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
              <div className="pt-2 flex items-center gap-2">
                <input
                  type="text"
                  value={newBodyInput}
                  onChange={(e) => setNewBodyInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomBody();
                    }
                  }}
                  placeholder="新增自訂身體狀態標籤..."
                  className="flex-1 bg-[#090B0E] border border-[#2B3544] focus:border-[#EF4444] outline-none px-3 py-1.5 text-xs text-white rounded-sm"
                />
                <button
                  type="button"
                  onClick={handleAddCustomBody}
                  className="px-3 py-1.5 border border-[#2B3544] bg-[#131820] hover:bg-[#1C232E] text-xs text-[#E2E8F0] rounded-sm inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  新增
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Current Needs & Regulation Tendency Tags (Collapsed by default, record-only) */}
        <div className="border border-[#1E2530] bg-[#0E1218] rounded overflow-hidden">
          <button
            type="button"
            onClick={() => setNeedOpen((v) => !v)}
            className="w-full px-5 py-3.5 flex items-center justify-between gap-4 text-left hover:bg-[#121720] transition-colors cursor-pointer"
          >
            <div className="flex flex-wrap items-center gap-3 min-w-0">
              <span className="text-sm font-semibold text-white">當下需求與調節傾向</span>
              <span className="text-xs text-[#64748B]">純紀錄，不列入計算與回顧</span>
              <span className="text-xs font-mono text-[#94A3B8]">
                已選 {needTags.length} 項
              </span>
              {needTags.length > 0 && (
                <span className="text-xs text-[#CBD5E1] truncate max-w-[360px]">
                  · {needTags.join('、')}
                </span>
              )}
            </div>
            <span className="text-xs text-[#94A3B8] inline-flex items-center gap-1 shrink-0">
              {needOpen ? '收合清單' : '展開清單'}
              {needOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </span>
          </button>

          {needOpen && (
            <div className="px-5 pb-5 pt-3 border-t border-[#1E2530] space-y-3">
              {allNeedOptions.length === 0 ? (
                <p className="text-xs text-[#64748B]">
                  目前尚無預設標籤項目（請於下方新增自訂標籤，或提供完整清單圖片以更新預設選項）。
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {allNeedOptions.map((tag) => {
                    const active = needTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleToggleTag(tag, needTags, setNeedTags)}
                        className={`px-2.5 py-1 text-xs rounded-sm border transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#EF4444]/15 border-[#EF4444] text-white'
                            : 'bg-[#090B0E] border-[#232B36] text-[#94A3B8] hover:text-white'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="pt-2 flex items-center gap-2">
                <input
                  type="text"
                  value={newNeedInput}
                  onChange={(e) => setNewNeedInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomNeed();
                    }
                  }}
                  placeholder="新增當下需求與調節傾向標籤..."
                  className="flex-1 bg-[#090B0E] border border-[#2B3544] focus:border-[#EF4444] outline-none px-3 py-1.5 text-xs text-white rounded-sm"
                />
                <button
                  type="button"
                  onClick={handleAddCustomNeed}
                  className="px-3 py-1.5 border border-[#2B3544] bg-[#131820] hover:bg-[#1C232E] text-xs text-[#E2E8F0] rounded-sm inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  新增
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 5.2 Multi-line Text Notes */}
      <section className="border border-[#1E2530] bg-[#0E1218] rounded p-5 space-y-4">
        <div className="border-b border-[#1E2530] pb-3">
          <h2 className="text-sm font-semibold text-white">文字紀錄與評估理由（自由選填）</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { key: 'events' as const, label: '今天發生的事', placeholder: '記錄今日關鍵事件或行程...' },
            {
              key: 'satisfactionReason' as const,
              label: '現狀與未來目標滿意度的評估理由',
              placeholder: '為何給予今天的滿意度分數？',
            },
            {
              key: 'performanceReason' as const,
              label: '自我狀態表現的評估理由',
              placeholder: '工作、專注力或自我掌控的具體原因...',
            },
            { key: 'goodPoints' as const, label: '做得好的地方', placeholder: '值得保持的行動或決策...' },
            {
              key: 'improvements' as const,
              label: '覺得可以改進的地方',
              placeholder: '未來可微調的具體面向...',
            },
            { key: 'moodDiary' as const, label: '心情日記', placeholder: '補充主觀感受與思緒...' },
          ].map((field) => (
            <div key={field.key}>
              <label
                htmlFor={`note-${field.key}`}
                className="block text-xs font-medium text-[#CBD5E1] mb-1.5"
              >
                {field.label}
              </label>
              <textarea
                id={`note-${field.key}`}
                rows={3}
                value={notes[field.key]}
                onChange={(e) =>
                  setNotes((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                placeholder={field.placeholder}
                className="w-full bg-[#090B0E] border border-[#2B3544] focus:border-[#EF4444] outline-none px-3 py-2 text-sm text-[#E2E8F0] rounded-sm resize-y"
              />
            </div>
          ))}
        </div>
      </section>

      <div className="flex items-center justify-end gap-3 pb-4">
        <button
          type="button"
          onClick={() => {
            setEditingRecordId(null);
            setActivePage('dashboard');
          }}
          className="px-4 py-2 border border-[#2B3544] text-xs text-[#CBD5E1] hover:text-white rounded-sm cursor-pointer"
        >
          取消返回
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 bg-[#EF4444] hover:bg-[#DC2626] disabled:opacity-50 text-white text-sm font-medium rounded-sm inline-flex items-center gap-2 cursor-pointer"
        >
          <Save className="w-4 h-4" />
          {saving ? '儲存中...' : editingRecord ? '更新紀錄並重算指數' : '儲存紀錄並更新指數'}
        </button>
      </div>
    </form>
  );
}
