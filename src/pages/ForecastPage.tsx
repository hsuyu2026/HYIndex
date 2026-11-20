import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CategoryScale,
  Chart,
  ChartConfiguration,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { AlertTriangle, ArrowLeft, Compass, Info } from 'lucide-react';
import { ChangeDisplay, getDirectionTone } from '../components/IndexDisplay';
import { useHy } from '../context/HyContext';
import {
  computeTrendForecast,
  formatIndex,
  formatSigned,
} from '../engine/calculations';
import { BASELINE_SCORE, INITIAL_HY_INDEX } from '../types/hy';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler
);

export function ForecastPage() {
  const { dailySnapshots, records, closures, setActivePage, openEditRecord } = useHy();

  // Resets to false on every mount so entering the page ALWAYS presents the warning first
  const [acknowledgedWarning, setAcknowledgedWarning] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  const forecast = useMemo(
    () => computeTrendForecast(dailySnapshots, records, closures, Date.now()),
    [dailySnapshots, records, closures]
  );

  useEffect(() => {
    if (!acknowledgedWarning || !forecast.hasEnoughData) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const timeline = forecast.timeline;
    const labels = timeline.map((t) => t.label);
    const actualData = timeline.map((t) => t.actualHY);
    const forecastData = timeline.map((t) => t.forecastHY);
    const baselineData = timeline.map(() => INITIAL_HY_INDEX);

    const forecastColor =
      forecast.trendDirection === 'up'
        ? '#EF4444'
        : forecast.trendDirection === 'down'
          ? '#22C55E'
          : '#94A3B8';

    const forecastFill =
      forecast.trendDirection === 'up'
        ? 'rgba(239, 68, 68, 0.08)'
        : forecast.trendDirection === 'down'
          ? 'rgba(34, 197, 94, 0.08)'
          : 'rgba(148, 163, 184, 0.06)';

    const config: ChartConfiguration<'line', Array<number | null>, string> = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: '過去 30 天實際 HY 指數',
            data: actualData,
            borderColor: '#CBD5E1',
            borderWidth: 2,
            tension: 0.12,
            spanGaps: true,
            fill: false,
            pointRadius: (ctx) => {
              const pt = timeline[ctx.dataIndex];
              if (!pt || pt.actualHY === null) return 0;
              if (pt.isClosedSegment || pt.isCarryForward) return 2.5;
              return 3;
            },
            pointBackgroundColor: (ctx) => {
              const pt = timeline[ctx.dataIndex];
              if (!pt) return '#CBD5E1';
              if (pt.isClosedSegment || pt.isCarryForward) return '#64748B';
              if (pt.deviationScore !== null) {
                if (pt.deviationScore > 1e-9) return '#EF4444';
                if (pt.deviationScore < -1e-9) return '#22C55E';
              }
              return '#94A3B8';
            },
            segment: {
              borderDash: (ctx) => {
                const p0 = timeline[ctx.p0DataIndex];
                const p1 = timeline[ctx.p1DataIndex];
                if (p0?.isClosedSegment || p1?.isClosedSegment) return [4, 4];
                return undefined;
              },
              borderColor: (ctx) => {
                const p0 = timeline[ctx.p0DataIndex];
                const p1 = timeline[ctx.p1DataIndex];
                if (p0?.isClosedSegment || p1?.isClosedSegment || p1?.isCarryForward) {
                  return '#64748B';
                }
                const y0 = ctx.p0.parsed.y;
                const y1 = ctx.p1.parsed.y;
                if (y0 !== null && y1 !== null) {
                  if (y1 > y0) return '#EF4444';
                  if (y1 < y0) return '#22C55E';
                }
                return '#94A3B8';
              },
            },
          },
          {
            label: '未來 7 天潛在走勢預測（虛線）',
            data: forecastData,
            borderColor: forecastColor,
            backgroundColor: forecastFill,
            borderWidth: 2.25,
            borderDash: [6, 4],
            tension: 0,
            spanGaps: false,
            fill: true,
            pointRadius: (ctx) => {
              const pt = timeline[ctx.dataIndex];
              if (!pt || pt.forecastHY === null) return 0;
              return pt.isForecast ? 4 : 3.5;
            },
            pointHoverRadius: 5.5,
            pointBackgroundColor: forecastColor,
            pointBorderColor: '#090B0E',
            pointBorderWidth: 1.5,
          },
          {
            label: `初始基期 (${INITIAL_HY_INDEX.toFixed(2)})`,
            data: baselineData,
            borderColor: '#475569',
            borderWidth: 1,
            borderDash: [4, 4],
            pointRadius: 0,
            pointHoverRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0F1319',
            borderColor: '#2B3544',
            borderWidth: 1,
            titleColor: '#F8FAFC',
            bodyColor: '#CBD5E1',
            padding: 10,
            displayColors: false,
            titleFont: { family: '"IBM Plex Mono", monospace', size: 12, weight: 600 },
            bodyFont: { family: '"IBM Plex Mono", monospace', size: 12 },
            callbacks: {
              title: (items) => {
                if (!items.length) return '';
                const pt = timeline[items[0].dataIndex];
                if (!pt) return '';
                return pt.isForecast
                  ? `${pt.date}（未來趨勢推估 · 僅供參考）`
                  : `${pt.date}（歷史紀錄）`;
              },
              label: (ctx) => {
                const pt = timeline[ctx.dataIndex];
                if (!pt) return '';
                if (ctx.datasetIndex === 2) return '';
                if (ctx.datasetIndex === 0 && pt.actualHY !== null) {
                  const lines = [`實際累計 HY：${formatIndex(pt.actualHY)}`];
                  if (pt.deviationScore !== null && pt.totalScore !== null) {
                    lines.push(`當日綜合分數 (St)：${formatIndex(pt.totalScore)}`);
                    lines.push(`當日偏離 (Dt)：${formatSigned(pt.deviationScore, 2)} 點`);
                  } else if (pt.isClosedSegment) {
                    lines.push('狀態：休市凍結');
                  } else if (pt.isCarryForward) {
                    lines.push('狀態：無紀錄（維持前值）');
                  }
                  return lines;
                }
                if (ctx.datasetIndex === 1 && pt.forecastHY !== null && pt.isForecast) {
                  return [
                    `推估潛在 HY：${formatIndex(pt.forecastHY)}`,
                    `套用 30 日平均偏離：${formatSigned(forecast.avgDeviation30d, 2)} 點/日`,
                    '註：此線性外推僅供觀察參考',
                  ];
                }
                return '';
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: {
              color: '#64748B',
              maxTicksLimit: 12,
              font: { family: '"IBM Plex Mono", monospace', size: 11 },
            },
          },
          y: {
            position: 'right',
            grace: '8%',
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#94A3B8',
              font: { family: '"IBM Plex Mono", monospace', size: 11 },
              callback: (v) => Number(v).toFixed(2),
            },
          },
        },
      },
    };

    chartRef.current = new Chart(canvas, config);

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [acknowledgedWarning, forecast]);

  // Mandatory Warning Gate displayed on every visit before entering
  if (!acknowledgedWarning) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <div className="border border-[#F59E0B]/50 bg-[#0E1218] rounded p-6 md:p-8 space-y-5">
          <div className="flex items-start gap-3 border-b border-[#1E2530] pb-4">
            <AlertTriangle className="w-6 h-6 text-[#F59E0B] shrink-0 mt-0.5" />
            <div>
              <h1 className="text-lg font-bold text-white">警示：趨勢預測頁面僅供參考</h1>
              <p className="text-xs text-[#FCD34D] mt-1">
                每次進入「趨勢預測」前均須確認本警示說明
              </p>
            </div>
          </div>

          <div className="space-y-3 text-sm text-[#CBD5E1] leading-relaxed">
            <p>
              「趨勢預測」功能僅根據您過去 30 天有效開市日的平均每日偏離分數（
              <span className="font-mono text-white">Avg Dt</span>
              ），對未來 7 天的 HY 指數進行線性外推模擬。
            </p>
            <div className="border border-[#1E2530] bg-[#090B0E] p-4 rounded-sm text-xs text-[#94A3B8] space-y-1.5">
              <div>• 未來走勢推估僅為歷史慣性之統計延伸，絕非未來必定發生的結果。</div>
              <div>• 預測未計入未來可能出現的休市安排、突發生活事件或作息調整。</div>
              <div>• 本頁面所有數值與原因拆解均僅供個人自我觀察參考，不構成任何醫療、心理診斷或行動保證。</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setActivePage('dashboard')}
              className="px-4 py-2 border border-[#2B3544] bg-[#131820] hover:bg-[#1C232E] text-xs text-[#E2E8F0] rounded-sm inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              返回行情總覽
            </button>
            <button
              type="button"
              onClick={() => setAcknowledgedWarning(true)}
              className="px-4 py-2 bg-[#F59E0B] hover:bg-[#D97706] text-[#090B0E] text-xs font-semibold rounded-sm cursor-pointer"
            >
              我已了解此頁面僅供參考，進入趨勢預測
            </button>
          </div>
        </div>
      </div>
    );
  }

  const trendTone = getDirectionTone(forecast.projected7dChange);

  return (
    <div className="space-y-6">
      {/* Header + Persistent Reference Warning */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1E2530] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-[#EF4444]" />
            <h1 className="text-lg font-bold text-white">趨勢預測（30 日平均偏離推估未來 7 天）</h1>
          </div>
          <p className="text-xs text-[#94A3B8] mt-1">
            統計視窗：{forecast.windowStart} ~ {forecast.windowEnd}（過去 30 天有效開市 {forecast.validDaysCount} 天）
          </p>
        </div>

        <div className="border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-3 py-1.5 rounded-sm text-xs text-[#FDE68A] inline-flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
          <span>僅供趨勢觀察參考，非實際保證結果</span>
        </div>
      </div>

      {!forecast.hasEnoughData ? (
        <div className="border border-[#1E2530] bg-[#0E1218] rounded p-10 text-center space-y-3">
          <Info className="w-8 h-8 text-[#64748B] mx-auto" />
          <p className="text-sm text-[#CBD5E1]">
            過去 30 天內（{forecast.windowStart} ~ {forecast.windowEnd}）尚無有效的開市紀錄
          </p>
          <p className="text-xs text-[#64748B]">
            至少需有 1 筆過去 30 天內的開市有效數值紀錄，系統才能計算 30 日平均偏離分數並推估未來 7 天潛在走勢。
          </p>
        </div>
      ) : (
        <>
          {/* Key Forecast Summary Strip */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="border border-[#1E2530] bg-[#0E1218] rounded p-4">
              <div className="text-xs text-[#64748B]">目前基準 HY 指數</div>
              <div className="font-mono tabular-nums text-2xl font-bold text-white mt-1.5">
                {formatIndex(forecast.anchorHY)}
              </div>
              <div className="text-[11px] font-mono text-[#94A3B8] mt-1">
                統計截至 {forecast.todayDate}
              </div>
            </div>

            <div className="border border-[#1E2530] bg-[#0E1218] rounded p-4">
              <div className="text-xs text-[#64748B]">過去 30 天平均偏離 (Avg Dt)</div>
              <div
                className={`font-mono tabular-nums text-2xl font-bold mt-1.5 ${
                  getDirectionTone(forecast.avgDeviation30d).textClass
                }`}
              >
                {formatSigned(forecast.avgDeviation30d, 2)} 點/日
              </div>
              <div className="text-[11px] font-mono text-[#94A3B8] mt-1">
                30 日均 St：{formatIndex(forecast.avgTotalScore30d)}（基準 {BASELINE_SCORE}）
              </div>
            </div>

            <div className="border border-[#1E2530] bg-[#0E1218] rounded p-4">
              <div className="text-xs text-[#64748B]">未來 7 天潛在 HY 指數（推估）</div>
              <div className={`font-mono tabular-nums text-2xl font-bold mt-1.5 ${trendTone.textClass}`}>
                {formatIndex(forecast.projectedEndHY)}
              </div>
              <div className="text-[11px] font-mono text-[#94A3B8] mt-1">
                預估區間終點（第 +7 日）
              </div>
            </div>

            <div className="border border-[#1E2530] bg-[#0E1218] rounded p-4">
              <div className="text-xs text-[#64748B]">未來 7 天推估變化</div>
              <div className="mt-2">
                <ChangeDisplay
                  points={forecast.projected7dChange}
                  suffix="點"
                  percent={forecast.projected7dPercent}
                  percentPrefix="推估"
                  size="lg"
                />
              </div>
              <div className="text-[11px] text-[#94A3B8] mt-1.5">
                {forecast.trendDirection === 'up'
                  ? '慣性偏向推升（僅供參考）'
                  : forecast.trendDirection === 'down'
                    ? '慣性偏向回落（僅供參考）'
                    : '慣性維持平盤（僅供參考）'}
              </div>
            </div>
          </section>

          {/* Dashed Forecast Chart */}
          <section className="border border-[#1E2530] bg-[#0E1218] rounded p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-white">
                近 30 日實際走勢與未來 7 日潛在走勢預測圖
              </h2>
              <div className="flex flex-wrap items-center gap-4 text-xs text-[#94A3B8]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-4 h-[2px] bg-[#CBD5E1] inline-block" />
                  過去 30 天實際走勢（紅漲綠跌）
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={`w-4 border-t-2 border-dashed inline-block ${
                      forecast.trendDirection === 'up'
                        ? 'border-[#EF4444]'
                        : forecast.trendDirection === 'down'
                          ? 'border-[#22C55E]'
                          : 'border-[#94A3B8]'
                    }`}
                  />
                  未來 7 天潛在走勢（虛線標記）
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 border-t border-dashed border-[#475569] inline-block" />
                  基期 {INITIAL_HY_INDEX.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="h-[320px] relative border border-[#1E2530] bg-[#0D1015] rounded p-3">
              <canvas ref={canvasRef} />
            </div>
          </section>

          {/* Historical Cause Attribution Section */}
          <section className="space-y-4">
            <div className="border border-[#1E2530] bg-[#0E1218] rounded p-5 space-y-3">
              <h2 className="text-sm font-semibold text-white border-b border-[#1E2530] pb-2.5">
                造成此未來走勢的歷史原因解析
              </h2>
              <ul className="space-y-2 text-xs text-[#E2E8F0] leading-relaxed">
                {forecast.causeSummaryLines.map((line, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="font-mono text-[#64748B] shrink-0">{idx + 1}.</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Factor Contributions + Habit & Tag Drivers */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              {/* Quantitative 4-Axis & Habits Contribution Table */}
              <div className="xl:col-span-7 border border-[#1E2530] bg-[#0E1218] rounded p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-[#1E2530] pb-2.5">
                  <h3 className="text-sm font-semibold text-white">
                    各項目偏離貢獻拆解（過去 30 天）
                  </h3>
                  <span className="text-[11px] font-mono text-[#64748B]">
                    合計日均偏離 = {formatSigned(forecast.avgDeviation30d, 2)} 點
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#1E2530] text-[#64748B]">
                        <th className="text-left py-2 font-normal">項目</th>
                        <th className="text-right py-2 font-normal">有效天數</th>
                        <th className="text-right py-2 font-normal">30日均分</th>
                        <th className="text-right py-2 font-normal">日均偏離貢獻</th>
                        <th className="text-right py-2 font-normal">7日推估影響</th>
                        <th className="text-right py-2 font-normal">成因佔比</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E2530]/60">
                      {forecast.factorDrivers.map((d) => {
                        const tone = getDirectionTone(d.avgDailyDeviation);
                        return (
                          <tr key={d.key}>
                            <td className="py-2.5 text-white font-medium">{d.label}</td>
                            <td className="py-2.5 text-right font-mono tabular-nums text-[#94A3B8]">
                              {d.recordedDays} 天
                            </td>
                            <td className="py-2.5 text-right font-mono tabular-nums text-[#E2E8F0]">
                              {formatIndex(d.avgScore)}
                            </td>
                            <td className={`py-2.5 text-right font-mono tabular-nums ${tone.textClass}`}>
                              {tone.arrow} {formatSigned(d.avgDailyDeviation, 2)}
                            </td>
                            <td className={`py-2.5 text-right font-mono tabular-nums ${tone.textClass}`}>
                              {formatSigned(d.projected7dImpact, 2)} 點
                            </td>
                            <td className="py-2.5 text-right font-mono tabular-nums text-white font-semibold">
                              {d.impactSharePercent.toFixed(1)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Habits & Emotion/Body Tags */}
              <div className="xl:col-span-5 border border-[#1E2530] bg-[#0E1218] rounded p-5 space-y-4">
                <h3 className="text-sm font-semibold text-white border-b border-[#1E2530] pb-2.5">
                  近 30 天習慣與情緒標籤脈絡
                </h3>

                <div className="space-y-2 text-xs">
                  <div className="text-[#64748B]">主要出現習慣（影響 H 分數）</div>
                  {forecast.habitDrivers.length === 0 ? (
                    <div className="text-[#64748B]">近 30 天無已勾選習慣紀錄</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {forecast.habitDrivers.map((h) => (
                        <div
                          key={h.id}
                          className="flex items-center justify-between py-1 border-b border-[#1E2530]/50"
                        >
                          <span className={h.polarity === 'positive' ? 'text-[#EF4444]' : 'text-[#22C55E]'}>
                            {h.label}
                          </span>
                          <span className="font-mono tabular-nums text-[#CBD5E1]">
                            {h.days}天 ({formatSigned(h.totalPointsImpact, 0)})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 text-xs pt-1">
                  <div className="text-[#64748B]">情緒標籤統計（正紅負綠）</div>
                  {forecast.emotionStats.length === 0 ? (
                    <div className="text-[#64748B]">近 30 天無情緒標籤紀錄</div>
                  ) : (
                    <div className="flex flex-wrap gap-x-2.5 gap-y-1">
                      {forecast.emotionStats.slice(0, 12).map((e, idx) => (
                        <span
                          key={e.tag}
                          className={
                            e.polarity === 'positive'
                              ? 'text-[#EF4444]'
                              : e.polarity === 'negative'
                                ? 'text-[#22C55E]'
                                : 'text-[#E2E8F0]'
                          }
                        >
                          {e.tag} ({e.count})
                          {idx < Math.min(forecast.emotionStats.length, 12) - 1 && (
                            <span className="text-[#475569] ml-2">·</span>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {forecast.bodyStats.length > 0 && (
                  <div className="space-y-1.5 text-xs pt-1">
                    <div className="text-[#64748B]">身體狀態標籤</div>
                    <div className="text-[#CBD5E1]">
                      {forecast.bodyStats
                        .slice(0, 8)
                        .map((b) => `${b.tag} (${b.count})`)
                        .join(' · ')}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Qualitative Evidence Clues from History */}
            <div className="border border-[#1E2530] bg-[#0E1218] rounded p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E2530] pb-2.5">
                <h3 className="text-sm font-semibold text-white">
                  歷史紀錄具體原因摘要（依主要影響日排序）
                </h3>
                <span className="text-[11px] text-[#64748B]">點擊紀錄可前往編輯檢視完整內容</span>
              </div>

              {forecast.evidenceClues.length === 0 ? (
                <p className="text-xs text-[#64748B]">
                  過去 30 天的紀錄尚未填寫事件、評估理由或心得文字。
                </p>
              ) : (
                <div className="space-y-2.5">
                  {forecast.evidenceClues.map((clue) => {
                    const clueTone = getDirectionTone(clue.deviationScore);
                    return (
                      <button
                        key={clue.recordId}
                        type="button"
                        onClick={() => openEditRecord(clue.recordId)}
                        className="w-full text-left border border-[#1E2530] bg-[#090B0E] hover:border-[#334155] p-3.5 rounded-sm space-y-1.5 transition-colors cursor-pointer"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-mono text-[#CBD5E1]">
                            {clue.date} {clue.time}（交易日 {clue.logicalDate}）
                          </span>
                          <span className={`font-mono tabular-nums font-medium ${clueTone.textClass}`}>
                            當日 St {clue.totalScore.toFixed(2)} · 偏離 {formatSigned(clue.deviationScore, 2)} 點
                          </span>
                        </div>
                        {clue.highlights.map((h, i) => (
                          <div key={i} className="text-xs text-[#E2E8F0]">
                            <span className="text-[#64748B]">{h.label}：</span>
                            <span>{h.text}</span>
                          </div>
                        ))}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
