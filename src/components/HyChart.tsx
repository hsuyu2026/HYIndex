import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  ChartConfiguration,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  Plugin,
  PointElement,
  Tooltip,
} from 'chart.js';
import { ChevronLeft, ChevronRight, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import {
  ChartDataPoint,
  ChartMetric,
  ChartTimeframe,
  buildCandlestickSeries,
  buildChartSeries,
  formatIndex,
  formatSigned,
  getDefaultDailyDateRange,
} from '../engine/calculations';
import {
  AXIS_DEFINITIONS,
  CandlestickPoint,
  DailySnapshot,
  INITIAL_HY_INDEX,
  MarketClosure,
  WeeklySettlement,
} from '../types/hy';
import { addDaysTaipei, getNowTaipei, getWeekBoundsTaipei } from '../utils/taipeiTime';

Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler
);

interface HyChartProps {
  metric?: ChartMetric;
  timeframe: ChartTimeframe;
  onTimeframeChange: (tf: ChartTimeframe) => void;
  dailySnapshots: DailySnapshot[];
  settlements: WeeklySettlement[];
  closures: MarketClosure[];
  heightClass?: string;
}

type DailyRangePreset = 'this_week' | '7d' | '14d' | '30d' | 'all' | 'custom';

const TIMEFRAME_OPTIONS: Array<{ id: ChartTimeframe; label: string }> = [
  { id: 'daily', label: '日線' },
  { id: 'weekly', label: '週 K' },
  { id: 'monthly', label: '月 K' },
  { id: 'yearly', label: '年 K' },
];

const DAILY_PRESET_OPTIONS: Array<{ id: DailyRangePreset; label: string; days?: number }> = [
  { id: 'this_week', label: '本週' },
  { id: '7d', label: '最近 7 天', days: 7 },
  { id: '14d', label: '14 天', days: 14 },
  { id: '30d', label: '30 天', days: 30 },
  { id: 'all', label: '全部' },
  { id: 'custom', label: '自訂區間' },
];

export function HyChart({
  metric = 'hy',
  timeframe,
  onTimeframeChange,
  dailySnapshots,
  settlements,
  closures,
  heightClass = 'h-[320px]',
}: HyChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  const nowMs = useMemo(() => Date.now(), [dailySnapshots, settlements, closures]);
  const todayStr = useMemo(() => getNowTaipei(nowMs).logicalDate, [nowMs]);

  const defaultDailyRange = useMemo(
    () => getDefaultDailyDateRange(dailySnapshots, nowMs, metric),
    [dailySnapshots, nowMs, metric]
  );

  // Daily range controls (default: trailing 7 days)
  const [dailyPreset, setDailyPreset] = useState<DailyRangePreset>('7d');
  const [dailyAnchorEnd, setDailyAnchorEnd] = useState<string | null>(null);
  const [customDailyStart, setCustomDailyStart] = useState<string>(defaultDailyRange.startDate);
  const [customDailyEnd, setCustomDailyEnd] = useState<string>(defaultDailyRange.endDate);

  // Candlestick date range filter (Weekly / Monthly / Yearly)
  const [klineStartDate, setKlineStartDate] = useState<string>('');
  const [klineEndDate, setKlineEndDate] = useState<string>('');

  // Shared zoom/pan slice window over active points/candles
  const [viewWindow, setViewWindow] = useState<{ startIdx: number; count: number } | null>(null);
  const [selectedCandleIdx, setSelectedCandleIdx] = useState<number | null>(null);

  // Drag-to-pan pointer state
  const dragStateRef = useRef<{
    active: boolean;
    startX: number;
    origStartIdx: number;
    windowCount: number;
    totalCount: number;
    didMove: boolean;
  }>({
    active: false,
    startX: 0,
    origStartIdx: 0,
    windowCount: 0,
    totalCount: 0,
    didMove: false,
  });

  // Sync custom daily inputs when dataset bounds first populate or metric changes
  useEffect(() => {
    setCustomDailyStart(defaultDailyRange.startDate);
    setCustomDailyEnd(defaultDailyRange.endDate);
    setDailyAnchorEnd(null);
    setViewWindow(null);
    setSelectedCandleIdx(null);
  }, [defaultDailyRange.startDate, defaultDailyRange.endDate, metric]);

  useEffect(() => {
    setViewWindow(null);
    setSelectedCandleIdx(null);
  }, [timeframe]);

  const metricLabel = useMemo(() => {
    if (metric === 'hy') return '累計 HY 指數';
    return AXIS_DEFINITIONS.find((a) => a.key === metric)?.label || '狀態指數';
  }, [metric]);

  // Compute active daily filter range
  const activeDailyFilter = useMemo(() => {
    if (dailyPreset === 'all') return undefined;
    if (dailyPreset === 'this_week') {
      const wb = getWeekBoundsTaipei(dailyAnchorEnd || todayStr);
      return {
        startDate: wb.weekStart,
        endDate: wb.weekEnd > todayStr ? todayStr : wb.weekEnd,
      };
    }
    if (dailyPreset === 'custom') {
      return {
        startDate: customDailyStart || undefined,
        endDate: customDailyEnd || undefined,
      };
    }
    const days = dailyPreset === '7d' ? 7 : dailyPreset === '14d' ? 14 : 30;
    const endDate = dailyAnchorEnd || defaultDailyRange.endDate;
    const startDate = addDaysTaipei(endDate, -(days - 1));
    return { startDate, endDate };
  }, [dailyPreset, dailyAnchorEnd, todayStr, customDailyStart, customDailyEnd, defaultDailyRange.endDate]);

  // Full daily series (unfiltered) to know earliest/latest valid date bounds
  const allDailyPoints: ChartDataPoint[] = useMemo(() => {
    if (timeframe !== 'daily') return [];
    return buildChartSeries('daily', dailySnapshots, settlements, closures, nowMs, metric);
  }, [timeframe, dailySnapshots, settlements, closures, nowMs, metric]);

  const dailyPoints: ChartDataPoint[] = useMemo(() => {
    if (timeframe !== 'daily') return [];
    return buildChartSeries(
      'daily',
      dailySnapshots,
      settlements,
      closures,
      nowMs,
      metric,
      activeDailyFilter
    );
  }, [timeframe, dailySnapshots, settlements, closures, nowMs, metric, activeDailyFilter]);

  const allCandles: CandlestickPoint[] = useMemo(() => {
    if (timeframe === 'daily') return [];
    return buildCandlestickSeries(timeframe, dailySnapshots, nowMs, metric, {
      startDate: klineStartDate || undefined,
      endDate: klineEndDate || undefined,
    });
  }, [timeframe, dailySnapshots, nowMs, metric, klineStartDate, klineEndDate]);

  const totalItems = timeframe === 'daily' ? dailyPoints.length : allCandles.length;

  // Resolve visible slice [sliceStart, sliceEnd)
  const { sliceStart, sliceEnd } = useMemo(() => {
    if (totalItems === 0) return { sliceStart: 0, sliceEnd: 0 };
    if (!viewWindow) {
      // For candlestick charts with many periods, show latest 24 bars by default unless zoomed/all
      if (timeframe !== 'daily' && totalItems > 24) {
        return { sliceStart: totalItems - 24, sliceEnd: totalItems };
      }
      return { sliceStart: 0, sliceEnd: totalItems };
    }
    const count = Math.max(Math.min(3, totalItems), Math.min(totalItems, viewWindow.count));
    const maxStart = Math.max(0, totalItems - count);
    const start = Math.max(0, Math.min(maxStart, viewWindow.startIdx));
    return { sliceStart: start, sliceEnd: start + count };
  }, [totalItems, viewWindow, timeframe]);

  const visibleDaily = useMemo(
    () => (timeframe === 'daily' ? dailyPoints.slice(sliceStart, sliceEnd) : []),
    [timeframe, dailyPoints, sliceStart, sliceEnd]
  );

  const visibleCandles = useMemo(
    () => (timeframe !== 'daily' ? allCandles.slice(sliceStart, sliceEnd) : []),
    [timeframe, allCandles, sliceStart, sliceEnd]
  );

  const activeCandleIdx = useMemo(() => {
    if (visibleCandles.length === 0) return null;
    if (selectedCandleIdx !== null && selectedCandleIdx >= 0 && selectedCandleIdx < visibleCandles.length) {
      return selectedCandleIdx;
    }
    return visibleCandles.length - 1;
  }, [visibleCandles.length, selectedCandleIdx]);

  const activeCandle = activeCandleIdx !== null ? visibleCandles[activeCandleIdx] : null;

  // Navigation & Zoom handlers
  const handleZoom = (direction: 'in' | 'out') => {
    if (totalItems <= 2) return;
    const currentCount = sliceEnd - sliceStart;
    const step = Math.max(1, Math.round(currentCount * 0.25));
    const nextCount =
      direction === 'in'
        ? Math.max(Math.min(3, totalItems), currentCount - step)
        : Math.min(totalItems, currentCount + step);
    const nextStart = Math.max(0, sliceEnd - nextCount);
    setViewWindow({ startIdx: nextStart, count: nextCount });
  };

  const handleShiftPeriod = (dir: -1 | 1) => {
    // If zoomed or in candlestick mode, pan within items
    const currentCount = sliceEnd - sliceStart;
    if (viewWindow || (timeframe !== 'daily' && currentCount < totalItems)) {
      const panStep = Math.max(1, Math.round(currentCount * 0.4));
      const maxStart = Math.max(0, totalItems - currentCount);
      const nextStart = Math.max(0, Math.min(maxStart, sliceStart + dir * panStep));
      setViewWindow({ startIdx: nextStart, count: currentCount });
      return;
    }

    // In daily 'this_week' preset mode, shift week-by-week
    if (timeframe === 'daily' && dailyPreset === 'this_week') {
      const currRef = dailyAnchorEnd || todayStr;
      let nextRef = addDaysTaipei(currRef, dir * 7);
      if (nextRef > todayStr) nextRef = todayStr;
      const earliestDate = allDailyPoints[0]?.date;
      if (earliestDate && getWeekBoundsTaipei(nextRef).weekEnd < earliestDate && dir === -1) {
        return;
      }
      setDailyAnchorEnd(nextRef);
      setViewWindow(null);
      return;
    }

    // In daily preset mode (7d / 14d / 30d), shift the calendar window
    if (timeframe === 'daily' && (dailyPreset === '7d' || dailyPreset === '14d' || dailyPreset === '30d')) {
      const days = dailyPreset === '7d' ? 7 : dailyPreset === '14d' ? 14 : 30;
      const currEnd = dailyAnchorEnd || defaultDailyRange.endDate;
      let nextEnd = addDaysTaipei(currEnd, dir * days);
      const maxBound = todayStr > defaultDailyRange.endDate ? todayStr : defaultDailyRange.endDate;
      if (nextEnd > maxBound) nextEnd = maxBound;
      const earliestDate = allDailyPoints[0]?.date;
      if (earliestDate && addDaysTaipei(nextEnd, -(days - 1)) < earliestDate && dir === -1) {
        const minValidEnd = addDaysTaipei(earliestDate, days - 1);
        nextEnd = minValidEnd > currEnd ? currEnd : minValidEnd;
      }
      setDailyAnchorEnd(nextEnd);
      setViewWindow(null);
    }
  };

  const handleResetLatest = () => {
    setDailyAnchorEnd(null);
    setViewWindow(null);
    setSelectedCandleIdx(null);
    if (timeframe !== 'daily') {
      setKlineStartDate('');
      setKlineEndDate('');
    }
  };

  const handleShowAllWindow = () => {
    if (timeframe === 'daily') {
      setDailyPreset('all');
      setDailyAnchorEnd(null);
      setViewWindow(null);
    } else {
      setViewWindow({ startIdx: 0, count: Math.max(1, allCandles.length) });
    }
  };

  // Mouse wheel zoom & drag pan on chart container
  const handleWheelZoom = (e: React.WheelEvent<HTMLDivElement>) => {
    if (totalItems <= 3) return;
    if (Math.abs(e.deltaY) < 4) return;
    e.preventDefault();
    handleZoom(e.deltaY < 0 ? 'in' : 'out');
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const currentCount = sliceEnd - sliceStart;
    if (currentCount >= totalItems) return;
    dragStateRef.current = {
      active: true,
      startX: e.clientX,
      origStartIdx: sliceStart,
      windowCount: currentCount,
      totalCount: totalItems,
      didMove: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragStateRef.current;
    if (!st.active) return;
    const dx = e.clientX - st.startX;
    if (Math.abs(dx) < 6) return;
    st.didMove = true;
    const canvasWidth = canvasRef.current?.clientWidth || 600;
    const pxPerItem = Math.max(8, canvasWidth / Math.max(1, st.windowCount));
    const deltaItems = Math.round(-dx / pxPerItem);
    const maxStart = Math.max(0, st.totalCount - st.windowCount);
    const nextStart = Math.max(0, Math.min(maxStart, st.origStartIdx + deltaItems));
    setViewWindow({ startIdx: nextStart, count: st.windowCount });
  };

  const handlePointerUp = () => {
    dragStateRef.current.active = false;
  };

  // Render Chart.js instance (Daily Line vs Weekly/Monthly/Yearly Candlestick)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    if (timeframe === 'daily') {
      if (visibleDaily.length === 0) return;

      const labels = visibleDaily.map((p) => p.label);
      const values = visibleDaily.map((p) => p.hyIndex);
      const baselineSeries = visibleDaily.map(() => INITIAL_HY_INDEX);

      const validVals = values.filter((v): v is number => v !== null);
      const firstVal = metric === 'hy' ? INITIAL_HY_INDEX : validVals.length > 0 ? validVals[0] : 50;
      const lastVal = validVals.length > 0 ? validVals[validVals.length - 1] : firstVal;
      const lineColor =
        lastVal > firstVal ? '#EF4444' : lastVal < firstVal ? '#22C55E' : '#94A3B8';

      const datasets: ChartConfiguration<'line', Array<number | null>, string>['data']['datasets'] = [
        {
          label: metricLabel,
          data: values,
          borderColor: lineColor,
          backgroundColor:
            lastVal > firstVal
              ? 'rgba(239, 68, 68, 0.08)'
              : lastVal < firstVal
                ? 'rgba(34, 197, 94, 0.08)'
                : 'rgba(148, 163, 184, 0.06)',
          borderWidth: 2,
          fill: true,
          tension: 0.12,
          spanGaps: true,
          pointRadius: (ctx) => {
            const pt = visibleDaily[ctx.dataIndex];
            if (!pt || pt.hyIndex === null) return 0;
            if (pt.isClosedSegment || pt.isCarryForward) return 3.5;
            return visibleDaily.length > 40 ? 2 : 3.5;
          },
          pointHoverRadius: 5,
          pointBackgroundColor: (ctx) => {
            const pt = visibleDaily[ctx.dataIndex];
            if (!pt) return lineColor;
            if (pt.isClosedSegment || pt.isCarryForward) return '#717A8C';
            if (pt.changePoints !== null) {
              if (pt.changePoints > 1e-9) return '#EF4444';
              if (pt.changePoints < -1e-9) return '#22C55E';
              return '#94A3B8';
            }
            return lineColor;
          },
          pointBorderColor: '#090B0E',
          pointBorderWidth: 1,
          segment: {
            borderDash: (ctx) => {
              const p0 = visibleDaily[ctx.p0DataIndex];
              const p1 = visibleDaily[ctx.p1DataIndex];
              if (p0?.isClosedSegment || p1?.isClosedSegment) {
                return [5, 5];
              }
              return undefined;
            },
            borderColor: (ctx) => {
              const p0 = visibleDaily[ctx.p0DataIndex];
              const p1 = visibleDaily[ctx.p1DataIndex];
              if (p0?.isClosedSegment || p1?.isClosedSegment) return '#64748B';
              if (p1?.isCarryForward) return '#717A8C';
              const y0 = ctx.p0.parsed.y;
              const y1 = ctx.p1.parsed.y;
              if (y0 !== null && y1 !== null) {
                if (y1 > y0) return '#EF4444';
                if (y1 < y0) return '#22C55E';
                return '#94A3B8';
              }
              return lineColor;
            },
          },
        },
      ];

      if (metric === 'hy') {
        datasets.push({
          label: `初始基期 (${INITIAL_HY_INDEX.toFixed(2)})`,
          data: baselineSeries,
          borderColor: '#475569',
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false,
        });
      }

      const config: ChartConfiguration<'line', Array<number | null>, string> = {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 150 },
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
                  return visibleDaily[items[0].dataIndex]?.subLabel || '';
                },
                label: (ctx) => {
                  if (ctx.datasetIndex === 1) return '';
                  const pt = visibleDaily[ctx.dataIndex];
                  if (!pt) return '';
                  if (pt.hyIndex === null) {
                    return [`${metricLabel}：無有效資料`, pt.validDaysInfo];
                  }

                  if (metric === 'hy') {
                    const lines = [`${metricLabel}：${formatIndex(pt.hyIndex)}`];
                    if (pt.totalScore !== null && pt.deviationScore !== null) {
                      lines.push(`每日綜合分數 (St)：${formatIndex(pt.totalScore)}`);
                      const pctText =
                        pt.changePercent !== null && pt.changePercent !== undefined
                          ? ` ${formatSigned(pt.changePercent, 2)}%`
                          : '';
                      lines.push(`每日偏離分數 (Dt)：${formatSigned(pt.deviationScore, 2)} 點${pctText}`);
                    } else {
                      lines.push('當日變化：+0.00 點 +0.00%');
                    }
                    lines.push(`狀態：${pt.validDaysInfo}`);
                    return lines;
                  }

                  return [
                    `${metricLabel}：${formatIndex(pt.hyIndex)}`,
                    `較前期變化：${pt.changePoints !== null ? formatSigned(pt.changePoints, 2) : '--'}`,
                    `狀態：${pt.validDaysInfo}`,
                  ];
                },
              },
            },
          },
          scales: {
            x: {
              grid: { color: 'rgba(255, 255, 255, 0.04)' },
              ticks: {
                color: '#64748B',
                maxTicksLimit: 10,
                font: { family: '"IBM Plex Mono", monospace', size: 11 },
              },
            },
            y: {
              position: 'right',
              min: metric === 'hy' ? undefined : 0,
              max: metric === 'hy' ? undefined : 100,
              grace: '6%',
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
    } else {
      // Candlestick Mode (Weekly / Monthly / Yearly)
      if (visibleCandles.length === 0) return;

      const labels = visibleCandles.map((c) => c.label);
      const rangeData: Array<[number, number]> = visibleCandles.map((c) => [c.low, c.high]);
      const baselineData = visibleCandles.map(() => INITIAL_HY_INDEX);

      const candlestickPlugin: Plugin<'bar'> = {
        id: 'hyCandlestickRenderer',
        afterDatasetsDraw(chart) {
          const { ctx, chartArea, scales } = chart;
          const yScale = scales.y;
          const meta = chart.getDatasetMeta(0);
          if (!meta || !meta.data || !yScale) return;

          const count = visibleCandles.length;
          const slotWidth = (chartArea.right - chartArea.left) / Math.max(1, count);
          const bodyWidth = Math.max(6, Math.min(28, slotWidth * 0.56));

          ctx.save();
          ctx.beginPath();
          ctx.rect(
            chartArea.left,
            chartArea.top - 16,
            chartArea.right - chartArea.left,
            chartArea.bottom - chartArea.top + 20
          );
          ctx.clip();

          visibleCandles.forEach((candle, idx) => {
            const elem = meta.data[idx];
            if (!elem) return;
            const x = elem.x;
            const yHigh = yScale.getPixelForValue(candle.high);
            const yLow = yScale.getPixelForValue(candle.low);
            const yOpen = yScale.getPixelForValue(candle.open);
            const yClose = yScale.getPixelForValue(candle.close);

            const isUp = candle.close > candle.open + 1e-9;
            const isDown = candle.close < candle.open - 1e-9;
            const strokeColor = isUp ? '#EF4444' : isDown ? '#22C55E' : '#94A3B8';
            const fillColor = candle.isIncomplete
              ? isUp
                ? 'rgba(239, 68, 68, 0.32)'
                : isDown
                  ? 'rgba(34, 197, 94, 0.32)'
                  : 'rgba(148, 163, 184, 0.32)'
              : strokeColor;

            // Highlight selected candle slot subtly
            if (activeCandleIdx === idx) {
              ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
              ctx.fillRect(
                x - Math.max(bodyWidth * 0.85, slotWidth * 0.38),
                chartArea.top,
                Math.max(bodyWidth * 1.7, slotWidth * 0.76),
                chartArea.bottom - chartArea.top
              );
            }

            const topBody = Math.min(yOpen, yClose);
            const bottomBody = Math.max(yOpen, yClose);
            const rawHeight = bottomBody - topBody;
            const bodyHeight = Math.max(2, rawHeight);
            const adjustedTop = rawHeight < 2 ? (yOpen + yClose) / 2 - 1 : topBody;

            // Upper & lower wicks
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([]);
            if (yHigh < adjustedTop) {
              ctx.beginPath();
              ctx.moveTo(x, yHigh);
              ctx.lineTo(x, adjustedTop);
              ctx.stroke();
            }
            if (yLow > adjustedTop + bodyHeight) {
              ctx.beginPath();
              ctx.moveTo(x, adjustedTop + bodyHeight);
              ctx.lineTo(x, yLow);
              ctx.stroke();
            }

            // Candle body
            ctx.fillStyle = fillColor;
            ctx.fillRect(x - bodyWidth / 2, adjustedTop, bodyWidth, bodyHeight);

            if (candle.isIncomplete) {
              ctx.strokeStyle = strokeColor;
              ctx.lineWidth = 1.25;
              ctx.setLineDash([3, 2]);
              ctx.strokeRect(x - bodyWidth / 2, adjustedTop, bodyWidth, bodyHeight);
              ctx.setLineDash([]);

              // Mark incomplete period cleanly above upper wick
              ctx.fillStyle = '#F59E0B';
              ctx.font = '600 10px "IBM Plex Mono", monospace';
              ctx.textAlign = 'center';
              const labelY = Math.max(chartArea.top + 10, yHigh - 5);
              ctx.fillText('未完成', x, labelY);
            } else if (activeCandleIdx === idx) {
              ctx.strokeStyle = '#E2E8F0';
              ctx.lineWidth = 1;
              ctx.strokeRect(x - bodyWidth / 2 - 1, adjustedTop - 1, bodyWidth + 2, bodyHeight + 2);
            }
          });

          ctx.restore();
        },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const datasets: any[] = [
        {
          type: 'bar',
          label: `${metricLabel} K 線`,
          data: rangeData,
          backgroundColor: 'rgba(0, 0, 0, 0)',
          borderColor: 'rgba(0, 0, 0, 0)',
          borderWidth: 0,
          grouped: false,
          barPercentage: 0.7,
          categoryPercentage: 0.8,
        },
      ];

      if (metric === 'hy') {
        datasets.push({
          type: 'line',
          label: `初始基期 (${INITIAL_HY_INDEX.toFixed(2)})`,
          data: baselineData,
          borderColor: '#475569',
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false,
        });
      }

      const config: ChartConfiguration = {
        type: 'bar',
        data: { labels, datasets },
        plugins: [candlestickPlugin as Plugin],
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 150 },
          interaction: { mode: 'index', intersect: false },
          onClick: (_evt, elements) => {
            if (dragStateRef.current.didMove) return;
            if (elements && elements.length > 0) {
              setSelectedCandleIdx(elements[0].index);
            }
          },
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
                  const c = visibleCandles[items[0].dataIndex];
                  if (!c) return '';
                  return `${c.subLabel}${c.isIncomplete ? ' · 未完成' : ''}`;
                },
                label: (ctx) => {
                  if (ctx.datasetIndex === 1) return '';
                  const c = visibleCandles[ctx.dataIndex];
                  if (!c) return '';
                  const pctText =
                    c.changePercent !== null ? `${formatSigned(c.changePercent, 2)}%` : '--';
                  return [
                    `有效交易日：${c.tradingDaysCount} 天（${c.firstTradingDate} ~ ${c.lastTradingDate}）`,
                    `開盤 (Open)：${formatIndex(c.open)}`,
                    `最高 (High)：${formatIndex(c.high)}`,
                    `最低 (Low)：${formatIndex(c.low)}`,
                    `收盤 (Close)：${formatIndex(c.close)}`,
                    `區間變化 (C - O)：${formatSigned(c.change, 2)} 點`,
                    `變化率參考 (Rp)：${pctText}（輔助參考）`,
                  ];
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
              min: metric === 'hy' ? undefined : 0,
              max: metric === 'hy' ? undefined : 100,
              grace: '10%',
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
    }

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [metric, metricLabel, timeframe, visibleDaily, visibleCandles, activeCandleIdx]);

  const activeRangeSummary = useMemo(() => {
    if (timeframe === 'daily') {
      if (visibleDaily.length === 0) return '尚無資料';
      const first = visibleDaily[0]?.date;
      const last = visibleDaily[visibleDaily.length - 1]?.date;
      return `${first || '--'} ~ ${last || '--'}（共 ${visibleDaily.length} 天）`;
    }
    if (visibleCandles.length === 0) return '尚無 K 線資料';
    const first = visibleCandles[0];
    const last = visibleCandles[visibleCandles.length - 1];
    return `${first.periodId} ~ ${last.periodId}（顯示 ${visibleCandles.length} / ${allCandles.length} 根 K 線）`;
  }, [timeframe, visibleDaily, visibleCandles, allCandles.length]);

  return (
    <div className="flex flex-col gap-3">
      {/* Row 1: Timeframe Switcher + Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-[#0D1015] border border-[#1E2530] p-1 rounded">
          {TIMEFRAME_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onTimeframeChange(opt.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                timeframe === opt.id
                  ? 'bg-[#1F2733] text-white border border-[#334155]'
                  : 'text-[#94A3B8] hover:text-white border border-transparent'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {timeframe === 'daily' ? (
          <div className="flex flex-wrap items-center gap-4 text-xs text-[#94A3B8]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-[2px] bg-[#EF4444] inline-block" />
              上漲
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-[2px] bg-[#22C55E] inline-block" />
              下跌
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-[2px] bg-[#717A8C] inline-block" />
              無紀錄（維持前值）
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 border-t-2 border-dashed border-[#64748B] inline-block" />
              休市凍結
            </span>
            {metric === 'hy' && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 border-t border-dashed border-[#475569] inline-block" />
                基期 {INITIAL_HY_INDEX.toFixed(2)}
              </span>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4 text-xs text-[#94A3B8]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-3 bg-[#EF4444] inline-block rounded-[1px]" />
              收盤 &gt; 開盤（上漲）
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-3 bg-[#22C55E] inline-block rounded-[1px]" />
              收盤 &lt; 開盤（下跌）
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-3 bg-[#94A3B8] inline-block rounded-[1px]" />
              平盤
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-3 border border-dashed border-[#F59E0B] bg-[#F59E0B]/20 inline-block rounded-[1px]" />
              進行中（未完成）
            </span>
            {metric === 'hy' && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 border-t border-dashed border-[#475569] inline-block" />
                基期 {INITIAL_HY_INDEX.toFixed(2)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Row 2: Range Selector, Prev/Next/Latest Navigation, Zoom Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#090B0E] border border-[#1E2530] px-3 py-2 rounded text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {timeframe === 'daily' ? (
            <>
              <div className="flex items-center gap-1">
                {DAILY_PRESET_OPTIONS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setDailyPreset(preset.id);
                      setDailyAnchorEnd(null);
                      setViewWindow(null);
                    }}
                    className={`px-2 py-1 rounded-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      dailyPreset === preset.id
                        ? 'bg-[#1F2733] text-white border border-[#334155]'
                        : 'text-[#94A3B8] hover:text-white border border-transparent'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              {dailyPreset === 'custom' && (
                <div className="flex items-center gap-1.5 font-mono">
                  <input
                    type="date"
                    aria-label="日線開始日期"
                    value={customDailyStart}
                    onChange={(e) => {
                      setCustomDailyStart(e.target.value);
                      setViewWindow(null);
                    }}
                    className="bg-[#0D1015] border border-[#2B3544] rounded-sm px-2 py-0.5 text-xs text-[#E2E8F0] focus:outline-none focus:border-[#475569]"
                  />
                  <span className="text-[#64748B]">~</span>
                  <input
                    type="date"
                    aria-label="日線結束日期"
                    value={customDailyEnd}
                    onChange={(e) => {
                      setCustomDailyEnd(e.target.value);
                      setViewWindow(null);
                    }}
                    className="bg-[#0D1015] border border-[#2B3544] rounded-sm px-2 py-0.5 text-xs text-[#E2E8F0] focus:outline-none focus:border-[#475569]"
                  />
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2 font-mono">
              <span className="text-[#94A3B8] font-sans">日期範圍</span>
              <input
                type="date"
                aria-label="K線開始日期"
                value={klineStartDate}
                onChange={(e) => {
                  setKlineStartDate(e.target.value);
                  setViewWindow(null);
                  setSelectedCandleIdx(null);
                }}
                className="bg-[#0D1015] border border-[#2B3544] rounded-sm px-2 py-0.5 text-xs text-[#E2E8F0] focus:outline-none focus:border-[#475569]"
              />
              <span className="text-[#64748B]">~</span>
              <input
                type="date"
                aria-label="K線結束日期"
                value={klineEndDate}
                onChange={(e) => {
                  setKlineEndDate(e.target.value);
                  setViewWindow(null);
                  setSelectedCandleIdx(null);
                }}
                className="bg-[#0D1015] border border-[#2B3544] rounded-sm px-2 py-0.5 text-xs text-[#E2E8F0] focus:outline-none focus:border-[#475569]"
              />
            </div>
          )}
        </div>

        {/* Period Navigation & Zoom */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono tabular-nums text-[11px] text-[#64748B] mr-1 hidden sm:inline">
            {activeRangeSummary}
          </span>
          <button
            type="button"
            onClick={() => handleShiftPeriod(-1)}
            title="上一區間"
            className="px-2 py-1 border border-[#1E2530] bg-[#0D1015] hover:border-[#334155] text-[#CBD5E1] hover:text-white rounded-sm inline-flex items-center gap-0.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>上一區間</span>
          </button>
          <button
            type="button"
            onClick={() => handleShiftPeriod(1)}
            title="下一區間"
            className="px-2 py-1 border border-[#1E2530] bg-[#0D1015] hover:border-[#334155] text-[#CBD5E1] hover:text-white rounded-sm inline-flex items-center gap-0.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>下一區間</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleResetLatest}
            title="跳轉至最新區間"
            className="px-2 py-1 border border-[#1E2530] bg-[#0D1015] hover:border-[#334155] text-[#CBD5E1] hover:text-white rounded-sm inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>最新區間</span>
          </button>
          <div className="flex items-center gap-0.5 ml-1">
            <button
              type="button"
              onClick={() => handleZoom('in')}
              title="放大"
              aria-label="放大圖表"
              className="p-1 border border-[#1E2530] bg-[#0D1015] hover:border-[#334155] text-[#CBD5E1] hover:text-white rounded-sm cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleZoom('out')}
              title="縮小"
              aria-label="縮小圖表"
              className="p-1 border border-[#1E2530] bg-[#0D1015] hover:border-[#334155] text-[#CBD5E1] hover:text-white rounded-sm cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            {timeframe !== 'daily' && (
              <button
                type="button"
                onClick={handleShowAllWindow}
                className="px-2 py-1 border border-[#1E2530] bg-[#0D1015] hover:border-[#334155] text-[#CBD5E1] hover:text-white rounded-sm whitespace-nowrap shrink-0 cursor-pointer"
              >
                全部
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Candlestick OHLC Inspector Strip (for Weekly / Monthly / Yearly) */}
      {timeframe !== 'daily' && activeCandle && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#090B0E] border border-[#1E2530] px-3.5 py-2 rounded text-xs">
          <div className="flex flex-wrap items-center gap-2 font-mono">
            <span className="text-white font-semibold">{activeCandle.periodId}</span>
            <span className="text-[#64748B]">
              {activeCandle.firstTradingDate} ~ {activeCandle.lastTradingDate}
            </span>
            <span className="text-[#94A3B8]">({activeCandle.tradingDaysCount} 交易日)</span>
            {activeCandle.isIncomplete && (
              <span className="text-[#F59E0B] font-semibold">未完成</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums">
            <span>
              <span className="text-[#64748B] mr-1">開</span>
              <span className="text-[#E2E8F0]">{formatIndex(activeCandle.open)}</span>
            </span>
            <span>
              <span className="text-[#64748B] mr-1">高</span>
              <span className="text-[#E2E8F0]">{formatIndex(activeCandle.high)}</span>
            </span>
            <span>
              <span className="text-[#64748B] mr-1">低</span>
              <span className="text-[#E2E8F0]">{formatIndex(activeCandle.low)}</span>
            </span>
            <span>
              <span className="text-[#64748B] mr-1">收</span>
              <span className="text-white font-semibold">{formatIndex(activeCandle.close)}</span>
            </span>
            <span
              className={
                activeCandle.change > 1e-9
                  ? 'text-[#EF4444]'
                  : activeCandle.change < -1e-9
                    ? 'text-[#22C55E]'
                    : 'text-[#94A3B8]'
              }
            >
              {formatSigned(activeCandle.change, 2)} 點
              {activeCandle.changePercent !== null
                ? ` (${formatSigned(activeCandle.changePercent, 2)}%)`
                : ''}
            </span>
          </div>
        </div>
      )}

      {/* Canvas Container */}
      {(timeframe === 'daily' ? visibleDaily.length === 0 : visibleCandles.length === 0) ? (
        <div
          className={`${heightClass} flex flex-col items-center justify-center border border-[#1E2530] bg-[#0D1015] rounded text-center px-4 gap-2`}
        >
          <p className="text-sm text-[#94A3B8]">
            {timeframe === 'daily'
              ? `目前所選日期區間無「${metricLabel}」有效走勢資料`
              : `目前所選條件尚無「${metricLabel}」K 線資料，新增開市有效紀錄後將自動彙整 OHLC`}
          </p>
          <button
            type="button"
            onClick={handleResetLatest}
            className="px-3 py-1 text-xs border border-[#2B3544] text-[#CBD5E1] hover:text-white rounded-sm cursor-pointer"
          >
            重設為最新區間
          </button>
        </div>
      ) : (
        <div
          onWheel={handleWheelZoom}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className={`${heightClass} relative border border-[#1E2530] bg-[#0D1015] rounded p-3 select-none`}
        >
          <canvas ref={canvasRef} />
        </div>
      )}
    </div>
  );
}
