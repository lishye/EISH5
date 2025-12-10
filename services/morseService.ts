import { MORSE_MAP, REVERSE_MORSE_MAP } from '../constants';
import { AppConfig, SoundType } from '../types';

// Timing constants (in units)
const DOT_UNITS = 1;
const DASH_UNITS = 3;
const INTRA_CHAR_GAP = 1;
const INTER_CHAR_GAP = 3;
const WORD_GAP = 7;

export interface MorseEvent {
  type: 'on' | 'off';
  duration: number; // ms
  charIndex?: number; // Maps back to source text index
}

/**
 * Translates text to Morse Code
 */
export const textToMorse = (text: string): string => {
  return text
    .toUpperCase()
    .split('')
    .map(char => {
      if (char === ' ') return '/'; // Word separator
      return MORSE_MAP[char] || ''; // Ignore unknown chars
    })
    .join(' ')
    .replace(/\s\/\s/g, ' / ') // Clean up word separators
    .trim();
};

/**
 * Translates Morse Code to Text
 */
export const morseToText = (morse: string): string => {
  return morse
    .trim()
    .split('/') // Split words
    .map(word => 
      word
        .trim()
        .split(' ') // Split chars
        .map(code => REVERSE_MORSE_MAP[code] || '')
        .join('')
    )
    .join(' ');
};

/**
 * Generates a sequence of timing events for playback
 */
export const generateTimingSequence = (morse: string, config: AppConfig): MorseEvent[] => {
  const events: MorseEvent[] = [];
  
  // Calculate unit duration in ms
  // Standard: T = 1200 / WPM
  const unitMs = 1200 / config.wpm;
  
  // Farnsworth logic:
  // If Farnsworth is slower than WPM, we extend the Inter-Char and Word Gaps.
  // The Dot/Dash/Intra-Char gaps remain at the main WPM speed.
  let farnsworthUnitMs = unitMs;
  if (config.farnsworth < config.wpm && config.farnsworth > 0) {
    // There are complex formulas, but the standard "ARRL" method effectively 
    // uses the slower speed for the spacing.
    farnsworthUnitMs = 1200 / config.farnsworth;
  }

  const words = morse.split('/');
  
  words.forEach((word, wIdx) => {
    const chars = word.trim().split(' ');
    
    chars.forEach((char, cIdx) => {
      if (!char) return;
      
      const signals = char.split('');
      signals.forEach((sig, sIdx) => {
        // Signal (On)
        const duration = sig === '-' ? DASH_UNITS * unitMs : DOT_UNITS * unitMs;
        events.push({ type: 'on', duration });
        
        // Gap (Off)
        if (sIdx < signals.length - 1) {
          // Intra-character gap
          events.push({ type: 'off', duration: INTRA_CHAR_GAP * unitMs });
        }
      });

      // Inter-character gap (unless last char of word)
      if (cIdx < chars.length - 1) {
        events.push({ type: 'off', duration: INTER_CHAR_GAP * farnsworthUnitMs });
      }
    });

    // Word gap (unless last word)
    if (wIdx < words.length - 1) {
       events.push({ type: 'off', duration: WORD_GAP * farnsworthUnitMs });
    }
  });

  return events;
};

/**
 * Audio Context Helper to manage single instance
 */
let audioCtx: AudioContext | null = null;

const getAudioContext = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
};

/**
 * Renders audio to a Blob (WAV) for downloading
 */
export const renderAudioToWav = async (morse: string, config: AppConfig): Promise<Blob> => {
  const sequence = generateTimingSequence(morse, config);
  const totalDurationMs = sequence.reduce((acc, e) => acc + e.duration, 0);
  const sampleRate = 44100;
  // Add 1s padding
  const totalFrames = Math.ceil((totalDurationMs + 500) * sampleRate / 1000); 

  const offlineCtx = new OfflineAudioContext(1, totalFrames, sampleRate);
  
  let currentTime = 0;
  
  const gainNode = offlineCtx.createGain();
  gainNode.gain.value = config.volume / 100;
  gainNode.connect(offlineCtx.destination);

  sequence.forEach(event => {
    const durationSec = event.duration / 1000;
    
    if (event.type === 'on') {
      if (config.soundType === SoundType.CW) {
        const osc = offlineCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = config.pitch;
        osc.connect(gainNode);
        
        // Anti-pop envelope
        const attack = 0.005; 
        const release = 0.005;
        
        osc.start(currentTime);
        gainNode.gain.setValueAtTime(0, currentTime);
        gainNode.gain.linearRampToValueAtTime(config.volume / 100, currentTime + attack);
        gainNode.gain.setValueAtTime(config.volume / 100, currentTime + durationSec - release);
        gainNode.gain.linearRampToValueAtTime(0, currentTime + durationSec);
        
        osc.stop(currentTime + durationSec);
      } else {
        // Telegraph click simulation (simplified noise burst)
        const osc = offlineCtx.createOscillator();
        osc.type = 'square'; // harsher sound
        osc.frequency.value = 100; // Low thud
        osc.connect(gainNode);
        osc.start(currentTime);
        osc.stop(currentTime + Math.min(0.03, durationSec)); // Short click
      }
    }
    currentTime += durationSec;
  });

  const renderedBuffer = await offlineCtx.startRendering();
  return bufferToWav(renderedBuffer);
};

// Helper to convert AudioBuffer to WAV Blob
const bufferToWav = (abuffer: AudioBuffer) => {
  const numOfChan = abuffer.numberOfChannels;
  const length = abuffer.length * numOfChan * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  // write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(abuffer.sampleRate);
  setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit (hardcoded in this example)

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // write interleaved data
  for(i = 0; i < abuffer.numberOfChannels; i++)
    channels.push(abuffer.getChannelData(i));

  while(pos < abuffer.length) {
    for(i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][pos])); // clamp
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0; // scale to 16-bit signed int
      view.setInt16(44 + offset, sample, true);
      offset += 2;
    }
    pos++;
  }

  return new Blob([buffer], {type: "audio/wav"});

  function setUint16(data: any) {
    view.setUint16(pos, data, true);
    pos += 2;
  }
  function setUint32(data: any) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
};