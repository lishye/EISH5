import { MorseDictionary, AppConfig, SoundType, AlphabetType } from './types';

// International Morse Code
export const MORSE_MAP: MorseDictionary = {
  'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.',
  'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..',
  'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.',
  'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-',
  'Y': '-.--', 'Z': '--..',
  '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....',
  '6': '-....', '7': '--...', '8': '---..', '9': '----.', '0': '-----',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--',
  '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...',
  ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '_': '..--.-',
  '"': '.-..-.', '$': '...-..-', '@': '.--.-.'
};

export const REVERSE_MORSE_MAP: MorseDictionary = Object.entries(MORSE_MAP).reduce(
  (acc, [char, code]) => ({ ...acc, [code]: char }), 
  {}
);

export const DEFAULT_CONFIG: AppConfig = {
  wpm: 20,
  farnsworth: 20,
  pitch: 550,
  volume: 80,
  soundType: SoundType.CW,
  alphabet: AlphabetType.LATIN
};

export const UI_STRINGS = {
  en: {
    title: "EISH5 Morse Translator",
    input: "Input",
    output: "Output",
    speed: "Speed",
    pitch: "Pitch",
    volume: "Volume",
    play: "Play",
    pause: "Pause",
    stop: "Stop",
    repeat: "Repeat",
    sound: "Sound",
    light: "Light",
    vibrate: "Vibrate",
    save: "Save Audio",
    share: "Share",
    configure: "Configure",
    settings: "Settings",
    close: "Close",
    soundType: "Sound Type",
    charSpeed: "Character Speed (WPM)",
    farnSpeed: "Farnsworth Speed",
    alphabet: "Alphabet",
    desc_sound: "Choose between modern CW beep or classic Telegraph clicks.",
    desc_pitch: "Frequency in Hz. 550Hz is standard.",
    desc_vol: "Output volume.",
    desc_speed: "Standard word speed based on 'PARIS'.",
    desc_farn: "Lengthens gaps between letters/words to help learning.",
    desc_alpha: "Character set mapping."
  },
  cn: {
    title: "EISH5 摩尔斯电码翻译器",
    input: "输入",
    output: "输出",
    speed: "速度",
    pitch: "音调",
    volume: "音量",
    play: "播放",
    pause: "暂停",
    stop: "停止",
    repeat: "循环",
    sound: "声音",
    light: "闪光",
    vibrate: "震动",
    save: "保存音频",
    share: "分享",
    configure: "配置",
    settings: "设置",
    close: "关闭",
    soundType: "声音类型",
    charSpeed: "字符速度 (WPM)",
    farnSpeed: "Farnsworth 速度",
    alphabet: "字母表",
    desc_sound: "选择现代无线电音或经典电报敲击声。",
    desc_pitch: "频率(Hz)。550Hz为标准值。",
    desc_vol: "输出音量。",
    desc_speed: "基于标准词'PARIS'的速度。",
    desc_farn: "延长字符和单词间的间隔，有助于学习。",
    desc_alpha: "字符映射集。"
  }
};