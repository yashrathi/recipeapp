import type { HousehelpLocale, SpeechToken } from "./types";

export interface SpeechRequest {
  locale: HousehelpLocale;
  text: string;
}

export interface SpeechAdapter {
  cancel(): void;
  probe(locale: HousehelpLocale): Promise<boolean>;
  speak(text: string, locale: HousehelpLocale): Promise<void>;
  alarm(): Promise<void>;
}

interface DeterministicSpeechMock {
  cancel(): void;
  probe(locale: HousehelpLocale): boolean | Promise<boolean>;
  speak(text: string, locale: HousehelpLocale): void | Promise<void>;
  alarm?(): void | Promise<void>;
}

declare global {
  interface Window {
    __HOUSEHELP_SPEECH_MOCK__?: DeterministicSpeechMock;
  }
}

function waitForVoices(synthesis: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const voices = synthesis.getVoices();
  if (voices.length > 0) return Promise.resolve(voices);

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      synthesis.removeEventListener("voiceschanged", onVoicesChanged);
      resolve(synthesis.getVoices());
    }, 1_000);
    function onVoicesChanged() {
      window.clearTimeout(timeout);
      synthesis.removeEventListener("voiceschanged", onVoicesChanged);
      resolve(synthesis.getVoices());
    }
    synthesis.addEventListener("voiceschanged", onVoicesChanged, { once: true });
  });
}

function compatibleVoice(voices: SpeechSynthesisVoice[], locale: HousehelpLocale) {
  const exact = voices.find((voice) => voice.lang.toLowerCase() === locale.toLowerCase());
  if (exact) return exact;
  const base = locale.slice(0, 2).toLowerCase();
  return voices.find((voice) => voice.lang.toLowerCase().startsWith(`${base}-`)) ?? null;
}

export class BrowserSpeechAdapter implements SpeechAdapter {
  private selectedVoices = new Map<HousehelpLocale, SpeechSynthesisVoice>();

  cancel(): void {
    if (window.__HOUSEHELP_SPEECH_MOCK__) {
      window.__HOUSEHELP_SPEECH_MOCK__.cancel();
      return;
    }
    window.speechSynthesis?.cancel();
  }

  async probe(locale: HousehelpLocale): Promise<boolean> {
    const mock = window.__HOUSEHELP_SPEECH_MOCK__;
    if (mock) return mock.probe(locale);
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return false;
    const voice = compatibleVoice(await waitForVoices(window.speechSynthesis), locale);
    if (!voice) return false;
    this.selectedVoices.set(locale, voice);
    return true;
  }

  async speak(text: string, locale: HousehelpLocale): Promise<void> {
    const mock = window.__HOUSEHELP_SPEECH_MOCK__;
    if (mock) {
      await mock.speak(text, locale);
      return;
    }

    const synthesis = window.speechSynthesis;
    const voice = this.selectedVoices.get(locale);
    if (!synthesis || !voice) throw new Error("no_compatible_voice");

    await new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = locale;
      utterance.voice = voice;
      let started = false;
      const noStartWatchdog = window.setTimeout(() => {
        if (!started) {
          synthesis.cancel();
          reject(new Error("synthesis_no_start"));
        }
      }, 3_000);
      const completionWatchdog = window.setTimeout(() => {
        synthesis.cancel();
        reject(new Error("synthesis_timeout"));
      }, Math.max(8_000, text.length * 180));

      utterance.onstart = () => {
        started = true;
        window.clearTimeout(noStartWatchdog);
      };
      utterance.onend = () => {
        window.clearTimeout(noStartWatchdog);
        window.clearTimeout(completionWatchdog);
        resolve();
      };
      utterance.onerror = (event) => {
        window.clearTimeout(noStartWatchdog);
        window.clearTimeout(completionWatchdog);
        reject(new Error(event.error || "synthesis_error"));
      };
      synthesis.speak(utterance);
    });
  }

  async alarm(): Promise<void> {
    const mock = window.__HOUSEHELP_SPEECH_MOCK__;
    if (mock?.alarm) {
      await mock.alarm();
      return;
    }
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = 740;
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, audioContext.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.42);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.45);
    await new Promise((resolve) => window.setTimeout(resolve, 460));
    await audioContext.close();
  }
}

export class SerializedSpeechQueue {
  constructor(private readonly adapter: SpeechAdapter) {}

  cancel(): void {
    this.adapter.cancel();
  }

  async play(
    requests: SpeechRequest[],
    token: SpeechToken,
    isCurrent: (token: SpeechToken) => boolean,
    playAlarmFirst = false,
  ): Promise<"completed" | "dropped" | "failed"> {
    this.adapter.cancel();
    try {
      if (playAlarmFirst) {
        if (!isCurrent(token)) return "dropped";
        await this.adapter.alarm();
      }
      for (const request of requests) {
        if (!isCurrent(token)) return "dropped";
        await this.adapter.speak(request.text, request.locale);
        if (!isCurrent(token)) return "dropped";
      }
      return "completed";
    } catch {
      return isCurrent(token) ? "failed" : "dropped";
    }
  }
}
