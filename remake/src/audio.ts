import { Sys } from './hud';

// soundplayer com/noor/soundplayer.as six background loops start together and stay in sync
// enterarea fades the chosen one up to 1 and the rest down to 0 over 3 + delay seconds
// effects are one-shots soundplayer.playsoundeffect
// game.mute silences everything
export type Music = 'Village' | 'Caves' | 'Castle' | 'Factory' | 'Ruins' | 'MenuSound';
const LOOPS: Music[] = ['Castle', 'Caves', 'Factory', 'MenuSound', 'Ruins', 'Village'];

class AudioHub {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private bufs = new Map<string, Promise<AudioBuffer>>();
  private loops = new Map<Music, { src: AudioBufferSourceNode; gain: GainNode }>();
  private duck = 1; // soundplayer.soundvolume 1 normally 0.3 while the game-over screen is up
  private down = false;
  private started = false;

  // must run inside a user gesture browsers keep the audiocontext suspended until then
  unlock() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.started) this.startLoops();
  }
  private load(name: string): Promise<AudioBuffer> {
    let p = this.bufs.get(name);
    if (!p) {
      p = fetch('./audio/' + name + '.mp3')
        .then(r => r.arrayBuffer())
        .then(b => this.ctx!.decodeAudioData(b));
      this.bufs.set(name, p);
    }
    return p;
  }
  private startLoops() {
    if (!this.ctx) return;
    this.started = true;
    const t0 = this.ctx.currentTime + 0.1;
    for (const n of LOOPS) {
      this.load(n).then(buf => {
        const src = this.ctx!.createBufferSource(),
          gain = this.ctx!.createGain();
        src.buffer = buf;
        src.loop = true;
        src.connect(gain);
        gain.connect(this.master);
        gain.gain.value = n === 'MenuSound' ? 1 : 0;
        src.start(t0);
        this.loops.set(n, { src, gain });
      });
    }
  }
  // soundplayer.enterarea crossfade to one track over 3 + delay seconds
  enterArea(name: Music, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime,
      d = 3 + delay;
    for (const [n, l] of this.loops) {
      const g = l.gain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(n === name ? 1 : 0, t + d);
    }
  }
  // soundplayer.tweendown / the 1 s volume tween back up
  setDown(on: boolean) {
    this.down = on;
  }
  // one-shot effect soundplayer.playsoundeffect
  sfx(name: string, vol = 1) {
    if (!this.ctx || Sys.muted) return;
    this.load(name)
      .then(buf => {
        const src = this.ctx!.createBufferSource(),
          g = this.ctx!.createGain();
        src.buffer = buf;
        g.gain.value = vol;
        src.connect(g);
        g.connect(this.master);
        src.start();
      })
      .catch(() => {
        /* missing file: stay silent */
      });
  }
  // call once per 45 hz tick ducking and the mute switch
  step() {
    if (!this.ctx) return;
    const target = this.down ? 0.3 : 1;
    this.duck += (target - this.duck) * 0.04; // ~1 s tweenmax eased
    this.master.gain.value = Sys.muted ? 0 : this.duck;
  }
}
export const Audio = new AudioHub();
