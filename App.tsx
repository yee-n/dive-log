
import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Trophy, Calendar, MapPin, Users, ChevronLeft, Trash2, Camera, 
  Play, Cloud, CloudOff, Loader2, ExternalLink, Globe, User as UserIcon, 
  LogOut, Edit2, Check, X, Search, Clock
} from 'lucide-react';
import { Discipline, DiveSession, DiveEntry, MediaFile, PersonalBest, User } from './types';
import { formatTime, calculateOverallPB, calculateSessionPB, fileToBase64, parseSmartTime } from './utils';

const DRIVE_FOLDER_ID = '1Kcx0f-fqKsnYzof58Gg5gMZfKaeg4e_x';
const CLIENT_ID = '229707401391-cfovrjr2ecse3vk4jv613pkgi3mmmn0a.apps.googleusercontent.com'; 
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

const LOCATIONS = ["딥스테이션", "올림픽공원 수영장", "성남 아쿠아라인"];

// --- Sub-components ---

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

const MediaThumbnail: React.FC<{ media: MediaFile }> = ({ media }) => {
  return (
    <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-[#1a1a24] border border-[#2d2d3a] flex-shrink-0 group">
      {media.thumbnailUrl || !media.driveFileId ? (
        <img src={media.thumbnailUrl || media.url} className="w-full h-full object-cover" alt="Dive media" />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center text-blue-400 bg-blue-900/10">
          <Cloud size={20} />
          <span className="text-[8px] mt-1 font-bold">DRIVE</span>
        </div>
      )}
      {media.type === 'video' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <Play size={16} className="text-white fill-white" />
        </div>
      )}
      <a 
        href={media.url} 
        target="_blank" 
        rel="noopener noreferrer" 
        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
      >
        <ExternalLink size={14} className="text-white" />
      </a>
    </div>
  );
};

export default function App() {
  // --- States ---
  const [activeTab, setActiveTab] = useState<'home' | 'social' | 'profile'>('home');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [sessions, setSessions] = useState<DiveSession[]>([]);
  const [view, setView] = useState<'dashboard' | 'session_detail'>('dashboard');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  
  // Modals
  const [isAuthModal, setIsAuthModal] = useState(false);
  const [isNewSessionModal, setIsNewSessionModal] = useState(false);
  const [isDiveModal, setIsDiveModal] = useState<{open: boolean, entry?: DiveEntry | null}>({open: false, entry: null});
  
  // Dynamic Form State for Dive Entry
  const [selectedDiscipline, setSelectedDiscipline] = useState<Discipline>(Discipline.STA);
  const [timeValue, setTimeValue] = useState("");

  // System States
  const [isUploading, setIsUploading] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const tokenClientRef = useRef<any>(null);

  // --- Initial Load ---
  useEffect(() => {
    const savedSessions = localStorage.getItem('dive_sessions_v2');
    const savedUsers = localStorage.getItem('dive_users_v2');
    const savedUser = localStorage.getItem('current_user_v2');

    if (savedSessions) setSessions(JSON.parse(savedSessions));
    if (savedUsers) setUsers(JSON.parse(savedUsers));
    if (savedUser) setCurrentUser(JSON.parse(savedUser));

    // GIS Init
    const initGis = () => {
      if ((window as any).google) {
        tokenClientRef.current = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: (response: any) => {
            if (response.access_token) setAccessToken(response.access_token);
          },
        });
      }
    };
    const timer = setInterval(() => {
      if ((window as any).google) { initGis(); clearInterval(timer); }
    }, 500);
    return () => clearInterval(timer);
  }, []);

  // --- Persistence ---
  useEffect(() => { localStorage.setItem('dive_sessions_v2', JSON.stringify(sessions)); }, [sessions]);
  useEffect(() => { localStorage.setItem('dive_users_v2', JSON.stringify(users)); }, [users]);
  useEffect(() => { 
    if (currentUser) localStorage.setItem('current_user_v2', JSON.stringify(currentUser));
    else localStorage.removeItem('current_user_v2');
  }, [currentUser]);

  // Sync state when editing
  useEffect(() => {
    if (isDiveModal.entry) {
      setSelectedDiscipline(isDiveModal.entry.discipline);
      setTimeValue(isDiveModal.entry.timeSeconds ? formatTime(isDiveModal.entry.timeSeconds).replace(':', '') : "");
    } else {
      setSelectedDiscipline(Discipline.STA);
      setTimeValue("");
    }
  }, [isDiveModal.open]);

  // --- Auth Handlers ---
  const handleAuth = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const pass = formData.get('password') as string;
    const isLogin = (e.nativeEvent as any).submitter.name === 'login';

    if (isLogin) {
      const user = users.find(u => u.name === name && u.password === pass);
      if (user) { setCurrentUser(user); setIsAuthModal(false); }
      else alert('사용자 정보를 찾을 수 없습니다.');
    } else {
      if (users.find(u => u.name === name)) { alert('이미 존재하는 이름입니다.'); return; }
      const newUser = { id: Date.now().toString(), name, password: pass };
      setUsers([...users, newUser]);
      setCurrentUser(newUser);
      setIsAuthModal(false);
    }
  };

  const handleLogout = () => { setCurrentUser(null); setAccessToken(null); setView('dashboard'); setActiveTab('home'); };

  const handleDriveAuth = () => {
    if (tokenClientRef.current) tokenClientRef.current.requestAccessToken();
    else alert("API 로딩 중...");
  };

  // --- Google Drive Logic ---
  const uploadToDrive = async (file: File, name: string): Promise<{url: string, thumb?: string} | null> => {
    if (!accessToken) return null;
    const metadata = { name, parents: [DRIVE_FOLDER_ID] };
    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    formData.append('file', file);

    try {
      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,thumbnailLink', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + accessToken },
        body: formData,
      });
      const data = await res.json();
      return { url: data.webViewLink, thumb: data.thumbnailLink };
    } catch (e) { console.error(e); return null; }
  };

  // --- Session & Dive Handlers ---
  const handleCreateSession = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentUser) { setIsAuthModal(true); return; }
    const formData = new FormData(e.currentTarget);
    const newSession: DiveSession = {
      id: Date.now().toString(),
      ownerId: currentUser.id,
      ownerName: currentUser.name,
      date: formData.get('date') as string,
      location: formData.get('location') as string,
      buddy: formData.get('buddy') as string,
      note: formData.get('note') as string,
      entries: [],
    };
    setSessions([newSession, ...sessions]);
    setIsNewSessionModal(false);
    setSelectedSessionId(newSession.id);
    setView('session_detail');
  };

  const handleAddOrUpdateDive = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const discipline = formData.get('discipline') as Discipline;
    const session = sessions.find(s => s.id === selectedSessionId);
    if (!session) return;

    setIsUploading(true);
    const mediaFiles = formData.getAll('media') as File[];
    const processedMedia: MediaFile[] = [];

    if (isDiveModal.entry) processedMedia.push(...isDiveModal.entry.media);

    for (const f of mediaFiles) {
      if (f.size > 0) {
        const fileName = `${session.date} ${discipline}_${isDiveModal.entry ? isDiveModal.entry.attemptNumber : (session.entries.length + 1)}`;
        const driveRes = await uploadToDrive(f, fileName);
        if (driveRes) {
          processedMedia.push({
            id: Math.random().toString(36).substr(2, 9),
            type: f.type.startsWith('video') ? 'video' : 'image',
            url: driveRes.url,
            driveFileId: 'drive',
            thumbnailUrl: driveRes.thumb
          });
        } else {
          const b64 = await fileToBase64(f);
          processedMedia.push({
            id: Math.random().toString(36).substr(2, 9),
            type: f.type.startsWith('video') ? 'video' : 'image',
            url: b64
          });
        }
      }
    }

    const timeSeconds = parseSmartTime(timeValue);

    const newDive: DiveEntry = {
      id: isDiveModal.entry?.id || Date.now().toString(),
      discipline,
      attemptNumber: isDiveModal.entry?.attemptNumber || session.entries.filter(e => e.discipline === discipline).length + 1,
      timeSeconds: (discipline !== Discipline.DYN) ? timeSeconds : undefined,
      distanceMeters: (discipline === Discipline.DYN) ? Number(formData.get('distance')) : undefined,
      depthMeters: (discipline === Discipline.FIM || discipline === Discipline.CWT) ? Number(formData.get('depth')) : undefined,
      media: processedMedia,
      note: formData.get('note') as string,
      timestamp: isDiveModal.entry?.timestamp || Date.now(),
    };

    setSessions(sessions.map(s => {
      if (s.id !== selectedSessionId) return s;
      const entries = isDiveModal.entry 
        ? s.entries.map(e => e.id === isDiveModal.entry?.id ? newDive : e)
        : [...s.entries, newDive];
      return { ...s, entries };
    }));

    setIsUploading(false);
    setIsDiveModal({open: false, entry: null});
  };

  // --- Filtering ---
  const mySessions = sessions.filter(s => s.ownerId === currentUser?.id);
  const currentSession = sessions.find(s => s.id === selectedSessionId);
  const overallPB = calculateOverallPB(mySessions);
  const sessionPBs = currentSession ? calculateSessionPB(currentSession.entries) : {};

  return (
    <div className="max-w-md mx-auto min-h-screen bg-[#0f0f17] pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0f0f17]/90 backdrop-blur-lg border-b border-[#1a1a24] px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-900/20">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-white"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
          </div>
          <div>
            <h1 className="text-md font-bold leading-none mb-1">DiveLog</h1>
            {currentUser && (
              <button onClick={handleDriveAuth} className={`flex items-center gap-1 text-[8px] font-black tracking-tighter uppercase ${accessToken ? 'text-green-400' : 'text-gray-600'}`}>
                {accessToken ? <Cloud size={8} /> : <CloudOff size={8} />} {accessToken ? 'Connected' : 'Sync Drive'}
              </button>
            )}
          </div>
        </div>
        {currentUser ? (
          <button onClick={() => setIsNewSessionModal(true)} className="w-9 h-9 bg-[#1a1a24] text-white rounded-xl flex items-center justify-center hover:bg-purple-600 transition-colors">
            <Plus size={20} />
          </button>
        ) : (
          <button onClick={() => setIsAuthModal(true)} className="text-xs font-bold text-purple-400 border border-purple-500/30 px-3 py-1.5 rounded-lg">로그인</button>
        )}
      </header>

      {/* Main Content */}
      <div className="p-6">
        {!currentUser && activeTab !== 'social' ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
            <div className="w-16 h-16 bg-purple-600 rounded-2xl flex items-center justify-center shadow-xl shadow-purple-900/30 mb-6">
              <UserIcon size={32} className="text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-2">프리다이버 로그인</h2>
            <form onSubmit={handleAuth} className="w-full space-y-4">
              <input required name="name" type="text" placeholder="이름" className="w-full bg-[#1a1a24] border border-[#2d2d3a] rounded-xl px-4 py-4 focus:border-purple-500 outline-none" />
              <input required name="password" type="password" placeholder="비밀번호" className="w-full bg-[#1a1a24] border border-[#2d2d3a] rounded-xl px-4 py-4 focus:border-purple-500 outline-none" />
              <div className="grid grid-cols-2 gap-3 pt-4">
                <button type="submit" name="login" className="bg-[#2d2d3a] text-white font-bold py-4 rounded-xl">로그인</button>
                <button type="submit" name="join" className="bg-purple-600 text-white font-bold py-4 rounded-xl shadow-lg">회원가입</button>
              </div>
            </form>
          </div>
        ) : (
          <>
            {view === 'dashboard' ? (
              <div className="space-y-8 animate-in fade-in duration-500">
                {activeTab === 'home' ? (
                  <>
                    <section>
                      <div className="flex items-center gap-2 mb-4">
                        <Trophy size={18} className="text-yellow-500" />
                        <h2 className="text-lg font-bold">나의 역대 PB</h2>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {overallPB.map(pb => (
                          <div key={pb.discipline} className="bg-[#1a1a24] border border-[#2d2d3a] p-4 rounded-2xl">
                            <DisciplineBadge type={pb.discipline} />
                            <div className="text-2xl font-black mt-3">{pb.value}</div>
                            <div className="text-[10px] text-gray-500 font-medium">{pb.date || '기록 없음'}</div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section>
                      <h2 className="text-lg font-bold mb-4">내 다이빙 세션</h2>
                      <div className="space-y-4">
                        {mySessions.length === 0 ? (
                          <div className="text-center py-20 bg-[#1a1a24]/50 rounded-3xl border border-dashed border-[#2d2d3a] text-gray-600 text-sm">기록된 세션이 없습니다.</div>
                        ) : mySessions.map(s => (
                          <div key={s.id} onClick={() => { setSelectedSessionId(s.id); setView('session_detail'); }} className="bg-[#1a1a24] border border-[#2d2d3a] p-5 rounded-2xl hover:border-purple-500/50 cursor-pointer">
                            <div className="flex justify-between mb-3 text-xs">
                              <span className="font-bold text-purple-500">{s.date}</span>
                              <span className="text-gray-500 flex items-center gap-1"><MapPin size={10} />{s.location}</span>
                            </div>
                            <div className="flex gap-2 mb-3">
                              {Object.entries(calculateSessionPB(s.entries)).map(([d, v]) => (
                                <div key={d} className="bg-[#0f0f17] px-2 py-1 rounded text-[10px] font-bold border border-[#2d2d3a]">
                                  <span className="text-purple-400 mr-1">{d}</span>{v}
                                </div>
                              ))}
                            </div>
                            <div className="text-xs text-gray-400 italic">"{s.note || '메모 없음'}"</div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </>
                ) : activeTab === 'social' ? (
                  <section>
                    <div className="flex items-center gap-2 mb-6">
                      <Globe size={18} className="text-blue-500" />
                      <h2 className="text-lg font-bold">모든 다이버의 소식</h2>
                    </div>
                    <div className="space-y-6">
                      {sessions.map(s => (
                        <div key={s.id} className="bg-[#1a1a24] rounded-3xl overflow-hidden border border-[#2d2d3a]">
                          <div className="p-4 flex items-center gap-3 bg-[#23232f]/50">
                            <div className="w-10 h-10 bg-gradient-to-tr from-purple-600 to-blue-500 rounded-full flex items-center justify-center text-xs font-bold text-white uppercase">{s.ownerName.charAt(0)}</div>
                            <div>
                              <div className="text-sm font-bold">{s.ownerName} <span className="text-gray-500 font-normal text-xs">님이 다이빙했어요!</span></div>
                              <div className="text-[10px] text-gray-500">{s.date} @ {s.location}</div>
                            </div>
                          </div>
                          <div className="p-5">
                            <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
                              {s.entries.flatMap(e => e.media).map(m => <MediaThumbnail key={m.id} media={m} />)}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {Object.entries(calculateSessionPB(s.entries)).map(([d, v]) => (
                                <div key={d} className="bg-[#0f0f17] p-2 rounded-xl text-xs flex justify-between">
                                  <span className="text-gray-500 font-bold uppercase">{d}</span>
                                  <span className="font-bold">{v}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : (
                  <section className="text-center py-10">
                    <div className="w-24 h-24 bg-gradient-to-tr from-purple-600 to-blue-500 rounded-full mx-auto flex items-center justify-center text-4xl font-black text-white mb-6 uppercase">{currentUser?.name.charAt(0)}</div>
                    <h2 className="text-2xl font-black mb-2">{currentUser?.name}</h2>
                    <div className="grid grid-cols-2 gap-4 text-left mt-8">
                      <div className="bg-[#1a1a24] p-5 rounded-2xl border border-[#2d2d3a]">
                        <div className="text-gray-500 text-[10px] font-bold uppercase mb-1">Sessions</div>
                        <div className="text-2xl font-black">{mySessions.length}</div>
                      </div>
                      <div className="bg-[#1a1a24] p-5 rounded-2xl border border-[#2d2d3a]">
                        <div className="text-gray-500 text-[10px] font-bold uppercase mb-1">Max Depth</div>
                        <div className="text-2xl font-black">{Math.max(0, ...mySessions.flatMap(s => s.entries.filter(e => e.depthMeters).map(e => e.depthMeters!)))}m</div>
                      </div>
                    </div>
                    <button onClick={handleLogout} className="mt-12 flex items-center gap-2 text-red-400 font-bold mx-auto px-6 py-3 bg-red-400/10 rounded-xl"><LogOut size={18} /> 로그아웃</button>
                  </section>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <button onClick={() => setView('dashboard')} className="flex items-center gap-1 text-gray-500 font-bold"><ChevronLeft size={20}/> BACK</button>
                  {currentSession?.ownerId === currentUser?.id && <button onClick={() => { if(confirm('삭제할까요?')) { setSessions(sessions.filter(s => s.id !== selectedSessionId)); setView('dashboard'); }}} className="text-gray-600"><Trash2 size={18}/></button>}
                </div>
                {currentSession && (
                  <>
                    <div className="bg-[#1a1a24] p-6 rounded-3xl border border-[#2d2d3a]">
                      <div className="text-purple-500 font-black text-[10px] uppercase mb-1">{currentSession.date}</div>
                      <h2 className="text-3xl font-black mb-3">{currentSession.location}</h2>
                      <div className="flex gap-4 text-xs font-bold text-gray-400"><Users size={12} className="text-purple-500"/>{currentSession.buddy}</div>
                      {currentSession.note && <p className="mt-4 text-sm text-gray-400 italic">"{currentSession.note}"</p>}
                    </div>
                    <div className="flex items-center justify-between pt-6">
                      <h3 className="font-black text-lg">로그기록 <span className="text-purple-500 text-sm ml-1">{currentSession.entries.length}</span></h3>
                      {currentSession.ownerId === currentUser?.id && <button onClick={() => setIsDiveModal({open: true, entry: null})} className="bg-purple-600 px-3 py-2 rounded-xl text-[10px] font-black">기록 추가</button>}
                    </div>
                    <div className="space-y-4">
                      {currentSession.entries.sort((a,b) => b.timestamp - a.timestamp).map(entry => (
                        <div key={entry.id} className="bg-[#1a1a24] border border-[#2d2d3a] p-5 rounded-3xl space-y-4">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3"><DisciplineBadge type={entry.discipline} /><span className="text-xs font-black text-gray-500">{entry.attemptNumber}차 시도</span></div>
                            {currentSession.ownerId === currentUser?.id && (
                              <div className="flex gap-3 text-gray-500">
                                <button onClick={() => setIsDiveModal({open: true, entry})}><Edit2 size={16}/></button>
                                <button onClick={() => setSessions(sessions.map(s => s.id === selectedSessionId ? {...s, entries: s.entries.filter(e => e.id !== entry.id)} : s))}><Trash2 size={16}/></button>
                              </div>
                            )}
                          </div>
                          <div className="grid grid-cols-3 gap-4">
                            {entry.timeSeconds !== undefined && <div><div className="text-[9px] font-black text-gray-600 uppercase">TIME</div><div className="text-lg font-black">{formatTime(entry.timeSeconds)}</div></div>}
                            {entry.distanceMeters !== undefined && <div><div className="text-[9px] font-black text-gray-600 uppercase">DIST</div><div className="text-lg font-black">{entry.distanceMeters}m</div></div>}
                            {entry.depthMeters !== undefined && <div><div className="text-[9px] font-black text-gray-600 uppercase">DEPTH</div><div className="text-lg font-black">{entry.depthMeters}m</div></div>}
                          </div>
                          <div className="flex gap-2 overflow-x-auto scrollbar-hide">{entry.media.map(m => <MediaThumbnail key={m.id} media={m} />)}</div>
                          {entry.note && <p className="text-xs text-gray-500 bg-[#0f0f17] p-3 rounded-xl">{entry.note}</p>}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Nav Bar */}
      {currentUser && (
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md h-20 bg-[#11111a]/95 backdrop-blur-xl border-t border-[#1a1a24] flex items-center justify-around px-6 z-40">
          <button onClick={() => { setActiveTab('home'); setView('dashboard'); }} className={`flex flex-col items-center gap-1 ${activeTab === 'home' ? 'text-purple-500' : 'text-gray-500'}`}><Calendar size={20} /><span className="text-[10px] font-black">Home</span></button>
          <button onClick={() => { setActiveTab('social'); setView('dashboard'); }} className={`flex flex-col items-center gap-1 ${activeTab === 'social' ? 'text-purple-500' : 'text-gray-500'}`}><Globe size={20} /><span className="text-[10px] font-black">Social</span></button>
          <button onClick={() => { setActiveTab('profile'); setView('dashboard'); }} className={`flex flex-col items-center gap-1 ${activeTab === 'profile' ? 'text-purple-500' : 'text-gray-500'}`}><UserIcon size={20} /><span className="text-[10px] font-black">Profile</span></button>
        </nav>
      )}

      {/* New Session Modal */}
      {isNewSessionModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-[#1a1a24] w-full max-w-sm rounded-[40px] p-8 border border-[#2d2d3a]">
            <h2 className="text-2xl font-black mb-8">새 다이빙 세션</h2>
            <form onSubmit={handleCreateSession} className="space-y-5">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-600 uppercase ml-1">Date</label>
                <input required type="date" name="date" className="w-full bg-[#0f0f17] border border-[#2d2d3a] rounded-2xl px-5 py-4 text-sm outline-none" defaultValue={new Date().toISOString().split('T')[0]} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-600 uppercase ml-1">Location</label>
                <div className="grid grid-cols-1 gap-2">
                  <input required id="loc-input" type="text" name="location" placeholder="직접 입력 또는 아래 선택" className="w-full bg-[#0f0f17] border border-[#2d2d3a] rounded-2xl px-5 py-4 text-sm outline-none" />
                  <div className="flex flex-wrap gap-2">
                    {LOCATIONS.map(loc => (
                      <button key={loc} type="button" onClick={() => { (document.getElementById('loc-input') as HTMLInputElement).value = loc; }} className="text-[10px] font-bold bg-[#2d2d3a] px-3 py-2 rounded-lg hover:bg-purple-600 transition-colors">{loc}</button>
                    ))}
                  </div>
                </div>
              </div>
              <input required type="text" name="buddy" placeholder="버디 이름" className="w-full bg-[#0f0f17] border border-[#2d2d3a] rounded-2xl px-5 py-4 text-sm outline-none" />
              <textarea name="note" placeholder="오늘의 다이빙 메모" rows={2} className="w-full bg-[#0f0f17] border border-[#2d2d3a] rounded-2xl px-5 py-4 text-sm outline-none resize-none"></textarea>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setIsNewSessionModal(false)} className="flex-1 font-bold text-gray-500">취소</button>
                <button type="submit" className="flex-[2] bg-purple-600 font-bold text-white py-4 rounded-3xl">세션 시작</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit Dive Modal */}
      {isDiveModal.open && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-[#1a1a24] w-full max-w-sm rounded-[40px] p-8 border border-[#2d2d3a] max-h-[85vh] overflow-y-auto scrollbar-hide">
            <h2 className="text-2xl font-black mb-6">{isDiveModal.entry ? '기록 수정' : '다이브 기록'}</h2>
            <form onSubmit={handleAddOrUpdateDive} className="space-y-6">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-600 uppercase ml-1">Discipline</label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.values(Discipline).map(d => (
                    <button key={d} type="button" onClick={() => setSelectedDiscipline(d)} className={`py-3 rounded-xl text-[10px] font-black border transition-all ${selectedDiscipline === d ? 'bg-purple-600 border-purple-500' : 'bg-[#0f0f17] border-[#2d2d3a] text-gray-500'}`}>
                      {d}
                    </button>
                  ))}
                  <input type="hidden" name="discipline" value={selectedDiscipline} />
                </div>
              </div>

              {selectedDiscipline !== Discipline.DYN && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-600 uppercase ml-1 flex items-center gap-1"><Clock size={10}/> Time (MMSS)</label>
                  <input 
                    type="number" 
                    placeholder="예: 0130, 52" 
                    value={timeValue}
                    onChange={(e) => setTimeValue(e.target.value)}
                    className="w-full bg-[#0f0f17] border border-[#2d2d3a] rounded-2xl px-5 py-4 text-lg font-black outline-none focus:border-purple-500" 
                  />
                  <div className="text-[10px] text-purple-400 font-bold ml-1">입력된 시간: {formatTime(parseSmartTime(timeValue))}</div>
                </div>
              )}

              {selectedDiscipline === Discipline.DYN && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-600 uppercase ml-1">Distance (m)</label>
                  <input type="number" name="distance" placeholder="0" defaultValue={isDiveModal.entry?.distanceMeters || ''} className="w-full bg-[#0f0f17] border border-[#2d2d3a] rounded-2xl px-5 py-4 text-lg font-black outline-none focus:border-purple-500" />
                </div>
              )}

              {(selectedDiscipline === Discipline.FIM || selectedDiscipline === Discipline.CWT) && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-600 uppercase ml-1">Depth (m)</label>
                  <input type="number" name="depth" placeholder="0" defaultValue={isDiveModal.entry?.depthMeters || ''} className="w-full bg-[#0f0f17] border border-[#2d2d3a] rounded-2xl px-5 py-4 text-lg font-black outline-none focus:border-purple-500" />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-600 uppercase ml-1">Media</label>
                <div className="relative overflow-hidden bg-[#0f0f17] border border-[#2d2d3a] border-dashed rounded-2xl p-6 text-center hover:border-purple-500">
                  <input type="file" name="media" multiple accept="image/*,video/*" className="absolute inset-0 opacity-0 cursor-pointer" />
                  <Camera className="mx-auto text-gray-600 mb-1" size={24}/>
                  <div className="text-[10px] text-gray-600 font-bold">CLICK TO ADD PHOTOS/VIDEOS</div>
                </div>
              </div>
              <textarea name="note" placeholder="메모" defaultValue={isDiveModal.entry?.note || ''} className="w-full bg-[#0f0f17] border border-[#2d2d3a] rounded-2xl px-5 py-4 text-sm outline-none resize-none"></textarea>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setIsDiveModal({open: false, entry: null})} className="flex-1 font-bold text-gray-500 py-4" disabled={isUploading}>취소</button>
                <button type="submit" className="flex-[2] bg-purple-600 font-bold text-white py-4 rounded-3xl disabled:opacity-50" disabled={isUploading}>{isUploading ? <Loader2 className="animate-spin mx-auto" size={20}/> : (isDiveModal.entry ? '수정 완료' : '저장하기')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
