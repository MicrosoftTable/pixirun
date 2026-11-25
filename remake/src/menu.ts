import * as PIXI from 'pixi.js';
import { W, H } from './game';
import { VecAssets, VecClip } from './vec';
import { Save, FONT, Sys, Hud } from './hud';
import { SKINS, HATS } from './shop';
import { Tasks } from './tasks';
import { Audio } from './audio';
import type { LevelName } from './game';
import type { Shop } from './shop';
import { LEVEL_ORDER } from './game';

type Rect = [number, number, number, number];

const MAIN = 3475,
  OPT = 3540,
  MORE = 3509,
  MODE = 3309,
  SP = 3331,
  BACK = 3812,
  LV = 3411,
  TASKS = 3546,
  INSTR = 3712,
  CRED = 3736,
  FB = 3811;
const POS: Record<number, [number, number]> = {
  [MAIN]: [375.9, 133.6],
  [OPT]: [93.9, 363.6],
  [MORE]: [656.5, 369.9],
  [MODE]: [0.6, 0.8],
  [SP]: [0, 0],
  [LV]: [0, 0],
  [BACK]: [0, 0],
  [TASKS]: [-80.4, 225.5],
  [INSTR]: [0, 0],
  [CRED]: [0, 0],
  [FB]: [0, 0],
};
const ORDER = [MODE, SP, LV, MAIN, MORE, OPT, TASKS, INSTR, CRED, FB, BACK]; // root depth order
const LAST: Record<number, number> = {
  [MAIN]: 51,
  [OPT]: 53,
  [MORE]: 32,
  [MODE]: 54,
  [SP]: 45,
  [BACK]: 40,
  [LV]: 59,
  [TASKS]: 58,
  [INSTR]: 49,
  [CRED]: 38,
  [FB]: 45,
}; // fully shown frame
const SHOW: Record<number, [number, number]> = {
  [MAIN]: [2, 51],
  [OPT]: [2, 53],
  [MORE]: [2, 32],
  [MODE]: [2, 54],
  [SP]: [2, 45],
  [BACK]: [2, 40],
  [LV]: [2, 59],
  [TASKS]: [2, 58],
  [INSTR]: [2, 49],
  [CRED]: [2, 38],
  [FB]: [2, 45],
};
const HIDE: Record<number, [number, number]> = {
  [MAIN]: [52, 77],
  [OPT]: [54, 82],
  [MORE]: [33, 52],
  [MODE]: [55, 85],
  [SP]: [46, 69],
  [BACK]: [41, 60],
  [LV]: [60, 83],
  [TASKS]: [59, 75],
  [INSTR]: [50, 80],
  [CRED]: [39, 65],
  [FB]: [46, 67],
};
// nested clips the code leaves on a fixed frame locked buttons or hides
const LOCKED: Record<number, number | false> = { 158: 1, 3301: 3, 3305: 1, 3503: false };
const LOCKEDN = {};
const CARD_X = [86.6, 230.6, 374.6, 518.5, 661.5]; // level cards on the level select panel village ruins
const CARD_NAME = [
  'VillageBackground',
  'CaveBackground',
  'CastleBackground',
  'FactoryBackground',
  'RuinsBackground',
];
interface Spec {
  n: number;
  show?: number[];
  hide?: number[];
  shown?: number[];
}
const T: Record<string, Spec> = {
  title_in: { n: 52, show: [MAIN, OPT, MORE, TASKS] },
  title_hold: { n: 60, shown: [MAIN, OPT, MORE, TASKS] },
  title_out_mode: { n: 53, hide: [MAIN, OPT, MORE, TASKS], show: [MODE, BACK] },
  mode_hold: { n: 60, shown: [MODE, BACK] },
  mode_to_title: { n: 52, hide: [MODE, BACK], show: [MAIN, OPT, MORE, TASKS] },
  mode_to_sp: { n: 44, hide: [MODE], show: [SP], shown: [BACK] },
  sp_hold: { n: 60, shown: [SP, BACK] },
  sp_to_levels: { n: 58, hide: [SP], show: [LV], shown: [BACK] },
  shop_in: { n: 45, shown: [MAIN, OPT, MORE, TASKS], show: [BACK] },
  shop_hold: { n: 60, shown: [MAIN, OPT, MORE, TASKS, BACK] },
  shop_out: { n: 45, shown: [MAIN, OPT, MORE, TASKS], hide: [BACK] },
  levels_hold: { n: 60, shown: [LV, BACK] },
  levels_to_title: { n: 52, hide: [LV, BACK], show: [MAIN, OPT, MORE, TASKS] },
  instr_in: { n: 50, shown: [MAIN, OPT, MORE, TASKS], show: [INSTR, BACK] },
  instr_hold: { n: 60, shown: [MAIN, OPT, MORE, TASKS, INSTR, BACK] },
  instr_out: { n: 31, shown: [MAIN, OPT, MORE, TASKS], hide: [INSTR, BACK] },
  cred_in: { n: 37, shown: [MAIN, OPT, MORE, TASKS, INSTR, BACK], show: [CRED] },
  cred_hold: { n: 60, shown: [MAIN, OPT, MORE, TASKS, INSTR, CRED, BACK] },
  cred_out: { n: 27, shown: [MAIN, OPT, MORE, TASKS, INSTR, BACK], hide: [CRED] },
  wheel_in: { n: 45, shown: [MAIN, OPT, MORE, TASKS], show: [FB] },
  wheel_hold: { n: 60, shown: [MAIN, OPT, MORE, TASKS, FB] },
  wheel_out: { n: 22, shown: [MAIN, OPT, MORE, TASKS], hide: [FB] },
  wheelL_in: { n: 45, shown: [LV, BACK], show: [FB] },
  wheelL_hold: { n: 60, shown: [LV, BACK, FB] },
  wheelL_out: { n: 22, shown: [LV, BACK], hide: [FB] },
  sp_to_title: { n: 52, hide: [SP, BACK], show: [MAIN, OPT, MORE, TASKS] },
};

// menu drawn from the original mainmenu clip 3813 as vectors the panels run their show/hide ranges
// on the 45 hz tick and the background clip scrolls on its own 400-frame loop clicks are routed
// like menustate.as does
export class Menu {
  root = new PIXI.Container();
  private bg!: VecClip;
  private panels = new Map<number, VecClip>();
  state: 'busy' | 'title' | 'mode' | 'sp' | 'levels' | 'shop' | 'instr' | 'credits' | 'wheel' | 'wheelL' =
    'busy';
  slide = 1;
  onQuality: (() => void) | null = null;
  private shift = new PIXI.Container();
  private shop: Shop | null = null;
  private shiftTw = 0;
  private shiftDir = 0;
  shiftY = 0;
  private cur = '';
  private idx = 0;
  private loop = false;
  private next: (() => void) | null = null;
  private t = 0;
  onStart: ((level: LevelName, countingAsWin: boolean) => void) | null = null;
  onSurvival: (() => void) | null = null;
  onRunner: (() => void) | null = null;
  cursor = 'default';

  // button zones in stage space taken from the original hold frames
  private static BACK: Rect = [12, 10, 62, 60];
  private static Z: Record<string, Record<string, Rect>> = {
    title: {
      wheel: [69, 337, 242, 395],
      help: [13, 338, 64, 389],
      mute: [696, 6, 720, 31],
      quality: [722, 6, 747, 31],
      play: [264, 184, 478, 240],
      runner: [264, 246, 478, 292],
      shop: [264, 306, 478, 358],
    },
    instr: { fwd: [630, 174, 665, 271], back: [113, 174, 148, 271], credits: [587, 18, 743, 48] },
    credits: {},
    wheel: { exit: [12, 10, 62, 60], spin: [16, 15, 237, 231], buy: [632, 143, 736, 221] },
    wheelL: { exit: [12, 10, 62, 60], spin: [16, 15, 237, 231], buy: [632, 143, 736, 221] },
    mode: { single: [72, 95, 366, 310] },
    sp: { campaign: [148, 108, 603, 187], survival: [144.6, 198.2, 605.6, 279.2] },
    levels: {
      wheel: [560, 19, 611, 70],
      village: [18, 85, 155, 375],
      cave: [162, 85, 299, 375],
      castle: [306, 85, 443, 375],
      factory: [450, 85, 587, 375],
      ruins: [593, 85, 730, 375],
    },
  };

  async load(base: string, v: VecAssets) {
    await v.preload([3267, 3475, 3812]); // title screen first the other panels + wheel art stream in behind it
    v.preload([3813, 133, 3820]);
    this.bg = new VecClip(v, 3267);
    this.bg.position.set(1482.3, 200);
    this.root.addChild(this.bg, this.shift);
    for (const id of ORDER) {
      const c = new VecClip(v, id);
      c.relative = true;
      c.ctlId = LOCKED;
      c.position.set(...POS[id]);
      this.panels.set(id, c);
      (id === BACK ? this.root : this.shift).addChild(c);
    }
    this.initTasks();
    this.riskClip = new VecClip(v, 133);
    this.riskClip.relative = true;
    this.riskClip.visible = false; // game.riskf mpmessages
    this.buyClip = new VecClip(v, 3820);
    this.buyClip.relative = true; // buyspin
    this.root.addChild(this.riskClip, this.buyClip);
    this.drawBuy();
    this.play('title_in', false, () => this.hold('title_hold', 'title'));
  }

  // the shop page sits 500 px below the title panels menustate.showshop the menu tweens y to -500
  // while bg and back button stay
  attachShop(sh: Shop) {
    this.shop = sh;
    sh.root.y = 500;
    this.shift.addChild(sh.root);
  }
  private slideShop(dir: 1 | -1) {
    this.shiftDir = dir;
    this.shiftTw = 0;
  }
  // tasks panel tasksui 3546 real slides out on click the three task texts sit in real.container
  private realF = 1;
  private taskTx: PIXI.Text[] = [];
  private taskBox = new PIXI.Container();
  private initTasks() {
    Tasks.init();
    const pn = this.panels.get(TASKS)!;
    const pos = [
      [-68.3, -67.9],
      [-68.3, -18.1],
      [-68.3, 33.5],
    ];
    for (const [x, y] of pos) {
      const t = new PIXI.Text('', {
        fontFamily: FONT,
        fontSize: 18,
        fill: 0xdfbe99,
        wordWrap: true,
        wordWrapWidth: 168,
        align: 'left',
        lineHeight: 22,
      } as any);
      const st = t.style as any;
      st.stroke = 0x5d4328;
      st.strokeThickness = 4;
      st.lineJoin = 'round';
      t.position.set(x, y);
      this.taskBox.addChild(t);
      this.taskTx.push(t);
    }
    pn.mounts = { 'real.container': this.taskBox };
    // fbui.counter.spinnr guest always 0
    const sp = new PIXI.Text('0', { fontFamily: FONT, fontSize: 45, fill: 0xffffff, align: 'center' } as any);
    const ss = sp.style as any;
    ss.stroke = 0x5d4328;
    ss.strokeThickness = 6;
    ss.lineJoin = 'round';
    sp.anchor.set(0.5, 0);
    sp.position.set(-93.5 + 13.4, -94.8);
    const sb = new PIXI.Container();
    sb.addChild(sp);
    this.spinTx = sp;
    this.panels.get(FB)!.mounts = { counter: sb };
    this.refreshTasks();
  }
  refreshTasks() {
    Save.data.chosenTasks.forEach((t: any, i: number) => {
      if (this.taskTx[i]) this.taskTx[i].text = t.message;
    });
  }
  private stepReal() {
    // real show 2..20 stops hide 21..39 to frame 1
    if (this.realF >= 2 && this.realF < 20) this.realF++;
    else if (this.realF >= 21) {
      this.realF++;
      if (this.realF > 39) this.realF = 1;
    }
  }
  private tasksHit(x: number, y: number) {
    return this.realF === 1 ? this.inside(x, y, [0, 143, 30, 308]) : this.inside(x, y, [0, 143, 237, 308]);
  }

  // mega wheel menustate.globalwheelshow / enterframe the spin runs locally the server gate of the
  // original is skipped
  private riskClip!: VecClip;
  private buyClip!: VecClip;
  private popHud: Hud | null = null;
  private spinTx!: PIXI.Text;
  private wheelTurn = false;
  private wheelSpeed = 0;
  private wheelAcc = 0;
  private wheelRot = 0;
  private wheelClickT = 45;
  private leverOver = false;
  private leverHeld = false; // spin button 3810 up / over / down looks
  private riskF = 1;
  private riskMsg = 1;
  private buyF = 1; // game.riskf frame / framerisk buyspin frame
  attachPopup(h: Hud) {
    this.popHud = h;
    h.popupOnly();
    this.root.addChild(h.root);
  }
  // space closes the unlocked popup game.enterframe
  space() {
    if (this.popHud?.popupWaiting) this.popHud.hidePopup();
  }
  private popupBlocks() {
    return !!this.popHud && this.popHud.popupActive;
  }
  private showMessage(n: number) {
    this.riskMsg = n;
    this.riskF = 2;
  }
  private startSpin() {
    const d = Save.data;
    if (d.globalSpinsLeft >= 1 && !this.wheelTurn) {
      this.wheelTurn = true;
      d.globalSpinsLeft--;
      Save.flush();
      this.wheelAcc = 30 + Math.random() * 35;
      this.wheelSpeed = 0.3;
      Audio.sfx('WheelSpin');
    } else Audio.sfx('NotEnoughMoney');
  }
  private stepWheel() {
    this.spinTx.text = String(Save.data.globalSpinsLeft);
    if (this.riskF > 1) {
      this.riskF++;
      if (this.riskF > 120) this.riskF = 1;
    }
    if (this.buyF >= 31) {
      this.buyF++;
      if (this.buyF > 45) this.buyF = 1;
    } else if (this.buyF > 1 && this.buyF < 30) this.buyF++;
    this.riskClip.visible = this.riskF > 1;
    this.riskClip.ctl = { message: this.riskMsg };
    this.riskClip.setFrame(this.riskF, this.riskF);
    this.drawBuy();
    this.popHud?.stepPopup();
    if (!this.wheelTurn) return;
    if (this.wheelSpeed > 0) {
      if (this.wheelAcc > 0) {
        this.wheelSpeed += 0.5;
        this.wheelAcc--;
        if (this.wheelAcc < 0) {
          this.wheelAcc = 0;
          this.wheelSpeed += this.wheelAcc / 2;
        }
      }
      this.wheelSpeed -= this.wheelSpeed / 500 + 0.03;
      if (this.wheelSpeed < 0) this.wheelSpeed = 0;
      this.wheelRot += this.wheelSpeed;
      this.wheelClickT -= this.wheelSpeed;
      while (this.wheelClickT <= 0) {
        Audio.sfx('WheelClick');
        this.wheelClickT += 45;
      }
    }
    if (this.wheelSpeed === 0 && this.wheelAcc === 0) {
      this.wheelTurn = false;
      this.wheelResult();
    }
  }
  private drawBuy() {
    this.buyClip.visible = this.buyF > 1;
    this.buyClip.setFrame(this.buyF, this.buyF);
  }
  // which wheel segment sits under the fixed pointer segment outlines of wheel.collision sampled at
  // the pointer radius
  private wheelSegments(): string[] {
    const a = ((-this.wheelRot % 360) + 360) % 360,
      lo = a - 1.6,
      hi = a + 1.6;
    const SEG: [string, number, number][] = [
      ['hat', 45, 90],
      ['hat', 315, 360],
      ['skin', 90, 135],
      ['skin', 270, 315],
      ['secret', 241.5, 245.9],
      ['xp', 135, 180],
      ['gold', 0, 45],
      ['blue', 204.5, 208.9],
    ];
    const out: string[] = [];
    for (const [n, s, e] of SEG)
      for (const sh of [-360, 0, 360])
        if (lo + sh < e && hi + sh > s) {
          if (!out.includes(n)) out.push(n);
        }
    return out;
  }
  private wheelResult() {
    const d = Save.data as any,
      seg = this.wheelSegments(),
      h = this.popHud!;
    const pick = (all: [number, string, number][], have: any[]) => {
      const left = all.filter(e => !have.some(x => x[1] === e[1]));
      return left.length ? left[Math.floor(left.length * Math.random())] : null;
    };
    if (seg.includes('hat')) {
      const it = pick(HATS, d.hatsUnlocked);
      if (it) {
        d.hatsUnlocked.push([it[0], it[1], it[2]]);
        Save.flush();
        h.showUnlock(33, { item: it });
      } else this.showMessage(3);
    } else if (seg.includes('skin')) {
      const it = pick(SKINS, d.skinsUnlocked);
      if (it) {
        if (it[0] === 40) d.hatsUnlocked.push([17, 'Bonus1', 0]);
        if (it[0] === 41) d.hatsUnlocked.push([18, 'Bonus2', 0]);
        if (it[0] === 59) d.hatsUnlocked.push([33, 'Bonus3', 0]);
        d.skinsUnlocked.push([it[0], it[1], it[2]]);
        Save.flush();
        h.showUnlock(32, { item: it });
      } else this.showMessage(2);
    } else if (seg.includes('secret')) {
      if (!d.purpleAwesome) {
        h.showUnlock(34);
        d.hatsUnlocked.push([38, 'Pur Hat', 0]);
        d.skinsUnlocked.push([66, 'Purdaze', 0]);
        d.trailsUnlocked.push([31, 'Purdaze', 0]);
        d.coins += 2000;
        d.purpleAwesome = true;
        Save.addXP(2000);
        Save.flush();
      } else this.showMessage(4);
    } else if (seg.includes('xp')) {
      const amt = d.xpLevel < 30 ? d.xpLevel * 80 : 4500;
      h.showUnlock(54, { amount: amt });
      Save.addXP(amt);
    } else if (seg.includes('gold')) {
      const amt = Math.floor(Math.random() * 7001) + 3000;
      h.showUnlock(53, { amount: amt });
      d.coins += amt;
      Save.flush();
    } else if (seg.includes('blue')) {
      const amt = Math.floor(Math.random() * 11) + 10;
      h.showUnlock(55, { amount: amt });
      d.blueCoins += amt;
      Save.flush();
    } else {
      Audio.sfx('Lose');
      this.showMessage(1);
    }
  }
  // mega wheel panel fbui 3811
  // offline the wheel cant spin it needs the server so only the counter page is shown
  private openWheel(fromLevels: boolean) {
    const d = Save.data;
    while (d.taskDone >= 3) {
      d.globalSpinsLeft++;
      d.taskDone -= 3;
      Save.flush();
    }
    this.go(
      fromLevels ? 'wheelL_in' : 'wheel_in',
      fromLevels ? 'wheelL_hold' : 'wheel_hold',
      fromLevels ? 'wheelL' : 'wheel',
    );
  }
  private fbTasks(): Record<string, number> {
    const n = Save.data.taskDone;
    return { task1: n >= 1 ? 2 : 1, task2: n >= 2 ? 2 : 1, task3: 1 };
  }
  private survivalOpen() {
    return Save.data.currentLevel > 1 || Save.data.xpLevel > 1;
  }
  // menustate re-entered from a finished run
  private unlockCard = -1;
  private unlockT0 = 0;
  // anim = menustate _showanimation the frontier level card plays its unlock frame 4 with the
  // 215-frame bg animation
  showAfterGame(levels: boolean, anim = false) {
    const cur = Save.data.currentLevel - 1;
    this.unlockCard = levels && anim && cur >= 1 && cur < CARD_NAME.length ? cur : -1;
    this.unlockT0 = this.t;
    this.refreshTasks();
    if (levels) this.hold('levels_hold', 'levels');
    else this.hold('title_hold', 'title');
  }

  private play(name: string, loop: boolean, then: (() => void) | null) {
    this.cur = name;
    this.idx = 0;
    this.loop = loop;
    this.next = then;
    this.draw();
  }
  private hold(name: string, st: Menu['state']) {
    this.state = st;
    this.play(name, true, null);
  }
  private go(name: string, hold: string, st: Menu['state']) {
    this.state = 'busy';
    this.play(name, false, () => this.hold(hold, st));
  }
  private draw() {
    const sp = T[this.cur],
      i = this.idx;
    this.bg.setFrame((this.t % 400) + 1);
    for (const id of ORDER) {
      let f = 1;
      if (sp.shown?.includes(id)) f = LAST[id];
      else if (sp.show?.includes(id)) f = Math.min(SHOW[id][0] + i, SHOW[id][1]);
      else if (sp.hide?.includes(id)) f = Math.min(HIDE[id][0] + i, HIDE[id][1]);
      const pn = this.panels.get(id)!;
      if (id === LV) {
        const cur = Save.data.currentLevel - 1;
        pn.ctl = Object.fromEntries(
          CARD_NAME.map((n, k) => [n, k === this.unlockCard ? 4 : k <= cur ? 1 : 3]),
        );
        pn.sub =
          this.unlockCard >= 0
            ? { [CARD_NAME[this.unlockCard]]: { bg: Math.min(215, this.t - this.unlockT0 + 1) } }
            : {};
      }
      if (id === TASKS) pn.ctl = { real: this.realF, task1: false, task2: false, task3: false };
      if (id === FB) {
        pn.ctl = { arrow: 1, spinnr: false, counter: 1, ...this.fbTasks() };
        pn.rot = { 'wheel.wheel': this.wheelRot };
        pn.ctlId = { ...LOCKED, 3810: this.leverHeld && this.leverOver ? 3 : this.leverOver ? 2 : 1 };
      }
      if (id === OPT) pn.ctl = { ...LOCKEDN, mute_off: Sys.muted ? 1 : false };
      if (id === INSTR) {
        const c: Record<string, number | false> = { slides: this.slide };
        if (this.slide <= 1) c.back = false;
        if (this.slide >= 5) c.forward = false;
        pn.ctl = c;
      }
      if (id === SP) pn.ctl = this.survivalOpen() ? { locked: false } : {};
      pn.setFrame(f, this.t);
    }
  }

  // one 45 hz tick
  step() {
    this.t++;
    this.stepReal();
    if (this.shiftDir) {
      this.shiftTw++;
      const k = Math.min(1, this.shiftTw / 45),
        e = 1 - (1 - k) * (1 - k);
      this.shiftY = this.shiftDir === 1 ? -500 * e : -500 * (1 - e);
      this.shift.y = this.shiftY;
      if (k >= 1) this.shiftDir = 0;
    }
    if (this.shop && (this.state === 'shop' || this.shiftY < 0)) this.shop.step();
    this.stepWheel();
    const sp = T[this.cur];
    if (!sp) return;
    if (this.idx + 1 < sp.n) this.idx++;
    else if (this.loop) this.idx = 0;
    else if (this.next) {
      const f = this.next;
      this.next = null;
      f();
      return;
    }
    this.draw();
  }

  private inside(x: number, y: number, r: Rect) {
    return x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
  }
  private backHit(x: number, y: number) {
    const [a, b, c, d] = Menu.BACK;
    const cx = (a + c) / 2,
      cy = (b + d) / 2;
    return Math.hypot(x - cx, y - cy) <= 26;
  }

  hover(x: number, y: number) {
    if (this.popHud) {
      this.popHud.point(x, y);
      if (this.popHud.popupActive) {
        this.cursor = this.popHud.overOk(x, y) ? 'pointer' : 'default';
        return;
      }
    }
    if (this.buyF > 1) {
      this.cursor =
        this.buyF >= 20 &&
        this.buyF < 31 &&
        (this.inside(x, y, [258, 259, 365, 294]) || this.inside(x, y, [385, 259, 492, 294]))
          ? 'pointer'
          : 'default';
      return;
    }
    if (this.state === 'shop' && this.shop && !this.shiftDir) {
      this.shop.hover(x, y - 500 - this.shiftY);
      this.cursor = this.shop.cursor === 'pointer' || this.backHit(x, y) ? 'pointer' : 'default';
      return;
    }
    this.leverOver =
      (this.state === 'wheel' || this.state === 'wheelL') &&
      this.inside(x, y, Menu.Z[this.state].spin) &&
      !this.backHit(x, y);
    const z = Menu.Z[this.state];
    let hit = false;
    if (z) for (const r of Object.values(z)) if (this.inside(x, y, r)) hit = true;
    if (this.state !== 'title' && this.state !== 'busy' && this.backHit(x, y)) hit = true;
    if (this.state === 'title' && this.tasksHit(x, y)) hit = true;
    this.cursor = hit ? 'pointer' : 'default';
  }

  // mouse released a simplebutton fires click only when released over itself
  release(x: number, y: number) {
    if (!this.leverHeld) return;
    this.leverHeld = false;
    this.leverOver =
      (this.state === 'wheel' || this.state === 'wheelL') &&
      this.inside(x, y, Menu.Z[this.state].spin) &&
      !this.backHit(x, y);
    if (this.leverOver && !this.popupBlocks() && this.buyF <= 1) this.startSpin();
  }
  click(x: number, y: number) {
    // game.unlockedscreen / buyspin sit on top of everything
    if (this.popHud?.popupActive) {
      if (this.popHud.popupWaiting && this.popHud.overOk(x, y)) this.popHud.hidePopup();
      return;
    }
    if (this.buyF > 1) {
      if (this.buyF >= 20 && this.buyF < 31) {
        if (this.inside(x, y, [258, 259, 365, 294])) {
          // menustate.wanttobuyspins 10 blue coins for one spin
          const d = Save.data;
          if (d.blueCoins >= 10) {
            d.blueCoins -= 10;
            d.globalSpinsLeft++;
            Save.flush();
            this.buyF = 31;
          }
        } else if (this.inside(x, y, [385, 259, 492, 294])) this.buyF = 31;
      }
      return;
    }
    if ((this.state === 'wheel' || this.state === 'wheelL') && Menu.Z[this.state]) {
      const zz = Menu.Z[this.state];
      if (this.inside(x, y, zz.spin) && !this.backHit(x, y)) {
        this.leverHeld = true;
        return;
        // simplebutton down look while held click the spin fires on release // the back button sits
        // inside the levers zone
      }
      if (this.inside(x, y, zz.buy)) {
        this.buyF = 2;
        Audio.sfx('ClickSmall');
        return;
      }
    }
    {
      // menustate click sounds clickbig on play / single player / level cards clickplank on shop
      // runner campaign survival clicksmall elsewhere
      const Z = Menu.Z[this.state],
        on = (k: string) => !!Z && !!Z[k] && this.inside(x, y, Z[k]);
      const big =
        (this.state === 'title' && on('play')) ||
        (this.state === 'mode' && on('single')) ||
        (this.state === 'levels' && LEVEL_ORDER.some(l => on(l)));
      const plank =
        (this.state === 'title' && (on('shop') || on('runner'))) ||
        (this.state === 'sp' && (on('campaign') || on('survival')));
      Audio.sfx(big ? 'ClickBig' : plank ? 'ClickPlank' : 'ClickSmall');
    }
    const z = Menu.Z[this.state];
    const hit = (k: string) => z && this.inside(x, y, z[k]);
    switch (this.state) {
      case 'title':
        if (this.tasksHit(x, y)) {
          if (this.realF === 1) this.realF = 2;
          else if (this.realF >= 19 && this.realF < 21) this.realF = 21;
        } else if (hit('play')) this.go('title_out_mode', 'mode_hold', 'mode');
        else if (hit('runner') && this.onRunner) this.onRunner();
        else if (hit('wheel')) this.openWheel(false);
        else if (hit('help')) {
          this.slide = 1;
          this.go('instr_in', 'instr_hold', 'instr');
        } else if (hit('mute')) Sys.muted = !Sys.muted;
        else if (hit('quality') && this.onQuality) this.onQuality();
        else if (hit('shop') && this.shop) {
          this.shop.open();
          this.slideShop(1);
          this.go('shop_in', 'shop_hold', 'shop');
        }
        break;
      case 'instr':
        if (this.backHit(x, y)) this.go('instr_out', 'title_hold', 'title');
        else if (hit('credits')) this.go('cred_in', 'cred_hold', 'credits');
        else if (hit('fwd') && this.slide < 5) this.slide++;
        else if (hit('back') && this.slide > 1) this.slide--;
        break;
      case 'wheel':
      case 'wheelL':
        if (this.backHit(x, y))
          this.go(
            this.state === 'wheel' ? 'wheel_out' : 'wheelL_out',
            this.state === 'wheel' ? 'title_hold' : 'levels_hold',
            this.state === 'wheel' ? 'title' : 'levels',
          );
        break;
      case 'credits':
        if (this.backHit(x, y)) this.go('cred_out', 'instr_hold', 'instr');
        break;
      case 'shop':
        if (this.shiftDir) break;
        if (this.backHit(x, y) && !this.shop!.blocking) {
          this.slideShop(-1);
          this.go('shop_out', 'title_hold', 'title');
        } else this.shop!.click(x, y - 500 - this.shiftY);
        break;
      case 'mode':
        if (this.backHit(x, y)) this.go('mode_to_title', 'title_hold', 'title');
        else if (hit('single')) this.go('mode_to_sp', 'sp_hold', 'sp');
        break;
      case 'sp':
        if (this.backHit(x, y)) this.go('sp_to_title', 'title_hold', 'title');
        else if (hit('campaign')) this.go('sp_to_levels', 'levels_hold', 'levels');
        else if (hit('survival') && this.survivalOpen() && this.onSurvival) this.onSurvival();
        break;
      case 'levels':
        if (hit('wheel')) this.openWheel(true);
        else if (this.backHit(x, y)) this.go('levels_to_title', 'title_hold', 'title');
        else if (this.onStart) {
          const cur = Save.data.currentLevel - 1;
          LEVEL_ORDER.forEach((l, k) => {
            if (hit(l) && k <= cur) this.onStart!(l, k === cur);
          });
        }
        break;
    }
  }
}
export { W, H };
