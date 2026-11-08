import React from 'react';
import { Target, LineChart, Sliders, Newspaper, Award } from 'lucide-react';

export type ActiveTab = 'signals' | 'terminal' | 'calibration' | 'news' | 'backtest';

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
      id: 'signals' as ActiveTab,
      label: 'Sinyal Live & Eksekusi',
      icon: Target,
      badge: lockedSignalsCount > 0 ? `${lockedSignalsCount} LOCKED` : undefined,
    },
    {
      id: 'terminal' as ActiveTab,
      label: 'Terminal Live & Chart',
      icon: LineChart,
    },
    {
      id: 'calibration' as ActiveTab,
      label: 'Kalibrasi Multi-Market',
      icon: Sliders,
    },
    {
      id: 'news' as ActiveTab,
      label: 'News & Blackout Gate',
      icon: Newspaper,
    },
    {
      id: 'backtest' as ActiveTab,
      label: 'Validasi Playbook (Backtest)',
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
              <span className="bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1">
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
};
