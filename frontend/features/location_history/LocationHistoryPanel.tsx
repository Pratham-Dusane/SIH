'use client';

// Location History & Context Research Right Rail Panel (F12)
import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  Search,
  Calendar,
  MapPin,
  ExternalLink,
  Loader2,
  AlertCircle,
  Building,
  Waves,
  Trees,
  ShieldCheck,
  ChevronRight,
  Info,
  CheckCircle2,
  Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { HistoricalContextReport } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';

const TOPIC_OPTIONS = [
  'Infrastructure',
  'Flooding & Disasters',
  'Urban Expansion',
  'Water & Reservoirs',
  'Master Plans',
];

export default function LocationHistoryPanel({ scene }: { scene: any }) {
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<string>('');
  const [report, setReport] = useState<HistoricalContextReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  // Custom location input
  const [customLocation, setCustomLocation] = useState('');
  const [dateRange, setDateRange] = useState('2000-2026');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([
    'Infrastructure',
    'Flooding & Disasters',
    'Urban Expansion',
  ]);
  const [activeTab, setActiveTab] = useState<'timeline' | 'development' | 'pdf' | 'sources'>('timeline');
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingJson, setDownloadingJson] = useState(false);

  const toggleTopic = (topic: string) => {
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  };

  const handleDownloadPdf = async () => {
    if (!report) return;
    setDownloadingPdf(true);
    try {
      const res = await fetch(`${API_BASE}/api/location-history/export/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `location_context_report_${report.id || 'dossier'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`PDF download failed: ${err.message || err}`);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleOpenPdfPreview = async () => {
    if (!report) return;
    try {
      const res = await fetch(`${API_BASE}/api/location-history/export/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err: any) {
      alert(`PDF preview failed: ${err.message || err}`);
    }
  };

  const handleDownloadJson = () => {
    if (!report) return;
    setDownloadingJson(true);
    try {
      const jsonStr = JSON.stringify(report, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `location_context_report_${report.id || 'data'}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`JSON export failed: ${err.message || err}`);
    } finally {
      setDownloadingJson(false);
    }
  };

  const runResearch = useCallback(async (forcedLocation?: string) => {
    setLoading(true);
    setError(null);
    setLoadingStage('Resolving administrative boundaries...');

    try {
      const locTarget = forcedLocation !== undefined ? forcedLocation : customLocation.trim();
      const payload: any = {
        date_range: dateRange,
        topic: selectedTopics.join(', '),
      };

      if (locTarget) {
        payload.location = locTarget;
      } else if (scene?.id) {
        payload.scene_id = scene.id;
      } else {
        payload.location = 'Pune, Maharashtra';
      }

      // Multi-stage indicator
      const stageTimer1 = setTimeout(() => {
        setLoadingStage('Searching regional disaster & master plan annals...');
      }, 350);

      const stageTimer2 = setTimeout(() => {
        setLoadingStage('Synthesizing grounded chronological context...');
      }, 700);

      const res = await fetch(`${API_BASE}/api/location-history/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);

      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json();
      setReport(data);
      setLastRefreshedAt(new Date().toLocaleTimeString());
      if (!customLocation && data?.overview?.district) {
        setCustomLocation(data.overview.district);
      }
    } catch (err: any) {
      setError(err.message || 'Location history research failed');
    } finally {
      setLoading(false);
      setLoadingStage('');
    }
  }, [scene?.id, customLocation, dateRange, selectedTopics]);

  // Run on first mount
  useEffect(() => {
    if (scene?.id && !report && !loading) {
      runResearch();
    }
  }, [scene?.id]);

  const handleCopyReport = () => {
    if (!report) return;
    const text = `
Historical & Contextual Report: ${report.overview.location_name} (${report.overview.period_analysed})
Summary: ${report.context_analysis.summary}

Timeline Events:
${report.timeline.map((t) => `- ${t.year} (${t.date_str}): ${t.title} - ${t.description}`).join('\n')}

Interpretation:
${report.context_analysis.interpretation_notes}

Caveat: ${report.context_analysis.methodological_caveat}
    `.trim();

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'natural_disasters':
        return <Waves className="w-4 h-4 text-blue-500" />;
      case 'infrastructure':
      case 'government_projects':
        return <Building className="w-4 h-4 text-amber-500" />;
      case 'environmental':
        return <Trees className="w-4 h-4 text-emerald-500" />;
      default:
        return <BookOpen className="w-4 h-4 text-purple-500" />;
    }
  };

  return (
    <div className="p-4 space-y-4 text-sm">
      {/* Top Banner Notice */}
      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-primary/10 border border-primary/20 text-primary">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <p className="text-xs leading-relaxed">
          Retrieves grounded historical, disaster, and infrastructure records from administrative annals
          to contextualize regional satellite observations without asserting unverified causal links.
        </p>
      </div>

      {/* Research Controls */}
      <div className="space-y-3 p-3.5 rounded-xl border border-border/70 bg-card/40 shadow-xs">
        {/* Location Target Input */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-primary" />
              <span>Target Location / AOI</span>
            </span>
            {scene?.name && !customLocation && (
              <span className="text-[11px] text-primary/80 font-mono lowercase">auto: scene bounds</span>
            )}
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="e.g. Pune, Maharashtra, Bengaluru, Mumbai..."
              value={customLocation}
              onChange={(e) => setCustomLocation(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runResearch()}
              className="w-full text-xs bg-background border border-border/80 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/60"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-primary" />
            <span>Period Window</span>
          </span>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="text-xs bg-background border border-border/80 rounded-lg px-2.5 py-1.5 font-mono focus:outline-none"
          >
            <option value="2000-2026">2000 – 2026 (Decadal)</option>
            <option value="2010-2026">2010 – 2026 (Recent)</option>
            <option value="2015-2026">2015 – 2026 (Post-Smart City)</option>
          </select>
        </div>

        {/* Topic Pills */}
        <div>
          <span className="text-xs text-muted-foreground block mb-1.5 font-medium">Focus Topics:</span>
          <div className="flex flex-wrap gap-1.5">
            {TOPIC_OPTIONS.map((t) => {
              const active = selectedTopics.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleTopic(t)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer',
                    active
                      ? 'bg-primary/15 border-primary/40 text-primary font-semibold'
                      : 'bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        <Button
          onClick={() => runResearch()}
          disabled={loading}
          size="sm"
          className="w-full h-9 text-xs font-semibold gap-2 rounded-xl mt-1 cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{loadingStage || 'Researching Regional Context...'}</span>
            </>
          ) : (
            <>
              <Search className="w-4 h-4" />
              <span>Run Location Research</span>
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Results View */}
      {report && (
        <div className="space-y-3.5">
          {/* Location Header Card */}
          <div className="p-3.5 rounded-xl border border-border/70 bg-card/60 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                <MapPin className="w-4 h-4 text-primary shrink-0" />
                <span>{report.overview.location_name}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                Admin: {report.overview.district} ({report.overview.unit_id || 'IN-DISTRICT'}) · {report.overview.period_analysed}
              </p>
              {lastRefreshedAt && (
                <p className="text-[11px] text-emerald-500 font-mono mt-0.5">
                  ✓ Ready · updated {lastRefreshedAt}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyReport}
                className="h-8 px-2.5 text-xs gap-1.5 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
                title="Copy formatted historical summary"
              >
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </Button>
            </div>
          </div>

          {/* Sub-Tabs: Timeline | Evolution | PDF Dossier | Sources */}
          <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-muted/60 border border-border/60 text-xs">
            {[
              { id: 'timeline', label: 'Timeline' },
              { id: 'development', label: 'Evolution' },
              { id: 'pdf', label: 'PDF Dossier' },
              { id: 'sources', label: `Sources (${report.sources.length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  'py-1.5 rounded-lg font-medium transition-all cursor-pointer text-center',
                  activeTab === tab.id
                    ? 'bg-card text-foreground shadow-xs font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab 1: Chronological Timeline */}
          {activeTab === 'timeline' && (
            <div className="space-y-3 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/60">
              {report.timeline.map((item) => (
                <div key={item.id} className="relative pl-8 group">
                  {/* Timeline bullet */}
                  <div className="absolute left-1.5 top-1.5 -translate-x-1/2 w-4 h-4 rounded-full bg-card border-2 border-primary flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  </div>

                  <div className="p-3 rounded-xl border border-border/60 bg-card/40 hover:bg-card/80 transition-colors space-y-1.5">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5">
                        {getCategoryIcon(item.category)}
                        <span className="font-bold text-xs text-foreground">{item.title}</span>
                      </div>
                      <span className="text-[11px] font-mono text-muted-foreground shrink-0 px-2 py-0.5 rounded bg-black/5 dark:bg-white/5">
                        {item.date_str}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {item.description}
                    </p>

                    <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground font-mono">
                      <span className="capitalize text-primary/80 font-medium">
                        {item.spatial_relevance.replace('_', ' ')}
                      </span>
                      <span>{item.source_ids.length} citations</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tab 2: Historical Development */}
          {activeTab === 'development' && (
            <div className="space-y-2.5 text-xs">
              <div className="p-3.5 rounded-xl border border-border/60 bg-card/40 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-foreground text-xs">
                  <Building className="w-4 h-4 text-blue-500" />
                  <span>Urban Expansion Dynamics</span>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  {report.development_summary.urban_expansion}
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-border/60 bg-card/40 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-foreground text-xs">
                  <ChevronRight className="w-4 h-4 text-amber-500" />
                  <span>Infrastructure Evolution</span>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  {report.development_summary.infrastructure_evolution}
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-border/60 bg-card/40 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-foreground text-xs">
                  <Waves className="w-4 h-4 text-cyan-500" />
                  <span>Environmental & Disaster Record</span>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  {report.development_summary.environmental_record}
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-border/60 bg-card/40 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-foreground text-xs">
                  <Trees className="w-4 h-4 text-emerald-500" />
                  <span>Agricultural Transition</span>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  {report.development_summary.agricultural_transition}
                </p>
              </div>
            </div>
          )}

          {/* Tab 3: PDF Dossier (Sleek Context + 2 Export Actions) */}
          {activeTab === 'pdf' && (
            <div className="space-y-3 text-xs">
              {/* Executive Summary */}
              <div className="p-3.5 rounded-xl border border-border/70 bg-card/60 space-y-2">
                <h4 className="font-bold text-xs text-foreground">Synthesis Summary</h4>
                <p className="text-muted-foreground leading-relaxed">
                  {report.context_analysis.summary}
                </p>
              </div>

              {/* Analyst Guidelines */}
              <div className="p-3.5 rounded-xl border border-primary/30 bg-primary/5 space-y-2">
                <h4 className="font-bold text-xs text-primary flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Analyst Interpretation Guidelines</span>
                </h4>
                <p className="text-muted-foreground leading-relaxed">
                  {report.context_analysis.interpretation_notes}
                </p>
              </div>

              {/* Scientific Caveat */}
              <div className="p-3 rounded-xl border border-border/70 bg-muted/30 text-muted-foreground text-xs leading-relaxed">
                <strong className="text-foreground font-semibold">Methodological Boundary:</strong> {report.context_analysis.methodological_caveat}
              </div>

              {/* Just 2 Clean Download Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf}
                  className="h-9 text-xs font-semibold gap-1.5 rounded-xl cursor-pointer bg-primary text-primary-foreground hover:opacity-90"
                >
                  {downloadingPdf ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <BookOpen className="w-3.5 h-3.5" />
                  )}
                  <span>Download PDF</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadJson}
                  disabled={downloadingJson}
                  className="h-9 text-xs font-medium gap-1.5 rounded-xl border-border/80 hover:bg-muted cursor-pointer"
                >
                  {downloadingJson ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <span className="font-mono text-xs font-bold text-primary">.JSON</span>
                  )}
                  <span>Download JSON</span>
                </Button>
              </div>
            </div>
          )}

          {/* Tab 4: Sources Bibliography */}
          {activeTab === 'sources' && (
            <div className="space-y-2.5">
              {report.sources.map((src) => (
                <div
                  key={src.id}
                  className="p-3 rounded-xl border border-border/60 bg-card/40 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h5 className="font-bold text-foreground text-xs leading-snug">
                      {src.title}
                    </h5>
                    {src.url && (
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:opacity-80 p-0.5 shrink-0"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">
                    {src.publisher} {src.date ? `· ${src.date}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground/90 italic leading-relaxed pt-1">
                    "{src.excerpt}"
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

