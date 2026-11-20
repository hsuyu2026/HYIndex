import { ChartTimeframe } from '../engine/calculations';
import { PageId } from '../types/hy';

const PREF_KEY = 'hy_index_ui_prefs_v1';

export interface UiPreferences {
  chartTimeframe: ChartTimeframe;
  lastPage: PageId;
}

const DEFAULT_PREFS: UiPreferences = {
  chartTimeframe: 'daily',
  lastPage: 'dashboard',
};

export function loadUiPreferences(): UiPreferences {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    return {
      chartTimeframe: ['daily', 'weekly', 'monthly', 'yearly'].includes(parsed.chartTimeframe)
        ? parsed.chartTimeframe
        : DEFAULT_PREFS.chartTimeframe,
      lastPage: [
        'dashboard',
        'record',
        'history',
        'statistics',
        'weekly',
        'market',
        'settings',
      ].includes(parsed.lastPage)
        ? parsed.lastPage
        : DEFAULT_PREFS.lastPage,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveUiPreferences(partial: Partial<UiPreferences>): void {
  try {
    const current = loadUiPreferences();
    localStorage.setItem(PREF_KEY, JSON.stringify({ ...current, ...partial }));
  } catch {
    // Ignore storage quota errors
  }
}
