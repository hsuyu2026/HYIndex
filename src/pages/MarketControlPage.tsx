import { useState } from 'react';
import { Lock, Play, Power, Trash2 } from 'lucide-react';
import { useHy, useTaipeiClock } from '../context/HyContext';
import { formatIndex, getClosureDurationDays } from '../engine/calculations';
import { formatIsoToTaipei, taipeiDateTimeToMs } from '../utils/taipeiTime';

export function MarketControlPage() {
  const {
    closures,
    marketQuote,
    closeMarket,
    reopenMarket,
    deleteClosure,
  } = useHy();
  const taipeiNow = useTaipeiClock();

  const [startDate, setStartDate] = useState(taipeiNow.date);
  const [startTime, setStartTime] = useState(taipeiNow.time);
  const [reason, setReason] = useState('');

  const [endDate, setEndDate] = useState(taipeiNow.date);
  const [endTime, setEndTime] = useState(taipeiNow.time);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const activeClosure = marketQuote.activeClosure;

  const handleCloseMarket = async () => {
    setErrorMsg(null);
    try {
      const ms = taipeiDateTimeToMs(startDate, startTime);
      await closeMarket(new Date(ms).toISOString(), reason);
      setReason('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '休市操作失敗');
    }
  };

  const handleReopenMarket = async () => {
    if (!activeClosure) return;
    setErrorMsg(null);
    try {
      const ms = taipeiDateTimeToMs(endDate, endTime);
      await reopenMarket(activeClosure.id, new Date(ms).toISOString());
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '重新開市操作失敗');
    }
  };

  const totalClosedDaysAll = closures.reduce(
    (acc, c) => acc + getClosureDurationDays(c, taipeiNow.timestampMs),
    0
  );

  return (
    <div className="space-y-6">
      <div className="border-b border-[#1E2530] pb-4">
        <h1 className="text-lg font-bold text-white">休市與開市管理</h1>
        <p className="text-xs text-[#94A3B8] mt-1">
          休市期間可照常寫入日記與數值紀錄，但指數將凍結在最後有效開市指數，休市紀錄不回溯納入計算
        </p>
      </div>

      {/* Current Status Panel */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 border border-[#1E2530] bg-[#0E1218] rounded p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#1E2530] pb-3">
            <span className="text-sm font-semibold text-white">目前市場交易狀態</span>
            <span
              className={`text-xs font-medium px-2.5 py-1 rounded-sm border ${
                marketQuote.isMarketClosed
                  ? 'border-[#64748B]/40 bg-[#1E2530] text-[#CBD5E1]'
                  : 'border-[#EF4444]/40 bg-[#EF4444]/10 text-[#F87171]'
              }`}
            >
              {marketQuote.isMarketClosed ? '休市中（指數凍結）' : '交易中（正常計價）'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-[#64748B]">最後有效／凍結指數</div>
              <div className="font-mono tabular-nums text-2xl font-bold text-white mt-1">
                {formatIndex(marketQuote.currentHY)}
              </div>
            </div>
            <div>
              <div className="text-[#64748B]">累計總休市天數</div>
              <div className="font-mono tabular-nums text-2xl font-bold text-[#CBD5E1] mt-1">
                {totalClosedDaysAll.toFixed(1)} 天
              </div>
            </div>
          </div>

          {activeClosure && (
            <div className="border border-[#2B3544] bg-[#090B0E] p-3.5 rounded-sm text-xs space-y-1">
              <div className="text-[#94A3B8]">
                本次休市開始：
                <span className="font-mono text-white ml-1">
                  {formatIsoToTaipei(activeClosure.startAt).dateTimeSec}
                </span>
              </div>
              <div className="text-[#94A3B8]">
                已持續休市：
                <span className="font-mono text-white ml-1">
                  {getClosureDurationDays(activeClosure, taipeiNow.timestampMs).toFixed(2)} 天
                </span>
              </div>
              {activeClosure.reason && (
                <div className="text-[#94A3B8]">
                  休市原因：<span className="text-[#E2E8F0]">{activeClosure.reason}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Panel: Close or Reopen */}
        <div className="lg:col-span-7 border border-[#1E2530] bg-[#0E1218] rounded p-5 space-y-4">
          {!activeClosure ? (
            <>
              <div className="flex items-center gap-2 border-b border-[#1E2530] pb-3">
                <Lock className="w-4 h-4 text-[#94A3B8]" />
                <h2 className="text-sm font-semibold text-white">手動執行休市</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[#94A3B8] mb-1">休市開始日期（台北）</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-[#090B0E] border border-[#2B3544] px-3 py-2 font-mono text-white rounded-sm"
                  />
                </div>
                <div>
                  <label className="block text-[#94A3B8] mb-1">休市開始時間（台北）</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full bg-[#090B0E] border border-[#2B3544] px-3 py-2 font-mono text-white rounded-sm"
                  />
                </div>
              </div>

              <div className="text-xs">
                <label className="block text-[#94A3B8] mb-1">休市原因（選填）</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="例如：出國旅遊、生病休養、工作出差或刻意暫停評估..."
                  className="w-full bg-[#090B0E] border border-[#2B3544] px-3 py-2 text-white rounded-sm"
                />
              </div>

              {errorMsg && (
                <div className="text-xs text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/30 px-3 py-2 rounded-sm">
                  {errorMsg}
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setStartDate(taipeiNow.date);
                    setStartTime(taipeiNow.time);
                  }}
                  className="text-xs text-[#94A3B8] hover:text-white cursor-pointer"
                >
                  重設為目前台北時間
                </button>
                <button
                  type="button"
                  onClick={handleCloseMarket}
                  className="px-5 py-2 bg-[#1E2530] hover:bg-[#2B3544] border border-[#334155] text-white text-xs font-medium rounded-sm inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Power className="w-3.5 h-3.5" />
                  確認進入休市
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-[#1E2530] pb-3">
                <Play className="w-4 h-4 text-[#EF4444]" />
                <h2 className="text-sm font-semibold text-white">重新開市</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[#94A3B8] mb-1">開市日期（台北）</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-[#090B0E] border border-[#2B3544] px-3 py-2 font-mono text-white rounded-sm"
                  />
                </div>
                <div>
                  <label className="block text-[#94A3B8] mb-1">開市時間（台北）</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full bg-[#090B0E] border border-[#2B3544] px-3 py-2 font-mono text-white rounded-sm"
                  />
                </div>
              </div>

              <p className="text-xs text-[#94A3B8]">
                重新開市後，休市期間內建立的紀錄會完整保留，但不會回溯納入指數；開市後的新紀錄才參與指數計算與週結算。
              </p>

              {errorMsg && (
                <div className="text-xs text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/30 px-3 py-2 rounded-sm">
                  {errorMsg}
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setEndDate(taipeiNow.date);
                    setEndTime(taipeiNow.time);
                  }}
                  className="text-xs text-[#94A3B8] hover:text-white cursor-pointer"
                >
                  重設為目前台北時間
                </button>
                <button
                  type="button"
                  onClick={handleReopenMarket}
                  className="px-5 py-2 bg-[#EF4444] hover:bg-[#DC2626] text-white text-xs font-medium rounded-sm inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  確認重新開市
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Closure History Table */}
      <section className="border border-[#1E2530] bg-[#0E1218] rounded overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#1E2530] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">休市區間紀錄</h2>
          <span className="text-xs font-mono text-[#64748B]">共 {closures.length} 筆</span>
        </div>

        {closures.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#64748B]">尚無任何休市區間紀錄。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1E2530] text-[#64748B] bg-[#0B0E13]">
                  <th className="text-left py-2.5 px-4 font-normal">休市開始時間</th>
                  <th className="text-left py-2.5 px-4 font-normal">重新開市時間</th>
                  <th className="text-right py-2.5 px-3 font-normal">累計休市天數</th>
                  <th className="text-left py-2.5 px-4 font-normal">休市原因</th>
                  <th className="text-right py-2.5 px-4 font-normal">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2530]/70">
                {closures.map((c) => {
                  const days = getClosureDurationDays(c, taipeiNow.timestampMs);
                  return (
                    <tr key={c.id} className="hover:bg-[#141922]">
                      <td className="py-2.5 px-4 font-mono tabular-nums text-[#E2E8F0]">
                        {formatIsoToTaipei(c.startAt).dateTimeSec}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-[#CBD5E1]">
                        {c.endAt ? formatIsoToTaipei(c.endAt).dateTimeSec : '休市中（尚未開市）'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-white">
                        {days.toFixed(2)} 天
                      </td>
                      <td className="py-2.5 px-4 text-[#94A3B8]">
                        {c.reason || '（未填寫原因）'}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        {confirmDeleteId === c.id ? (
                          <span className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                deleteClosure(c.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-2 py-0.5 bg-[#EF4444] text-white rounded-sm cursor-pointer"
                            >
                              確定刪除
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-0.5 text-[#CBD5E1] cursor-pointer"
                            >
                              取消
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(c.id)}
                            className="text-[#94A3B8] hover:text-[#F87171] inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            刪除
                          </button>
                        )}
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
