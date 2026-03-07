import React, { useState } from 'react';
import { fetchJsonApi } from '../api/base';

interface AIInsightsModalProps {
  isOpen: boolean;
  onClose: () => void;
  year: number;
  teamCode: string;
  teamName: string;
}

type AnalysisType = 'trends' | 'draft';

export default function AIInsightsModal({ isOpen, onClose, year, teamCode, teamName }: AIInsightsModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analysisType, setAnalysisType] = useState<AnalysisType>('trends');

  const fetchAnalysis = async (type: AnalysisType) => {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    setAnalysisType(type);

    try {
      const endpoint = type === 'trends' 
        ? `/api/archive/${year}/ai/trends/${teamCode}`
        : `/api/archive/${year}/ai/draft/${teamCode}`;
      
      const data = await fetchJsonApi<{ analysis: string }>(endpoint);
      setAnalysis(data.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate analysis');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-[4px] shadow-2xl"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-[var(--lg-glass-bg)] backdrop-blur-[var(--lg-glass-blur)] border border-[var(--lg-glass-border)] rounded-[var(--lg-radius-2xl)] shadow-[var(--lg-glass-shadow)] w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-[var(--lg-glass-border)] bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-transparent">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[var(--lg-text-heading)] flex items-center gap-3">
              <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
              </svg>
              AI Insights <span className="text-[var(--lg-text-muted)] opacity-30 mx-1">/</span> {teamName}
            </h2>
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--lg-text-muted)] mt-1">{year} Season Analysis</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-[var(--lg-tint-hover)] rounded-[var(--lg-radius-lg)] transition-colors text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Analysis Type Buttons */}
        <div className="flex gap-4 px-8 py-5 border-b border-[var(--lg-glass-border)] bg-[var(--lg-tint)]">
          <button
            onClick={() => fetchAnalysis('trends')}
            disabled={loading}
            className={`flex-1 px-4 py-3 rounded-[var(--lg-radius-xl)] text-xs font-bold uppercase tracking-wide transition-all duration-300 ${
              analysisType === 'trends' && analysis
                ? 'bg-[var(--lg-accent)] text-white shadow-lg shadow-blue-500/20 scale-[1.02]'
                : 'bg-[var(--lg-tint)] text-[var(--lg-text-muted)] border border-[var(--lg-border-faint)] hover:bg-[var(--lg-tint-hover)] hover:text-[var(--lg-text-primary)]'
            } disabled:opacity-50 flex items-center justify-center gap-2`}
          >
            📈 Season Trends
          </button>
          <button
            onClick={() => fetchAnalysis('draft')}
            disabled={loading}
            className={`flex-1 px-4 py-3 rounded-[var(--lg-radius-xl)] text-xs font-bold uppercase tracking-wide transition-all duration-300 ${
              analysisType === 'draft' && analysis
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20 scale-[1.02]'
                : 'bg-[var(--lg-tint)] text-[var(--lg-text-muted)] border border-[var(--lg-border-faint)] hover:bg-[var(--lg-tint-hover)] hover:text-[var(--lg-text-primary)]'
            } disabled:opacity-50 flex items-center justify-center gap-2`}
          >
            💵 Draft Strategy
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 px-8 py-6 overflow-y-auto custom-scrollbar">
          {!loading && !analysis && !error && (
            <div className="flex flex-col items-center justify-center py-20 text-[var(--lg-text-muted)] text-center">
              <div className="w-20 h-20 rounded-full bg-blue-500/5 flex items-center justify-center mb-6 border border-blue-500/10">
                <span className="text-4xl">🧠</span>
              </div>
              <p className="text-lg font-bold tracking-tight text-[var(--lg-text-primary)]">Choose an Analysis</p>
              <p className="text-xs font-medium mt-2 max-w-xs opacity-60">Run AI analysis on {teamName}'s {year} performance data and draft strategy.</p>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-20 text-[var(--lg-text-muted)]">
               <div className="relative">
                <div className="w-16 h-16 border-[6px] border-blue-500/10 border-t-blue-500 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center text-2xl animate-pulse">⚡</div>
              </div>
              <p className="text-lg font-bold tracking-tight text-[var(--lg-text-primary)] mt-6">Analyzing...</p>
              <p className="text-xs font-bold uppercase tracking-wide mt-2 opacity-50">Generating {analysisType} analysis...</p>
            </div>
          )}

          {error && (
            <div className="lg-alert lg-alert-error">
              <div className="flex items-center gap-2 font-bold uppercase tracking-wide text-[11px] mb-2">
                <span className="text-lg">⚠️</span> Error
              </div>
              <p className="text-sm font-medium">{error}</p>
              {error.includes('API key') && (
                <div className="mt-4 p-3 bg-red-500/10 rounded-[var(--lg-radius-lg)] border border-red-500/20 text-xs font-mono opacity-80">
                  Missing GEMINI_API_KEY environment variable.
                </div>
              )}
            </div>
          )}

          {analysis && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {analysis.split('\n\n').map((paragraph, i) => (
                <p key={i} className="text-sm font-medium text-[var(--lg-text-primary)] leading-relaxed bg-[var(--lg-tint)] p-4 rounded-[var(--lg-radius-lg)] border border-[var(--lg-border-faint)]">
                  {paragraph}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-[var(--lg-glass-border)] bg-black/20 text-xs font-bold uppercase tracking-wide text-[var(--lg-text-muted)] flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Powered by Google Gemini
          </div>
          {analysis && (
            <button 
              onClick={() => navigator.clipboard.writeText(analysis)}
              className="px-3 py-1 bg-[var(--lg-tint)] rounded-[var(--lg-radius-md)] hover:bg-[var(--lg-tint-hover)] hover:text-[var(--lg-text-primary)] transition-all flex items-center gap-2"
            >
              📋 Copy
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
