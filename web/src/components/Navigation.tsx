import React from 'react';
import { LayoutDashboard, Target, LineChart, Sliders, Newspaper, Award } from 'lucide-react';

export type ActiveTab = 'cockpit' | 'signals' | 'terminal' | 'calibration' | 'news' | 'backtest';

interface NavigationProps {
  activeTab: ActiveTab;
  onChangeTab: (tab: ActiveTab) => void;
  lockedSignalsCount: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onChangeTab,
  lockedSignalsCount,
}) => {
  const tabs = [
    {
      id: 'cockpit' as ActiveTab,
      label: 'Cockpit Terpadu',
      icon: LayoutDashboard,
      badge: lockedSignalsCount > 0 ? `${lockedSignalsCount} LOCKED` : undefined,
    },
    {
      id: 'signals' as ActiveTab,
      label: 'Sinyal & Eksekusi',
      icon: Target,
    },
    {
      id: 'terminal' as ActiveTab,
      label: 'Terminal Chart',
      icon: LineChart,
    },
    {
      id: 'calibration' as ActiveTab,
      label: 'Studio Kalibrasi',
      icon: Sliders,
    },
    {
      id: 'news' as ActiveTab,
      label: 'News Blackout Gate',
      icon: Newspaper,
    },
    {
      id: 'backtest' as ActiveTab,
      label: 'Validasi Playbook',
      icon: Award,
    },
  ];

  return (
    <nav className="nav-tabs" role="tablist">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChangeTab(tab.id)}
            className={`nav-btn ${isActive ? 'active' : ''}`}
          >
            <Icon className="w-4 h-4" />
            <span>{tab.label}</span>
            {tab.badge && (
              <span className="bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1 animate-pulse">
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
};
