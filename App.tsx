
import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Trophy, Calendar, MapPin, Users, ChevronLeft, Trash2, Camera, 
  Play, Cloud, CloudOff, Loader2, ExternalLink, Globe, User as UserIcon, 
  LogOut, Edit2, Check, X, Search, Clock, Award, ShieldCheck, RefreshCw,
  BrainCircuit, Activity, Lightbulb, Sparkles, MessageCircle, Heart, Share2, Download,
  Wifi, WifiOff, Database
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { Discipline, DiveSession, DiveEntry, MediaFile, PersonalBest, User } from './types';
import { formatTime, calculateOverallPB, calculateSessionPB, fileToBase64, parseSmartTime } from './utils';

const DRIVE_FOLDER_ID = '1Kcx0f-fqKsnYzof58Gg5gMZfKaeg4e_x';
const CLIENT_ID = '229707401391-cfovrjr2ecse3vk4jv613pkgi3mmmn0a.apps.googleusercontent.com'; 
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets';

const LOCATIONS = ["딥스테이션", "올림픽공원 수영장", "성남 아쿠아라인", "제주 서귀포", "필리핀 보홀", "이집트 다합"];
const ORGS = ["AIDA", "PADI", "SSI", "기타"];
const LEVELS = ["Level 1", "Level 2", "Level 3", "Level 4", "Instructor"];

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
  const [isProfileEditModal, setIsProfileEditModal] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{id: string, text: string} | null>(null);
  
  // Dynamic Form State for Dive Entry
  const [selectedDiscipline, setSelectedDiscipline] = useState<Discipline>(Discipline.STA);
  const [timeValue, setTimeValue] = useState("");

  // System States
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const tokenClientRef = useRef<any>(null);

  // --- Data Fetching ---
  const fetchData = async () => {
    try {
      const [sessionsRes, usersRes] = await Promise.all([
        fetch('/api/sessions'),
        fetch('/api/users')
      ]);
      const [sessionsData, usersData] = await Promise.all([
        sessionsRes.json(),
        usersRes.json()
      ]);
      setSessions(sessionsData);
      setUsers(usersData);
    } catch (e) {
      console.error("Failed to fetch data:", e);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  // --- Initial Load (User Only) ---
  useEffect(() => {
    const savedUser = localStorage.getItem('current_user_v3');
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

  // --- Persistence (User Only) ---
  useEffect(() => { 
    if (currentUser) {
      localStorage.setItem('current_user_v3', JSON.stringify(currentUser));
      // Ensure user exists in Supabase
      fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentUser)
      }).catch(err => console.error("Failed to sync user to DB:", err));
    } else {
      localStorage.removeItem('current_user_v3');
    }
  }, [currentUser]);

  // Sync state when editing dive
  useEffect(() => {
    if (isDiveModal.entry) {
      setSelectedDiscipline(isDiveModal.entry.discipline);
      setTimeValue(isDiveModal.entry.timeSeconds ? formatTime(isDiveModal.entry.timeSeconds).replace(':', '') : "");
    } else {
      setSelectedDiscipline(Discipline.STA);
      setTimeValue("");
    }
  }, [isDiveModal.open]);

  // --- Share & Import Handlers ---
  const handleShareSession = (session: DiveSession) => {
    // Media URLs are excluded for text sharing to avoid data limits
    const shareData = {
        ...session,
        id: `shared-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        entries: session.entries.map(e => ({ ...e, media: [] })) 
    };
    const code = btoa(unescape(encodeURIComponent(JSON.stringify(shareData))));
    navigator.clipboard.writeText(code);
    alert("공유 코드가 클립보드에 복사되었습니다!");
  };

  // --- AI Analysis Logic ---
  const analyzeDive = async (entry: DiveEntry) => {
    const profileImage = entry.media.find(m => m.type === 'image');
    if (!profileImage) {
      alert("분석할 다이빙 프로필 이미지가 없습니다.");
      return;
    }
    setIsAnalyzing(true);
    setAnalysisResult(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      let imageData: string = profileImage.url;
      if (imageData.startsWith('data:')) imageData = imageData.split(',')[1];
      const prompt = `당신은 프리다이빙 전문 코치입니다. 이 다이브 컴퓨터 그래프 이미지를 분석하여 하강/상승의 속도와 이퀄라이징 정체 구간을 찾아내고, 기술적인 조언을 한국어로 해주세요.`;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: imageData } }] }],
      });
      setAnalysisResult({ id: entry.id, text: response.text });
    } catch (error) {
      console.error(error);
      alert("분석 중 오류가 발생했습니다.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- Auth & Profile ---
  const handleAuth = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const pass = formData.get('password') as string;
    const isLogin = (e.nativeEvent as any).submitter.name === 'login';

    if (isLogin) {
      const user = users.find(u => u.name === name && u.password === pass);
      if (user) { 
        setCurrentUser(user); 
        setIsAuthModal(false); 
      }
      else alert('사용자 정보를 찾을 수 없습니다.');
    } else {
      if (users.find(u => u.name === name)) { alert('이미 존재하는 이름입니다.'); return; }
      const newUser = { id: Date.now().toString(), name, password: pass };
      setCurrentUser(newUser);
      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      });
      fetchData();
      setIsAuthModal(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentUser) return;
    const formData = new FormData(e.currentTarget);
    
    const updatedUser: User = {
      ...currentUser,
      organization: formData.get('organization') as string,
      level: formData.get('level') as string,
      isTraining: formData.get('isTraining') === 'on',
    };
    
    setCurrentUser(updatedUser);
    await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedUser)
    });
    fetchData();
    setIsProfileEditModal(false);
    alert("프로필이 업데이트되었습니다.");
  };

  const handleLogout = () => { setCurrentUser(null); setAccessToken(null); setView('dashboard'); setActiveTab('home'); };
  const handleDriveAuth = () => { if (tokenClientRef.current) tokenClientRef.current.requestAccessToken(); };

  // --- Session CRUD ---
  const handleCreateSession = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentUser) return;
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
    
    setIsCreatingSession(true);
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSession)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create session');
      }
      await fetchData();
      setIsNewSessionModal(false);
      setSelectedSessionId(newSession.id);
      setView('session_detail');
    } catch (err: any) {
      console.error(err);
      alert(`세션 생성 실패: ${err.message}`);
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleAddOrUpdateDive = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const discipline = formData.get('discipline') as Discipline;
    const session = sessions.find(s => s.id === selectedSessionId);
    if (!session) return;

    setIsUploading(true);
    const mediaFiles = formData.getAll('media') as File[];
    const processedMedia: MediaFile[] = isDiveModal.entry ? [...isDiveModal.entry.media] : [];
    
    for (const f of mediaFiles) {
        if (f.size > 0) {
            const b64 = await fileToBase64(f);
            processedMedia.push({ 
                id: Math.random().toString(36).substr(2, 9), 
                type: f.type.startsWith('video') ? 'video' : 'image', 
                url: b64 
            });
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

    const updatedSession = { 
      ...session, 
      entries: isDiveModal.entry ? session.entries.map(e => e.id === isDiveModal.entry?.id ? newDive : e) : [...session.entries, newDive] 
    };

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSession)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save dive');
      }
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert(`기록 저장 실패: ${err.message}`);
    } finally {
      setIsUploading(false);
      setIsDiveModal({open: false, entry: null});
    }
  };

  const mySessions = sessions.filter(s => s.ownerId === currentUser?.id);
  const currentSession = sessions.find(s => s.id === selectedSessionId);
  const overallPB = calculateOverallPB(mySessions);

  return (
    <div className="max-w-md mx-auto min-h-screen bg-[#0f0f17] pb-24 relative overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0f0f17]/90 backdrop-blur-lg border-b border-[#1a1a24] px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-900/20">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
              <path d="M22 10.5c-2.5-2.5-6-3-9-2-2.5.8-4.5 2.5-5.5 4.5-1 2-1 4.5 0 6.5.5 1 1.5 1.5 2.5 1.5h1c1 0 2-.5 2.5-1.5.5-1 .5-2.5 0-4.5-1-2-3-3.5-5.5-4.5-3-1-6.5-.5-9 2" />
            </svg>
          </div>
          <div>
            <h1 className="text-md font-black leading-none mb-1 tracking-tight">FreeDiveLog</h1>
            <div className="flex items-center gap-2">
              {currentUser && (
                <button onClick={handleDriveAuth} className={`flex items-center gap-1 text-[8px] font-black tracking-tighter uppercase ${accessToken ? 'text-green-400' : 'text-gray-600'}`}>
                  {accessToken ? <Cloud size={8} /> : <CloudOff size={8} />} {accessToken ? 'Connected' : 'Sync Drive'}
                </button>
              )}
              <button onClick={fetchData} className="flex items-center gap-1 text-[8px] font-black tracking-tighter uppercase text-purple-400 hover:text-purple-300">
                <RefreshCw size={8} className={isExporting ? 'animate-spin' : ''} /> Sync Sheets
              </button>
            </div>
          </div>
        </div>
        {currentUser ? (
          <div className="flex items-center gap-2">
             {/* Removed Plus button from here */}
          </div>
        ) : (
          <button onClick={() => setIsAuthModal(true)} className="text-xs font-bold text-purple-400 border border-purple-500/30 px-3 py-1.5 rounded-lg">로그인</button>
        )}
      </header>

      <div className="p-6">
        {!currentUser && activeTab !== 'social' ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center animate-in zoom-in-95 duration-500">
            <div className="w-20 h-20 bg-purple-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-purple-900/30 mb-8 rotate-3">
              <UserIcon size={40} className="text-white" />
            </div>
            <h2 className="text-3xl font-black mb-3">프리다이빙 로그</h2>
            <p className="text-gray-500 text-sm mb-10 leading-relaxed">나의 다이빙 기록을 안전하게 남기고<br/>AI 코칭과 친구들의 소식을 만나보세요.</p>
            <form onSubmit={handleAuth} className="w-full space-y-4">
              <input required name="name" type="text" placeholder="이름" className="w-full bg-[#1a1a24] border border-[#2d2d3a] rounded-2xl px-5 py-5 focus:border-purple-500 outline-none transition-all" />
              <input required name="password" type="password" placeholder="비밀번호" className="w-full bg-[#1a1a24] border border-[#2d2d3a] rounded-2xl px-5 py-5 focus:border-purple-500 outline-none transition-all" />
              <div className="grid grid-cols-2 gap-3 pt-6">
                <button type="submit" name="login" className="bg-[#2d2d3a] text-white font-black py-5 rounded-2xl active:scale-95 transition-transform">로그인</button>
                <button type="submit" name="join" className="bg-purple-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-purple-900/40 active:scale-95 transition-transform">회원가입</button>
              </div>
            </form>
          </div>
        ) : (
          <>
            {view === 'dashboard' ? (
              <div className="space-y-10 animate-in fade-in duration-500">
                {activeTab === 'home' ? (
                  <>
                    <section>
                      <div className="flex items-center gap-2 mb-6">
                        <Trophy size={20} className="text-yellow-500" />
                        <h2 className="text-xl font-black tracking-tight">Personal Best</h2>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {overallPB.map(pb => (
                          <div key={pb.discipline} className="bg-[#1a1a24] border border-[#2d2d3a] p-5 rounded-3xl hover:border-purple-500/40 transition-all group">
                            <DisciplineBadge type={pb.discipline} />
                            <div className="text-3xl font-black mt-4 group-hover:text-purple-400 transition-colors">{pb.value}</div>
                            <div className="text-[10px] text-gray-500 font-bold uppercase mt-1 tracking-widest">{pb.date || 'NO RECORD'}</div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section>
                      <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-black tracking-tight">내 다이빙 세션</h2>
                        <div className="flex items-center gap-3">
                          <span className="text-purple-500 font-black text-xs">{mySessions.length} sessions</span>
                          <button 
                            onClick={() => setIsNewSessionModal(true)} 
                            className="w-8 h-8 bg-purple-600 text-white rounded-lg flex items-center justify-center hover:bg-purple-500 transition-colors shadow-lg shadow-purple-900/20"
                          >
                            <Plus size={18} />
                          </button>
                        </div>
                      </div>
                      <div className="space-y-5">
                        {mySessions.length === 0 ? (
                          <div className="text-center py-24 bg-[#1a1a24]/50 rounded-[40px] border border-dashed border-[#2d2d3a] text-gray-600 text-sm">기록된 세션이 없습니다.<br/>새로운 다이빙을 시작해보세요!</div>
                        ) : mySessions.map(s => (
                          <div key={s.id} onClick={() => { setSelectedSessionId(s.id); setView('session_detail'); }} className="bg-[#1a1a24] border border-[#2d2d3a] p-6 rounded-[32px] hover:border-purple-500/50 cursor-pointer transition-all shadow-xl shadow-black/20 group">
                            <div className="flex justify-between mb-4">
                              <span className="font-black text-purple-500 text-xs tracking-widest uppercase">{s.date}</span>
                              <span className="text-gray-500 flex items-center gap-1 text-[10px] font-bold"><MapPin size={12} className="text-purple-600"/>{s.location}</span>
                            </div>
                            <div className="flex flex-wrap gap-2 mb-4">
                              {Object.entries(calculateSessionPB(s.entries)).map(([d, v]) => (
                                <div key={d} className="bg-[#0f0f17] px-3 py-1.5 rounded-xl text-[10px] font-black border border-[#2d2d3a]">
                                  <span className="text-purple-400 mr-1.5">{d}</span>{v}
                                </div>
                              ))}
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="text-xs text-gray-400 italic font-medium line-clamp-1">"{s.note || '메모가 없습니다.'}"</div>
                                <div className="p-2 bg-[#2d2d3a] rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                    <ChevronLeft className="rotate-180" size={14}/>
                                </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </>
                ) : activeTab === 'social' ? (
                  <section className="animate-in slide-in-from-right-4 duration-500">
                    <div className="flex items-center justify-between mb-8">
                      <div className="flex items-center gap-2">
                        <Globe size={22} className="text-blue-500" />
                        <h2 className="text-2xl font-black tracking-tighter">Network</h2>
                      </div>
                      <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest bg-[#1a1a24] px-3 py-1.5 rounded-full border border-[#2d2d3a]">
                        Real-time Sync Active
                      </div>
                    </div>

                    <div className="space-y-8 pb-10">
                      {sessions.length === 0 ? (
                          <div className="text-center py-20 bg-[#1a1a24]/30 rounded-3xl border border-dashed border-[#2d2d3a] text-gray-600 font-bold p-10">
                              공유된 기록이 아직 없습니다.<br/><br/>
                              첫 번째 다이빙 기록을<br/>남겨보세요!
                          </div>
                      ) : sessions.map(s => (
                        <div key={s.id} className="bg-[#1a1a24] rounded-[40px] overflow-hidden border border-[#2d2d3a] shadow-2xl">
                          <div className="p-5 flex items-center justify-between bg-[#23232f]/50 border-b border-[#2d2d3a]">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-gradient-to-tr from-purple-600 to-blue-500 rounded-2xl flex items-center justify-center text-sm font-black text-white shadow-lg uppercase">{s.ownerName.charAt(0)}</div>
                                <div>
                                    <div className="text-sm font-black flex items-center gap-2">
                                        {s.ownerName}
                                        {s.ownerId === currentUser?.id ? (
                                            <span className="bg-purple-600/20 text-purple-400 text-[8px] px-2 py-0.5 rounded-full border border-purple-500/30 uppercase font-black">Me</span>
                                        ) : (
                                            <span className="bg-blue-600/20 text-blue-400 text-[8px] px-2 py-0.5 rounded-full border border-blue-500/30 uppercase font-black">Shared</span>
                                        )}
                                    </div>
                                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter mt-0.5">{s.date} @ {s.location}</div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => handleShareSession(s)} className="p-2.5 bg-[#0f0f17] text-gray-400 hover:text-purple-400 rounded-xl transition-colors border border-[#2d2d3a]">
                                    <Share2 size={16}/>
                                </button>
                                {s.ownerId === currentUser?.id && (
                                    <button onClick={async () => { 
                                      if(confirm('이 기록을 삭제할까요?')) {
                                        await fetch(`/api/sessions/${s.id}`, { method: 'DELETE' });
                                        fetchData();
                                      }
                                    }} className="p-2.5 bg-[#0f0f17] text-gray-400 hover:text-red-400 rounded-xl transition-colors border border-[#2d2d3a]">
                                        <Trash2 size={16}/>
                                    </button>
                                )}
                            </div>
                          </div>
                          <div className="p-6">
                            <div className="flex gap-2 overflow-x-auto pb-5 scrollbar-hide">
                              {s.entries.flatMap(e => e.media).map(m => <MediaThumbnail key={m.id} media={m} />)}
                            </div>
                            <div className="grid grid-cols-2 gap-3 mt-2">
                              {Object.entries(calculateSessionPB(s.entries)).map(([d, v]) => (
                                <div key={d} className="bg-[#0f0f17] p-3.5 rounded-2xl text-xs flex justify-between border border-[#2d2d3a]">
                                  <span className="text-gray-500 font-black uppercase tracking-tighter">{d}</span>
                                  <span className="font-black text-white">{v}</span>
                                </div>
                              ))}
                            </div>
                            {s.note && (
                                <div className="mt-5 p-4 bg-[#0f0f17]/50 rounded-2xl border border-[#2d2d3a]/50">
                                    <p className="text-xs text-gray-400 leading-relaxed font-medium">"{s.note}"</p>
                                </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : (
                  <section className="animate-in slide-in-from-bottom-6 duration-500">
                    <div className="relative mb-12">
                      <div className="w-36 h-36 bg-gradient-to-br from-purple-600 to-blue-600 rounded-[40px] mx-auto flex items-center justify-center text-6xl font-black text-white shadow-2xl shadow-purple-900/40 uppercase rotate-2">{currentUser?.name.charAt(0)}</div>
                      <button onClick={() => setIsProfileEditModal(true)} className="absolute bottom-2 right-1/2 translate-x-20 bg-purple-600 w-12 h-12 rounded-2xl flex items-center justify-center border-4 border-[#0f0f17] shadow-xl hover:scale-110 transition-transform">
                        <Edit2 size={20} className="text-white" />
                      </button>
                    </div>

                    <div className="text-center space-y-3 mb-12">
                      <h2 className="text-4xl font-black tracking-tight">{currentUser?.name}</h2>
                      <div className="flex items-center justify-center gap-3">
                        {currentUser?.organization && (
                          <div className="bg-blue-600/20 text-blue-400 border border-blue-500/30 px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase flex items-center gap-1.5 shadow-lg">
                            <ShieldCheck size={14}/> {currentUser.organization}
                          </div>
                        )}
                        {currentUser?.level && (
                          <div className="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase shadow-lg">
                            {currentUser.level}
                          </div>
                        )}
                        {currentUser?.isTraining && (
                          <div className="bg-orange-500/20 text-orange-400 border border-orange-500/30 px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase animate-pulse shadow-lg">
                            Training
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-5 mb-10">
                      <div className="bg-[#1a1a24] p-6 rounded-[32px] border border-[#2d2d3a] shadow-xl">
                        <div className="text-gray-500 text-[10px] font-black uppercase mb-1.5 tracking-widest">Total Sessions</div>
                        <div className="text-4xl font-black tracking-tight">{mySessions.length}</div>
                      </div>
                      <div className="bg-[#1a1a24] p-6 rounded-[32px] border border-[#2d2d3a] shadow-xl">
                        <div className="text-gray-500 text-[10px] font-black uppercase mb-1.5 tracking-widest">Max Depth</div>
                        <div className="text-4xl font-black tracking-tight">{Math.max(0, ...mySessions.flatMap(s => s.entries.filter(e => e.depthMeters).map(e => e.depthMeters!)))}<span className="text-xl ml-0.5">m</span></div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-[#1a1a24] border border-[#2d2d3a] p-6 rounded-[32px] shadow-xl">
                        <div className="flex items-center justify-between mb-6">
                          <h3 className="text-xs font-black uppercase flex items-center gap-2 tracking-widest text-emerald-400">
                            <Database size={18}/> Supabase DB
                          </h3>
                          <span className="text-[10px] font-black text-green-400 flex items-center gap-1 uppercase tracking-widest bg-green-400/10 px-2 py-1 rounded-md">
                            <Check size={12}/> Connected
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-500 font-medium leading-relaxed">
                          모든 데이터가 Supabase 클라우드 데이터베이스에 안전하게 실시간으로 저장되고 있습니다.
                        </p>
                      </div>

                      <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 text-red-400 font-black p-6 bg-red-400/5 rounded-[32px] border border-red-400/10 hover:bg-red-400/10 transition-all active:scale-95">
                        <LogOut size={20} /> 로그아웃
                      </button>
                    </div>
                  </section>
                )}
              </div>
            ) : (
              <div className="space-y-8 animate-in slide-in-from-left-4 duration-500">
                <div className="flex items-center justify-between">
                  <button onClick={() => setView('dashboard')} className="flex items-center gap-1 text-gray-500 font-black hover:text-white transition-colors"><ChevronLeft size={24}/> BACK</button>
                  {currentSession?.ownerId === currentUser?.id && (
                      <div className="flex gap-4">
                          <button onClick={() => currentSession && handleShareSession(currentSession)} className="text-gray-500 hover:text-purple-400 transition-colors"><Share2 size={20}/></button>
                          <button onClick={async () => { 
                            if(confirm('삭제할까요?')) { 
                              await fetch(`/api/sessions/${selectedSessionId}`, { method: 'DELETE' });
                              fetchData();
                              setView('dashboard'); 
                            }
                          }} className="text-gray-500 hover:text-red-500 transition-colors"><Trash2 size={20}/></button>
                      </div>
                  )}
                </div>
                {currentSession && (
                  <>
                    <div className="bg-[#1a1a24] p-8 rounded-[40px] border border-[#2d2d3a] shadow-2xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-8 opacity-10">
                          <MapPin size={80}/>
                      </div>
                      <div className="text-purple-500 font-black text-xs uppercase mb-2 tracking-[0.2em]">{currentSession.date}</div>
                      <h2 className="text-4xl font-black mb-4 tracking-tight leading-tight">{currentSession.location}</h2>
                      <div className="flex gap-4 text-xs font-bold text-gray-400 bg-black/20 w-fit px-3 py-1.5 rounded-full"><Users size={14} className="text-purple-500"/>{currentSession.buddy}</div>
                      {currentSession.note && <p className="mt-8 text-sm text-gray-300 italic font-medium leading-relaxed">"{currentSession.note}"</p>}
                    </div>

                    <div className="flex items-center justify-between pt-10">
                      <h3 className="font-black text-2xl tracking-tight">다이브 로그 <span className="text-purple-500 font-black ml-2 text-lg">{currentSession.entries.length}</span></h3>
                      {currentSession.ownerId === currentUser?.id && (
                          <button onClick={() => setIsDiveModal({open: true, entry: null})} className="bg-purple-600 hover:bg-purple-500 px-6 py-3 rounded-2xl text-xs font-black shadow-xl shadow-purple-900/40 transition-all active:scale-95">기록 추가</button>
                      )}
                    </div>

                    <div className="space-y-6 pb-10">
                      {currentSession.entries.sort((a,b) => b.timestamp - a.timestamp).map(entry => (
                        <div key={entry.id} className="bg-[#1a1a24] border border-[#2d2d3a] p-6 rounded-[32px] space-y-6 relative hover:border-purple-500/30 transition-all group shadow-xl">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <DisciplineBadge type={entry.discipline} />
                                <span className="text-[10px] font-black text-gray-500 tracking-widest uppercase">{entry.attemptNumber} ATTEMPT</span>
                            </div>
                            {currentSession.ownerId === currentUser?.id && (
                              <div className="flex gap-4 text-gray-500 opacity-40 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => analyzeDive(entry)} className={`hover:text-blue-400 flex items-center gap-1 text-[10px] font-black border border-blue-500/30 px-3 py-1.5 rounded-xl ${isAnalyzing ? 'opacity-50 animate-pulse' : ''}`}>
                                  <BrainCircuit size={16}/> AI 분석
                                </button>
                                <button onClick={() => setIsDiveModal({open: true, entry})} className="hover:text-purple-400 p-1.5"><Edit2 size={18}/></button>
                                <button onClick={async () => {
                                  if(confirm('삭제할까요?')) {
                                    const updatedSession = { ...currentSession, entries: currentSession.entries.filter(e => e.id !== entry.id) };
                                    await fetch('/api/sessions', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify(updatedSession)
                                    });
                                    fetchData();
                                  }
                                }} className="hover:text-red-400 p-1.5"><Trash2 size={18}/></button>
                              </div>
                            )}
                          </div>
                          <div className="grid grid-cols-3 gap-6">
                            {entry.timeSeconds !== undefined && <div><div className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1">TIME</div><div className="text-2xl font-black">{formatTime(entry.timeSeconds)}</div></div>}
                            {entry.distanceMeters !== undefined && <div><div className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1">DIST</div><div className="text-2xl font-black">{entry.distanceMeters}<span className="text-sm ml-0.5">m</span></div></div>}
                            {entry.depthMeters !== undefined && <div><div className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1">DEPTH</div><div className="text-2xl font-black">{entry.depthMeters}<span className="text-sm ml-0.5">m</span></div></div>}
                          </div>

                          {analysisResult?.id === entry.id && (
                            <div className="mt-4 bg-blue-900/10 border border-blue-500/20 p-6 rounded-[24px] animate-in zoom-in-95 duration-500 shadow-inner">
                              <div className="flex items-center gap-2 mb-6 text-blue-400">
                                <Sparkles size={20}/>
                                <h4 className="text-xs font-black uppercase tracking-[0.2em]">AI Dive Coaching</h4>
                              </div>
                              <div className="space-y-4 text-xs leading-relaxed text-gray-300 font-medium">
                                {analysisResult.text.split('\n').map((line, i) => (
                                  <p key={i}>{line}</p>
                                ))}
                              </div>
                              <button onClick={() => setAnalysisResult(null)} className="mt-8 w-full py-4 bg-[#0f0f17] border border-[#2d2d3a] rounded-2xl text-[10px] font-black text-gray-500 uppercase tracking-widest hover:text-white transition-colors">리포트 닫기</button>
                            </div>
                          )}

                          <div className="flex gap-3 overflow-x-auto scrollbar-hide py-1">{entry.media.map(m => <MediaThumbnail key={m.id} media={m} />)}</div>
                          {entry.note && (
                              <div className="bg-[#0f0f17] p-4 rounded-2xl border border-[#2d2d3a]/50">
                                  <p className="text-xs text-gray-500 italic font-medium leading-relaxed">"{entry.note}"</p>
                              </div>
                          )}
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

      {/* Profile Edit Modal */}
      {isProfileEditModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in zoom-in-95 duration-300">
          <div className="bg-[#1a1a24] w-full max-w-sm rounded-[40px] p-8 border border-[#2d2d3a] shadow-2xl">
            <h2 className="text-2xl font-black mb-8 flex items-center gap-3"><Award className="text-purple-500"/> 프로필 설정</h2>
            <form onSubmit={handleUpdateProfile} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-600 uppercase ml-1 tracking-widest">발급 단체</label>
                <select name="organization" defaultValue={currentUser?.organization || ORGS[0]} className="w-full bg-[#0f0f17] border border-[#2d2d3a] rounded-2xl px-5 py-4 text-sm outline-none appearance-none focus:border-purple-500 text-white">
                  {ORGS.map(org => <option key={org} value={org}>{org}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-600 uppercase ml-1 tracking-widest">레벨</label>
                <select name="level" defaultValue={currentUser?.level || LEVELS[0]} className="w-full bg-[#0f0f17] border border-[#2d2d3a] rounded-2xl px-5 py-4 text-sm outline-none appearance-none focus:border-purple-500 text-white">
                  {LEVELS.map(lv => <option key={lv} value={lv}>{lv}</option>)}
                </select>
              </div>
              <div className="flex items-center justify-between p-4 bg-[#0f0f17] border border-[#2d2d3a] rounded-2xl">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"/>
                  <span className="text-xs font-bold text-gray-300">다음 레벨 교육 중</span>
                </div>
                <input type="checkbox" name="isTraining" defaultChecked={currentUser?.isTraining} className="w-6 h-6 accent-purple-600" />
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setIsProfileEditModal(false)} className="flex-1 font-black text-gray-500 py-4">취소</button>
                <button type="submit" className="flex-[2] bg-purple-600 font-black text-white py-4 rounded-3xl shadow-xl shadow-purple-900/40">저장 완료</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Nav Bar */}
      {currentUser && (
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md h-24 bg-[#11111a]/95 backdrop-blur-2xl border-t border-[#1a1a24] flex items-center justify-around px-8 z-40 shadow-2xl shadow-black">
          <button onClick={() => { setActiveTab('home'); setView('dashboard'); }} className={`flex flex-col items-center gap-1.5 transition-all duration-300 ${activeTab === 'home' ? 'text-purple-500 scale-110' : 'text-gray-500 hover:text-gray-400'}`}>
            <div className={`p-2 rounded-2xl ${activeTab === 'home' ? 'bg-purple-600/10' : ''}`}><Calendar size={22} strokeWidth={activeTab === 'home' ? 3 : 2}/></div>
            <span className="text-[9px] font-black uppercase tracking-widest">Home</span>
          </button>
          <button onClick={() => { setActiveTab('social'); setView('dashboard'); }} className={`flex flex-col items-center gap-1.5 transition-all duration-300 ${activeTab === 'social' ? 'text-purple-500 scale-110' : 'text-gray-500 hover:text-gray-400'}`}>
            <div className={`p-2 rounded-2xl ${activeTab === 'social' ? 'bg-purple-600/10' : ''}`}><Globe size={22} strokeWidth={activeTab === 'social' ? 3 : 2}/></div>
            <span className="text-[9px] font-black uppercase tracking-widest">Network</span>
          </button>
          <button onClick={() => { setActiveTab('profile'); setView('dashboard'); }} className={`flex flex-col items-center gap-1.5 transition-all duration-300 ${activeTab === 'profile' ? 'text-purple-500 scale-110' : 'text-gray-500 hover:text-gray-400'}`}>
            <div className={`p-2 rounded-2xl ${activeTab === 'profile' ? 'bg-purple-600/10' : ''}`}><UserIcon size={22} strokeWidth={activeTab === 'profile' ? 3 : 2}/></div>
            <span className="text-[9px] font-black uppercase tracking-widest">Profile</span>
          </button>
        </nav>
      )}

      {/* AI Analyzing Loader */}
      {isAnalyzing && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-xl flex flex-col items-center justify-center p-12 text-center animate-in fade-in duration-500">
          <div className="relative mb-10">
             <div className="w-24 h-24 border-4 border-blue-500/10 border-t-blue-500 rounded-full animate-spin"></div>
             <BrainCircuit className="absolute inset-0 m-auto text-blue-400 animate-pulse" size={40}/>
          </div>
          <h3 className="text-2xl font-black mb-4 text-white tracking-tight">AI 다이빙 코칭 리포트</h3>
          <p className="text-gray-400 text-sm leading-relaxed font-medium">그래프의 미세한 변화를 분석하여<br/>당신을 위한 최적의 다이빙 솔루션을 찾고 있습니다.</p>
        </div>
      )}

      {/* New Session & Dive Modals (Minimal update for aesthetic consistency) */}
      {isNewSessionModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in zoom-in-95 duration-300">
          <div className="bg-[#1a1a24] w-full max-w-sm rounded-[40px] p-8 border border-[#2d2d3a] shadow-2xl">
            <h2 className="text-2xl font-black mb-8 tracking-tight">새 다이빙 세션</h2>
            <form onSubmit={handleCreateSession} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-600 uppercase ml-1 tracking-widest">Date</label>
                <input required type="date" name="date" className="w-full bg-[#0f0f17] border border-[#2d2d3a] rounded-[24px] px-5 py-5 text-sm outline-none focus:border-purple-500 text-white" defaultValue={new Date().toISOString().split('T')[0]} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-600 uppercase ml-1 tracking-widest">Location</label>
                <input required id="loc-input" type="text" name="location" placeholder="다이빙 포인트" className="w-full bg-[#0f0f17] border border-[#2d2d3a] rounded-[24px] px-5 py-5 text-sm outline-none focus:border-purple-500 text-white" />
                <div className="flex flex-wrap gap-2 mt-2">
                    {LOCATIONS.slice(0, 3).map(loc => (
                      <button key={loc} type="button" onClick={() => { (document.getElementById('loc-input') as HTMLInputElement).value = loc; }} className="text-[10px] font-black bg-[#2d2d3a] px-3 py-2 rounded-xl hover:bg-purple-600 transition-all">{loc}</button>
                    ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-600 uppercase ml-1 tracking-widest">Buddy</label>
                <input required type="text" name="buddy" placeholder="버디 이름" className="w-full bg-[#0f0f17] border border-[#2d2d3a] rounded-[24px] px-5 py-5 text-sm outline-none focus:border-purple-500 text-white" />
              </div>
              <div className="flex gap-4 pt-6">
                <button type="button" onClick={() => setIsNewSessionModal(false)} className="flex-1 font-black text-gray-500 py-5">취소</button>
                <button type="submit" disabled={isCreatingSession} className="flex-[2] bg-purple-600 font-black text-white py-5 rounded-[24px] shadow-xl shadow-purple-900/40 disabled:opacity-50">
                  {isCreatingSession ? <Loader2 className="animate-spin mx-auto" size={24}/> : '세션 시작'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isDiveModal.open && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in zoom-in-95 duration-300">
          <div className="bg-[#1a1a24] w-full max-w-sm rounded-[40px] p-8 border border-[#2d2d3a] max-h-[85vh] overflow-y-auto scrollbar-hide shadow-2xl">
            <h2 className="text-2xl font-black mb-8 tracking-tight">{isDiveModal.entry ? '기록 수정' : '다이브 기록'}</h2>
            <form onSubmit={handleAddOrUpdateDive} className="space-y-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-600 uppercase ml-1 tracking-widest">Discipline</label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.values(Discipline).map(d => (
                    <button key={d} type="button" onClick={() => setSelectedDiscipline(d)} className={`py-4 rounded-2xl text-[11px] font-black border transition-all ${selectedDiscipline === d ? 'bg-purple-600 border-purple-500 text-white shadow-lg' : 'bg-[#0f0f17] border-[#2d2d3a] text-gray-500'}`}>
                      {d}
                    </button>
                  ))}
                  <input type="hidden" name="discipline" value={selectedDiscipline} />
                </div>
              </div>

              {selectedDiscipline !== Discipline.DYN && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-600 uppercase ml-1 flex items-center gap-1.5 tracking-widest"><Clock size={12} className="text-purple-500"/> Time (MMSS)</label>
                  <input 
                    type="number" 
                    placeholder="MMSS (예: 0130)" 
                    value={timeValue}
                    onChange={(e) => setTimeValue(e.target.value)}
                    className="w-full bg-[#0f0f17] border border-[#2d2d3a] rounded-[24px] px-5 py-6 text-3xl font-black outline-none focus:border-purple-500 placeholder:text-gray-800 text-white" 
                  />
                  <div className="text-[10px] text-purple-400 font-black ml-1 uppercase flex items-center gap-1.5">
                    <Activity size={12}/> 변환 결과: {formatTime(parseSmartTime(timeValue))}
                  </div>
                </div>
              )}

              {selectedDiscipline === Discipline.DYN && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-600 uppercase ml-1 tracking-widest">Distance (m)</label>
                  <input type="number" name="distance" placeholder="0" defaultValue={isDiveModal.entry?.distanceMeters || ''} className="w-full bg-[#0f0f17] border border-[#2d2d3a] rounded-[24px] px-5 py-6 text-3xl font-black outline-none focus:border-purple-500 text-white" />
                </div>
              )}

              {(selectedDiscipline === Discipline.FIM || selectedDiscipline === Discipline.CWT) && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-600 uppercase ml-1 tracking-widest">Depth (m)</label>
                  <input type="number" name="depth" placeholder="0" defaultValue={isDiveModal.entry?.depthMeters || ''} className="w-full bg-[#0f0f17] border border-[#2d2d3a] rounded-[24px] px-5 py-6 text-3xl font-black outline-none focus:border-purple-500 text-white" />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-600 uppercase ml-1 tracking-widest">Media</label>
                <div className="relative group overflow-hidden bg-[#0f0f17] border-2 border-[#2d2d3a] border-dashed rounded-[32px] p-10 text-center hover:border-purple-500 transition-all active:scale-95">
                  <input type="file" name="media" multiple accept="image/*,video/*" className="absolute inset-0 opacity-0 cursor-pointer" />
                  <Camera className="mx-auto text-gray-600 mb-2 group-hover:scale-110 transition-transform" size={32}/>
                  <div className="text-[10px] text-gray-600 font-black uppercase tracking-widest">Photos / Videos</div>
                </div>
              </div>
              <textarea name="note" placeholder="오늘의 다이빙은 어땠나요?" defaultValue={isDiveModal.entry?.note || ''} className="w-full bg-[#0f0f17] border border-[#2d2d3a] rounded-[24px] px-5 py-5 text-sm outline-none resize-none focus:border-purple-500 font-medium text-white"></textarea>
              <div className="flex gap-4 pt-6">
                <button type="button" onClick={() => setIsDiveModal({open: false, entry: null})} className="flex-1 font-black text-gray-500 py-5" disabled={isUploading}>취소</button>
                <button type="submit" className="flex-[2] bg-purple-600 font-black text-white py-5 rounded-[24px] disabled:opacity-50 shadow-xl shadow-purple-900/40" disabled={isUploading}>{isUploading ? <Loader2 className="animate-spin mx-auto" size={24}/> : (isDiveModal.entry ? '수정 완료' : '로그 저장')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
