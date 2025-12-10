import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Lightbulb, LightbulbOff, Zap, ZapOff, Download, Share2, Settings, Globe, ArrowRightLeft } from 'lucide-react';
import { 
  AppConfig, 
  SoundType, 
  AlphabetType, 
  PlayOptions, 
  PlaybackState 
} from './types';
import { 
  DEFAULT_CONFIG, 
  UI_STRINGS 
} from './constants';
import { 
  textToMorse, 
  morseToText, 
  generateTimingSequence, 
  renderAudioToWav,
  MorseEvent
} from './services/morseService';

export default function App() {
  // --- State ---
  const [lang, setLang] = useState<'en' | 'cn'>('en');
  
  // Input Modes: 'text' means Top is Text, Bottom is Morse. 'morse' means Top is Morse.
  const [inputMode, setInputMode] = useState<'text' | 'morse'>('text');
  
  const [inputText, setInputText] = useState('eish5');
  const [morseText, setMorseText] = useState(textToMorse('eish5'));
  
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  
  const [options, setOptions] = useState<PlayOptions>({
    enableSound: true,
    enableLight: true,
    enableVibrate: false,
    loop: false
  });

  const [playback, setPlayback] = useState<PlaybackState>({
    isPlaying: false,
    isPaused: false,
    progress: 0,
    currentIndex: 0
  });

  const [showConfigModal, setShowConfigModal] = useState(false);
  const [isLightActive, setIsLightActive] = useState(false); // For visual flashing

  // --- Refs for Audio/Timing ---
  const audioCtxRef = useRef<AudioContext | null>(null);
  // We use a master gain node for the current session to easily kill all sound on Stop
  const activeGainNodeRef = useRef<GainNode | null>(null);
  const timeoutRefs = useRef<number[]>([]);
  
  // Use strings helper
  const t = UI_STRINGS[lang];

  // --- Handlers ---

  // Initialize Audio Context on user interaction to handle autoplay policies
  const initAudio = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  const handleSwapMode = () => {
    stopPlayback();
    // Swap the content
    const currentInput = inputText;
    const currentMorse = morseText;
    
    if (inputMode === 'text') {
      // Switch to Morse Input: Top becomes Morse, Bottom becomes Text
      setInputMode('morse');
      // We want the top box (now Morse) to contain the Morse code
      setInputText(currentMorse);
      setMorseText(currentInput); 
    } else {
      // Switch to Text Input: Top becomes Text, Bottom becomes Morse
      setInputMode('text');
      setInputText(currentMorse); // The old 'output' (Text) becomes new Input
      setMorseText(currentInput); // The old 'input' (Morse) becomes new Output
    }
  };

  const handleMainInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);
    stopPlayback();

    if (inputMode === 'text') {
      setMorseText(textToMorse(val));
    } else {
      setMorseText(morseToText(val));
    }
  };

  const handleSecondaryDisplayChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setMorseText(val);
    stopPlayback();
    
    // If user edits the bottom box, update the top box accordingly
    if (inputMode === 'text') {
      setInputText(morseToText(val));
    } else {
      setInputText(textToMorse(val));
    }
  };

  const toggleOption = (key: keyof PlayOptions) => {
    setOptions(prev => {
      const next = { ...prev, [key]: !prev[key] };
      
      // Constraint: At least one of Sound or Light must be enabled
      if (key === 'enableSound' || key === 'enableLight') {
        if (!next.enableSound && !next.enableLight) {
          // If trying to turn off the last active one, prevent it
          return prev;
        }
      }
      return next;
    });
  };

  // --- Playback Logic ---

  const stopPlayback = useCallback(() => {
    // 1. Audio Stop: Disconnect the master gain for the current session
    if (activeGainNodeRef.current) {
      try {
        activeGainNodeRef.current.disconnect();
      } catch (e) {
        console.warn("Error disconnecting gain node", e);
      }
      activeGainNodeRef.current = null;
    }
    
    // 2. Clear all timeouts
    timeoutRefs.current.forEach(id => window.clearTimeout(id));
    timeoutRefs.current = [];

    // 3. Stop Vibration
    if (navigator.vibrate) navigator.vibrate(0);

    // 4. Reset UI State
    setIsLightActive(false);
    setPlayback({
      isPlaying: false,
      isPaused: false,
      progress: 0,
      currentIndex: 0
    });
  }, []);

  const playSequence = useCallback(async () => {
    initAudio();
    stopPlayback(); // Ensure everything is killed before starting new

    // Decide which text to play. We always play the Morse representation.
    
    let stringToPlay = '';
    if (inputMode === 'text') {
        stringToPlay = morseText;
    } else {
        stringToPlay = inputText;
    }

    if (!stringToPlay.trim()) return;

    setPlayback(prev => ({ ...prev, isPlaying: true, isPaused: false }));

    const events = generateTimingSequence(stringToPlay, config);
    let currentTimeMs = 0;
    const totalDuration = events.reduce((sum, e) => sum + e.duration, 0);

    // Create a new Master Gain for this session
    const sessionGain = audioCtxRef.current!.createGain();
    sessionGain.connect(audioCtxRef.current!.destination);
    activeGainNodeRef.current = sessionGain; // Store ref to disconnect later

    // Schedule Events
    events.forEach((event, idx) => {
      // 1. Audio Scheduling (Precise via Web Audio Time)
      if (options.enableSound && event.type === 'on') {
        const startSec = audioCtxRef.current!.currentTime + (currentTimeMs / 1000);
        const durationSec = event.duration / 1000;
        
        const osc = audioCtxRef.current!.createOscillator();
        const gain = audioCtxRef.current!.createGain();
        
        osc.connect(gain);
        gain.connect(sessionGain); // Connect to session gain!
        
        if (config.soundType === SoundType.CW) {
          osc.type = 'sine';
          osc.frequency.value = config.pitch;
          
          // Envelope to prevent popping
          gain.gain.setValueAtTime(0, startSec);
          gain.gain.linearRampToValueAtTime(config.volume / 100, startSec + 0.005);
          gain.gain.setValueAtTime(config.volume / 100, startSec + durationSec - 0.005);
          gain.gain.linearRampToValueAtTime(0, startSec + durationSec);
        } else {
           // Telegraph click
           osc.type = 'square';
           osc.frequency.value = 100;
           gain.gain.value = config.volume / 100;
        }

        osc.start(startSec);
        osc.stop(startSec + durationSec);
      }

      // 2. Visual & Vibrate Scheduling (via setTimeout)
      const timeoutId = window.setTimeout(() => {
        if (event.type === 'on') {
          if (options.enableLight) setIsLightActive(true);
          if (options.enableVibrate && navigator.vibrate) navigator.vibrate(event.duration);
        } else {
          setIsLightActive(false);
        }
        
        // Update Progress
        setPlayback(prev => ({
          ...prev,
          progress: Math.min((currentTimeMs / totalDuration), 1)
        }));

      }, currentTimeMs);
      
      timeoutRefs.current.push(timeoutId);

      // Turn off light at end of 'on' event
      if (event.type === 'on') {
        const offId = window.setTimeout(() => {
           setIsLightActive(false);
        }, currentTimeMs + event.duration);
        timeoutRefs.current.push(offId);
      }

      currentTimeMs += event.duration;
    });

    // End of Sequence Handler
    const endId = window.setTimeout(() => {
      stopPlayback();
    }, totalDuration + 100);
    
    timeoutRefs.current.push(endId);

  }, [inputMode, inputText, morseText, config, options, stopPlayback]);

  const handlePause = () => {
     stopPlayback(); 
  };

  const handleSaveAudio = async () => {
    const stringToSave = inputMode === 'text' ? morseText : inputText;
    if (!stringToSave) return;
    try {
      const blob = await renderAudioToWav(stringToSave, config);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'morse.wav';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to save audio", err);
      alert("Error generating audio file.");
    }
  };

  const handleShare = () => {
    const textContent = inputMode === 'text' ? inputText : morseText;
    const morseContent = inputMode === 'text' ? morseText : inputText;
    
    if (navigator.share) {
      // Validate URL: navigator.share throws if url is invalid (e.g. data:, about:blank in iframes)
      let shareUrl = window.location.href;
      // If we are in a non-standard environment (like an iframe with about:srcdoc), use a fallback or omit
      if (!shareUrl.startsWith('http')) {
        shareUrl = 'https://eish5.com'; 
      }

      navigator.share({
        title: 'eish5 Morse',
        text: `Text: ${textContent}\nMorse: ${morseContent}`,
        url: shareUrl
      }).catch((err) => {
        console.error("Share failed", err);
        // Fallback if share fails (e.g. unsupported platform despite check)
        navigator.clipboard.writeText(`${textContent}\n${morseContent}`);
        alert("Copied to clipboard!");
      });
    } else {
      // Fallback copy to clipboard
      navigator.clipboard.writeText(`${textContent}\n${morseContent}`);
      alert("Copied to clipboard!");
    }
  };


  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-700">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm relative z-20">
        <h1 className="text-2xl font-bold tracking-tight text-morse-800">
          eish5 <span className="text-morse-500 text-sm font-normal ml-2 tracking-widest">. .. ... .... .....</span>
        </h1>
        <button 
          onClick={() => setLang(l => l === 'en' ? 'cn' : 'en')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-slate-100 text-sm font-medium transition-colors"
        >
          <Globe size={16} />
          {lang === 'en' ? '中文' : 'English'}
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* Flash Overlay */}
        <div 
          className={`absolute inset-0 bg-morse-900 pointer-events-none z-10 signal-flash ${isLightActive ? 'opacity-20' : 'opacity-0'}`}
        />

        {/* Center: Input/Output */}
        <div className="flex-1 p-4 md:p-8 flex flex-col gap-6 overflow-y-auto relative z-0">
          
          {/* TOP BOX */}
          <div className="flex flex-col gap-2 flex-1">
            <div className="flex justify-between items-center">
              <label className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                {inputMode === 'text' ? t.input : "MORSE INPUT"}
              </label>
              <button 
                onClick={handleSwapMode}
                className="flex items-center gap-1 text-xs font-bold text-morse-600 bg-morse-50 hover:bg-morse-100 px-3 py-1 rounded-full transition-colors"
                title="Swap Input Mode"
              >
                <ArrowRightLeft size={14} />
                {inputMode === 'text' ? 'Text → Morse' : 'Morse → Text'}
              </button>
            </div>
            <textarea
              value={inputText}
              onChange={handleMainInputChange}
              className={`w-full flex-1 p-4 rounded-lg border border-slate-300 shadow-sm focus:ring-2 focus:ring-morse-500 focus:border-morse-500 outline-none resize-none font-mono text-lg bg-white ${inputMode === 'morse' ? 'tracking-widest' : ''}`}
              spellCheck={false}
              placeholder={inputMode === 'text' ? "Type text here..." : ".- -... -.-."}
            />
          </div>

          {/* BOTTOM BOX */}
          <div className="flex flex-col gap-2 flex-1">
            <label className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
               {inputMode === 'text' ? t.output : "TEXT OUTPUT"}
            </label>
            <textarea
              value={morseText}
              onChange={handleSecondaryDisplayChange}
              className={`w-full flex-1 p-4 rounded-lg border border-slate-300 shadow-sm focus:ring-2 focus:ring-morse-500 focus:border-morse-500 outline-none resize-none font-mono text-2xl bg-paper text-slate-800 ${inputMode === 'text' ? 'tracking-widest' : ''}`}
              spellCheck={false}
              placeholder={inputMode === 'text' ? ".- -... -.-." : "Translation..."}
            />
          </div>
        </div>

        {/* Right: Quick Settings (Sliders) */}
        <div className="w-full md:w-64 bg-white border-l border-slate-200 p-6 flex md:flex-col justify-between md:justify-start gap-8 z-20 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)]">
          
          {/* Speed */}
          <div className="flex flex-col items-center gap-2 flex-1 md:flex-none h-48 md:h-64">
             <span className="font-semibold text-sm text-slate-600">{t.speed}</span>
             <span className="text-xs text-morse-600 font-mono mb-2">{config.wpm}</span>
             <input 
               type="range" 
               min="5" max="50" 
               orient="vertical"
               className="slider-vertical flex-1 accent-morse-600 cursor-pointer"
               value={config.wpm}
               onChange={(e) => setConfig({...config, wpm: Number(e.target.value)})}
             />
          </div>

          {/* Pitch */}
          <div className="flex flex-col items-center gap-2 flex-1 md:flex-none h-48 md:h-64">
             <span className="font-semibold text-sm text-slate-600">{t.pitch}</span>
             <span className="text-xs text-morse-600 font-mono mb-2">{config.pitch}</span>
             <input 
               type="range" 
               min="200" max="1000" step="50"
               orient="vertical"
               className="slider-vertical flex-1 accent-morse-600 cursor-pointer"
               value={config.pitch}
               onChange={(e) => setConfig({...config, pitch: Number(e.target.value)})}
             />
          </div>

          {/* Volume */}
          <div className="flex flex-col items-center gap-2 flex-1 md:flex-none h-48 md:h-64">
             <span className="font-semibold text-sm text-slate-600">{t.volume}</span>
             <span className="text-xs text-morse-600 font-mono mb-2">{config.volume}</span>
             <input 
               type="range" 
               min="0" max="100" 
               orient="vertical"
               className="slider-vertical flex-1 accent-morse-600 cursor-pointer"
               value={config.volume}
               onChange={(e) => setConfig({...config, volume: Number(e.target.value)})}
             />
          </div>
        </div>

      </main>

      {/* Footer Controls */}
      <footer className="bg-white border-t border-slate-200 p-4 z-30">
        <div className="max-w-6xl mx-auto flex flex-wrap justify-center gap-4 sm:gap-6 items-center">
          
          {/* Play/Pause */}
          <button 
            onClick={playback.isPlaying ? handlePause : playSequence} 
            className="btn-unified"
          >
            {playback.isPlaying ? <Pause size={24} /> : <Play size={24} />}
            <span className="text-xs font-medium mt-1">{playback.isPlaying ? t.pause : t.play}</span>
          </button>

          {/* Sound */}
          <button 
            onClick={() => toggleOption('enableSound')} 
            className={`btn-unified ${options.enableSound ? 'text-morse-600' : ''}`}
          >
            {options.enableSound ? <Volume2 size={24} /> : <VolumeX size={24} />}
            <span className="text-xs font-medium mt-1">{t.sound}</span>
          </button>

          {/* Light */}
          <button 
            onClick={() => toggleOption('enableLight')} 
            className={`btn-unified ${options.enableLight ? 'text-amber-500' : ''}`}
          >
            {options.enableLight ? <Lightbulb size={24} /> : <LightbulbOff size={24} />}
            <span className="text-xs font-medium mt-1">{t.light}</span>
          </button>

          {/* Vibrate */}
          <button 
            onClick={() => toggleOption('enableVibrate')} 
            className={`btn-unified ${options.enableVibrate ? 'text-purple-600' : ''}`}
          >
            {options.enableVibrate ? <Zap size={24} /> : <ZapOff size={24} />}
            <span className="text-xs font-medium mt-1">{t.vibrate}</span>
          </button>

          {/* Configure */}
          <button 
            onClick={() => setShowConfigModal(true)} 
            className="btn-unified"
          >
            <Settings size={24} />
            <span className="text-xs font-medium mt-1">{t.configure}</span>
          </button>

          {/* Save */}
          <button 
            onClick={handleSaveAudio} 
            className="btn-unified"
          >
            <Download size={24} />
            <span className="text-xs font-medium mt-1">{t.save}</span>
          </button>

          {/* Share */}
          <button 
            onClick={handleShare} 
            className="btn-unified"
          >
            <Share2 size={24} />
            <span className="text-xs font-medium mt-1">{t.share}</span>
          </button>

        </div>
      </footer>

      {/* Configuration Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
            <div className="bg-slate-100 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-800">{t.configure}</h3>
              <button onClick={() => setShowConfigModal(false)} className="text-slate-500 hover:text-slate-800">
                ✕
              </button>
            </div>
            
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              
              {/* Sound Type */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 block">{t.soundType}</label>
                <select 
                  className="w-full p-2 border rounded-md"
                  value={config.soundType}
                  onChange={(e) => setConfig({...config, soundType: e.target.value as SoundType})}
                >
                  <option value={SoundType.CW}>CW Radio Tone</option>
                  <option value={SoundType.TELEGRAPH}>Telegraph Sounder</option>
                </select>
                <p className="text-xs text-slate-500">{t.desc_sound}</p>
              </div>

              {/* Pitch */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm font-bold text-slate-700">{t.pitch}</label>
                  <span className="text-sm text-morse-600 font-mono">{config.pitch} Hz</span>
                </div>
                <input 
                  type="range" min="200" max="1000" step="10" 
                  className="w-full accent-morse-600"
                  value={config.pitch}
                  onChange={(e) => setConfig({...config, pitch: Number(e.target.value)})}
                />
                <p className="text-xs text-slate-500">{t.desc_pitch}</p>
              </div>

               {/* Char Speed */}
               <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm font-bold text-slate-700">{t.charSpeed}</label>
                  <span className="text-sm text-morse-600 font-mono">{config.wpm} WPM</span>
                </div>
                <input 
                  type="range" min="5" max="60"
                  className="w-full accent-morse-600"
                  value={config.wpm}
                  onChange={(e) => setConfig({...config, wpm: Number(e.target.value)})}
                />
                <p className="text-xs text-slate-500">{t.desc_speed}</p>
              </div>

              {/* Farnsworth Speed */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm font-bold text-slate-700">{t.farnSpeed}</label>
                  <span className="text-sm text-morse-600 font-mono">{config.farnsworth} WPM</span>
                </div>
                <input 
                  type="range" min="5" max="60"
                  className="w-full accent-morse-600"
                  value={config.farnsworth}
                  onChange={(e) => setConfig({...config, farnsworth: Number(e.target.value)})}
                />
                <p className="text-xs text-slate-500">{t.desc_farn}</p>
              </div>

               {/* Alphabet */}
               <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 block">{t.alphabet}</label>
                <select 
                  className="w-full p-2 border rounded-md"
                  value={config.alphabet}
                  onChange={(e) => setConfig({...config, alphabet: e.target.value as AlphabetType})}
                >
                  <option value={AlphabetType.LATIN}>Latin (Standard)</option>
                </select>
                <p className="text-xs text-slate-500">{t.desc_alpha}</p>
              </div>

            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 text-right">
              <button 
                onClick={() => setShowConfigModal(false)}
                className="px-6 py-2 bg-morse-600 text-white rounded-lg hover:bg-morse-700 font-medium"
              >
                {t.close}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .btn-unified {
          @apply flex flex-col items-center justify-center p-2 rounded-xl transition-all text-slate-500 hover:text-slate-900 hover:bg-slate-50 min-w-[70px] sm:min-w-[80px];
        }
      `}</style>
    </div>
  );
}