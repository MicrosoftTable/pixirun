export class Keys {
  private map: Record<string, { cur: number; last: number }> = {};
  private codes: Record<number, string> = {
    32: 'SPACE',
    80: 'P',
    38: 'UP',
    40: 'DOWN',
    37: 'LEFT',
    39: 'RIGHT',
  };
  UP = false;
  DOWN = false;
  LEFT = false;
  RIGHT = false;
  SPACE = false;
  P = false;
  constructor() {
    for (const n of Object.values(this.codes)) this.map[n] = { cur: 0, last: 0 };
  }
  down(code: number) {
    const n = this.codes[code];
    if (!n) return false;
    const k = this.map[n];
    k.cur = k.cur > 0 ? 1 : 2;
    (this as any)[n] = true;
    return true;
  }
  up(code: number) {
    const n = this.codes[code];
    if (!n) return false;
    const k = this.map[n];
    k.cur = k.cur > 0 ? -1 : 0;
    (this as any)[n] = false;
    return true;
  }
  justPressed(n: string) {
    return this.map[n].cur === 2;
  }
  justReleased(n: string) {
    return this.map[n].cur === -1;
  }
  update() {
    // flxkeyboard.update
    for (const k of Object.values(this.map)) {
      if (k.last === -1 && k.cur === -1) k.cur = 0;
      else if (k.last === 2 && k.cur === 2) k.cur = 1;
      k.last = k.cur;
    }
  }
  reset() {
    for (const k of Object.values(this.map)) {
      k.cur = 0;
      k.last = 0;
    }
    this.UP = this.DOWN = this.LEFT = this.RIGHT = this.SPACE = false;
  }
}
