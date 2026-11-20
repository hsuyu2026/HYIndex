import { useMemo, useState } from 'react';
import { Check, Copy, Eye, EyeOff, FileSpreadsheet } from 'lucide-react';
import { ChangeDisplay, getDirectionTone } from '../components/IndexDisplay';
import { useHy } from '../context/HyContext';
import {
  computeActualInfluence,
  formatIndex,
  formatSigned,
  generateWeeklyAIPrompt,
} from '../engine/calculations';
import { AXIS_DEFINITIONS, HABIT_DEFINITIONS, getEmotionPolarity } from '../types/hy';
import { formatIsoToTaipei } from '../utils/taipeiTime';

export function WeeklyReportPage() {
  const { records, settlements, currentWeek } = useHy();

  const sortedSettlements = useMemo(
    () => [...settlements].sort((a, b) => b.weekStart.localeCompare(a.weekStart)),
    [settlements]
  );

  const [selectedWeekId, setSelectedWeekId] = useState<string>(
    sortedSettlements[0]?.weekId || ''
  );
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [copied, setCopied] = useState(false);

  const effectiveWeekId = sortedSettlements.some((s) => s.weekId === selectedWeekId)
    ? selectedWeekId
    : sortedSettlements[0]?.weekId || '';

  const selected = useMemo(
    () => sortedSettlements.find((s) => s.weekId === effectiveWeekId) || null,
    [effectiveWeekId, sortedSettlements]
  );

  const prevSettlement = useMemo(() => {
    if (!selected || !selected.prevWeekId) return null;
    return settlements.find((s) => s.weekId === selected.prevWeekId) || null;
  }, [selected, settlements]);

  const influence = useMemo(() => {
    if (!selected || !prevSettlement) {
      return computeActualInfluence(null, null);
    }
    return computeActualInfluence(
      {
        label: selected.weekId,
        fourAxisAvg: selected.fourAxisAvg,
        avgHabitScore: selected.avgHabitScore,
      },
      {
        label: prevSettlement.weekId,
        fourAxisAvg: prevSettlement.fourAxisAvg,
        avgHabitScore: prevSettlement.avgHabitScore,
      }
    );
  }, [prevSettlement, selected]);

  const participatingRecords = useMemo(() => {
    if (!selected) return [];
    const idSet = new Set(selected.participatingRecordIds);
    return records
      .filter((r) => idSet.has(r.id))
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  }, [records, selected]);

  const tagStats = useMemo(() => {
    const emotionMap = new Map<string, number>();
    const bodyMap = new Map<string, number>();
    for (const r of participatingRecords) {
      for (const e of r.emotionTags) emotionMap.set(e, (emotionMap.get(e) || 0) + 1);
      for (const b of r.bodyTags) bodyMap.set(b, (bodyMap.get(b) || 0) + 1);
    }
    return {
      emotions: Array.from(emotionMap.entries()).sort((a, b) => b[1] - a[1]),
      bodies: Array.from(bodyMap.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [participatingRecords]);

  const maxHabitCounts = useMemo(() => {
    if (!selected) return { maxPos: 0, maxNeg: 0 };
    const posCounts = HABIT_DEFINITIONS.filter((h) => h.polarity === 'positive').map(
      (h) => selected.habitCounts[h.id] || 0
    );
    const negCounts = HABIT_DEFINITIONS.filter((h) => h.polarity === 'negative').map(
      (h) => selected.habitCounts[h.id] || 0
    );
    return {
      maxPos: Math.max(0, ...posCounts),
      maxNeg: Math.max(0, ...negCounts),
    };
  }, [selected]);

  const aiPromptText = useMemo(() => {
    if (!selected) return '';
    return generateWeeklyAIPrompt(selected, prevSettlement, records, influence);
  }, [influence, prevSettlement, records, selected]);

  const handleCopyPrompt = async () => {
    if (!aiPromptText) return;
    try {
      await navigator.clipboard.writeText(aiPromptText);
      setCopied(true);
      setShowPromptPreview(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setShowPromptPreview(true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1E2530] pb-4">
        <div>
          <h1 className="text-lg font-bold text-white">每週正式結算與週報</h1>
          <p className="text-xs text-[#94A3B8] mt-1">
            結算範圍：週一 03:00 至隔週一 02:59（台北時間）· 結算時間為每週一凌晨 03:00 · 僅計算開市有效紀錄
          </p>
        </div>

        <div className="border border-[#1E2530] bg-[#0E1218] px-3.5 py-2 rounded-sm text-xs flex flex-wrap items-center gap-3">
          <span className="text-[#94A3B8]">進行中本週 ({currentWeek.weekId}) 累計 HY：</span>
          <span className="font-mono tabular-nums text-white font-semibold">
            {formatIndex(currentWeek.endHyIndex)}
          </span>
          <span className="text-[#94A3B8] font-mono tabular-nums">
            （偏離 {formatSigned(currentWeek.weeklyDeviation, 2)} 點 · {currentWeek.validDaysCount} 天）
          </span>
        </div>
      </div>

      {sortedSettlements.length === 0 ? (
        <div className="border border-[#1E2530] bg-[#0E1218] rounded p-10 text-center space-y-2">
          <FileSpreadsheet className="w-8 h-8 text-[#64748B] mx-auto" />
          <p className="text-sm text-[#CBD5E1]">尚無已完成結算的歷史週報</p>
          <p className="text-xs text-[#64748B]">
            每週一凌晨 03:00（台北時間）週期結束後，開啟網站時將自動執行延遲週結算。若該週整週休市或無有效開市資料，系統不會產生虛假結算。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* Left: Settled Weeks List */}
          <aside className="xl:col-span-3 border border-[#1E2530] bg-[#0E1218] rounded overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1E2530] text-xs font-semibold text-[#CBD5E1]">
              已結算週期列表 ({sortedSettlements.length})
            </div>
            <div className="divide-y divide-[#1E2530]/70 max-h-[540px] overflow-y-auto">
              {sortedSettlements.map((w) => {
                const active = w.weekId === selected?.weekId;
                const tone = getDirectionTone(w.weeklyDeviation);
                return (
                  <button
                    key={w.weekId}
                    type="button"
                    onClick={() => {
                      setSelectedWeekId(w.weekId);
                      setShowPromptPreview(false);
                    }}
                    className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                      active ? 'bg-[#171D26]' : 'hover:bg-[#12161E]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-white">
                        {w.weekId}
                      </span>
                      <span className={`font-mono tabular-nums text-sm font-bold ${tone.textClass}`}>
                        {w.endHyIndex.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[11px] text-[#94A3B8]">
                      <span className="font-mono">{w.weekStart} ~ {w.weekEnd.slice(5)}</span>
                      <span className={`font-mono tabular-nums ${tone.textClass}`}>
                        {formatSigned(w.weeklyDeviation, 2)} 點
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Right: Selected Weekly Report Detail */}
          {selected && (
            <div className="xl:col-span-9 space-y-5">
              {/* Report Summary Card */}
              <div className="border border-[#1E2530] bg-[#0E1218] rounded p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1E2530] pb-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
                      <span className="font-mono text-white font-semibold">{selected.weekId}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">
                        {selected.weekStart} ~ {selected.weekEnd}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          selected.completeness === 'insufficient'
                            ? 'text-[#FCD34D]'
                            : 'text-[#CBD5E1]'
                        }
                      >
                        {selected.completenessLabel}
                        {selected.completeness === 'insufficient' && '（資料天數較少）'}
                      </span>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-baseline gap-4">
                      <span
                        className={`font-mono tabular-nums text-4xl font-bold ${
                          getDirectionTone(selected.weeklyDeviation).textClass
                        }`}
                      >
                        {selected.endHyIndex.toFixed(2)}
                      </span>
                      <ChangeDisplay
                        points={selected.weeklyDeviation}
                        suffix="點（本週累積偏離）"
                        size="md"
                      />
                    </div>
                  </div>

                  {/* AI Prompt Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowPromptPreview((v) => !v)}
                      className="px-3 py-2 border border-[#2B3544] bg-[#131820] hover:bg-[#1C232E] text-xs text-[#E2E8F0] rounded-sm inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {showPromptPreview ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                      {showPromptPreview ? '收合提示詞預覽' : '預覽 AI 提示詞'}
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyPrompt}
                      className="px-4 py-2 bg-[#EF4444] hover:bg-[#DC2626] text-white text-xs font-medium rounded-sm inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? '已複製提示詞' : '複製 AI 分析提示詞'}
                    </button>
                  </div>
                </div>

                {/* Metadata Grid: v1.2.0 start/end/high/low/avgSt */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-xs">
                  <div>
                    <div className="text-[#64748B]">本週期初 HY</div>
                    <div className="font-mono tabular-nums text-[#E2E8F0] mt-1">
                      {selected.startHyIndex.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[#64748B]">本週期末 HY</div>
                    <div className="font-mono tabular-nums text-white font-semibold mt-1">
                      {selected.endHyIndex.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[#64748B]">最高 / 最低 HY</div>
                    <div className="font-mono tabular-nums text-[#E2E8F0] mt-1">
                      {selected.highHyIndex.toFixed(2)} / {selected.lowHyIndex.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[#64748B]">週均綜合分數 (Avg St)</div>
                    <div className="font-mono tabular-nums text-[#E2E8F0] mt-1">
                      {selected.avgTotalScore.toFixed(2)}（基準 {selected.baselineScore}）
                    </div>
                  </div>
                  <div>
                    <div className="text-[#64748B]">有效開市 / 休市天數</div>
                    <div className="font-mono tabular-nums text-[#E2E8F0] mt-1">
                      有效 {selected.validDaysCount} 天 · 休市 {selected.closureDaysCount} 天
                    </div>
                  </div>
                  <div>
                    <div className="text-[#64748B]">結算時間與公式</div>
                    <div className="font-mono tabular-nums text-[#94A3B8] mt-1">
                      {formatIsoToTaipei(selected.settledAt).date} · v{selected.formulaVersion}
                    </div>
                  </div>
                </div>
              </div>

              {/* AI Prompt Preview Panel */}
              {showPromptPreview && (
                <div className="border border-[#2B3544] bg-[#0B0E13] rounded p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">
                      AI 分析提示詞預覽（可直接貼上至您慣用的外部 AI 模型）
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyPrompt}
                      className="text-[#F87171] hover:text-white inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      {copied ? '已複製' : '一鍵複製'}
                    </button>
                  </div>
                  <textarea
                    readOnly
                    rows={14}
                    value={aiPromptText}
                    className="w-full bg-[#090B0E] border border-[#1E2530] p-3 text-xs font-mono text-[#CBD5E1] rounded-sm resize-y outline-none"
                  />
                </div>
              )}

              {/* 4 Axes & Habits & Influence */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="border border-[#1E2530] bg-[#0E1218] rounded p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-white border-b border-[#1E2530] pb-2.5">
                    四大狀態指數變化
                  </h3>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[#64748B] border-b border-[#1E2530]">
                        <th className="text-left py-2 font-normal">項目</th>
                        <th className="text-right py-2 font-normal">本週均分</th>
                        <th className="text-right py-2 font-normal">上週均分</th>
                        <th className="text-right py-2 font-normal">變化</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E2530]/60">
                      {AXIS_DEFINITIONS.map((a) => {
                        const curr = selected.fourAxisAvg[a.key];
                        const prev = prevSettlement ? prevSettlement.fourAxisAvg[a.key] : null;
                        const diff = curr !== null && prev !== null ? curr - prev : null;
                        const tone = getDirectionTone(diff);
                        return (
                          <tr key={a.key}>
                            <td className="py-2 text-[#E2E8F0]">{a.shortLabel}</td>
                            <td className="py-2 text-right font-mono tabular-nums text-white">
                              {formatIndex(curr)}
                            </td>
                            <td className="py-2 text-right font-mono tabular-nums text-[#94A3B8]">
                              {formatIndex(prev)}
                            </td>
                            <td className={`py-2 text-right font-mono tabular-nums ${tone.textClass}`}>
                              {diff !== null ? `${tone.arrow} ${formatSigned(diff, 2)}` : '--'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="border border-[#1E2530] bg-[#0E1218] rounded p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#1E2530] pb-2.5">
                    <h3 className="text-sm font-semibold text-white">習慣紀錄統計</h3>
                    <span className="text-xs font-mono text-[#94A3B8]">
                      週均 H：{formatIndex(selected.avgHabitScore)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    {HABIT_DEFINITIONS.map((h) => {
                      const count = selected.habitCounts[h.id] || 0;
                      const isTopPos =
                        h.polarity === 'positive' && count > 0 && count === maxHabitCounts.maxPos;
                      const isTopNeg =
                        h.polarity === 'negative' && count > 0 && count === maxHabitCounts.maxNeg;
                      const labelClass = isTopPos
                        ? 'text-[#EF4444] font-semibold'
                        : isTopNeg
                          ? 'text-[#22C55E] font-semibold'
                          : 'text-[#CBD5E1]';
                      const countClass = isTopPos
                        ? 'text-[#EF4444] font-semibold'
                        : isTopNeg
                          ? 'text-[#22C55E] font-semibold'
                          : 'text-white';
                      return (
                        <div
                          key={h.id}
                          className="flex items-center justify-between py-1 border-b border-[#1E2530]/50"
                        >
                          <span className={labelClass}>{h.label}</span>
                          <span className={`font-mono tabular-nums ${countClass}`}>
                            {count} 天
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Actual Influence Summary */}
              <div className="border border-[#1E2530] bg-[#0E1218] rounded p-5 space-y-3">
                <h3 className="text-sm font-semibold text-white border-b border-[#1E2530] pb-2.5">
                  本週各項目實際影響力（較上週 {selected.prevWeekId || '無上週'}）
                </h3>
                {influence.status !== 'ok' ? (
                  <p className="text-xs text-[#94A3B8]">
                    {influence.reason || '無上週資料可進行實際影響力比較。'}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                    {influence.items.map((item) => {
                      const tone = getDirectionTone(item.deltaCi);
                      return (
                        <div
                          key={item.key}
                          className="border border-[#1E2530] bg-[#090B0E] p-3 rounded-sm"
                        >
                          <div className="text-[#CBD5E1] font-medium">{item.label}</div>
                          <div className="font-mono tabular-nums text-lg font-bold text-white mt-1">
                            {item.impactSharePi.toFixed(1)}%
                          </div>
                          <div className={`font-mono tabular-nums text-[11px] mt-1 ${tone.textClass}`}>
                            {tone.arrow} {formatSigned(item.deltaCi, 2)} 分
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Tags & Notes & Traceability */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="border border-[#1E2530] bg-[#0E1218] rounded p-5 space-y-3 text-xs">
                  <h3 className="text-sm font-semibold text-white border-b border-[#1E2530] pb-2.5">
                    情緒與身體狀態標籤統計
                  </h3>
                  <div>
                    <div className="text-[#64748B] mb-1">情緒標籤：</div>
                    <div className="flex flex-wrap gap-x-1.5 gap-y-1">
                      {tagStats.emotions.length > 0 ? (
                        tagStats.emotions.map(([k, v], idx) => {
                          const polarity = getEmotionPolarity(k);
                          const colorClass =
                            polarity === 'positive'
                              ? 'text-[#EF4444]'
                              : polarity === 'negative'
                                ? 'text-[#22C55E]'
                                : 'text-[#E2E8F0]';
                          return (
                            <span key={k} className={colorClass}>
                              {k} ({v})
                              {idx < tagStats.emotions.length - 1 && (
                                <span className="text-[#475569] ml-1.5">·</span>
                              )}
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-[#E2E8F0]">無</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-[#64748B] mb-1">身體狀態：</div>
                    <div className="text-[#E2E8F0]">
                      {tagStats.bodies.length > 0
                        ? tagStats.bodies.map(([k, v]) => `${k} (${v})`).join(' · ')
                        : '無'}
                    </div>
                  </div>
                </div>

                <div className="border border-[#1E2530] bg-[#0E1218] rounded p-5 space-y-2 text-xs">
                  <h3 className="text-sm font-semibold text-white border-b border-[#1E2530] pb-2.5">
                    結算計算依據與資料追溯
                  </h3>
                  <div className="text-[#94A3B8]">
                    參與結算日期（{selected.participatingDates.length} 天）：
                    <span className="font-mono text-[#E2E8F0] ml-1">
                      {selected.participatingDates.join(', ')}
                    </span>
                  </div>
                  <div className="text-[#94A3B8]">
                    參與計算紀錄筆數：
                    <span className="font-mono text-[#E2E8F0] ml-1">
                      {selected.participatingRecordIds.length} 筆
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-[#64748B] break-all">
                    紀錄 ID：{selected.participatingRecordIds.join(', ')}
                  </div>
                </div>
              </div>

              {/* Important Text Records */}
              <div className="border border-[#1E2530] bg-[#0E1218] rounded p-5 space-y-3">
                <h3 className="text-sm font-semibold text-white border-b border-[#1E2530] pb-2.5">
                  本週參與結算之重要文字紀錄
                </h3>
                <div className="space-y-3">
                  {participatingRecords.map((r) => {
                    const hasNotes = Object.values(r.notes).some((v) => v.trim().length > 0);
                    if (!hasNotes) return null;
                    return (
                      <div
                        key={r.id}
                        className="border border-[#1E2530] bg-[#090B0E] p-3.5 rounded-sm text-xs space-y-1.5"
                      >
                        <div className="font-mono text-[#94A3B8]">
                          {r.date} {r.time}
                        </div>
                        {r.notes.events && (
                          <div className="text-[#E2E8F0]">
                            <span className="text-[#64748B]">事件：</span>
                            {r.notes.events}
                          </div>
                        )}
                        {r.notes.goodPoints && (
                          <div className="text-[#E2E8F0]">
                            <span className="text-[#64748B]">做得好：</span>
                            {r.notes.goodPoints}
                          </div>
                        )}
                        {r.notes.improvements && (
                          <div className="text-[#E2E8F0]">
                            <span className="text-[#64748B]">可改進：</span>
                            {r.notes.improvements}
                          </div>
                        )}
                        {r.notes.moodDiary && (
                          <div className="text-[#E2E8F0]">
                            <span className="text-[#64748B]">心情日記：</span>
                            {r.notes.moodDiary}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {participatingRecords.every(
                    (r) => !Object.values(r.notes).some((v) => v.trim().length > 0)
                  ) && <p className="text-xs text-[#64748B]">本週參與紀錄未填寫文字內容。</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
