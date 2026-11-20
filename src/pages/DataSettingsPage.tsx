import React, { useState } from 'react';
import {
  AlertTriangle,
  Download,
  FileJson,
  FileSpreadsheet,
  Lock,
  Trash2,
  Upload,
} from 'lucide-react';
import { useHy } from '../context/HyContext';
import { BackupValidationResult, validateBackupJson } from '../storage/db';
import { ACCUMULATION_FACTOR, BASELINE_SCORE, FORMULA_VERSION, INITIAL_HY_INDEX } from '../types/hy';
import { getNowTaipei } from '../utils/taipeiTime';

function triggerDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function DataSettingsPage() {
  const {
    config,
    records,
    closures,
    settlements,
    preMigrationBackupJson,
    dismissPreMigrationBackup,
    exportJsonBackup,
    exportCsvString,
    importJsonBackup,
    clearAllSystemData,
  } = useHy();

  const [importPreview, setImportPreview] = useState<BackupValidationResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const handleExportJson = () => {
    const payload = exportJsonBackup();
    const today = getNowTaipei().date;
    triggerDownload(
      `hy_index_backup_${today}.json`,
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8'
    );
  };

  const handleExportCsv = () => {
    const csv = exportCsvString();
    const today = getNowTaipei().date;
    triggerDownload(
      `hy_index_records_${today}.csv`,
      csv,
      'text/csv;charset=utf-8'
    );
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    setImportPreview(null);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const validation = validateBackupJson(text);
      if (!validation.valid) {
        setImportError(validation.error || '備份檔驗證失敗');
        return;
      }
      setImportPreview(validation);
    } catch {
      setImportError('無法讀取選擇的檔案');
    } finally {
      e.target.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreview?.payload) return;
    setImporting(true);
    try {
      // Section 13.2 Step 6: Create safety backup of current data before overwriting
      if (records.length > 0 || closures.length > 0 || config.onboardingCompleted) {
        const preBackup = exportJsonBackup();
        const stamp = getNowTaipei().dateTimeSec.replace(/[: ]/g, '-');
        triggerDownload(
          `hy_index_pre_import_backup_${stamp}.json`,
          JSON.stringify(preBackup, null, 2),
          'application/json;charset=utf-8'
        );
      }
      await importJsonBackup(importPreview.payload);
      setImportPreview(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : '匯入失敗');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-[#1E2530] pb-4">
        <h1 className="text-lg font-bold text-white">資料備份與系統設定</h1>
        <p className="text-xs text-[#94A3B8] mt-1">
          支援完整 JSON 備份還原、Excel 相容 CSV 匯出，並於匯入覆蓋前自動保存現有資料備份
        </p>
      </div>

      {/* System Parameters (Fixed v1.2.0 constants) */}
      <section className="border border-[#1E2530] bg-[#0E1218] rounded p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-[#1E2530] pb-3">
          <h2 className="text-sm font-semibold text-white">系統固定基準參數與資料統計</h2>
          <span className="inline-flex items-center gap-1.5 text-xs text-[#94A3B8]">
            <Lock className="w-3.5 h-3.5" />
            每日偏離基準分數累積制參數固定鎖定
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 text-xs">
          <div>
            <div className="text-[#64748B]">初始 HY 指數</div>
            <div className="font-mono tabular-nums text-lg font-semibold text-white mt-1">
              {INITIAL_HY_INDEX.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-[#64748B]">每日基準分數</div>
            <div className="font-mono tabular-nums text-lg font-semibold text-white mt-1">
              {BASELINE_SCORE.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-[#64748B]">每日累積係數</div>
            <div className="font-mono tabular-nums text-lg font-semibold text-white mt-1">
              × {ACCUMULATION_FACTOR}
            </div>
          </div>
          <div>
            <div className="text-[#64748B]">累計紀錄筆數</div>
            <div className="font-mono tabular-nums text-lg font-semibold text-white mt-1">
              {records.length}
            </div>
          </div>
          <div>
            <div className="text-[#64748B]">已結算週報數</div>
            <div className="font-mono tabular-nums text-lg font-semibold text-white mt-1">
              {settlements.length}
            </div>
          </div>
          <div>
            <div className="text-[#64748B]">系統版本</div>
            <div className="font-mono tabular-nums text-lg font-semibold text-[#CBD5E1] mt-1">
              v{config.formulaVersion}
            </div>
          </div>
        </div>
      </section>

      {preMigrationBackupJson && (
        <section className="border border-[#F59E0B]/40 bg-[#F59E0B]/10 rounded p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="space-y-1 text-[#FDE68A]">
            <div className="font-semibold">
              已保留 v1.2.0 升級前的舊版原始資料備份快照
            </div>
            <div className="text-[#FCD34D]/80">
              系統已依新版每日偏離累積制完成歷史資料重算；您可隨時下載升級前原始資料快照留存。
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                triggerDownload(
                  `hy_index_pre_v120_backup_${getNowTaipei().date}.json`,
                  preMigrationBackupJson,
                  'application/json;charset=utf-8'
                )
              }
              className="px-3.5 py-1.5 bg-[#F59E0B] hover:bg-[#D97706] text-[#090B0E] font-medium rounded-sm inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              下載升級前備份
            </button>
            <button
              type="button"
              onClick={dismissPreMigrationBackup}
              className="px-3 py-1.5 border border-[#F59E0B]/40 text-[#FDE68A] hover:text-white rounded-sm cursor-pointer"
            >
              清除快照
            </button>
          </div>
        </section>
      )}

      {/* Export Section */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border border-[#1E2530] bg-[#0E1218] rounded p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <FileJson className="w-4 h-4 text-[#EF4444]" />
              <span>JSON 完整資料備份匯出</span>
            </div>
              <p className="text-xs text-[#94A3B8] mt-2 leading-relaxed">
              包含所有紀錄、文字內容、四大數值、習慣勾選、情緒／身體／需求標籤、休市區間、每週結算報告、系統設定及系統版本。
            </p>
          </div>
          <div>
            <button
              type="button"
              onClick={handleExportJson}
              className="px-4 py-2 bg-[#EF4444] hover:bg-[#DC2626] text-white text-xs font-medium rounded-sm inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              下載 JSON 完整備份
            </button>
          </div>
        </div>

        <div className="border border-[#1E2530] bg-[#0E1218] rounded p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <FileSpreadsheet className="w-4 h-4 text-[#CBD5E1]" />
              <span>CSV 數值資料匯出（Excel 適用）</span>
            </div>
            <p className="text-xs text-[#94A3B8] mt-2 leading-relaxed">
              採用 UTF-8 BOM 編碼，匯出全部時間戳記、四大數值、習慣勾選、每日分數（S / H / St / Dt / 累計HY）及休市狀態，可直接使用 Microsoft Excel 開啟。
            </p>
          </div>
          <div>
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-4 py-2 border border-[#2B3544] bg-[#131820] hover:bg-[#1C232E] text-[#E2E8F0] text-xs font-medium rounded-sm inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              下載 CSV 數值明細
            </button>
          </div>
        </div>
      </section>

      {/* Import Section */}
      <section className="border border-[#1E2530] bg-[#0E1218] rounded p-5 space-y-4">
        <div className="border-b border-[#1E2530] pb-3">
          <h2 className="text-sm font-semibold text-white">JSON 備份匯入與還原</h2>
          <p className="text-xs text-[#94A3B8] mt-1">
            匯入前將檢查檔案格式與完整性，顯示資料筆數與日期範圍；確認覆蓋前會先自動匯出您目前的本機備份檔。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="px-4 py-2 border border-[#2B3544] bg-[#131820] hover:bg-[#1C232E] text-xs text-white font-medium rounded-sm inline-flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>選擇 JSON 備份檔案</span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </div>

        {importError && (
          <div className="border border-[#EF4444]/40 bg-[#EF4444]/10 p-3 rounded-sm text-xs text-[#F87171]">
            匯入檢查錯誤：{importError}
          </div>
        )}

        {importPreview && (
          <div className="border border-[#2B3544] bg-[#090B0E] p-4 rounded-sm space-y-4">
            <div className="text-xs font-semibold text-white">備份檔案檢查通過 — 確認匯入明細</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <div className="text-[#64748B]">紀錄筆數</div>
                <div className="font-mono tabular-nums text-white mt-0.5">
                  {importPreview.recordCount} 筆
                </div>
              </div>
              <div>
                <div className="text-[#64748B]">匯入時間範圍</div>
                <div className="font-mono tabular-nums text-white mt-0.5">
                  {importPreview.dateRange}
                </div>
              </div>
              <div>
                <div className="text-[#64748B]">休市區間 / 週報數</div>
                <div className="font-mono tabular-nums text-white mt-0.5">
                  {importPreview.closureCount} 區間 / {importPreview.settlementCount} 週
                </div>
              </div>
              <div>
                <div className="text-[#64748B]">來源系統版本</div>
                <div className="font-mono tabular-nums text-white mt-0.5">
                  v{importPreview.payload?.formulaVersion || '--'}（匯入後統一重算為 v{FORMULA_VERSION}）
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 text-xs text-[#FCD34D] bg-[#F59E0B]/10 border border-[#F59E0B]/30 p-3 rounded-sm">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                確認匯入將會覆蓋目前瀏覽器中的所有資料，系統將在執行覆蓋前先自動下載一份目前資料的 JSON 備份檔，並於匯入後重新計算所有指數與週報。
              </span>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setImportPreview(null)}
                className="px-3 py-1.5 border border-[#2B3544] text-xs text-[#CBD5E1] rounded-sm cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={importing}
                className="px-4 py-1.5 bg-[#EF4444] hover:bg-[#DC2626] text-white text-xs font-medium rounded-sm cursor-pointer"
              >
                {importing ? '還原重算中...' : '確認備份現有資料並覆蓋匯入'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Danger Zone: Reset All Data */}
      <section className="border border-[#EF4444]/30 bg-[#0E1218] rounded p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[#F87171]">清除所有本機資料與重置系統</h2>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              將清除 IndexedDB 中的全部紀錄、週報、休市紀錄與自訂標籤設定（操作前建議先下載 JSON 備份）。
            </p>
          </div>

          {!confirmClear ? (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="px-3.5 py-2 border border-[#EF4444]/40 hover:bg-[#EF4444]/10 text-xs text-[#F87171] rounded-sm inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              重置全部資料
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-[#EF4444]/10 border border-[#EF4444]/40 px-3 py-1.5 rounded-sm text-xs">
              <span className="text-[#F87171]">確定永久清除並回到首次設定？</span>
              <button
                type="button"
                onClick={async () => {
                  await clearAllSystemData();
                  setConfirmClear(false);
                }}
                className="px-2.5 py-1 bg-[#EF4444] text-white rounded-sm cursor-pointer"
              >
                確定清除
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="px-2 py-1 text-[#CBD5E1] cursor-pointer"
              >
                取消
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
