
export enum Discipline {
  STA = 'STA',
  DYN = 'DYN',
  FIM = 'FIM',
  CWT = 'CWT'
}

export interface MediaFile {
  id: string;
  type: 'image' | 'video';
  url: string; // Base64 (local) or Google Drive URL
  driveFileId?: string; // ID of the file in Google Drive
}

export interface DiveEntry {
  id: string;
  discipline: Discipline;
  attemptNumber: number;
  timeSeconds?: number;
  distanceMeters?: number;
  depthMeters?: number;
  media: MediaFile[];
  note?: string;
  timestamp: number;
}

export interface DiveSession {
  id: string;
  date: string;
  location: string;
  buddy: string;
  note: string;
  entries: DiveEntry[];
}

export interface PersonalBest {
  discipline: Discipline;
  value: string;
  date?: string;
}
