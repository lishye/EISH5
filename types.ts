export enum SoundType {
  CW = "CW Radio Tone",
  TELEGRAPH = "Telegraph Sounder"
}

export enum AlphabetType {
  LATIN = "Latin"
}

export interface AppConfig {
  wpm: number;
  farnsworth: number;
  pitch: number;
  volume: number; // 0-100
  soundType: SoundType;
  alphabet: AlphabetType;
}

export interface PlayOptions {
  enableSound: boolean;
  enableLight: boolean;
  enableVibrate: boolean;
  loop: boolean;
}

export interface MorseDictionary {
  [key: string]: string;
}

export interface PlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  progress: number; // 0 to 1
  currentIndex: number;
}