// client/src/pages/Standings.tsx
import React, { useEffect, useState } from 'react';
import { fetchJsonApi } from '../../../api/base';
import {
  PeriodSummaryTable,
  CategoryPeriodTable,
  CategoryId,
  TeamPeriodSummaryRow,
  CategoryPeriodRow,
} from "../../../components/StatsTables";
import PageHeader from "../../../components/ui/PageHeader";
import { getArchiveSeasons, getArchivePeriods } from '../../../api';
import { OGBA_TEAM_NAMES } from '../../../lib/ogbaTeams';

// Hitting + pitching categories
const hittingCats: CategoryId[] = ["R", "HR", "RBI", "SB", "AVG"];
const pitchingCats: CategoryId[] = ["W", "SV", "K", "ERA", "WHIP"];
const categories: CategoryId[] = [...hittingCats, ...pitchingCats];

const Standings = () => {
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [periods, setPeriods] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'season' | 'period'>('season');
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);
  
  const [summaryRows, setSummaryRows] = useState<TeamPeriodSummaryRow[]>([]);
  const [categoryRows, setCategoryRows] = useState<Record<CategoryId, CategoryPeriodRow[]>>({} as any);
  const [loading, setLoading] = useState(false);

  // Load current/latest season
  useEffect(() => {
    async function init() {
      const data = await getArchiveSeasons();
      if (data.seasons?.length > 0) {
        setSelectedYear(data.seasons[0]);
      }
    }
    init();
  }, []);

  // Load periods
  useEffect(() => {
    if (!selectedYear) return;
    async function loadPeriods() {
      const data = await getArchivePeriods(selectedYear!);
      setPeriods(data.periods || []);
      if (data.periods?.length > 0) {
        setSelectedPeriod(data.periods[data.periods.length - 1].periodNumber);
      }
    }
    loadPeriods();
  }, [selectedYear]);

  // Fetch Data
  useEffect(() => {
    if (!selectedYear) return;
    
    async function fetchData() {
      setLoading(true);
      try {
        let url = `/api/archive/${selectedYear}/standings`;
        if (viewMode === 'period' && selectedPeriod) {
            url = `/api/archive/${selectedYear}/period/${selectedPeriod}/standings`;
        }
        
        const data = await fetchJsonApi<{ standings?: any[] }>(url);
        const standings = data.standings || [];

        // Transform for tables
        const newSummaryRows: TeamPeriodSummaryRow[] = standings.map((s: any) => ({
            teamId: s.teamCode,
            teamName: s.teamName || OGBA_TEAM_NAMES[s.teamCode] || s.teamCode,
            gamesPlayed: 0, 
            totalPoints: s.totalScore,
            totalPointsDelta: 0, 
            categories: categories.map(cat => ({
                categoryId: cat,
                points: s[`${cat}_score`] || 0
            }))
        }));
        setSummaryRows(newSummaryRows);

        // Category Rows
        const newCategoryRows: Record<CategoryId, CategoryPeriodRow[]> = {} as any;
        categories.forEach(cat => {
            newCategoryRows[cat] = standings.map((s: any) => ({
                teamId: s.teamCode,
                teamName: s.teamName || OGBA_TEAM_NAMES[s.teamCode] || s.teamCode,
                periodStat: s[cat] || 0, 
                points: s[`${cat}_score`] || 0, 
                pointsDelta: 0
            }));

            newCategoryRows[cat].sort((a, b) => {
                if (cat === 'ERA' || cat === 'WHIP') {
                   return a.periodStat - b.periodStat;
                }
                return b.periodStat - a.periodStat;
            });

            newCategoryRows[cat].forEach((row, idx) => {
                row.points = newCategoryRows[cat].length - idx; 
            });
            
             newCategoryRows[cat].sort((a, b) => b.points - a.points);
        });

        setCategoryRows(newCategoryRows);
            
    } catch (err) {
        console.error(err);
    } finally {
        setLoading(false);
    }
  }
  fetchData();
  }, [selectedYear, selectedPeriod, viewMode]);


  return (
    <div className="flex flex-col min-h-screen scrollbar-hide">
      <div className="px-6 pt-6">
        <PageHeader 
          title="Standings Central" 
          subtitle={viewMode === 'season' ? "All-Time Standings" : `Period ${selectedPeriod} Standings`}
          rightElement={
            <div className="flex bg-[var(--lg-tint)] p-1 rounded-[var(--lg-radius-lg)] border border-[var(--lg-border-subtle)] backdrop-blur-3xl">
                <button
                    onClick={() => setViewMode('season')}
                    className={`px-6 py-2 rounded-[var(--lg-radius-md)] text-xs font-bold uppercase tracking-wide transition-all duration-300 ${viewMode === 'season' ? 'bg-[var(--lg-accent)] text-white shadow-xl shadow-blue-500/20 scale-[1.02]' : 'text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint)]'}`}
                >
                    Season
                </button>
                <button
                    onClick={() => setViewMode('period')}
                    className={`px-6 py-2 rounded-[var(--lg-radius-md)] text-xs font-bold uppercase tracking-wide transition-all duration-300 ${viewMode === 'period' ? 'bg-[var(--lg-accent)] text-white shadow-xl shadow-blue-500/20 scale-[1.02]' : 'text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint)]'}`}
                >
                    Period
                </button>
            </div>
          }
        />
      </div>
      
      <div className="max-w-7xl mx-auto w-full px-6 py-8 custom-scrollbar">
      {viewMode === 'period' && (
        <div className="flex flex-wrap items-center gap-6 mb-12 lg-card p-4 bg-transparent">
            <div className="flex items-center gap-4">
              <label className="text-xs font-bold uppercase tracking-wide text-[var(--lg-text-muted)] opacity-60">Select Period</label>
              <select 
                  value={selectedPeriod || ''} 
                  onChange={e => setSelectedPeriod(Number(e.target.value))}
                  className="lg-input w-auto min-w-[240px] font-bold uppercase tracking-wide text-xs py-2.5"
              >
                  {periods.map(p => (
                      <option key={p.id} value={p.periodNumber}>Period {p.periodNumber}</option>
                  ))}
              </select>
            </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-[var(--lg-text-muted)]">
          <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-6"></div>
          <p className="text-xs font-bold uppercase tracking-wide animate-pulse">Loading standings...</p>
        </div>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
            <div className="space-y-16">
                <PeriodSummaryTable
                    periodId={viewMode === 'season' ? "Season" : `P${selectedPeriod}`}
                    rows={summaryRows}
                    categories={categories}
                />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                  <div className="space-y-10">
                    <div className="flex items-center gap-4 mb-8">
                       <div className="w-2 h-8 bg-blue-500 rounded-full shadow-lg shadow-blue-500/20"></div>
                       <h3 className="text-2xl font-bold uppercase tracking-tight text-[var(--lg-text-heading)]">
                        Hitting Division
                      </h3>
                    </div>
                    <div className="space-y-10">
                      {hittingCats.map((cat) => (
                        <CategoryPeriodTable
                            key={cat}
                            periodId={viewMode === 'season' ? "Season" : `P${selectedPeriod}`}
                            categoryId={cat}
                            rows={categoryRows[cat] || []}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-10">
                    <div className="flex items-center gap-4 mb-8">
                       <div className="w-2 h-8 bg-purple-500 rounded-full shadow-lg shadow-purple-500/20"></div>
                       <h3 className="text-2xl font-bold uppercase tracking-tight text-[var(--lg-text-heading)]">
                        Pitching Division
                      </h3>
                    </div>
                    <div className="space-y-10">
                      {pitchingCats.map((cat) => (
                        <CategoryPeriodTable
                            key={cat}
                            periodId={viewMode === 'season' ? "Season" : `P${selectedPeriod}`}
                            categoryId={cat}
                            rows={categoryRows[cat] || []}
                        />
                      ))}
                    </div>
                  </div>
                </div>
            </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default Standings;
