import { useState } from 'react';
import { ArrowRight, Check, Lock, ShieldCheck } from 'lucide-react';
import {
  ACCUMULATION_FACTOR,
  AXIS_DEFINITIONS,
  BASELINE_SCORE,
  FORMULA_VERSION,
  HABIT_DEFINITIONS,
  INITIAL_HY_INDEX,
} from '../types/hy';
import { useHy } from '../context/HyContext';

export function OnboardingFlow() {
  const { completeOnboarding } = useHy();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleFinish = async () => {
    setSubmitting(true);
    try {
      await completeOnboarding();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '初始化設定失敗');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090B0E] text-[#F1F5F9] flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-2xl border border-[#1F2733] bg-[#0F1319] rounded p-6 md:p-8">
        <div className="flex items-center justify-between border-b border-[#1E2530] pb-4 mb-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              HY INDEX · 初始開戶與系統規範確認
            </h1>
            <p className="text-xs text-[#94A3B8] mt-1">
              首次使用導覽 · 步驟 {step} / 4 · 系統版本 v{FORMULA_VERSION}
            </p>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-xs tabular-nums">
            {[1, 2, 3, 4].map((n) => (
              <span
                key={n}
                className={`w-7 h-7 flex items-center justify-center rounded-sm border ${
                  step === n
                    ? 'bg-[#EF4444]/15 border-[#EF4444] text-white font-semibold'
                    : step > n
                      ? 'bg-[#1E2530] border-[#334155] text-[#CBD5E1]'
                      : 'bg-[#090B0E] border-[#1E2530] text-[#64748B]'
                }`}
              >
                {step > n ? <Check className="w-3.5 h-3.5" /> : n}
              </span>
            ))}
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-white">
                第一步：認識 HY 綜合指數（每日偏離基準分數累積制）
              </h2>
              <p className="text-sm text-[#CBD5E1] mt-2 leading-relaxed">
                HY 綜合指數（HY INDEX）參考台灣證券交易所加權股價指數的編製精神，以{' '}
                <span className="font-mono text-white font-semibold">
                  {INITIAL_HY_INDEX.toFixed(2)}
                </span>{' '}
                作為初始基期，每個有效開市日計算每日綜合分數（S_t）相對於固定基準{' '}
                <span className="font-mono text-white font-semibold">
                  {BASELINE_SCORE.toFixed(2)}
                </span>{' '}
                的偏離程度（D_t = S_t - 50），並持續累積至 HY 指數。
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="border border-[#1E2530] bg-[#090B0E] p-4 rounded-sm">
                <div className="text-xs text-[#94A3B8] mb-1">本機儲存與隱私</div>
                <div className="text-[#E2E8F0]">
                  所有數值、日記與週報皆儲存在您的瀏覽器 IndexedDB，無須登入且不上傳雲端。
                </div>
              </div>
              <div className="border border-[#1E2530] bg-[#090B0E] p-4 rounded-sm">
                <div className="text-xs text-[#94A3B8] mb-1">休市、漏記與真實性原則</div>
                <div className="text-[#E2E8F0]">
                  未填寫欄位絕不當作 0 分；休市日與無紀錄日不產生偏離分數，HY 指數維持前一個有效交易日數值。
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-5 py-2.5 bg-[#EF4444] hover:bg-[#DC2626] text-white text-sm font-medium rounded-sm inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                下一步：檢視固定基準參數
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-white">
                第二步：固定基準參數與累積公式（v{FORMULA_VERSION}）
              </h2>
              <p className="text-sm text-[#CBD5E1] mt-2 leading-relaxed">
                系統採用統一固定參數計算，基準分數與初始 HY 指數不隨每日分數或每週結算自動改變，每週結算亦不重設 HY 指數。
              </p>
            </div>

            <div className="border border-[#1E2530] bg-[#090B0E] p-5 rounded-sm space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="border border-[#1E2530] bg-[#11161E] p-3.5 rounded-sm">
                  <div className="text-[#94A3B8]">初始 HY 指數</div>
                  <div className="font-mono tabular-nums text-xl font-bold text-white mt-1">
                    {INITIAL_HY_INDEX.toFixed(2)}
                  </div>
                </div>
                <div className="border border-[#1E2530] bg-[#11161E] p-3.5 rounded-sm">
                  <div className="text-[#94A3B8]">每日基準分數</div>
                  <div className="font-mono tabular-nums text-xl font-bold text-white mt-1">
                    {BASELINE_SCORE.toFixed(2)}
                  </div>
                </div>
                <div className="border border-[#1E2530] bg-[#11161E] p-3.5 rounded-sm">
                  <div className="text-[#94A3B8]">每日累積係數</div>
                  <div className="font-mono tabular-nums text-xl font-bold text-white mt-1">
                    {ACCUMULATION_FACTOR}
                  </div>
                </div>
              </div>

              <div className="border border-[#1E2530] bg-[#11161E] px-4 py-3 rounded-sm font-mono text-xs text-[#E2E8F0] space-y-1">
                <div>1. 每日偏離分數：D_t = S_t - {BASELINE_SCORE}</div>
                <div>2. 累計 HY 指數：HY_t = HY_(t-1) + D_t × {ACCUMULATION_FACTOR}</div>
              </div>

              <div className="flex items-start gap-2 text-xs text-[#94A3B8]">
                <Lock className="w-4 h-4 shrink-0 mt-0.5 text-[#CBD5E1]" />
                <span>
                  高於 {BASELINE_SCORE} 分產生正向偏離推升 HY 指數，低於 {BASELINE_SCORE} 分產生負向偏離拉回 HY 指數，等於 {BASELINE_SCORE} 分則維持持平。
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 border border-[#2B3544] text-[#CBD5E1] hover:text-white text-sm rounded-sm cursor-pointer"
              >
                上一步
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-5 py-2.5 bg-[#EF4444] hover:bg-[#DC2626] text-white text-sm font-medium rounded-sm inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                下一步：確認權重與習慣分數
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-white">
                第三步：確認四大狀態權重與習慣計分規則
              </h2>
              <p className="text-sm text-[#94A3B8] mt-1">
                所有公式皆依系統規範固定執行，未填寫欄位將自動依已填寫項目重新正規化權重。
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-[#1E2530] bg-[#090B0E] p-4 rounded-sm">
                <div className="text-xs font-medium text-[#CBD5E1] mb-3">
                  四大狀態指數（佔每日綜合分數 80%）
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[#64748B] border-b border-[#1E2530]">
                      <th className="text-left pb-2 font-normal">項目</th>
                      <th className="text-right pb-2 font-normal">原始權重</th>
                      <th className="text-right pb-2 font-normal">綜合權重</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2530]/60">
                    {AXIS_DEFINITIONS.map((a) => (
                      <tr key={a.key}>
                        <td className="py-2 text-[#E2E8F0]">{a.label}</td>
                        <td className="py-2 text-right font-mono tabular-nums text-[#94A3B8]">
                          {a.rawWeight}%
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums text-white">
                          {(a.compositeWeight * 100).toFixed(0)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border border-[#1E2530] bg-[#090B0E] p-4 rounded-sm">
                <div className="text-xs font-medium text-[#CBD5E1] mb-3">
                  習慣紀錄（佔每日綜合分數 20% · 每日每項限計一次）
                </div>
                <div className="space-y-1.5 text-xs">
                  {HABIT_DEFINITIONS.map((h) => (
                    <div
                      key={h.id}
                      className="flex items-center justify-between py-1 border-b border-[#1E2530]/60 last:border-b-0"
                    >
                      <span className="text-[#E2E8F0]">{h.label}</span>
                      <span
                        className={`font-mono tabular-nums font-medium ${
                          h.points > 0 ? 'text-[#EF4444]' : 'text-[#22C55E]'
                        }`}
                      >
                        {h.points > 0 ? `+${h.points}` : h.points}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-2 border-t border-[#1E2530] text-[11px] text-[#94A3B8] font-mono">
                  H = min(100, max(0, 50 + 10 × Hp))
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2 border border-[#2B3544] text-[#CBD5E1] hover:text-white text-sm rounded-sm cursor-pointer"
              >
                上一步
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="px-5 py-2.5 bg-[#EF4444] hover:bg-[#DC2626] text-white text-sm font-medium rounded-sm inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                下一步：完成確認
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-6 h-6 text-[#EF4444] shrink-0 mt-0.5" />
              <div>
                <h2 className="text-lg font-semibold text-white">
                  第四步：準備進入 HY INDEX 行情總覽
                </h2>
                <p className="text-sm text-[#94A3B8] mt-1">
                  確認以下固定基準參數無誤後，即可開始記錄並追蹤您的長期累積生活狀態指數。
                </p>
              </div>
            </div>

            <div className="border border-[#1E2530] bg-[#090B0E] p-4 rounded-sm grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-xs text-[#64748B]">初始 HY 基期</div>
                <div className="font-mono tabular-nums text-lg font-semibold text-white mt-1">
                  {INITIAL_HY_INDEX.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-xs text-[#64748B]">固定每日基準分數</div>
                <div className="font-mono tabular-nums text-lg font-semibold text-[#EF4444] mt-1">
                  {BASELINE_SCORE.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-xs text-[#64748B]">時區與結算週期</div>
                <div className="font-mono text-sm text-[#E2E8F0] mt-1.5">
                  Asia/Taipei · 週一 03:00 結算
                </div>
              </div>
            </div>

            {errorMsg && (
              <div className="text-xs text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/30 px-3 py-2 rounded-sm">
                {errorMsg}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={submitting}
                className="px-4 py-2 border border-[#2B3544] text-[#CBD5E1] hover:text-white text-sm rounded-sm cursor-pointer"
              >
                返回檢查
              </button>
              <button
                type="button"
                onClick={handleFinish}
                disabled={submitting}
                className="px-6 py-2.5 bg-[#EF4444] hover:bg-[#DC2626] disabled:opacity-50 text-white text-sm font-medium rounded-sm inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                {submitting ? '初始化中...' : '確認並進入行情總覽'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
