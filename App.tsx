
import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trophy, Calendar, MapPin, Users, ChevronLeft, Trash2, Camera, Play, Cloud, CloudOff, Loader2, ExternalLink } from 'lucide-react';
import { Discipline, DiveSession, DiveEntry, MediaFile, PersonalBest } from './types';
import { formatTime, calculateOverallPB, calculateSessionPB, fileToBase64 } from './utils';

// Constants for Google Drive
const DRIVE_FOLDER_ID = '1Kcx0f-fqKsnYzof58Gg5gMZfKaeg4e_x';
const CLIENT_ID = '229707401391-cfovrjr2ecse3vk4jv613pkgi3mmmn0a.apps.googleusercontent.com'; 
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

// Components
const DisciplineBadge: React.FC<{ type: Discipline }> = ({ type }) => {
  const colors: Record<Discipline, string> = {
    [Discipline.STA]: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    [Discipline.DYN]: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    [Discipline.FIM]: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    [Discipline.CWT]: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${colors[type]}`}>
      {type}
    </span>
  );
};

const PBCard: React.FC<{ pb: PersonalBest }> = ({ pb }) => {
  const subText: Record<Discipline, string> = {
    [Discipline.STA]: 'Static Apnea',
    [Discipline.DYN]: 'Dynamic',
    [Discipline.FIM]: 'Free Immersion',
    [Discipline.CWT]: 'Constant Weight',
  };

  return (
    <div className="bg-[#1a1a24] border border-[#2d2d3a] p-4 rounded-2xl flex flex-col justify-between hover:border-purple-500/50 transition-colors">
      <div className="flex justify-between items-start mb-4">
        <DisciplineBadge type={pb.discipline} />
        {pb.date && <span className="text-[10px] text-gray-500 font-medium">{pb.date}</span>}
      </div>
      <div>
        <div className="text-3xl font-bold text-white mb-1">{pb.value}</div>
        <div className="text-xs text-gray-400 font-medium">{subText[pb.discipline]}</div>
      </div>
    </div>
  );
};

const DiveEntryItem: React.FC<{ entry: DiveEntry; onDelete: () => void }> = ({ entry, onDelete }) => {
  return (
    <div className="bg-[#1a1a24] border border-[#2d2d3a] p-4 rounded-xl flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <DisciplineBadge type={entry.discipline} />
          <span className="text-xs font-semibold text-gray-400">{entry.attemptNumber}차 시도</span>
        </div>
        <button onClick={onDelete} className="p-1 text-gray-500 hover:text-red-400">
          <Trash2 size={16} />
        </button>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        {entry.timeSeconds !== undefined && (
          <div>
            <div className="text-[10px] text-gray-500 uppercase font-bold">Time</div>
            <div className="text-lg font-semibold">{formatTime(entry.timeSeconds)}</div>
          </div>
        )}
        {entry.distanceMeters !== undefined && (
          <div>
            <div className="text-[10px] text-gray-500 uppercase font-bold">Distance</div>
            <div className="text-lg font-semibold">{entry.distanceMeters}m</div>
          </div>
        )}
        {entry.depthMeters !== undefined && (
          <div>
            <div className="text-[10px] text-gray-500 uppercase font-bold">Depth</div>
            <div className="text-lg font-semibold">{entry.depthMeters}m</div>
          </div>
        )}
      </div>

      {entry.media.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {entry.media.map(m => (
            <div key={m.id} className="relative w-16 h-16 rounded-md overflow-hidden bg-black flex-shrink-0 group">
              {m.driveFileId ? (
                <div className="w-full h-full flex flex-col items-center justify-center bg-blue-900/20 text-blue-400">
                  <Cloud size={20} />
                  <a href={m.url} target="_blank" rel="noopener noreferrer" className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <ExternalLink size={16} />
                  </a>
                </div>
              ) : (
                <img src={m.url} className="w-full h-full object-cover opacity-80" alt="Dive media" />
              )}
              {m.type === 'video' && !m.driveFileId && <Play size={12} className="absolute inset-0 m-auto text-white fill-white" />}
            </div>
          ))}
        </div>
      )}
      
      {entry.note && (
        <p className="text-xs text-gray-400 border-t border-[#2d2d3a] pt-2">{entry.note}</p>
      )}
    </div>
  );
};

export default function App() {
  const [sessions, setSessions] = useState<DiveSession[]>([]);
  const [view, setView] = useState<'dashboard' | 'session_detail'>('dashboard');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDiveModalOpen, setIsDiveModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  // Google Auth State
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const tokenClientRef = useRef<any>(null);

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('dive_sessions');
    if (saved) {
      try {
        setSessions(JSON.parse(saved));
      } catch (e) { console.error(e); }
    }

    // Initialize Google Identity Services
    const initGis = () => {
      if ((window as any).google) {
        tokenClientRef.current = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: (response: any) => {
            if (response.access_token) {
              setAccessToken(response.access_token);
            }
          },
        });
      }
    };
    
    const checkGis = setInterval(() => {
        if ((window as any).google) {
            initGis();
            clearInterval(checkGis);
        }
    }, 500);
    
    return () => clearInterval(checkGis);
  }, []);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('dive_sessions', JSON.stringify(sessions));
  }, [sessions]);

  const handleDriveAuth = () => {
    if (tokenClientRef.current) {
      tokenClientRef.current.requestAccessToken();
    } else {
      alert("구글 API 라이브러리를 불러오는 중입니다. 잠시 후 다시 시도해주세요.");
    }
  };

  const uploadToDrive = async (file: File, name: string): Promise<string | null> => {
    if (!accessToken) return null;
    
    const metadata = {
      name: name,
      parents: [DRIVE_FOLDER_ID],
    };

    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    formData.append('file', file);

    try {
      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
        method: 'POST',
        headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
        body: formData,
      });
      const data = await response.json();
      return data.id ? data.webViewLink : null;
    } catch (error) {
      console.error('Upload failed:', error);
      return null;
    }
  };

  const overallPB = calculateOverallPB(sessions);

  const handleCreateSession = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newSession: DiveSession = {
      id: Date.now().toString(),
      date: formData.get('date') as string,
      location: formData.get('location') as string,
      buddy: formData.get('buddy') as string,
      note: formData.get('note') as string,
      entries: [],
    };
    setSessions([newSession, ...sessions]);
    setIsModalOpen(false);
    setSelectedSessionId(newSession.id);
    setView('session_detail');
  };

  const handleAddDive = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedSessionId) return;

    const formData = new FormData(e.currentTarget);
    const discipline = formData.get('discipline') as Discipline;
    const session = sessions.find(s => s.id === selectedSessionId);
    if (!session) return;

    const attemptNumber = session.entries.filter(e => e.discipline === discipline).length + 1;
    
    // Media processing
    const mediaFiles = formData.getAll('media') as File[];
    const processedMedia: MediaFile[] = [];
    
    if (mediaFiles.length > 0 && mediaFiles[0].size > 0) {
        setIsUploading(true);
        for (const f of mediaFiles) {
            if (f.size > 0) {
                // If connected to Drive, upload there. Otherwise, use Base64
                let driveUrl: string | null = null;
                const fileName = `${session.date} ${discipline}_${attemptNumber}`;
                
                if (accessToken) {
                    driveUrl = await uploadToDrive(f, fileName);
                }

                if (driveUrl) {
                    processedMedia.push({
                        id: Math.random().toString(36).substr(2, 9),
                        type: f.type.startsWith('video') ? 'video' : 'image',
                        url: driveUrl,
                        driveFileId: 'uploaded'
                    });
                } else {
                    const base64 = await fileToBase64(f);
                    processedMedia.push({
                        id: Math.random().toString(36).substr(2, 9),
                        type: f.type.startsWith('video') ? 'video' : 'image',
                        url: base64
                    });
                }
            }
        }
        setIsUploading(false);
    }

    const timeStr = formData.get('time') as string;
    let timeSeconds: number | undefined;
    if (timeStr) {
        const [m, s] = timeStr.split(':').map(Number);
        timeSeconds = (m || 0) * 60 + (s || 0);
    }

    const newEntry: DiveEntry = {
      id: Date.now().toString(),
      discipline,
      attemptNumber,
      timeSeconds,
      distanceMeters: formData.get('distance') ? Number(formData.get('distance')) : undefined,
      depthMeters: formData.get('depth') ? Number(formData.get('depth')) : undefined,
      media: processedMedia,
      note: formData.get('note') as string,
      timestamp: Date.now(),
    };

    setSessions(sessions.map(s => 
      s.id === selectedSessionId ? { ...s, entries: [...s.entries, newEntry] } : s
    ));
    setIsDiveModalOpen(false);
  };

  const deleteSession = (id: string) => {
    if (confirm('이 세션을 삭제하시겠습니까?')) {
      setSessions(sessions.filter(s => s.id !== id));
      setView('dashboard');
    }
  };

  const deleteEntry = (sessionId: string, entryId: string) => {
    setSessions(sessions.map(s => 
      s.id === sessionId ? { ...s, entries: s.entries.filter(e => e.id !== entryId) } : s
    ));
  };

  const currentSession = sessions.find(s => s.id === selectedSessionId);
  const sessionPBs = currentSession ? calculateSessionPB(currentSession.entries) : {};

  return (
    <div className="max-w-md mx-auto min-h-screen bg-[#0f0f17] pb-20 overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[#0f0f17]/80 backdrop-blur-md px-6 py-4 flex justify-between items-center border-b border-[#1a1a24]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-900/20">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">DiveLog</h1>
            <button 
                onClick={handleDriveAuth}
                className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider transition-colors"
                style={{ color: accessToken ? '#4ade80' : '#6b7280' }}
            >
                {accessToken ? <Cloud size={10} /> : <CloudOff size={10} />}
                {accessToken ? 'Drive Synced' : 'Drive Off'}
            </button>
          </div>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 px-5 rounded-xl flex items-center gap-2 shadow-lg shadow-purple-900/40 transition-all active:scale-95"
        >
          <Plus size={18} />
          <span className="text-sm">새 세션</span>
        </button>
      </header>

      {view === 'dashboard' ? (
        <main className="p-6 space-y-8">
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Trophy size={18} className="text-yellow-500" />
              <h2 className="text-lg font-bold">Overall PB</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {overallPB.map(pb => (
                <PBCard key={pb.discipline} pb={pb} />
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">다이브 세션</h2>
              <span className="text-xs text-gray-500 font-medium">{sessions.length} sessions</span>
            </div>
            
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 opacity-50">
                <Calendar size={48} className="text-gray-700" />
                <p className="text-gray-400 font-medium">아직 기록된 세션이 없습니다</p>
              </div>
            ) : (
              <div className="space-y-4">
                {sessions.map(session => {
                  const sPBs = calculateSessionPB(session.entries);
                  return (
                    <div 
                      key={session.id} 
                      onClick={() => { setSelectedSessionId(session.id); setView('session_detail'); }}
                      className="bg-[#1a1a24] border border-[#2d2d3a] p-5 rounded-2xl cursor-pointer hover:border-purple-500/40 transition-all active:scale-[0.98]"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-bold text-lg mb-1">{session.date}</h3>
                          <div className="flex items-center gap-3 text-xs text-gray-400">
                            <span className="flex items-center gap-1"><MapPin size={12} className="text-purple-500" />{session.location}</span>
                            <span className="flex items-center gap-1"><Users size={12} className="text-purple-500" />{session.buddy}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {Object.entries(sPBs).map(([disc, val]) => (
                          <div key={disc} className="bg-[#0f0f17] border border-[#2d2d3a] px-2 py-1 rounded-lg flex items-center gap-2">
                            <span className="text-[10px] font-bold text-purple-400">{disc}</span>
                            <span className="text-xs font-bold">{val}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      ) : (
        <main className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <button onClick={() => setView('dashboard')} className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors">
              <ChevronLeft size={20} />
              <span className="text-sm font-medium">대시보드</span>
            </button>
            <button onClick={() => deleteSession(selectedSessionId!)} className="text-gray-500 hover:text-red-400">
              <Trash2 size={18} />
            </button>
          </div>

          {currentSession && (
            <>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">{currentSession.date}</h2>
                <div className="flex gap-4 text-xs text-gray-400">
                  <span className="flex items-center gap-1"><MapPin size={14} className="text-purple-500" />{currentSession.location}</span>
                  <span className="flex items-center gap-1"><Users size={14} className="text-purple-500" />{currentSession.buddy}</span>
                </div>
                {currentSession.note && <p className="text-sm text-gray-400 bg-[#1a1a24] p-3 rounded-xl">{currentSession.note}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {Object.entries(sessionPBs).map(([disc, val]) => (
                  <div key={disc} className="bg-[#1a1a24] border border-[#2d2d3a] p-3 rounded-xl flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-400">{disc} PB</span>
                    <span className="text-sm font-bold text-purple-400">{val}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-[#1a1a24]">
                <h3 className="font-bold">다이브 로그 ({currentSession.entries.length})</h3>
                <button 
                  onClick={() => setIsDiveModalOpen(true)}
                  className="bg-[#1a1a24] border border-[#2d2d3a] text-xs font-bold py-2 px-4 rounded-lg hover:bg-[#2d2d3a] transition-all flex items-center gap-1"
                >
                  <Plus size={14} /> 기록 추가
                </button>
              </div>

              <div className="space-y-4">
                {currentSession.entries.length === 0 ? (
                  <p className="text-center py-10 text-gray-500 text-sm italic">기록된 다이브가 없습니다.</p>
                ) : (
                  [...currentSession.entries].sort((a,b) => b.timestamp - a.timestamp).map(entry => (
                    <DiveEntryItem 
                        key={entry.id} 
                        entry={entry} 
                        onDelete={() => deleteEntry(selectedSessionId!, entry.id)} 
                    />
                  ))
                )}
              </div>
            </>
          )}
        </main>
      )}

      {/* New Session Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1a1a24] w-full max-w-sm rounded-3xl p-6 border border-[#2d2d3a]">
            <h2 className="text-xl font-bold mb-6">새 다이브 세션</h2>
            <form onSubmit={handleCreateSession} className="space-y-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1.5 ml-1">날짜</label>
                <input required type="date" name="date" className="w-full bg-[#0f0f17] border border-[#2d2d3a] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500" defaultValue={new Date().toISOString().split('T')[0]} />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1.5 ml-1">장소</label>
                <input required type="text" name="location" placeholder="K2, 파라다이스, 올림픽수영장 등" className="w-full bg-[#0f0f17] border border-[#2d2d3a] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500" />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1.5 ml-1">버디</label>
                <input required type="text" name="buddy" placeholder="함께한 사람 이름" className="w-full bg-[#0f0f17] border border-[#2d2d3a] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500" />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1.5 ml-1">메모</label>
                <textarea name="note" rows={2} placeholder="오늘의 컨디션이나 특이사항" className="w-full bg-[#0f0f17] border border-[#2d2d3a] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500 resize-none"></textarea>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 text-sm font-bold text-gray-400 py-3 rounded-xl hover:bg-[#2d2d3a]">취소</button>
                <button type="submit" className="flex-[2] bg-purple-600 text-sm font-bold text-white py-3 rounded-xl hover:bg-purple-500 shadow-lg shadow-purple-900/30">세션 시작하기</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Dive Modal */}
      {isDiveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1a1a24] w-full max-w-sm rounded-3xl p-6 border border-[#2d2d3a] max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-6">기록 추가</h2>
            <form onSubmit={handleAddDive} className="space-y-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1.5 ml-1">종목</label>
                <select name="discipline" className="w-full bg-[#0f0f17] border border-[#2d2d3a] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500 appearance-none" required defaultValue={Discipline.STA}>
                  <option value={Discipline.STA}>STA (Static Apnea)</option>
                  <option value={Discipline.DYN}>DYN (Dynamic)</option>
                  <option value={Discipline.FIM}>FIM (Free Immersion)</option>
                  <option value={Discipline.CWT}>CWT (Constant Weight)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1.5 ml-1">시간 (MM:SS)</label>
                  <input type="text" name="time" placeholder="00:00" className="w-full bg-[#0f0f17] border border-[#2d2d3a] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500" />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1.5 ml-1">거리 (m)</label>
                  <input type="number" name="distance" placeholder="0" className="w-full bg-[#0f0f17] border border-[#2d2d3a] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500" />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1.5 ml-1">깊이 (m)</label>
                <input type="number" name="depth" placeholder="0" className="w-full bg-[#0f0f17] border border-[#2d2d3a] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500" />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1.5 ml-1">
                    사진/영상 {accessToken && <span className="text-blue-400 ml-1">(Google Drive Upload Active)</span>}
                </label>
                <div className="relative group">
                  <input type="file" name="media" multiple accept="image/*,video/*" className="absolute inset-0 opacity-0 cursor-pointer z-10" disabled={isUploading} />
                  <div className="bg-[#0f0f17] border border-[#2d2d3a] border-dashed rounded-xl px-4 py-6 flex flex-col items-center gap-2 group-hover:border-purple-500 transition-colors">
                    {isUploading ? <Loader2 className="text-purple-500 animate-spin" /> : <Camera className="text-gray-500 group-hover:text-purple-500" />}
                    <span className="text-xs text-gray-500">{isUploading ? '업로드 중...' : '미디어 업로드'}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1.5 ml-1">메모</label>
                <input type="text" name="note" placeholder="간단한 소감" className="w-full bg-[#0f0f17] border border-[#2d2d3a] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500" />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsDiveModalOpen(false)} className="flex-1 text-sm font-bold text-gray-400 py-3 rounded-xl hover:bg-[#2d2d3a]" disabled={isUploading}>취소</button>
                <button type="submit" className="flex-[2] bg-purple-600 text-sm font-bold text-white py-3 rounded-xl hover:bg-purple-500 disabled:opacity-50" disabled={isUploading}>
                    {isUploading ? '저장 중...' : '기록 저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
