import { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, Clock, Copy, Plus, Trash2, 
  PlayCircle, CheckCircle2, AlertTriangle, 
  ExternalLink, ChevronDown, Video, Download, Upload
} from 'lucide-react';

// --- Types ---
type Status = 'Scheduled' | 'Watching' | 'Completed';

interface WebinarEvent {
  id: string; // url as unique identifier
  site: string;
  title: string;
  jstDateString: string;
  timestampMs: number; // For sorting and comparisons
  url: string;
  status: Status;
}

// --- Icons & Colors Helper ---
const getSiteColor = (site: string) => {
  const s = site.toLowerCase();
  if (s.includes('m3')) return 'bg-rose-100 text-rose-700 border-rose-200';
  if (s.includes('carenet')) return 'bg-blue-100 text-blue-700 border-blue-200';
  if (s.includes('nikkei')) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (s.includes('medpeer')) return 'bg-cyan-100 text-cyan-700 border-cyan-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

const getSiteFallbackUrl = (site: string) => {
  const s = site.toLowerCase();
  if (s.includes('m3')) return 'https://www.m3.com/';
  if (s.includes('carenet')) return 'https://www.carenet.com/';
  if (s.includes('nikkei')) return 'https://medical.nikkeibp.co.jp/';
  if (s.includes('medpeer')) return 'https://medpeer.jp/';
  return '';
};

const PROMPT_TEXT = `あなたは医療系Web講演会の案内文から情報を正確に抽出する専門アシスタントです。
ユーザーから乱雑なメール本文やメッセージが送られてきたら、そこから「サイト名」「タイトル」「日時」「URL」を抽出し、以下のフォーマットで出力してください。複数の場合は「---」で区別してください。

【出力フォーマット】
[Site] (m3/CareNet/Nikkei/MedPeer/Other)
[Title] (講演会のタイトル)
[Date] YYYY/MM/DD HH:MM (※必ずJST時間表記)
[URL] (URLがある場合のみ記載)
`;

export default function App() {
  const [events, setEvents] = useState<WebinarEvent[]>(() => {
    try {
      const item = window.localStorage.getItem('webinar_events');
      return item ? JSON.parse(item) : [];
    } catch {
      return [];
    }
  });

  const [rawText, setRawText] = useState('');
  const [activeAlerts, setActiveAlerts] = useState<WebinarEvent[]>([]);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());

  // Persist to localStorage
  useEffect(() => {
    window.localStorage.setItem('webinar_events', JSON.stringify(events));
  }, [events]);

  // Alert check interval
  useEffect(() => {
    const checkAlerts = () => {
      const now = Date.now();
      const nextAlerts = events.filter(e => {
        if (e.status !== 'Scheduled') return false;
        const diffMs = e.timestampMs - now;
        const diffMin = diffMs / (1000 * 60);
        // Alert if it's starting in exactly 0 to 5 minutes
        return diffMin > 0 && diffMin <= 5;
      });
      setActiveAlerts(nextAlerts);
    };
    checkAlerts();
    const interval = setInterval(checkAlerts, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [events]);

  const handleParseText = () => {
    if (!rawText.trim()) return;

    // Pattern matching with high resilience.
    const normalizedText = rawText.replace(/［/g, '[').replace(/］/g, ']');

    // Split text into blocks by [Site], ensuring we handle multiple events.
    const blocks = normalizedText.split(/(?=\[Site\])/i).filter(b => b.trim().length > 0);
    
    // If no [Site] is found, the array will just have element(s) to process heuristically.
    const newEvents: WebinarEvent[] = [];

    for (const block of blocks) {
      const siteMatch = block.match(/\[Site\]([\s\S]*?)(?=\[Title\]|\[Date\]|\[URL\]|\[Site\]|$)/i);
      const titleMatch = block.match(/\[Title\]([\s\S]*?)(?=\[Date\]|\[URL\]|\[Site\]|$)/i);
      const dateMatch = block.match(/\[Date\]([\s\S]*?)(?=\[URL\]|\[Site\]|$)/i);
      const urlMatch = block.match(/\[URL\]([\s\S]*?)(?=\[Site\]|$)/i);

      let site = siteMatch ? siteMatch[1].trim() : '';
      let title = titleMatch ? titleMatch[1].trim() : '';
      let jstDateStrRaw = dateMatch ? dateMatch[1].trim() : '';
      let url = urlMatch ? urlMatch[1].trim() : '';

      // Redundancy: If the strict tags aren't explicitly used, try searching for any valid date.
      if (!site && !title && !jstDateStrRaw) {
         const fallbackDateMatch = block.match(/(\d{4}[\/\-年]\d{1,2}[\/\-月]\d{1,2}[日\s]*\d{1,2}:\d{1,2})/);
         if (fallbackDateMatch) {
           jstDateStrRaw = fallbackDateMatch[1];
           // Heuristic: Extract nearest previous non-empty lines as title/site
           const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0);
           const dateLineIdx = lines.findIndex(l => l.includes(jstDateStrRaw));
           if (dateLineIdx > 0) title = lines[dateLineIdx - 1];
           if (dateLineIdx > 1) site = lines[dateLineIdx - 2];
         }
      }

      if (!site) site = '未分類 (Other)';
      if (!title) title = 'タイトル未設定 (Untitled)';

      // Extract parts of the date string
      const extractDateMatch = jstDateStrRaw.match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})[日\s]*(\d{1,2}):(\d{1,2})/);
      if (!extractDateMatch) continue; 
      
      const [_, year, month, day, hour, minute] = extractDateMatch;
      const formattedMonth = month.padStart(2, '0');
      const formattedDay = day.padStart(2, '0');
      const formattedHour = hour.padStart(2, '0');
      const formattedMinute = minute.padStart(2, '0');
      
      const jstDateStr = `${year}/${formattedMonth}/${formattedDay} ${formattedHour}:${formattedMinute}`;
      const isoFormattedDate = `${year}-${formattedMonth}-${formattedDay}T${formattedHour}:${formattedMinute}:00+09:00`;
      const parsedDate = new Date(isoFormattedDate);

      // Verify the parsed date is structurally valid
      if (isNaN(parsedDate.getTime())) continue;

      let finalUrl = url;
      if (url && !url.startsWith('http')) {
        const fixedHttpMatch = url.match(/(https?:\/\/[^\s]+)/);
        finalUrl = fixedHttpMatch ? fixedHttpMatch[1] : '';
      }

      // If no URL, use a deterministic combination of details as unique ID
      const id = finalUrl || `id-${site}-${title}-${jstDateStr}`.replace(/\s+/g, '-');

      newEvents.push({
        id,
        site,
        title,
        jstDateString: jstDateStr,
        timestampMs: parsedDate.getTime(),
        url: finalUrl,
        status: 'Scheduled'
      });
    }

    if (newEvents.length === 0) {
      alert("No valid events found. Please ensure texts include a valid date format (e.g. YYYY/MM/DD HH:MM).");
      return;
    }

    setEvents(prev => {
      const map = new Map<string, WebinarEvent>();
      prev.forEach(e => map.set(e.id, e));
      newEvents.forEach(ne => {
        if (map.has(ne.id)) {
          const existing = map.get(ne.id)!;
          map.set(ne.id, { ...ne, status: existing.status });
        } else {
          map.set(ne.id, ne);
        }
      });
      return Array.from(map.values()).sort((a, b) => a.timestampMs - b.timestampMs);
    });

    setRawText('');
  };

  const updateStatus = (id: string, status: Status) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, status } : e));
  };

  const handleCleanup = () => {
    const now = Date.now();
    // Remove completed events OR events that happened more than 24 hours ago
    setEvents(prev => prev.filter(e => {
      const isAncient = (now - e.timestampMs) > 1000 * 60 * 60 * 24;
      return !isAncient && e.status !== 'Completed';
    }));
  };

  const handleDeleteSelected = () => {
    if (selectedEventIds.size === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedEventIds.size} selected event(s)?`)) return;
    setEvents(prev => prev.filter(e => !selectedEventIds.has(e.id)));
    setSelectedEventIds(new Set());
  };

  const toggleSelection = (id: string) => {
    setSelectedEventIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExportData = () => {
    if (events.length === 0) {
      alert('No events to export.');
      return;
    }
    const dataStr = JSON.stringify(events, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medwebinar_schedule_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedData = JSON.parse(event.target?.result as string);
        if (Array.isArray(importedData)) {
          if (importedData.length === 0 || (importedData[0].id && importedData[0].timestampMs)) {
            setEvents(prev => {
              const map = new Map<string, WebinarEvent>();
              prev.forEach(ev => map.set(ev.id, ev));
              importedData.forEach((ne: WebinarEvent) => {
                if (map.has(ne.id)) {
                  const existing = map.get(ne.id)!;
                  map.set(ne.id, { ...ne, status: existing.status });
                } else {
                  map.set(ne.id, ne);
                }
              });
              return Array.from(map.values()).sort((a, b) => a.timestampMs - b.timestampMs);
            });
            alert('Successfully imported schedule data!');
          } else {
            alert('Invalid data format. Please select a valid MedWebinar exported JSON file.');
          }
        }
      } catch (err) {
        alert('Failed to parse file. Please select a valid JSON file.');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const copyPrompt = () => {
    navigator.clipboard.writeText(PROMPT_TEXT);
    alert('Copied AI Formatter Prompt to clipboard!');
  };

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => a.timestampMs - b.timestampMs);
  }, [events]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <Video className="w-6 h-6 text-indigo-100" />
            <h1 className="text-xl font-bold tracking-tight">MedWebinar Scheduler</h1>
          </div>
          <button 
            onClick={copyPrompt}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-full text-sm font-medium transition-colors border border-white/10 shadow-sm backdrop-blur-md"
          >
            <Copy className="w-4 h-4" />
            Copy AI Prompt
          </button>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 py-8">
        
        {/* Alerts Section (If any) */}
        {activeAlerts.length > 0 && (
          <div className="mb-8 space-y-3 animation-fade-in">
            <h2 className="text-sm font-semibold text-rose-500 uppercase tracking-widest flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4"/> Starting Soon
            </h2>
            {activeAlerts.map(alert => (
              <div key={"alert-"+alert.id} className="bg-rose-500 rounded-xl p-4 flex items-center justify-between shadow-lg shadow-rose-500/20 text-white">
                <div>
                  <h3 className="font-bold">{alert.title}</h3>
                  <p className="text-rose-100 text-sm mt-1 whitespace-nowrap opacity-90">{alert.site}</p>
                </div>
                {(() => {
                  const alertUrl = alert.url || getSiteFallbackUrl(alert.site);
                  return (
                    <a 
                      href={alertUrl || '#'} 
                      target={alertUrl ? "_blank" : undefined} 
                      rel={alertUrl ? "noreferrer" : undefined}
                      className="px-4 py-2 bg-white text-rose-600 font-bold rounded-lg hover:bg-rose-50 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
                      onClick={(e) => {
                        if (!alertUrl) {
                          e.preventDefault();
                          window.alert('No URL available for this webinar.');
                        } else {
                          updateStatus(alert.id, 'Watching');
                        }
                      }}
                    >
                      <ExternalLink className="w-4 h-4" /> Watch Now
                    </a>
                  );
                })()}
              </div>
            ))}
          </div>
        )}

        {/* Input Section */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8 mt-4 transform transition-all hover:shadow-md">
          <div className="flex justify-between items-end mb-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-500" />
              Import Webinars
            </h2>
          </div>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm font-mono resize-y"
            placeholder="[Site] m3 [Title] 高血圧の最新知見 [Date] 2026/04/10 19:00 [URL] https://..."
          />
          <div className="mt-4 flex justify-end">
            <button 
              onClick={handleParseText}
              disabled={!rawText.trim()}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-medium transition-all shadow-sm shadow-indigo-200 text-sm flex items-center gap-2"
            >
              Parse and Add
            </button>
          </div>
        </section>

        {/* Schedule List */}
        <section>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-500" />
              Your Schedule
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-sm text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors font-medium px-3 py-1.5 rounded-lg cursor-pointer shadow-sm">
                <Upload className="w-4 h-4" /> Import Data
                <input type="file" accept=".json" className="hidden" onChange={handleImportData} />
              </label>
              <button 
                onClick={handleExportData}
                className="flex items-center gap-1.5 text-sm text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors font-medium px-3 py-1.5 rounded-lg shadow-sm"
              >
                <Download className="w-4 h-4" /> Export
              </button>
              <div className="w-px h-5 bg-slate-300 mx-1 hidden sm:block"></div>
              {selectedEventIds.size > 0 ? (
                <button 
                  onClick={handleDeleteSelected}
                  className="flex items-center gap-1.5 text-sm text-white bg-rose-500 hover:bg-rose-600 transition-colors font-medium px-3 py-1.5 rounded-lg shadow-sm"
                >
                  <Trash2 className="w-4 h-4" /> Delete ({selectedEventIds.size})
                </button>
              ) : (
                <button 
                  onClick={handleCleanup}
                  className="flex items-center gap-1.5 text-sm text-rose-500 hover:text-rose-600 bg-rose-50 border border-rose-100 hover:bg-rose-100 transition-colors font-medium px-3 py-1.5 rounded-lg shadow-sm"
                >
                  <Trash2 className="w-4 h-4" /> Cleanup Old
                </button>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {sortedEvents.length === 0 ? (
              <div className="text-center py-12 px-4 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 font-medium">
                No webinars scheduled. Paste your AI output above to get started.
              </div>
            ) : (
              sortedEvents.map(event => {
                const localDate = new Date(event.timestampMs);
                const isPast = Date.now() > event.timestampMs;

                return (
                  <div 
                    key={event.id}
                    className={`group rounded-2xl border overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 flex flex-col md:flex-row 
                      ${event.status === 'Completed' ? 'opacity-60 saturate-50' : ''} 
                      ${selectedEventIds.has(event.id) ? 'border-indigo-400 bg-indigo-50/40' : 'bg-white border-slate-200'}`}
                  >
                    {/* Time Pillar */}
                    <div className="md:w-48 bg-slate-50/70 p-4 border-b md:border-b-0 md:border-r border-slate-200/70 flex flex-col justify-center shrink-0">
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" /> Local Time
                      </div>
                      <div className={`font-bold text-lg ${isPast && event.status === 'Scheduled' ? 'text-rose-500' : 'text-slate-800'}`}>
                        {localDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric'})}
                      </div>
                      <div className={`text-xl tracking-tight font-black ${isPast && event.status === 'Scheduled' ? 'text-rose-600' : 'text-indigo-600'}`}>
                        {localDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-2">
                        (Orig: JST {event.jstDateString})
                      </div>
                    </div>

                    {/* Content Section */}
                    <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-center gap-3">
                            <input 
                              type="checkbox" 
                              checked={selectedEventIds.has(event.id)}
                              onChange={() => toggleSelection(event.id)}
                              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shadow-sm"
                            />
                            <span className={`inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold tracking-wide border ${getSiteColor(event.site)}`}>
                              {event.site.toUpperCase()}
                            </span>
                          </div>
                          <div className="relative inline-block text-left group">
                            <select 
                              value={event.status}
                              onChange={(e) => updateStatus(event.id, e.target.value as Status)}
                              className={`appearance-none text-xs font-medium pl-3 pr-8 py-1 rounded-full border cursor-pointer hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-indigo-500/50
                                ${event.status === 'Scheduled' ? 'bg-slate-100 text-slate-700 border-slate-200' : ''}
                                ${event.status === 'Watching' ? 'bg-emerald-500 text-white border-emerald-600' : ''}
                                ${event.status === 'Completed' ? 'bg-slate-700 text-white border-slate-800' : ''}
                              `}
                            >
                              <option value="Scheduled">🗓 Scheduled</option>
                              <option value="Watching">▶️ Watching</option>
                              <option value="Completed">✅ Completed</option>
                            </select>
                            <ChevronDown className={`w-3 h-3 absolute right-2.5 top-[7px] pointer-events-none ${event.status !== 'Scheduled' ? 'text-white/70' : 'text-slate-400'}`}/>
                          </div>
                        </div>
                        <h3 className="font-bold text-slate-800 line-clamp-2 leading-snug mt-2">
                          {event.title}
                        </h3>
                      </div>

                      <div className="flex justify-end">
                        {(() => {
                          const targetUrl = event.url || getSiteFallbackUrl(event.site);
                          return (
                            <a 
                              href={targetUrl || '#'} 
                              target={targetUrl ? "_blank" : undefined} 
                              rel={targetUrl ? "noreferrer" : undefined}
                              onClick={(e) => {
                                if (!targetUrl) {
                                  e.preventDefault();
                                  alert('No URL available for this webinar.');
                                } else if (event.status === 'Scheduled') {
                                  updateStatus(event.id, 'Watching');
                                }
                              }}
                              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm active:scale-95
                                ${event.status === 'Completed' 
                                  ? 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200' 
                                  : (!targetUrl)
                                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                                  : 'bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-700 hover:from-indigo-100 hover:to-violet-100 border border-indigo-100 hover:border-indigo-200'
                                }`}
                            >
                              {event.status === 'Completed' ? <CheckCircle2 className="w-4 h-4"/> : <PlayCircle className="w-4 h-4" />}
                              Open Webinar
                            </a>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
