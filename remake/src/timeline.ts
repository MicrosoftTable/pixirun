export class Timer {
  running = false;
  due = 0;
  listener: (() => void) | null = null;
  constructor(public delayMs: number) {}
  start(now: number) {
    this.running = true;
    this.due = now + this.delayMs;
  }
  stop() {
    this.running = false;
  }
  setListener(fn: (() => void) | null) {
    this.listener = fn;
  }
}

export class Timeline {
  frame = 1;
  playing = true;
  pending = false;
  constructor(
    public total: number,
    public onEnter: (f: number, tl: Timeline) => void,
  ) {}
  gotoAndPlay(f: number) {
    const same = f === this.frame;
    this.frame = f;
    this.playing = true;
    this.pending = !same;
  }
  gotoAndStop(f: number) {
    const same = f === this.frame;
    this.frame = f;
    this.playing = false;
    this.pending = !same;
  }
  stop() {
    this.playing = false;
  }
  advance() {
    if (this.pending) {
      this.pending = false;
      this.onEnter(this.frame, this);
      return;
    }
    if (!this.playing) return;
    this.frame = this.frame >= this.total ? 1 : this.frame + 1;
    this.onEnter(this.frame, this);
  }
}

export const PLAYER_STOPS = new Set([363, 398, 420, 446, 595, 635, 653, 871, 936]);
