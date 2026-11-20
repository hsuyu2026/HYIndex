import { AppShell } from './components/AppShell';
import { OnboardingFlow } from './components/OnboardingFlow';
import { HyProvider, useHy } from './context/HyContext';
import { DailyRecordPage } from './pages/DailyRecordPage';
import { DashboardPage } from './pages/DashboardPage';
import { DataSettingsPage } from './pages/DataSettingsPage';
import { ForecastPage } from './pages/ForecastPage';
import { HistoryPage } from './pages/HistoryPage';
import { MarketControlPage } from './pages/MarketControlPage';
import { StatisticsPage } from './pages/StatisticsPage';
import { WeeklyReportPage } from './pages/WeeklyReportPage';

function HyRouter() {
  const { isLoading, error, config, activePage } = useHy();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#090B0E] text-[#94A3B8] flex items-center justify-center text-sm font-mono">
        正在載入本機 HY INDEX 資料庫...
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#090B0E] text-[#F87171] flex items-center justify-center p-6 text-sm">
        <div className="border border-[#EF4444]/40 bg-[#0E1218] rounded p-6 max-w-md space-y-2">
          <div className="font-semibold">本機資料庫初始化異常</div>
          <div className="text-xs text-[#CBD5E1]">{error}</div>
        </div>
      </div>
    );
  }

  if (!config.onboardingCompleted) {
    return <OnboardingFlow />;
  }

  return (
    <AppShell>
      {activePage === 'dashboard' && <DashboardPage />}
      {activePage === 'record' && <DailyRecordPage />}
      {activePage === 'history' && <HistoryPage />}
      {activePage === 'statistics' && <StatisticsPage />}
      {activePage === 'forecast' && <ForecastPage />}
      {activePage === 'weekly' && <WeeklyReportPage />}
      {activePage === 'market' && <MarketControlPage />}
      {activePage === 'settings' && <DataSettingsPage />}
    </AppShell>
  );
}

export default function App() {
  return (
    <HyProvider>
      <HyRouter />
    </HyProvider>
  );
}
