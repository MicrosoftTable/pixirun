import { Audio } from './audio';
import * as PIXI from 'pixi.js';
import { loadImage } from './game';
import { VecAssets, VecClip, VecShape } from './vec';
import type { Look } from './rig';
import UNLOCKS from './unlocks.json';
import ALL from './allunlocks.json';
export { ALL };

interface Rec {
  p: number;
  x: number;
  y: number;
  w: number;
  h: number;
  ox: number;
  oy: number;
}
type Seq = (Rec | null)[];
type Rect = [number, number, number, number];

// session-wide switches game.mute stage.quality
export const Sys = { muted: false, quality: 0 };
export const FONT = "'Double N', Arial";
const XP_LEVELS = [
  0, 200, 500, 900, 1400, 2000, 2700, 3500, 4400, 5400, 6500, 7700, 9000, 10400, 11900, 13500, 15200, 17000,
  18900, 20900, 23000, 25200, 27500, 29900, 32400, 35000, 37700, 40500, 43400, 46400, 50000,
];
while (XP_LEVELS.length < 999) XP_LEVELS.push(XP_LEVELS[XP_LEVELS.length - 1] + 7000);

// persistent save original sharedobject savedata
export interface SaveData {
  coins: number;
  xp: number;
  xpLevel: number;
  currentLevel: number;
  parts: number[];
  skinsUnlocked: [number, string, number][];
  hatsUnlocked: [number, string, number][];
  trailsUnlocked: [number, string, number][];
  matchesWon: number;
  matchesLost: number;
  coopHighScore: number;
  distanceRan: number;
  tasksUnlocked: number;
  moneySpent: number;
  ticksPlayed: number;
  time: number;
  konami: boolean;
  blueCoins: number;
  mtxOwned: string[];
  rainbowTrail: boolean;
  flamingHat: boolean;
  nostalgia: boolean;
  swapper: boolean;
  lightGoggles: boolean;
  finalUnlock: boolean;
  tutorialShow: number;
  tasksList: any[];
  chosenTasks: any[];
  taskDone: number;
  globalSpinsLeft: number;
}
const LEVEL_COINS: Record<number, number> = {
  8: 600,
  11: 700,
  13: 800,
  17: 1000,
  21: 1200,
  23: 1400,
  25: 1700,
  27: 2000,
  29: 2300,
};
export const Save = {
  data: ((): SaveData => {
    const d: SaveData = {
      coins: 0,
      xp: 0,
      xpLevel: 1,
      currentLevel: 1,
      parts: [0, 0, 0, 0, 0, 0, 0],
      skinsUnlocked: [
        [1, 'Whitner', 0],
        [2, 'Punker', 0],
        [3, 'Rock', 0],
        [4, 'Tekimime', 0],
      ],
      hatsUnlocked: [
        [1, 'Nothing', 0],
        [2, 'Halo', 50],
      ],
      trailsUnlocked: [
        [1, 'Nothing', 0],
        [28, 'Luck', 0],
      ],
      matchesWon: 0,
      matchesLost: 0,
      coopHighScore: 0,
      distanceRan: 0,
      tasksUnlocked: 0,
      moneySpent: 0,
      ticksPlayed: 0,
      time: 1,
      konami: false,
      blueCoins: 999999,
      mtxOwned: [],
      rainbowTrail: false,
      flamingHat: false,
      nostalgia: false,
      swapper: false,
      lightGoggles: false,
      finalUnlock: false,
      tutorialShow: 10,
      tasksList: [],
      chosenTasks: [],
      taskDone: 0,
      globalSpinsLeft: 3,
    };
    try {
      Object.assign(d, JSON.parse(localStorage.getItem('kr2save') || '{}'));
    } catch (e) {
      /* storage unavailable */
    }
    // everything is unlocked for now, open the game with ?unlockall to get all costumes hats and trails
    const unlockAll = typeof location !== 'undefined' && /[?&]unlockall/.test(location.search);
    if (unlockAll)
      for (const [key, list] of [
        ['skinsUnlocked', ALL.skins],
        ['hatsUnlocked', ALL.hats],
        ['trailsUnlocked', ALL.trails],
      ] as const) {
        const have = new Set((d[key] as [number, string, number][]).map(x => x[0]));
        for (const e of list as [number, string, number][])
          if (!have.has(e[0])) {
            d[key].push([e[0], e[1], e[2]]);
            have.add(e[0]);
          }
      }
    return d;
  })(),
  flush() {
    try {
      localStorage.setItem('kr2save', JSON.stringify(this.data));
    } catch (e) {
      /* ignore */
    }
  },
  // game.setskin costume frames for the current parts selection
  look(): Look {
    const d = this.data,
      P = d.parts,
      sk = d.skinsUnlocked,
      ht = d.hatsUnlocked,
      tr = d.trailsUnlocked;
    const f = (a: [number, string, number][], i: number) => (a[i] ?? a[0])[0];
    return {
      head: f(sk, P[0]),
      expr: f(sk, P[1]),
      body: f(sk, P[2]),
      arm: f(sk, P[3]),
      leg: f(sk, P[4]),
      hat: f(ht, P[5]),
      flame: f(tr, P[6]) === 29,
      trail: f(tr, P[6]),
    };
  },
  // game.updatexp
  xpPercent() {
    const d = this.data;
    return (d.xp - XP_LEVELS[d.xpLevel - 1]) / (XP_LEVELS[d.xpLevel] - XP_LEVELS[d.xpLevel - 1]);
  },
  // playstate.savequick xp part returns number of level-ups
  addXP(v: number) {
    const d = this.data;
    let ups = 0;
    d.xp += v;
    while (d.xpLevel < 999 && d.xp >= XP_LEVELS[d.xpLevel]) {
      d.xpLevel++;
      ups++;
      d.coins += LEVEL_COINS[d.xpLevel] ?? 0; // playstate.unlockstuff coin bonus at these levels
      // playstate.unlockstuff the costume/hat/trail granted at this level
      for (const [kind, id, name] of (UNLOCKS as Record<string, [string, number, string][]>)[
        String(d.xpLevel)
      ] ?? []) {
        const list = kind === 'skins' ? d.skinsUnlocked : kind === 'hats' ? d.hatsUnlocked : d.trailsUnlocked;
        if (!list.some(x => x[0] === id)) list.push([id, name, 0]);
      }
    }
    this.flush();
    return ups;
  },
};

export class HudAssets {
  pages: PIXI.BaseTexture[] = [];
  man: any;
  tracks: any;
  grain!: PIXI.Texture;
  editorUnder!: PIXI.Texture;
  editorOver!: PIXI.Texture;
  private cache = new Map<Rec, PIXI.Texture>();
  async load(base: string) {
    const font = (async () => {
      try {
        const ff = new FontFace('Double N', `url(${base}assets/doublen.ttf)`);
        await ff.load();
        (document as any).fonts.add(ff);
      } catch (e) {
        /* falls back to Arial */
      }
    })();
    const [man, tracks, grain] = (await Promise.all([
      fetch(base + 'assets/hud.json').then(r => r.json()),
      fetch(base + 'assets/gameover_tracks.json').then(r => r.json()),
      loadImage(base + 'assets/grain.webp'),
      font,
    ])) as any;
    this.man = man;
    this.tracks = tracks;
    this.grain = new PIXI.Texture(grain);
  }
  tex(r: Rec) {
    let t = this.cache.get(r);
    if (!t) {
      t = new PIXI.Texture(this.pages[r.p], new PIXI.Rectangle(r.x, r.y, r.w, r.h));
      this.cache.set(r, t);
    }
    return t;
  }
}

const ease = (k: number) => 1 - (1 - k) * (1 - k); // tweenlite default quad.easeout

// hud layer, score plank countdown progress bar and game over screen
export class Hud {
  root = new PIXI.Container();
  private cd!: VecClip;
  private cdSeq: Seq;
  cdIdx = 0;
  private score!: PIXI.Text;
  private plank!: VecClip;
  private go!: VecClip;
  private goSeq: Seq = [];
  goIdx = -1;
  private goTrack: any;
  private msg: PIXI.Text;
  private coins: PIXI.Text;
  private lvl: PIXI.Text;
  private bar!: VecShape;
  private goLayer = new PIXI.Container();
  private prog!: VecClip;
  private progT = -1;
  // game-over state
  private coinsEarned = 0;
  private coinTw: { t: number }[] = [];
  // while the bar fills one xp particle every 4 ticks flies to the level badge in 1s
  private xpLayer = new PIXI.Container();
  private xpP: { c: VecClip; t: number; x: number; y: number; r: number }[] = [];
  private drop2 = 0;
  private xpOn = false;
  private lastCoin = 0;
  private coinVal = 0;
  private coinT = -1;
  private barFrom = 0;
  private barTo = 0;
  private barT = -1;
  private barPct = 0;
  private levelShown = 1;
  private pendingUps = 0;
  active = false;
  // unlock popup game.unlockedscreen + the two confetti effects started on a first clear
  private hatN = 0;
  private popMounts: Record<string, PIXI.Container> = {};
  private contN2 = 0;
  private pop!: VecClip;
  private conf!: VecClip[];
  private contN = 37; // 37 = lvl1 first clear
  private popIdx = -1;
  private popHiding = false;
  private confIdx = -1;
  popupDone = false;
  private mx = -1;
  private my = -1;
  static OK: Rect = [279.2, 338.6, 473.2, 387.6];

  static TRY: Rect = [282, 204, 470, 252];
  static MAIN: Rect = [282, 260, 470, 308];

  constructor(
    private a: HudAssets,
    private v: VecAssets,
    public campaign: boolean,
  ) {
    const m = a.man;
    this.cdSeq = m.seqs.countdown;
    // all the hud clips come straight from the swf
    this.cd = new VecClip(v, 2936);
    this.cd.position.set(350, 200);
    this.plank = new VecClip(v, 2350);
    this.plank.setFrame(1);
    this.score = new PIXI.Text('0', {
      fontFamily: FONT,
      fontSize: 32,
      fill: 0xdfbe99,
      align: 'center',
    } as any);
    this.score.anchor.set(0.5, 0.5);
    this.score.position.set(80, 44);
    if (!campaign) this.root.addChild(this.plank, this.score);
    this.prog = new VecClip(v, 3017);
    this.prog.ctl = { shield: false };
    if (campaign) {
      this.root.addChild(this.prog);
      this.setProgress(0);
    }
    this.root.addChild(this.cd);
    this.msg = new PIXI.Text('', { fontFamily: FONT, fontSize: 50, fill: 0xdfbe99, align: 'center' } as any);
    this.msg.anchor.set(0.5, 0);
    this.coins = new PIXI.Text('+ 0', {
      fontFamily: FONT,
      fontSize: 28,
      fill: 0xffff00,
      letterSpacing: -1,
    } as any);
    this.lvl = new PIXI.Text('1', {
      fontFamily: FONT,
      fontSize: 30,
      fill: 0xffffff,
      align: 'center',
      letterSpacing: -1,
    } as any);
    this.lvl.anchor.set(0.5, 0);
    const outline = (t: PIXI.Text, c: number, w: number) => {
      const st = t.style as any;
      st.stroke = c;
      st.strokeThickness = w;
      st.lineJoin = 'round';
    }; // the fields glowfilter
    outline(this.score, 0x5d4328, 4);
    outline(this.msg, 0x5d4328, 4);
    outline(this.coins, 0x232214, 3);
    outline(this.lvl, 0x999999, 3);
    this.go = new VecClip(v, 2563);
    this.go.ctl = { bar: false, level: 1, coinUI: 1 };
    this.bar = new VecShape(v, 894);
    this.goLayer.addChild(this.go, this.bar, this.msg, this.coins, this.lvl, this.xpLayer);
    this.goLayer.visible = false;
    this.root.addChild(this.goLayer);
    this.pop = new VecClip(v, 717);
    this.pop.visible = false;
    this.conf = [new VecClip(v, 2055), new VecClip(v, 2055)];
    for (const c of this.conf) c.visible = false;
    // playstate confetti < unlockedscreen < game confetti
    this.root.addChild(this.conf[0], this.pop, this.conf[1]);
    this.goTrack = a.tracks;
    this.drawCd();
  }

  // the unlock popup + confetti only used by the menus shop where there is no running game
  popupOnly() {
    this.cd.visible = false;
    this.plank.visible = false;
    this.score.visible = false;
    this.prog.visible = false;
    this.goLayer.visible = false;
  }
  // progressbar.progess.head.x = 622 * fraction head origin at 63.4 34.2
  setProgress(f: number) {
    this.prog.pos = { head: [622 * f + 0.3, 0.2] };
    this.prog.setFrame(1);
  }
  setScore(n: number) {
    this.score.text = String(n);
  }

  private drawCd() {
    this.cd.visible = this.cdIdx < this.cdSeq.length;
    this.cd.setFrame(this.cdIdx + 1);
  }
  // one tick of the countdown clip returns the frame index it is now on 0-based
  stepCountdown() {
    if (this.cdIdx < this.cdSeq.length - 1) {
      this.cdIdx++;
      this.drawCd();
    }
    return this.cdIdx;
  }

  // game over
  // playstate gameover.gotoandplay show
  showGameOver(o: {
    win: boolean;
    message: string;
    coinsEarned: number;
    xpGain: number;
    score: number;
    bank?: number;
  }) {
    // no jingle here, win comes from the confetti and lose from the shop and wheel
    this.active = true;
    this.win = o.win;
    this.goSeq = this.a.man.seqs[o.win ? 'gameover_win' : 'gameover_fail'];
    this.goIdx = 0;
    this.msg.text = o.message;
    this.coinsEarned = o.coinsEarned;
    this.coinVal = 0;
    this.coinT = -1;
    this.barPct = Save.xpPercent();
    this.levelShown = Save.data.xpLevel;
    this.pendingUps = Save.addXP(o.xpGain);
    this.barT = -1;
    this.lvlWait = false;
    const sd = Save.data as any;
    if (sd.xpLevel === 30 && !sd.finalUnlock) {
      sd.finalUnlock = true;
      this.pendingUps++;
      Save.flush();
    } // playstate.showfirstincrease one extra fill at level 30
    // campaign deaths bank score / 5 quietly
    Save.data.coins += o.bank !== undefined ? o.bank : Math.round(o.coinsEarned);
    if (o.score > Save.data.coopHighScore) Save.data.coopHighScore = o.score; // playstate gameover frame 6
    Save.data.distanceRan += o.score;
    Save.flush();
    this.goLayer.visible = true;
    this.drawGo();
  }
  get goFrame() {
    return this.goIdx + 2;
  } // gameover.currentframe label show = frame 2
  get interactive() {
    return this.active && this.goFrame > 5;
  }

  private win = false;
  private lvlWait = false;
  private drawGo() {
    const i = this.goIdx;
    this.go.ctl.mainMenu = this.win ? 2 : 1;
    this.go.setFrame(Math.min(i + 2, 60), i + 1);
    const t = this.goTrack,
      k = Math.min(i, t.msg.length - 1);
    this.msg.position.set(t.msg[k][4] - 2 + 234.5, t.msg[k][5] - 2 + 2 - 4);
    this.coins.position.set(t.coins[k][4], t.coins[k][5] - 3);
    this.lvl.position.set(t.lvl[k][4] - 2 + 41.7, t.lvl[k][5] - 3);
    this.lvl.text = String(this.levelShown);
    this.bar.position.set(t.bar[k][4], t.bar[k][5]);
    this.bar.scale.x = Math.max(0.0001, (this.barPct * 285) / 285.55);
    this.bar.visible = this.barPct > 0;
    this.coins.text = '+ ' + Math.round(this.coinVal);
  }

  stepGameOver() {
    if (!this.active) return;
    // tweenlite.to progressbar 3 y -300
    if (this.campaign && this.goFrame > 2 && this.progT < 0) this.progT = 0;
    if (this.progT >= 0 && this.progT < 135) {
      this.progT++;
      this.prog.y = -300 * ease(this.progT / 135);
    }
    if (this.goIdx < this.goSeq.length - 1) this.goIdx++;
    // coins count up once the clip has finished sliding in label done
    if (this.goIdx >= this.goSeq.length - 21 && this.coinT < 0 && this.coinsEarned > 0) this.coinT = 0;
    if (this.coinT >= 0) {
      this.coinT++;
      const c = this.coinsEarned;
      if (c > 20) {
        const t1 = (c / 80) * 45,
          t2 = 2 * 45;
        if (this.coinT <= t1) this.coinVal = ease(this.coinT / t1) * (c - 20);
        else this.coinVal = c - 20 + ease(Math.min(1, (this.coinT - t1) / t2)) * 20;
      } else this.coinVal = ease(Math.min(1, this.coinT / 90)) * c;
      const rv = Math.round(this.coinVal);
      if (rv !== this.lastCoin) {
        this.lastCoin = rv;
        Audio.sfx('Coin');
      } // playstate coin whenever the rounded value changes
    }
    // xp bar fills on the last frame of the slide-in
    if (this.goFrame === 60 && this.barT === -1) {
      this.barT = 0;
      this.barFrom = this.barPct;
      this.barTo = this.pendingUps > 0 ? 1 : Save.xpPercent();
    }
    if (this.lvlWait && this.popupDone) {
      // finalunlockstep bar back to 0 level + 1 next fill
      this.lvlWait = false;
      this.pendingUps--;
      this.levelShown++;
      this.barPct = 0;
      this.barFrom = 0;
      this.barT = 0;
      this.barTo = this.pendingUps > 0 ? 1 : Save.xpPercent();
      this.popIdx = -1;
      this.confIdx = -1;
    }
    if (this.barT >= 0) {
      this.barT++;
      const k = Math.min(1, this.barT / 45);
      this.barPct = this.barFrom + (this.barTo - this.barFrom) * ease(k);
      if (k >= 1) {
        if (this.pendingUps > 0) {
          // bar is full so show the unlock popup then finish the step once its closed
          this.barPct = 1;
          this.barT = -3;
          this.lvlWait = true;
          const nx = this.levelShown + 1;
          this.showUnlock(nx <= 30 ? nx : 56);
        } else this.barT = -2;
      }
    }
    // xp particles
    this.xpOn = this.barT >= 0 && this.barT < 45 && this.barTo > this.barFrom;
    if (this.xpOn) {
      if (this.drop2 > 3) {
        Audio.sfx('Xp');
        const c = new VecClip(this.v, 2590);
        c.relative = true;
        const x = 441.4 + Math.random() * 110,
          y = 99,
          r = Math.atan2(166.35 - y, 138 - x);
        c.rotation = r;
        this.xpLayer.addChild(c);
        this.xpP.push({ c, t: 0, x, y, r });
        this.drop2 = 0;
      }
      this.drop2++;
    }
    for (const p of this.xpP) {
      p.t++;
      const k = Math.min(1, p.t / 45),
        e = 1 - (1 - k) * (1 - k);
      p.c.position.set(p.x + (138 - p.x) * e, p.y + (166.35 - p.y) * e);
      p.c.alpha = Math.max(0, 1 - p.t / 56.25);
      p.c.setFrame((p.t % 4) + 1, p.t);
    }
    this.xpP = this.xpP.filter(p => {
      if (p.c.alpha <= 0.01) {
        p.c.destroy({ children: true });
        return false;
      }
      return true;
    });
    this.drawGo();
  }

  // game.showunlocked confetti x2 + the unlocked popup label show = frame 2
  // level popup frame of the costume clip 1..30 = that level 56 = generic level up 37 = first clear
  showUnlock(level = 37, extra?: { amount?: number; item?: [number, string, number] }) {
    Audio.sfx('Win'); // confettieffect.added
    this.contN = level;
    this.hatN = extra?.item ? extra.item[0] : 0;
    this.popMounts = {};
    if (extra && (extra.amount !== undefined || extra.item)) {
      const mk = (txt: string, size: number, fill: number, ls: number, cx: number, w: number) => {
        const c = new PIXI.Container(),
          t = new PIXI.Text(txt, {
            fontFamily: FONT,
            fontSize: size,
            fill,
            letterSpacing: ls,
            align: 'center',
          } as any);
        t.anchor.set(0.5, 0);
        t.position.set(cx, -2);
        c.addChild(t);
        return c;
      };
      // wheel prizes fill the amount, risk prizes fill the text and show the hat
      if (extra.amount !== undefined)
        this.popMounts['content.ammount'] = mk(
          String(extra.amount),
          28,
          level === 53 ? 0xffff00 : level === 54 ? 0x3caafb : 0xffffff,
          -1,
          48.6,
          101.2,
        );
      if (extra.item)
        this.popMounts['content.text'] = mk(
          extra.item[1],
          20,
          0xdfbe99,
          0,
          level === 32 ? 64.35 : 53.575,
          level === 32 ? 132.7 : 111.15,
        );
    }
    this.pop.mounts = this.popMounts;
    this.contN2 = level;
    this.popIdx = 0;
    this.confIdx = 0;
    this.popHiding = false;
    this.popupDone = false;
    this.drawPop();
  }
  get atEnd() {
    return this.active && this.goIdx >= this.goSeq.length - 1;
  } // gameover.currentframe == totalframes
  get popupActive() {
    return this.popIdx >= 0 && !this.popupDone;
  }
  get popupWaiting() {
    return this.popIdx === 43 && !this.popHiding;
  } // sitting on frame 45
  hidePopup() {
    if (this.popupWaiting) this.popHiding = true;
  } // gotoandplay hide
  point(x: number, y: number) {
    this.mx = x;
    this.my = y;
  }
  overOk(x: number, y: number) {
    return (
      this.popIdx >= 18 &&
      this.popIdx <= 43 &&
      !this.popHiding &&
      x >= Hud.OK[0] &&
      x <= Hud.OK[2] &&
      y >= Hud.OK[1] &&
      y <= Hud.OK[3]
    );
  }
  private drawPop() {
    const m = this.a.man.seqs;
    const over = this.popupWaiting && this.overOk(this.mx, this.my);
    this.pop.visible = this.popIdx >= 0;
    if (this.popIdx >= 0) {
      this.pop.ctl = { content: this.contN, ok: over ? 2 : 1, ...(this.hatN ? { hat: this.hatN } : {}) };
      this.pop.setFrame(Math.min(this.popIdx + 2, 76), this.popIdx + 1);
    }
    const c = this.confIdx;
    for (const s of this.conf) {
      s.visible = c >= 0;
      if (c >= 0) s.setFrame(Math.min(c + 1, 121), c);
    }
  }
  stepPopup() {
    if (this.popIdx < 0) return;
    const n = this.a.man.seqs.popup.length;
    if (this.confIdx >= 0 && this.confIdx < this.a.man.seqs.confetti.length - 1) this.confIdx++;
    if (this.popHiding) {
      if (this.popIdx < n - 1) this.popIdx++;
      else if (!this.popupDone) {
        this.popupDone = true;
      }
    } else if (this.popIdx < 43) this.popIdx++;
    this.drawPop();
  }

  hit(x: number, y: number): 'try' | 'main' | null {
    if (!this.interactive) return null;
    const ins = (r: Rect) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
    if (ins(Hud.TRY)) return 'try';
    if (ins(Hud.MAIN)) return 'main';
    return null;
  }
}
