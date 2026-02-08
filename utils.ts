
import { Discipline, DiveSession, DiveEntry, PersonalBest } from './types';

export const formatTime = (seconds?: number): string => {
  if (seconds === undefined) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const calculateSessionPB = (entries: DiveEntry[]): Partial<Record<Discipline, string>> => {
  const pbs: Partial<Record<Discipline, string>> = {};

  entries.forEach(entry => {
    if (entry.discipline === Discipline.STA) {
      const current = entry.timeSeconds || 0;
      const existing = parseInt(pbs[Discipline.STA] || '0');
      if (current > existing) pbs[Discipline.STA] = current.toString();
    } else if (entry.discipline === Discipline.DYN) {
      const current = entry.distanceMeters || 0;
      const existing = parseInt(pbs[Discipline.DYN] || '0');
      if (current > existing) pbs[Discipline.DYN] = current.toString();
    } else {
      // FIM, CWT (Depth is priority)
      const current = entry.depthMeters || 0;
      const existing = parseInt(pbs[entry.discipline] || '0');
      if (current > existing) pbs[entry.discipline] = current.toString();
    }
  });

  // Convert raw numbers back to display strings
  if (pbs[Discipline.STA]) pbs[Discipline.STA] = formatTime(parseInt(pbs[Discipline.STA]!));
  if (pbs[Discipline.DYN]) pbs[Discipline.DYN] = `${pbs[Discipline.DYN]}m`;
  if (pbs[Discipline.FIM]) pbs[Discipline.FIM] = `${pbs[Discipline.FIM]}m`;
  if (pbs[Discipline.CWT]) pbs[Discipline.CWT] = `${pbs[Discipline.CWT]}m`;

  return pbs;
};

export const calculateOverallPB = (sessions: DiveSession[]): PersonalBest[] => {
  const allEntries = sessions.flatMap(s => s.entries.map(e => ({ ...e, sessionDate: s.date })));
  
  const bests: Record<Discipline, { value: number; date: string }> = {
    [Discipline.STA]: { value: 0, date: '' },
    [Discipline.DYN]: { value: 0, date: '' },
    [Discipline.FIM]: { value: 0, date: '' },
    [Discipline.CWT]: { value: 0, date: '' },
  };

  allEntries.forEach(e => {
    let currentVal = 0;
    if (e.discipline === Discipline.STA) currentVal = e.timeSeconds || 0;
    else if (e.discipline === Discipline.DYN) currentVal = e.distanceMeters || 0;
    else currentVal = e.depthMeters || 0;

    if (currentVal > bests[e.discipline].value) {
      bests[e.discipline] = { value: currentVal, date: e.sessionDate };
    }
  });

  return Object.values(Discipline).map(d => ({
    discipline: d,
    value: d === Discipline.STA ? formatTime(bests[d].value) : (bests[d].value > 0 ? `${bests[d].value}m` : '--'),
    date: bests[d].date
  }));
};

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};
