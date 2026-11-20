import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Edit3,
  FilterX,
  Search,
  Trash2,
} from 'lucide-react';
import { useHy } from '../context/HyContext';
import { formatSigned, isRecordDuringClosure } from '../engine/calculations';
import {
  DEFAULT_BODY_TAGS,
  DEFAULT_EMOTION_TAGS,
  HABIT_DEFINITIONS,
  HabitId,
  getEmotionPolarity,
} from '../types/hy';
import { formatIsoToTaipei, getLogicalTradingDate } from '../utils/taipeiTime';

export function HistoryPage() {
  const {
    config,
    records,
    closures,
    dailySnapshots,
    openEditRecord,
    deleteRecord,
    setEditingRecordId,
    setActivePage,
  } = useHy();

  const [exactDate, setExactDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [emotionFilter, setEmotionFilter] = useState('');
  const [bodyFilter, setBodyFilter] = useState('');
  const [habitFilter, setHabitFilter] = useState<HabitId | ''>('');
  const [keyword, setKeyword] = useState('');

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const snapshotMap = useMemo(
    () => new Map(dailySnapshots.map((s) => [s.date, s])),
    [dailySnapshots]
  );

  const emotionOptions = useMemo(() => {
    const used = new Set<string>([...DEFAULT_EMOTION_TAGS, ...config.customEmotionTags]);
    for (const r of records) {
      for (const t of r.emotionTags) used.add(t);
    }
    return Array.from(used);
  }, [config.customEmotionTags, records]);

  const bodyOptions = useMemo(() => {
    const used = new Set<string>([...DEFAULT_BODY_TAGS, ...config.customBodyTags]);
    for (const r of records) {
      for (const t of r.bodyTags) used.add(t);
    }
    return Array.from(used);
  }, [config.customBodyTags, records]);

  const filteredRecords = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return records.filter((r) => {
      if (exactDate && r.date !== exactDate) return false;
      if (startDate && r.date < startDate) return false;
      if (endDate && r.date > endDate) return false;
      if (emotionFilter && !r.emotionTags.includes(emotionFilter)) return false;
      if (bodyFilter && !r.bodyTags.includes(bodyFilter)) return false;
      if (habitFilter && !r.habits.includes(habitFilter)) return false;
      if (kw) {
        const haystack = [
          r.notes.events,
          r.notes.satisfactionReason,
          r.notes.performanceReason,
          r.notes.goodPoints,
          r.notes.improvements,
          r.notes.moodDiary,
          ...r.emotionTags,
          ...r.bodyTags,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(kw)) return false;
      }
      return true;
    });
  }, [
    bodyFilter,
    emotionFilter,
    endDate,
    exactDate,
    habitFilter,
    keyword,
    records,
    startDate,
  ]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetFilters = () => {
    setExactDate('');
    setStartDate('');
    setEndDate('');
    setEmotionFilter('');
    setBodyFilter('');
    setHabitFilter('');
    setKeyword('');
  };

  const hasFilters = Boolean(
    exactDate || startDate || endDate || emotionFilter || bodyFilter || habitFilter || keyword
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1E2530] pb-4">
        <div>
          <h1 className="text-lg font-bold text-white">歷史紀錄查詢與管理</h1>
          <p className="text-xs text-[#94A3B8] mt-1">
            共 {records.length} 筆紀錄（目前顯示 {filteredRecords.length} 筆）· 修改已結算週期資料後將自動重算受影響週報
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingRecordId(null);
            setActivePage('record');
          }}
          className="px-4 py-2 bg-[#EF4444] hover:bg-[#DC2626] text-white text-xs font-medium rounded-sm cursor-pointer"
        >
          新增紀錄
        </button>
      </div>

      {/* Filter Bar */}
      <section className="border border-[#1E2530] bg-[#0E1218] rounded p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block text-[#94A3B8] mb-1">關鍵字搜尋（日記與標籤）</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="輸入關鍵字..."
                className="w-full bg-[#090B0E] border border-[#2B3544] focus:border-[#EF4444] outline-none pl-8 pr-3 py-2 text-white rounded-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-[#94A3B8] mb-1">指定日期搜尋</label>
            <input
              type="date"
              value={exactDate}
              onChange={(e) => setExactDate(e.target.value)}
              className="w-full bg-[#090B0E] border border-[#2B3544] focus:border-[#EF4444] outline-none px-3 py-2 font-mono text-white rounded-sm"
            />
          </div>

          <div>
            <label className="block text-[#94A3B8] mb-1">區間起始日</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-[#090B0E] border border-[#2B3544] focus:border-[#EF4444] outline-none px-3 py-2 font-mono text-white rounded-sm"
            />
          </div>

          <div>
            <label className="block text-[#94A3B8] mb-1">區間結束日</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-[#090B0E] border border-[#2B3544] focus:border-[#EF4444] outline-none px-3 py-2 font-mono text-white rounded-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs items-end">
          <div>
            <label className="block text-[#94A3B8] mb-1">情緒標籤篩選</label>
            <select
              value={emotionFilter}
              onChange={(e) => setEmotionFilter(e.target.value)}
              className="w-full bg-[#090B0E] border border-[#2B3544] focus:border-[#EF4444] outline-none px-3 py-2 text-white rounded-sm"
            >
              <option value="">全部情緒標籤</option>
              {emotionOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[#94A3B8] mb-1">身體狀態篩選</label>
            <select
              value={bodyFilter}
              onChange={(e) => setBodyFilter(e.target.value)}
              className="w-full bg-[#090B0E] border border-[#2B3544] focus:border-[#EF4444] outline-none px-3 py-2 text-white rounded-sm"
            >
              <option value="">全部身體狀態</option>
              {bodyOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[#94A3B8] mb-1">習慣紀錄篩選</label>
            <select
              value={habitFilter}
              onChange={(e) => setHabitFilter(e.target.value as HabitId | '')}
              className="w-full bg-[#090B0E] border border-[#2B3544] focus:border-[#EF4444] outline-none px-3 py-2 text-white rounded-sm"
            >
              <option value="">全部習慣項目</option>
              {HABIT_DEFINITIONS.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.label} ({h.points > 0 ? `+${h.points}` : h.points})
                </option>
              ))}
            </select>
          </div>

          <div>
            {hasFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="w-full px-3 py-2 border border-[#2B3544] bg-[#131820] hover:bg-[#1C232E] text-[#CBD5E1] rounded-sm inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FilterX className="w-3.5 h-3.5" />
                清除篩選條件
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Records List */}
      <section className="space-y-2.5">
        {filteredRecords.length === 0 ? (
          <div className="border border-[#1E2530] bg-[#0E1218] rounded p-10 text-center text-sm text-[#94A3B8]">
            {records.length === 0 ? '尚無任何歷史紀錄。' : '查無符合篩選條件的紀錄。'}
          </div>
        ) : (
          filteredRecords.map((r) => {
            const isExpanded = expandedIds.has(r.id);
            const closed = isRecordDuringClosure(r, closures);
            const logicalDate = getLogicalTradingDate(r.date, r.time);
            const snap = snapshotMap.get(logicalDate);
            const createdTaipei = formatIsoToTaipei(r.createdAt).dateTimeSec;
            const updatedTaipei = formatIsoToTaipei(r.updatedAt).dateTimeSec;
            const habitLabels = HABIT_DEFINITIONS.filter((h) => r.habits.includes(h.id)).map(
              (h) => `${h.label}(${h.points > 0 ? `+${h.points}` : h.points})`
            );

            return (
              <div
                key={r.id}
                className="border border-[#1E2530] bg-[#0E1218] rounded overflow-hidden"
              >
                {/* Row Header */}
                <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => toggleExpand(r.id)}
                    className="flex-1 min-w-[240px] flex flex-wrap items-center gap-x-5 gap-y-1.5 text-left cursor-pointer"
                  >
                    <span className="font-mono tabular-nums text-sm font-semibold text-white">
                      {r.date} {r.time}
                    </span>

                    <span className="text-xs text-[#94A3B8]">
                      {closed ? '休市紀錄（不計入指數）' : '開市有效'}
                    </span>

                    <span className="text-xs font-mono tabular-nums text-[#CBD5E1]">
                      滿意:{r.metrics.satisfaction ?? '--'} · 表現:{r.metrics.performance ?? '--'} ·
                      心情:{r.metrics.mood ?? '--'} · 精力:{r.metrics.energy ?? '--'}
                    </span>

                    {!closed && snap?.isTradingDay && (
                      <span className="text-xs font-mono tabular-nums text-[#94A3B8]">
                        St:{snap.totalScore?.toFixed(1)} · Dt:{formatSigned(snap.deviationScore, 1)} · 累計HY:{snap.hyIndex.toFixed(2)}
                      </span>
                    )}
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditRecord(r.id)}
                      className="px-2.5 py-1 border border-[#2B3544] bg-[#131820] hover:bg-[#1C232E] text-xs text-[#E2E8F0] rounded-sm inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      修改
                    </button>

                    {confirmDeleteId === r.id ? (
                      <div className="flex items-center gap-1 bg-[#EF4444]/10 border border-[#EF4444]/40 px-2 py-0.5 rounded-sm text-xs">
                        <span className="text-[#F87171]">確認刪除?</span>
                        <button
                          type="button"
                          onClick={() => {
                            deleteRecord(r.id);
                            setConfirmDeleteId(null);
                          }}
                          className="px-1.5 py-0.5 bg-[#EF4444] text-white rounded-sm cursor-pointer"
                        >
                          確定
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-1.5 py-0.5 text-[#CBD5E1] cursor-pointer"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(r.id)}
                        className="px-2.5 py-1 border border-[#EF4444]/30 hover:bg-[#EF4444]/10 text-xs text-[#F87171] rounded-sm inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        刪除
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleExpand(r.id)}
                      aria-label={isExpanded ? '收合詳細內容' : '展開詳細內容'}
                      className="p-1 text-[#94A3B8] hover:text-white cursor-pointer"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-4 py-4 border-t border-[#1E2530] bg-[#090B0E] space-y-4 text-xs">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-[#CBD5E1]">
                      <div>
                        <span className="text-[#64748B]">情緒標籤：</span>
                        {r.emotionTags.length > 0 ? (
                          <span>
                            {r.emotionTags.map((tag, idx) => {
                              const polarity = getEmotionPolarity(tag);
                              const colorClass =
                                polarity === 'positive'
                                  ? 'text-[#EF4444]'
                                  : polarity === 'negative'
                                    ? 'text-[#22C55E]'
                                    : 'text-[#CBD5E1]';
                              return (
                                <span key={tag} className={colorClass}>
                                  {tag}
                                  {idx < r.emotionTags.length - 1 && (
                                    <span className="text-[#475569]"> · </span>
                                  )}
                                </span>
                              );
                            })}
                          </span>
                        ) : (
                          <span>無</span>
                        )}
                      </div>
                      <div>
                        <span className="text-[#64748B]">身體狀態：</span>
                        <span>{r.bodyTags.length > 0 ? r.bodyTags.join(' · ') : '無'}</span>
                      </div>
                      <div>
                        <span className="text-[#64748B]">當下需求與調節傾向：</span>
                        <span>
                          {r.needTags && r.needTags.length > 0 ? r.needTags.join(' · ') : '無'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#64748B]">習慣勾選：</span>
                        <span>{habitLabels.length > 0 ? habitLabels.join(' · ') : '無'}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {[
                        { label: '今天發生的事', val: r.notes.events },
                        { label: '現狀與未來目標滿意度的評估理由', val: r.notes.satisfactionReason },
                        { label: '自我狀態表現的評估理由', val: r.notes.performanceReason },
                        { label: '做得好的地方', val: r.notes.goodPoints },
                        { label: '覺得可以改進的地方', val: r.notes.improvements },
                        { label: '心情日記', val: r.notes.moodDiary },
                      ].map((item) => (
                        <div key={item.label} className="border border-[#1E2530] bg-[#0E1218] p-3 rounded-sm">
                          <div className="text-[#64748B] mb-1">{item.label}</div>
                          <div className="text-[#E2E8F0] whitespace-pre-wrap leading-relaxed">
                            {item.val.trim() ? item.val : '（未填寫）'}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-[#1E2530] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[#64748B]">
                      <span>ID: {r.id}</span>
                      <span>
                        建立時間：{createdTaipei} · 最後修改：{updatedTaipei}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
