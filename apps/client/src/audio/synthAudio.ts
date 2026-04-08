import { AUDIO_CONFIG } from "../config/gameConfig";

type MusicKey = keyof typeof AUDIO_CONFIG.music;
type SfxKey = keyof typeof AUDIO_CONFIG.sfx;

interface TrackPattern {
  bpm: number;
  lead: number[];
  bass: number[];
  chord: number[];
}

const TRACKS: Record<string, TrackPattern> = {
  menu: {
    bpm: 96,
    lead: [440, 523.25, 659.25, 523.25],
    bass: [110, 130.81, 146.83, 130.81],
    chord: [261.63, 329.63, 392, 329.63]
  },
  soloCompetitive: {
    bpm: 116,
    lead: [523.25, 659.25, 783.99, 659.25, 587.33, 659.25],
    bass: [130.81, 146.83, 164.81, 174.61, 164.81, 146.83],
    chord: [261.63, 329.63, 392, 440, 392, 329.63]
  },
  soloParty: {
    bpm: 104,
    lead: [523.25, 587.33, 659.25, 783.99, 659.25, 587.33],
    bass: [196, 220, 246.94, 220, 196, 174.61],
    chord: [392, 440, 493.88, 523.25, 493.88, 440]
  },
  multiCompetitive: {
    bpm: 122,
    lead: [659.25, 783.99, 698.46, 880, 783.99, 659.25],
    bass: [130.81, 123.47, 146.83, 110, 130.81, 164.81],
    chord: [329.63, 392, 440, 493.88, 440, 392]
  },
  multiParty: {
    bpm: 110,
    lead: [587.33, 659.25, 698.46, 783.99, 698.46, 659.25],
    bass: [146.83, 174.61, 196, 174.61, 164.81, 146.83],
    chord: [349.23, 392, 440, 493.88, 523.25, 493.88]
  },
  result: {
    bpm: 88,
    lead: [523.25, 659.25, 783.99, 1046.5, 783.99, 659.25],
    bass: [130.81, 164.81, 196, 220, 196, 164.81],
    chord: [261.63, 392, 523.25, 659.25, 523.25, 392]
  }
};

const SFX_FREQUENCIES: Record<string, number[]> = {
  countdown: [880, 784, 659],
  eat: [659.25, 783.99, 987.77],
  pickup: [493.88, 587.33, 739.99],
  invincibleStart: [523.25, 659.25, 783.99],
  invincibleEnd: [783.99, 659.25, 523.25],
  death: [246.94, 196, 146.83],
  victory: [523.25, 659.25, 1046.5],
  uiClick: [440, 523.25]
};

export class SynthAudio {
  private context?: AudioContext;
  private masterGain?: GainNode;
  private musicGain?: GainNode;
  private sfxGain?: GainNode;
  private currentTimer?: number;
  private currentStep = 0;
  private currentTrack?: MusicKey;
  private desiredTrack?: MusicKey;
  private unlocked = false;

  unlock(): void {
    if (this.context && this.context.state === "suspended") {
      void this.context.resume();
    }
    if (this.unlocked) {
      return;
    }
    const context = new AudioContext();
    this.context = context;
    this.masterGain = context.createGain();
    this.musicGain = context.createGain();
    this.sfxGain = context.createGain();
    this.musicGain.connect(this.masterGain);
    this.sfxGain.connect(this.masterGain);
    this.masterGain.connect(context.destination);
    this.setVolume(AUDIO_CONFIG.volume.master, AUDIO_CONFIG.volume.music, AUDIO_CONFIG.volume.sfx);
    this.unlocked = true;
    if (this.desiredTrack) {
      this.startTrack(this.desiredTrack);
    }
  }

  setVolume(master: number, music: number, sfx: number): void {
    if (!this.masterGain || !this.musicGain || !this.sfxGain) {
      return;
    }
    this.masterGain.gain.value = master;
    this.musicGain.gain.value = music;
    this.sfxGain.gain.value = sfx;
  }

  playMusic(track: MusicKey): void {
    this.desiredTrack = track;
    if (!this.unlocked) {
      return;
    }
    if (this.currentTrack === track && this.currentTimer) {
      return;
    }
    this.startTrack(track);
  }

  private startTrack(track: MusicKey): void {
    if (!this.context || !this.musicGain) {
      return;
    }
    this.stopMusic(false);
    const pattern = TRACKS[AUDIO_CONFIG.music[track]];
    if (!pattern) {
      return;
    }
    this.currentTrack = track;
    const beatMs = 60000 / pattern.bpm;
    this.currentTimer = window.setInterval(() => {
      this.playBeat(pattern, this.currentStep);
      this.currentStep = (this.currentStep + 1) % pattern.lead.length;
    }, beatMs);
    this.playBeat(pattern, 0);
    this.currentStep = 1;
  }

  stopMusic(clearDesiredTrack = true): void {
    if (this.currentTimer) {
      window.clearInterval(this.currentTimer);
      this.currentTimer = undefined;
    }
    this.currentTrack = undefined;
    this.currentStep = 0;
    if (clearDesiredTrack) {
      this.desiredTrack = undefined;
    }
  }

  playSfx(name: SfxKey): void {
    this.unlock();
    if (!this.context || !this.sfxGain) {
      return;
    }
    const pattern = SFX_FREQUENCIES[AUDIO_CONFIG.sfx[name]];
    if (!pattern) {
      return;
    }
    pattern.forEach((frequency, index) => {
      const start = this.context!.currentTime + index * 0.06;
      const oscillator = this.context!.createOscillator();
      const gain = this.context!.createGain();
      oscillator.type = index === 0 ? "square" : "triangle";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
      oscillator.connect(gain);
      gain.connect(this.sfxGain!);
      oscillator.start(start);
      oscillator.stop(start + 0.22);
    });
  }

  private playBeat(pattern: TrackPattern, index: number): void {
    if (!this.context || !this.musicGain) {
      return;
    }
    const beatMs = 60000 / pattern.bpm;
    const start = this.context.currentTime;
    const lead = this.context.createOscillator();
    const leadGain = this.context.createGain();
    const bass = this.context.createOscillator();
    const bassGain = this.context.createGain();
    const pad = this.context.createOscillator();
    const padGain = this.context.createGain();

    lead.type = "triangle";
    bass.type = "sawtooth";
    pad.type = "sine";

    lead.frequency.setValueAtTime(pattern.lead[index % pattern.lead.length], start);
    bass.frequency.setValueAtTime(pattern.bass[index % pattern.bass.length], start);
    pad.frequency.setValueAtTime(pattern.chord[index % pattern.chord.length], start);

    leadGain.gain.setValueAtTime(0.001, start);
    bassGain.gain.setValueAtTime(0.001, start);
    padGain.gain.setValueAtTime(0.001, start);

    leadGain.gain.exponentialRampToValueAtTime(0.11, start + 0.02);
    leadGain.gain.exponentialRampToValueAtTime(0.001, start + beatMs / 1000 * 0.48);
    bassGain.gain.exponentialRampToValueAtTime(0.08, start + 0.02);
    bassGain.gain.exponentialRampToValueAtTime(0.001, start + beatMs / 1000 * 0.55);
    padGain.gain.exponentialRampToValueAtTime(0.05, start + 0.03);
    padGain.gain.exponentialRampToValueAtTime(0.001, start + beatMs / 1000 * 0.6);

    lead.connect(leadGain);
    bass.connect(bassGain);
    pad.connect(padGain);
    leadGain.connect(this.musicGain);
    bassGain.connect(this.musicGain);
    padGain.connect(this.musicGain);

    lead.start(start);
    bass.start(start);
    pad.start(start);
    lead.stop(start + beatMs / 1000 * 0.55);
    bass.stop(start + beatMs / 1000 * 0.62);
    pad.stop(start + beatMs / 1000 * 0.7);
  }

  dispose(): void {
    this.stopMusic();
    if (this.context) {
      void this.context.close();
      this.context = undefined;
    }
    this.unlocked = false;
  }
}
