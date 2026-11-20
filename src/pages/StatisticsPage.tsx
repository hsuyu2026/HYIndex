import { useMemo, useState } from 'react';
import { getDirectionTone } from '../components/IndexDisplay';
import { useHy } from '../context/HyContext';
import {
  ComparablePeriod,
  computeActualInfluence,
  formatSigned,
} from '../engine/calculations';
import { AXIS_DEFINITIONS, HABIT_DEFINITIONS, getEmotionPolarity } from '../types/hy';

export function StatisticsPage() {
  const { records, settlements, currentWeek, dailySnapshots } = useHy();

  // Build list of selectable periods (settled weeks + current provisional week if it has valid data)
  const periodOptions = useMemo(() => {
    const opts: Array<{ id: string; period: ComparablePeriod }> = [];
    for (const s of settlements) {
      opts.push({
        id: s.weekId,
        period: {
          label: `${s.weekId} (${s.weekStart} ~ ${s.weekEnd})`,
          fourAxisAvg: s.fourAxisAvg,
          avgHabitScore: s.avgHabitScore,
        },
      });
    }
    if (
      currentWeek.validDaysCount > 0 &&
      !settlements.some((s) => s.weekId === currentWeek.weekId)
    ) {
      opts.push({
        id: currentWeek.weekId,
        period: {
          label: `${currentWeek.weekId} 進行中暫估 (${currentWeek.weekStart} ~ ${currentWeek.weekEnd})`,
          fourAxisAvg: currentWeek.fourAxisAvg,
          avgHabitScore: currentWeek.avgHabitScore,
        },
      });
    }
    return opts;
  }, [currentWeek, settlements]);

  const defaultCurrentId =
    periodOptions.length >= 1 ? periodOptions[periodOptions.length - 1].id : '';
  const defaultPrevId =
    periodOptions.length >= 2 ? periodOptions[periodOptions.length - 2].id : '';

  const [selectedCurrentId, setSelectedCurrentId] = useState(defaultCurrentId);
  const [selectedPrevId, setSelectedPrevId] = useState(defaultPrevId);

  const effectiveCurrentId =
    periodOptions.some((o) => o.id === selectedCurrentId) ? selectedCurrentId : defaultCurrentId;
  const effectivePrevId =
    periodOptions.some((o) => o.id === selectedPrevId) ? selectedPrevId : defaultPrevId;

  const currentPeriod =
    periodOptions.find((o) => o.id === effectiveCurrentId)?.period || null;
  const prevPeriod =
    periodOptions.find((o) => o.id === effectivePrevId)?.period || null;

  const influence = useMemo(
    () => computeActualInfluence(currentPeriod, prevPeriod),
    [currentPeriod, prevPeriod]
  );

  // Overall tag & habit stats across all open-market valid days
  const aggregateStats = useMemo(() => {
    const validDays = dailySnapshots.filter((d) => d.isTradingDay);
    const habitDays: Record<string, number> = {};
    for (const h of HABIT_DEFINITIONS) habitDays[h.id] = 0;
    for (const d of validDays) {
      for (const hId of d.dailyHabits) {
        habitDays[hId] = (habitDays[hId] || 0) + 1;
      }
    }

    const emotionCounts = new Map<string, number>();
    const bodyCounts = new Map<string, number>();
    for (const r of records) {
      for (const e of r.emotionTags) emotionCounts.set(e, (emotionCounts.get(e) || 0) + 1);
      for (const b of r.bodyTags) bodyCounts.set(b, (bodyCounts.get(b) || 0) + 1);
    }

    return {
      totalValidDays: validDays.length,
      habitDays,
      emotions: Array.from(emotionCounts.entries()).sort((a, b) => b[1] - a[1]),
      bodies: Array.from(bodyCounts.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [dailySnapshots, records]);

  return (
    <div className="space-y-6">
      <div className="border-b border-[#1E2530] pb-4">
        <h1 className="text-lg font-bold text-white">指數統計與影響力佔比分析</h1>
        <p className="text-xs text-[#94A3B8] mt-1">
          區分「系統固定權重」與「兩週實際貢獻影響力 (Ci / Pi)」· 僅使用兩週皆有有效資料的共同項目進行比較
        </p>
      </div>

      {/* 8.1 Fixed Weight vs 8.2 Actual Influence */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        {/* 8.1 Fixed Weights */}
        <div className="xl:col-span-4 border border-[#1E2530] bg-[#0E1218] rounded p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white border-b border-[#1E2530] pb-3">
              8.1 系統固定權重配置
            </h2>
            <p className="text-xs text-[#64748B] mt-2">
              此為靜態公式權重，不可直接當作指數漲跌的實際影響力。
            </p>

            <table className="w-full text-xs mt-4">
              <thead>
                <tr className="border-b border-[#1E2530] text-[#64748B]">
                  <th className="text-left pb-2 font-normal">項目</th>
                  <th className="text-right pb-2 font-normal">固定權重</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2530]/60">
                {AXIS_DEFINITIONS.map((a) => (
                  <tr key={a.key}>
                    <td className="py-2.5 text-[#E2E8F0]">{a.shortLabel}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-white font-medium">
                      {(a.compositeWeight * 100).toFixed(0)}%
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2.5 text-[#E2E8F0]">習慣紀錄</td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-white font-medium">
                    20%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="pt-3 mt-4 border-t border-[#1E2530] text-[11px] font-mono text-[#64748B] space-y-1">
            <div>Ci = 本週項目貢獻 - 上週項目貢獻</div>
            <div>Pi = |Ci| / 所有項目絕對貢獻總和 × 100%</div>
          </div>
        </div>

        {/* 8.2 Actual Influence Comparison */}
        <div className="xl:col-span-8 border border-[#1E2530] bg-[#0E1218] rounded p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E2530] pb-3">
            <h2 className="text-sm font-semibold text-white">8.2 各項目實際影響力分析</h2>

            {periodOptions.length >= 2 && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <select
                  aria-label="選擇比較本期"
                  value={effectiveCurrentId}
                  onChange={(e) => setSelectedCurrentId(e.target.value)}
                  className="bg-[#090B0E] border border-[#2B3544] px-2.5 py-1.5 text-white rounded-sm"
                >
                  {periodOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      本期：{o.id}
                    </option>
                  ))}
                </select>
                <span className="text-[#64748B]">對比</span>
                <select
                  aria-label="選擇比較前週"
                  value={effectivePrevId}
                  onChange={(e) => setSelectedPrevId(e.target.value)}
                  className="bg-[#090B0E] border border-[#2B3544] px-2.5 py-1.5 text-white rounded-sm"
                >
                  {periodOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      基準：{o.id}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {influence.status === 'insufficient' ? (
            <div className="border border-[#1E2530] bg-[#090B0E] p-8 rounded-sm text-center text-sm text-[#94A3B8]">
              {influence.reason || '資料不足，至少需要兩個具備有效紀錄的週期才能比較實際影響力。'}
            </div>
          ) : influence.status === 'no_change' ? (
            <div className="border border-[#1E2530] bg-[#090B0E] p-8 rounded-sm text-center text-sm text-[#94A3B8]">
              無變動（所有共同有效項目的貢獻變化總和為 0）。
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#1E2530] text-[#64748B]">
                      <th className="text-left py-2 font-normal">共同有效項目</th>
                      <th className="text-right py-2 font-normal">正規化權重</th>
                      <th className="text-right py-2 font-normal">前週均分</th>
                      <th className="text-right py-2 font-normal">本週均分</th>
                      <th className="text-right py-2 font-normal">貢獻變化 (Ci)</th>
                      <th className="text-right py-2 font-normal">日均 HY 影響點</th>
                      <th className="text-right py-2 font-normal">實際影響力 (Pi)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2530]/60">
                    {influence.items.map((item) => {
                      const tone = getDirectionTone(item.deltaCi);
                      return (
                        <tr key={item.key}>
                          <td className="py-2.5 text-white font-medium">{item.label}</td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-[#94A3B8]">
                            {(item.effectiveWeight * 100).toFixed(1)}%
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-[#94A3B8]">
                            {item.previousAvg.toFixed(2)}
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-[#E2E8F0]">
                            {item.currentAvg.toFixed(2)}
                          </td>
                          <td className={`py-2.5 text-right font-mono tabular-nums font-medium ${tone.textClass}`}>
                            {tone.arrow} {formatSigned(item.deltaCi, 2)}
                          </td>
                          <td className={`py-2.5 text-right font-mono tabular-nums ${tone.textClass}`}>
                            {formatSigned(item.deltaHYPoints, 2)}
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-white font-semibold">
                            {item.impactSharePi.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Upward & Downward Drivers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="border border-[#EF4444]/30 bg-[#EF4444]/5 p-3.5 rounded-sm">
                  <div className="text-xs font-semibold text-[#F87171] mb-2">
                    主要上漲原因（正向貢獻）
                  </div>
                  {influence.upwardDrivers.length === 0 ? (
                    <div className="text-xs text-[#64748B]">本組比較無正向貢獻項目</div>
                  ) : (
                    <ul className="space-y-1.5 text-xs">
                      {influence.upwardDrivers.map((d) => (
                        <li key={d.key} className="flex items-center justify-between">
                          <span className="text-[#E2E8F0]">{d.label}</span>
                          <span className="font-mono tabular-nums text-[#EF4444]">
                            +{d.deltaCi.toFixed(2)} 分 ({d.impactSharePi.toFixed(1)}%)
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="border border-[#22C55E]/30 bg-[#22C55E]/5 p-3.5 rounded-sm">
                  <div className="text-xs font-semibold text-[#4ADE80] mb-2">
                    主要下跌原因（負向貢獻）
                  </div>
                  {influence.downwardDrivers.length === 0 ? (
                    <div className="text-xs text-[#64748B]">本組比較無負向貢獻項目</div>
                  ) : (
                    <ul className="space-y-1.5 text-xs">
                      {influence.downwardDrivers.map((d) => (
                        <li key={d.key} className="flex items-center justify-between">
                          <span className="text-[#E2E8F0]">{d.label}</span>
                          <span className="font-mono tabular-nums text-[#22C55E]">
                            {d.deltaCi.toFixed(2)} 分 ({d.impactSharePi.toFixed(1)}%)
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Habit & Tag Statistics */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="border border-[#1E2530] bg-[#0E1218] rounded p-5">
          <h2 className="text-sm font-semibold text-white border-b border-[#1E2530] pb-3 mb-3">
            累計開市日習慣統計（共 {aggregateStats.totalValidDays} 有效天）
          </h2>
          <div className="space-y-2 text-xs">
            {HABIT_DEFINITIONS.map((h) => {
              const count = aggregateStats.habitDays[h.id] || 0;
              return (
                <div
                  key={h.id}
                  className="flex items-center justify-between py-1 border-b border-[#1E2530]/60 last:border-b-0"
                >
                  <span className="text-[#E2E8F0]">
                    {h.label}{' '}
                    <span className={h.points > 0 ? 'text-[#EF4444]' : 'text-[#22C55E]'}>
                      ({h.points > 0 ? `+${h.points}` : h.points})
                    </span>
                  </span>
                  <span className="font-mono tabular-nums text-[#CBD5E1]">{count} 天</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="border border-[#1E2530] bg-[#0E1218] rounded p-5">
          <h2 className="text-sm font-semibold text-white border-b border-[#1E2530] pb-3 mb-3">
            情緒標籤出現次數統計
          </h2>
          {aggregateStats.emotions.length === 0 ? (
            <p className="text-xs text-[#64748B]">尚無情緒標籤紀錄</p>
          ) : (
            <div className="space-y-1.5 text-xs max-h-60 overflow-y-auto pr-1">
              {aggregateStats.emotions.map(([tag, count]) => {
                const polarity = getEmotionPolarity(tag);
                const colorClass =
                  polarity === 'positive'
                    ? 'text-[#EF4444]'
                    : polarity === 'negative'
                      ? 'text-[#22C55E]'
                      : 'text-[#E2E8F0]';
                return (
                  <div
                    key={tag}
                    className="flex items-center justify-between py-1 border-b border-[#1E2530]/60 last:border-b-0"
                  >
                    <span className={colorClass}>{tag}</span>
                    <span className="font-mono tabular-nums text-[#CBD5E1]">{count} 次</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border border-[#1E2530] bg-[#0E1218] rounded p-5">
          <h2 className="text-sm font-semibold text-white border-b border-[#1E2530] pb-3 mb-3">
            身體狀態標籤出現次數統計
          </h2>
          {aggregateStats.bodies.length === 0 ? (
            <p className="text-xs text-[#64748B]">尚無身體狀態標籤紀錄</p>
          ) : (
            <div className="space-y-1.5 text-xs max-h-60 overflow-y-auto pr-1">
              {aggregateStats.bodies.map(([tag, count]) => (
                <div
                  key={tag}
                  className="flex items-center justify-between py-1 border-b border-[#1E2530]/60 last:border-b-0"
                >
                  <span className="text-[#E2E8F0]">{tag}</span>
                  <span className="font-mono tabular-nums text-[#CBD5E1]">{count} 次</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
