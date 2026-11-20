import { useState } from 'react';
import {
  Activity,
  AlarmClock,
  ArrowUpRight,
  Bed,
  BookOpen,
  Clock,
  Moon,
  PenSquare,
  Smartphone,
  Sunrise,
} from 'lucide-react';
import { ChangeDisplay, ScoreValue, getDirectionTone } from '../components/IndexDisplay';
import { HyChart } from '../components/HyChart';
import { useHy } from '../context/HyContext';
import {
  ChartMetric,
  formatIndex,
  formatSigned,
  isRecordDuringClosure,
} from '../engine/calculations';
import {
  AXIS_DEFINITIONS,
  BASELINE_SCORE,
  HABIT_DEFINITIONS,
  HabitId,
  INITIAL_HY_INDEX,
} from '../types/hy';

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

export function DashboardPage() {
  const {
    records,
    closures,
    settlements,
    dailySnapshots,
    marketQuote,
    currentWeek,
    chartTimeframe,
    setChartTimeframe,
    setActivePage,
    setEditingRecordId,
    openEditRecord,
  } = useHy();

  const [selectedMetric, setSelectedMetric] = useState<ChartMetric>('hy');

  const latestSnap = marketQuote.latestValidSnapshot;
  const validSnaps = dailySnapshots.filter((s) => s.isTradingDay);
  const prevSnap = validSnaps.length >= 2 ? validSnaps[validSnaps.length - 2] : null;
  const mainTone = getDirectionTone(marketQuote.changePoints);

  const recentRecords = records.slice(0, 8);
  const latestSettled = marketQuote.latestSettlement;

  const activeMetricLabel =
    selectedMetric === 'hy'
      ? 'HY 指數走勢圖'
      : `${AXIS_DEFINITIONS.find((a) => a.key === selectedMetric)?.label || ''} 走勢圖`;

  return (
    <div className="space-y-6">
      {/* Top Quote Anchor: HY Composite Index */}
      <section className="border border-[#1E2530] bg-[#0E1218] rounded p-5 md:p-6 flex flex-col justify-between">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1E2530] pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
              <span className="font-mono text-[#CBD5E1] font-semibold">HY INDEX</span>
              <span aria-hidden="true">·</span>
              <span>HY 綜合指數</span>
              <span aria-hidden="true">·</span>
              <span className="text-[#CBD5E1]">
                {marketQuote.isMarketClosed
                  ? '休市凍結指數'
                  : !marketQuote.hasAnyTradingDay
                    ? '初始基期（尚無有效紀錄）'
                    : marketQuote.isTodayQuote
                      ? '當日即時累積'
                      : `最新累積指數（${marketQuote.quoteDate}）`}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-baseline gap-4">
              <span
                className={`font-mono tabular-nums text-4xl md:text-5xl font-bold tracking-tight ${
                  marketQuote.hasAnyTradingDay ? mainTone.textClass : 'text-white'
                }`}
              >
                {formatIndex(marketQuote.currentHY)}
              </span>
              <ChangeDisplay
                points={marketQuote.changePoints}
                suffix="點"
                percent={marketQuote.hasAnyTradingDay ? marketQuote.changePercent : null}
                percentPrefix="較昨日"
                size="lg"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingRecordId(null);
                setActivePage('record');
              }}
              className="px-4 py-2 bg-[#EF4444] hover:bg-[#DC2626] text-white text-xs font-medium rounded-sm inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <PenSquare className="w-3.5 h-3.5" />
              新增紀錄
            </button>
          </div>
        </div>

        {/* Quote Metadata Strip: Clearly distinguish St, Dt, Cumulative HY, and Baseline */}
        <div className="pt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <div className="text-[#64748B]">初始基期 / 固定基準分數</div>
            <div className="font-mono tabular-nums text-[#E2E8F0] mt-1">
              {INITIAL_HY_INDEX.toFixed(2)} / {BASELINE_SCORE.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-[#64748B]">每日綜合分數 (St)</div>
            <div className="font-mono tabular-nums text-[#E2E8F0] mt-1">
              {formatIndex(marketQuote.latestTotalScore)}
            </div>
          </div>
          <div>
            <div className="text-[#64748B]">每日偏離分數 (Dt = St - 50)</div>
            <div
              className={`font-mono tabular-nums mt-1 ${
                getDirectionTone(marketQuote.latestDeviation).textClass
              }`}
            >
              {marketQuote.latestDeviation !== null
                ? `${formatSigned(marketQuote.latestDeviation, 2)} 點${
                    marketQuote.changePercent !== null
                      ? ` (較昨日${formatSigned(marketQuote.changePercent, 2)}%)`
                      : ''
                  }`
                : '--'}
            </div>
          </div>
          <div>
            <div className="text-[#64748B]">前有效交易日 HY</div>
            <div className="font-mono tabular-nums text-[#E2E8F0] mt-1">
              {formatIndex(marketQuote.previousHY)}
              {marketQuote.isMarketClosed && '（休市維持）'}
            </div>
          </div>
        </div>
      </section>

      {/* Four State Indices Strip (Clickable to switch chart metric) */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <h2 className="text-sm font-semibold text-white">
            四大狀態指數（佔綜合指數 80% · 點擊框格切換對應走勢圖）
          </h2>
          <span className="text-xs text-[#64748B] font-mono">
            {latestSnap
              ? `統計交易日：${latestSnap.date}（開市當日各欄位平均）`
              : '尚無開市有效紀錄'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {AXIS_DEFINITIONS.map((axis) => {
            const val = latestSnap ? latestSnap.fourAxisAvg[axis.key] : null;
            const prevVal = prevSnap ? prevSnap.fourAxisAvg[axis.key] : null;
            const diff = val !== null && prevVal !== null ? val - prevVal : null;
            const diffTone = getDirectionTone(diff);
            const isSelected = selectedMetric === axis.key;

            return (
              <button
                key={axis.key}
                type="button"
                onClick={() => setSelectedMetric(isSelected ? 'hy' : axis.key)}
                aria-pressed={isSelected}
                className={`text-left border rounded p-4 flex flex-col justify-between transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-[#EF4444] bg-[#161C26]'
                    : 'border-[#1E2530] bg-[#0E1218] hover:border-[#334155] hover:bg-[#121720]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs w-full">
                  <span className="text-[#CBD5E1] font-medium truncate">{axis.label}</span>
                  <span className="font-mono tabular-nums text-[#64748B] shrink-0">
                    {(axis.compositeWeight * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="mt-3 flex items-baseline justify-between gap-2 w-full">
                  <ScoreValue value={val} className="text-2xl font-bold" />
                  <span className={`font-mono tabular-nums text-xs ${diffTone.textClass}`}>
                    {diff !== null ? `${diffTone.arrow} ${formatSigned(diff, 2)}` : '未記錄 / 無比較'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Chart + Habit Summary Split */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        <div className="xl:col-span-8 border border-[#1E2530] bg-[#0E1218] rounded p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">{activeMetricLabel}</h2>
            <div className="flex flex-wrap items-center gap-1 bg-[#090B0E] border border-[#1E2530] p-0.5 rounded text-xs">
              <button
                type="button"
                onClick={() => setSelectedMetric('hy')}
                className={`px-2.5 py-1 rounded-sm cursor-pointer transition-colors ${
                  selectedMetric === 'hy'
                    ? 'bg-[#1F2733] text-white'
                    : 'text-[#94A3B8] hover:text-white'
                }`}
              >
                HY 綜合
              </button>
              {AXIS_DEFINITIONS.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => setSelectedMetric(a.key)}
                  className={`px-2.5 py-1 rounded-sm cursor-pointer transition-colors ${
                    selectedMetric === a.key
                      ? 'bg-[#1F2733] text-white'
                      : 'text-[#94A3B8] hover:text-white'
                  }`}
                >
                  {a.shortLabel}
                </button>
              ))}
            </div>
          </div>

          <HyChart
            metric={selectedMetric}
            timeframe={chartTimeframe}
            onTimeframeChange={setChartTimeframe}
            dailySnapshots={dailySnapshots}
            settlements={settlements}
            closures={closures}
            heightClass="h-[310px]"
          />
        </div>

        {/* Habit Record Summary */}
        <div className="xl:col-span-4 border border-[#1E2530] bg-[#0E1218] rounded p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#1E2530] pb-3">
              <h2 className="text-sm font-semibold text-white">習慣紀錄摘要（佔 20%）</h2>
              <span className="font-mono tabular-nums text-xs text-[#94A3B8]">
                {latestSnap?.date || '--'}
              </span>
            </div>

            <div className="py-4 border-b border-[#1E2530] flex items-baseline justify-between">
              <div>
                <div className="text-xs text-[#64748B]">當日習慣分數 (H)</div>
                <div className="font-mono tabular-nums text-2xl font-bold text-white mt-1">
                  {latestSnap?.habitScoreH !== null && latestSnap?.habitScoreH !== undefined
                    ? latestSnap.habitScoreH.toFixed(2)
                    : '未計分'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-[#64748B]">加減分合計 (Hp)</div>
                <div className="font-mono tabular-nums text-base font-semibold text-[#CBD5E1] mt-1">
                  {latestSnap?.habitPointsHp !== null && latestSnap?.habitPointsHp !== undefined
                    ? formatSigned(latestSnap.habitPointsHp, 0)
                    : '--'}
                </div>
              </div>
            </div>

            <div className="pt-4 space-y-2">
              <div className="text-xs text-[#94A3B8]">最新開市日已勾選項目</div>
              {latestSnap && latestSnap.dailyHabits.length > 0 ? (
                <div className="space-y-1.5">
                  {HABIT_DEFINITIONS.filter((h) => latestSnap.dailyHabits.includes(h.id)).map(
                    (h) => {
                      const Icon = HABIT_ICONS[h.id];
                      return (
                        <div
                          key={h.id}
                          className="flex items-center justify-between text-xs py-1.5 px-2.5 bg-[#090B0E] border border-[#1E2530] rounded-sm"
                        >
                          <span className="flex items-center gap-2 text-[#E2E8F0]">
                            <Icon
                              className={`w-3.5 h-3.5 ${
                                h.points > 0 ? 'text-[#EF4444]' : 'text-[#22C55E]'
                              }`}
                            />
                            <span>{h.label}</span>
                          </span>
                          <span
                            className={`font-mono tabular-nums ${
                              h.points > 0 ? 'text-[#EF4444]' : 'text-[#22C55E]'
                            }`}
                          >
                            {h.points > 0 ? `+${h.points}` : h.points}
                          </span>
                        </div>
                      );
                    }
                  )}
                </div>
              ) : (
                <div className="text-xs text-[#64748B] py-4">
                  最新有效日尚未勾選任何習慣項目（未勾選不代表沒有發生，不納入 H 計分）。
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-[#1E2530] flex items-center justify-between text-xs text-[#64748B]">
            <span>同一交易日限計一次</span>
            <button
              type="button"
              onClick={() => setActivePage('statistics')}
              className="text-[#CBD5E1] hover:text-white cursor-pointer"
            >
              檢視統計分析 →
            </button>
          </div>
        </div>
      </section>

      {/* Weekly Formal Settlement & Current Week Progress (Moved above Recent Records) */}
      <section className="border border-[#1E2530] bg-[#0E1218] rounded p-5">
        <div className="flex items-center justify-between border-b border-[#1E2530] pb-3 mb-4">
          <h2 className="text-sm font-semibold text-white">每週正式結算與本週進度</h2>
          <button
            type="button"
            onClick={() => setActivePage('weekly')}
            className="text-xs text-[#94A3B8] hover:text-white inline-flex items-center gap-1 cursor-pointer"
          >
            週報總覽
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Latest Formal Weekly Settlement */}
          <div className="border border-[#1E2530] bg-[#090B0E] p-4 rounded-sm">
            <div className="flex items-center justify-between text-xs text-[#94A3B8]">
              <span>最近正式週結算</span>
              <span className="font-mono">
                {latestSettled
                  ? `${latestSettled.weekId} · ${latestSettled.completenessLabel}`
                  : '尚未結算'}
              </span>
            </div>
            {latestSettled ? (
              <div className="space-y-1.5 mt-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={`font-mono tabular-nums text-2xl font-bold ${
                      getDirectionTone(latestSettled.weeklyDeviation).textClass
                    }`}
                  >
                    {latestSettled.endHyIndex.toFixed(2)}
                  </span>
                  <ChangeDisplay
                    points={latestSettled.weeklyDeviation}
                    suffix="點（本週偏離）"
                    size="sm"
                  />
                </div>
                <div className="text-[11px] font-mono tabular-nums text-[#64748B]">
                  期初 {latestSettled.startHyIndex.toFixed(2)} · 最高 {latestSettled.highHyIndex.toFixed(2)} / 最低 {latestSettled.lowHyIndex.toFixed(2)}
                </div>
              </div>
            ) : (
              <div className="mt-2.5 text-xs text-[#64748B]">
                每週一凌晨 03:00（台北時間）結束上一週期後自動結算，且結算不重設 HY 指數。
              </div>
            )}
          </div>

          {/* Current In-Progress Week */}
          <div className="border border-[#1E2530] bg-[#090B0E] p-4 rounded-sm">
            <div className="flex items-center justify-between text-xs text-[#94A3B8]">
              <span>本週進行中（累計未結算）</span>
              <span className="font-mono">{currentWeek.weekId}</span>
            </div>
            <div className="mt-2.5 flex items-baseline justify-between gap-2">
              <span className="font-mono tabular-nums text-2xl font-semibold text-[#E2E8F0]">
                {formatIndex(currentWeek.endHyIndex)}
              </span>
              <ChangeDisplay
                points={currentWeek.weeklyDeviation}
                suffix="點"
                size="sm"
              />
            </div>
            <div className="mt-1.5 text-[11px] text-[#64748B] font-mono tabular-nums">
              期初 {currentWeek.startHyIndex.toFixed(2)} · 有效 {currentWeek.validDaysCount} 天 · {currentWeek.completenessLabel}
              {currentWeek.closureDaysCount > 0 && ` · 休市 ${currentWeek.closureDaysCount} 天`}
            </div>
          </div>
        </div>
      </section>

      {/* Recent Records Table */}
      <section className="border border-[#1E2530] bg-[#0E1218] rounded">
        <div className="px-5 py-3.5 border-b border-[#1E2530] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">最近紀錄明細</h2>
          <button
            type="button"
            onClick={() => setActivePage('history')}
            className="text-xs text-[#94A3B8] hover:text-white cursor-pointer"
          >
            查看全部歷史紀錄 ({records.length}) →
          </button>
        </div>

        {recentRecords.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-sm text-[#94A3B8]">
              目前尚未建立任何每日紀錄。新增第一筆狀態與習慣紀錄，即可開始計算您的 HY 綜合指數。
            </p>
            <button
              type="button"
              onClick={() => {
                setEditingRecordId(null);
                setActivePage('record');
              }}
              className="px-4 py-2 bg-[#EF4444] hover:bg-[#DC2626] text-white text-xs font-medium rounded-sm cursor-pointer"
            >
              建立第一筆紀錄
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1E2530] text-[#64748B] bg-[#0B0E13]">
                  <th className="text-left py-2.5 px-4 font-medium">日期時間 (台北)</th>
                  <th className="text-left py-2.5 px-3 font-medium">交易狀態</th>
                  <th className="text-right py-2.5 px-3 font-medium">滿意度</th>
                  <th className="text-right py-2.5 px-3 font-medium">自我表現</th>
                  <th className="text-right py-2.5 px-3 font-medium">心情</th>
                  <th className="text-right py-2.5 px-3 font-medium">精力</th>
                  <th className="text-right py-2.5 px-3 font-medium">習慣</th>
                  <th className="text-left py-2.5 px-4 font-medium">摘要</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2530]/70">
                {recentRecords.map((r) => {
                  const closed = isRecordDuringClosure(r, closures);
                  const notePreview =
                    r.notes.events ||
                    r.notes.moodDiary ||
                    r.notes.goodPoints ||
                    r.notes.improvements ||
                    '--';
                  return (
                    <tr
                      key={r.id}
                      onClick={() => openEditRecord(r.id)}
                      className="hover:bg-[#141922] transition-colors cursor-pointer"
                    >
                      <td className="py-2.5 px-4 font-mono tabular-nums text-[#E2E8F0] whitespace-nowrap">
                        {r.date} {r.time}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={closed ? 'text-[#94A3B8]' : 'text-[#CBD5E1]'}>
                          {closed ? '休市紀錄（不計入）' : '開市有效'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#E2E8F0]">
                        {r.metrics.satisfaction !== null ? r.metrics.satisfaction : '--'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#E2E8F0]">
                        {r.metrics.performance !== null ? r.metrics.performance : '--'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#E2E8F0]">
                        {r.metrics.mood !== null ? r.metrics.mood : '--'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#E2E8F0]">
                        {r.metrics.energy !== null ? r.metrics.energy : '--'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#94A3B8]">
                        {r.habits.length > 0 ? `${r.habits.length} 項` : '--'}
                      </td>
                      <td className="py-2.5 px-4 text-[#94A3B8] max-w-[240px] truncate">
                        {notePreview}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
