import React, { useState } from 'react';
import {
  BarChart3,
  CalendarClock,
  Database,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  Menu,
  PenSquare,
  Power,
  Settings,
  TrendingUp,
  X,
} from 'lucide-react';
import { useHy, useTaipeiClock } from '../context/HyContext';
import { ACCUMULATION_FACTOR, BASELINE_SCORE, INITIAL_HY_INDEX, PageId } from '../types/hy';

interface NavItem {
  id: PageId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: '行情總覽', icon: LayoutDashboard },
  { id: 'record', label: '新增紀錄', icon: PenSquare },
  { id: 'history', label: '歷史紀錄', icon: History },
  { id: 'statistics', label: '統計分析', icon: BarChart3 },
  { id: 'forecast', label: '趨勢預測', icon: TrendingUp },
  { id: 'weekly', label: '每週結算', icon: FileSpreadsheet },
  { id: 'market', label: '休市開市', icon: Power },
  { id: 'settings', label: '資料設定', icon: Database },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const {
    activePage,
    setActivePage,
    setEditingRecordId,
    marketQuote,
    systemBanner,
    dismissBanner,
    config,
  } = useHy();
  const taipeiNow = useTaipeiClock();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSelectPage = (page: PageId) => {
    if (page === 'record') {
      setEditingRecordId(null);
    }
    setActivePage(page);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#090B0E] text-[#F1F5F9] flex flex-col">
      {/* Top Bar */}
      <header className="h-14 border-b border-[#1E2530] bg-[#0D1015] px-4 lg:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="切換選單"
            className="lg:hidden p-2 -ml-2 text-[#94A3B8] hover:text-white cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <button
            type="button"
            onClick={() => handleSelectPage('dashboard')}
            className="text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            HY INDEX
          </button>
          <span className="hidden sm:inline text-xs text-[#64748B] whitespace-nowrap shrink-0">
            HY綜合指數
          </span>
        </div>

        {/* Zone 2: Market Status & Asia/Taipei Clock */}
        <div className="flex items-center gap-4 md:gap-6 text-xs overflow-x-auto">
          <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
            <span className="text-[#64748B] hidden md:inline">系統狀態</span>
            <span
              className={`font-medium px-2 py-0.5 rounded-sm border whitespace-nowrap ${
                marketQuote.isMarketClosed
                  ? 'border-[#64748B]/40 bg-[#1E2530] text-[#CBD5E1]'
                  : 'border-[#EF4444]/40 bg-[#EF4444]/10 text-[#F87171]'
              }`}
            >
              {marketQuote.isMarketClosed ? '休市中' : '交易中'}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 font-mono tabular-nums text-[#CBD5E1] whitespace-nowrap shrink-0">
            <CalendarClock className="w-3.5 h-3.5 text-[#64748B]" />
            <span>{taipeiNow.dateTimeSec}</span>
            <span className="text-[#64748B]">{taipeiNow.weekdayLabel} · 台北</span>
          </div>
        </div>

        {/* Zone 3: Settings Entry */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleSelectPage('settings')}
            className="px-3 py-1.5 text-xs font-medium border border-[#2B3544] bg-[#131820] hover:bg-[#1C232E] text-[#E2E8F0] rounded-sm inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>設定</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Desktop & iPad Landscape Sidebar */}
        <aside className="hidden lg:flex w-60 shrink-0 border-r border-[#1E2530] bg-[#0B0E13] flex-col justify-between">
          <nav className="p-3 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectPage(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-sm rounded-sm transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#171D26] text-white border border-[#2B3544]'
                      : 'text-[#94A3B8] hover:text-white hover:bg-[#12161D] border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2.5 whitespace-nowrap">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-[#EF4444]' : 'text-[#64748B]'}`} />
                    <span className="font-medium">{item.label}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="p-4 border-t border-[#1E2530] text-xs space-y-1.5 text-[#64748B]">
            <div className="flex items-center justify-between">
              <span>初始基期 HY</span>
              <span className="font-mono tabular-nums text-[#CBD5E1]">
                {INITIAL_HY_INDEX.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>每日基準分數</span>
              <span className="font-mono tabular-nums text-[#CBD5E1]">
                {BASELINE_SCORE.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>每日累積係數</span>
              <span className="font-mono tabular-nums text-[#CBD5E1]">
                × {ACCUMULATION_FACTOR}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>系統版本</span>
              <span className="font-mono tabular-nums text-[#94A3B8]">
                v{config.formulaVersion}
              </span>
            </div>
          </div>
        </aside>

        {/* Mobile Drawer Navigation */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 top-14 z-40 bg-black/70" onClick={() => setMobileMenuOpen(false)}>
            <nav
              className="w-64 h-full bg-[#0B0E13] border-r border-[#1E2530] p-3 space-y-1"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-3 py-2 text-xs font-mono text-[#94A3B8] border-b border-[#1E2530] mb-2">
                {taipeiNow.dateTimeSec} ({taipeiNow.weekdayLabel})
              </div>
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectPage(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-sm rounded-sm transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[#171D26] text-white border border-[#2B3544]'
                        : 'text-[#94A3B8] hover:text-white border border-transparent'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-[#EF4444]' : 'text-[#64748B]'}`} />
                      <span>{item.label}</span>
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        )}

        {/* Main Viewport */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          {systemBanner && (
            <div
              className={`px-4 lg:px-6 py-2.5 border-b text-xs flex items-center justify-between gap-4 ${
                systemBanner.type === 'warning'
                  ? 'bg-[#F59E0B]/10 border-[#F59E0B]/30 text-[#FCD34D]'
                  : systemBanner.type === 'success'
                    ? 'bg-[#1E2530] border-[#334155] text-[#E2E8F0]'
                    : 'bg-[#141923] border-[#2B3544] text-[#CBD5E1]'
              }`}
            >
              <span>{systemBanner.message}</span>
              <button
                type="button"
                onClick={dismissBanner}
                className="text-[#94A3B8] hover:text-white px-2 py-0.5 cursor-pointer shrink-0"
              >
                關閉
              </button>
            </div>
          )}

          <div className="max-w-[1280px] mx-auto p-4 lg:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
