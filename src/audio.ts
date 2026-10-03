import type { PlayState } from "./types.ts";

export type ResolvedAudio = {
  bgm: { id: string; url: string } | null;
  se: { id: string; url: string } | null;
  ambience: { id: string; url: string } | null;
};

const FADE_SEC = 0.7;

type LoopSlot = {
  asset: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
};

/**
 * BGM, ambience, and SE. Effects only: the script state says which asset is current.
 * AudioContext is created on the first unlock() after a user gesture.
 */
export class AudioMixer {
  unlocked = false;
  private ctx: AudioContext | null = null;
  private buses: Record<"bgm" | "se" | "ambience", GainNode> | null = null;
  private volumes = { bgm: 0.35, se: 0.55, ambience: 0.22 };
  private muted = { bgm: false, se: false, ambience: false };
  private bgm: LoopSlot | null = null;
  private ambience: LoopSlot | null = null;
  private bgmGen = 0;
  private ambienceGen = 0;
  private seGen = 0;
  private lastSe: string | null = null;
  private buffers = new Map<string, Promise<AudioBuffer>>();

  unlock(): void {
    if (this.unlocked) {
      void this.ctx?.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.connect(ctx.destination);
    const make = () => {
      const node = ctx.createGain();
      node.connect(master);
      return node;
    };
    this.buses = { bgm: make(), se: make(), ambience: make() };
    this.applyBusGains();
    this.unlocked = true;
    void ctx.resume();
  }

  setVolume(channel: "bgm" | "se" | "ambience", value: number): void {
    this.volumes[channel] = Math.min(1, Math.max(0, value));
    this.applyBusGains();
  }

  setMuted(channel: "bgm" | "se" | "ambience", muted: boolean): void {
    this.muted[channel] = muted;
    this.applyBusGains();
  }

  sync(desired: ResolvedAudio): void {
    if (!this.unlocked || !this.ctx || !this.buses) return;
    this.syncLoop("bgm", desired.bgm);
    this.syncLoop("ambience", desired.ambience);
    this.syncSe(desired.se);
  }

  private applyBusGains(): void {
    if (!this.buses || !this.ctx) return;
    const now = this.ctx.currentTime;
    for (const channel of ["bgm", "se", "ambience"] as const) {
      const level = this.muted[channel] ? 0 : this.volumes[channel];
      this.buses[channel].gain.setValueAtTime(level, now);
    }
  }

  private fadeSeconds(): number {
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return 0.01;
    }
    return FADE_SEC;
  }

  private load(url: string): Promise<AudioBuffer> {
    const cached = this.buffers.get(url);
    if (cached) return cached;
    const ctx = this.ctx;
    if (!ctx) return Promise.reject(new Error("audio not unlocked"));
    const pending = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`audio ${response.status}`);
        return response.arrayBuffer();
      })
      .then((bytes) => ctx.decodeAudioData(bytes));
    this.buffers.set(url, pending);
    pending.catch(() => {
      this.buffers.delete(url);
    });
    return pending;
  }

  private syncLoop(channel: "bgm" | "ambience", next: { id: string; url: string } | null): void {
    const current = channel === "bgm" ? this.bgm : this.ambience;
    if (!next) {
      if (current) this.fadeOut(channel, current);
      return;
    }
    if (current?.asset === next.id) return;
    const gen = channel === "bgm" ? ++this.bgmGen : ++this.ambienceGen;
    void this.load(next.url)
      .then((buffer) => {
        const still = channel === "bgm" ? this.bgmGen === gen : this.ambienceGen === gen;
        if (!still || !this.ctx || !this.buses) return;
        this.startLoop(channel, next.id, buffer);
      })
      .catch(() => {
        /* missing decode or blocked fetch: keep the previous bed */
      });
  }

  private startLoop(channel: "bgm" | "ambience", asset: string, buffer: AudioBuffer): void {
    const ctx = this.ctx;
    const buses = this.buses;
    if (!ctx || !buses) return;
    const previous = channel === "bgm" ? this.bgm : this.ambience;
    const fade = this.fadeSeconds();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + fade);
    gain.connect(buses[channel]);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    source.start();
    const slot: LoopSlot = { asset, source, gain };
    if (channel === "bgm") this.bgm = slot;
    else this.ambience = slot;
    if (previous) this.release(previous, fade);
  }

  private fadeOut(channel: "bgm" | "ambience", slot: LoopSlot): void {
    if (channel === "bgm") {
      this.bgm = null;
      this.bgmGen += 1;
    } else {
      this.ambience = null;
      this.ambienceGen += 1;
    }
    this.release(slot, this.fadeSeconds());
  }

  private release(slot: LoopSlot, fade: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    try {
      slot.gain.gain.cancelScheduledValues(now);
      slot.gain.gain.setValueAtTime(slot.gain.gain.value, now);
      slot.gain.gain.linearRampToValueAtTime(0, now + fade);
      slot.source.stop(now + fade + 0.05);
    } catch {
      /* already stopped */
    }
  }

  private syncSe(next: { id: string; url: string } | null): void {
    if (!next) {
      this.lastSe = null;
      this.seGen += 1;
      return;
    }
    if (this.lastSe === next.id) return;
    this.lastSe = next.id;
    const gen = ++this.seGen;
    void this.load(next.url)
      .then((buffer) => {
        if (this.seGen !== gen || this.lastSe !== next.id || !this.ctx || !this.buses) return;
        const ctx = this.ctx;
        const gain = ctx.createGain();
        gain.connect(this.buses.se);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(gain);
        source.start();
      })
      .catch(() => {
        /* one-shot failed */
      });
  }
}

export function resolveAudio(
  audio: PlayState["audio"],
  urlFor: (id: string) => string | null,
): ResolvedAudio {
  const one = (id: string | null) => {
    if (!id) return null;
    const url = urlFor(id);
    if (!url) return null;
    return { id, url };
  };
  return {
    bgm: one(audio.bgm),
    se: one(audio.se),
    ambience: one(audio.ambience),
  };
}
