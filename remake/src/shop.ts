import { Audio } from './audio';
import * as PIXI from 'pixi.js';
import { VecAssets, VecClip } from './vec';
import { Save, FONT, Hud, HudAssets, ALL } from './hud';

type Rect = [number, number, number, number];
const ins = (x: number, y: number, r: Rect) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];

const SHOP = 4420,
  SKIN_BTN = 4221,
  HAT_BTN = 4228;
const PAD = 93; // shop.hatpadding
const TICK = 45; // ticks per second

// shop.skinsindex / hatsindex frame name price
export const SKINS: [number, string, number][] = [
  [11, 'Sleepper', 500],
  [12, 'Pinrk', 500],
  [55, 'VVVVVV', 500],
  [13, 'Vampayah', 800],
  [14, 'Rainbow', 800],
  [15, 'Junkie', 1000],
  [16, 'Glider', 1000],
  [17, 'Hankish', 1000],
  [67, 'Truxton', 1200],
  [18, 'Monsta', 1500],
  [51, 'Tale', 1500],
  [19, 'Nerd', 1900],
  [20, 'Reddar', 1950],
  [58, 'Cadence', 2000],
  [56, 'Gravinay', 2000],
  [23, 'Patcher', 2100],
  [26, 'Fencer', 2100],
  [57, 'Crypto', 2100],
  [28, 'Techer', 2400],
  [29, 'Volcano', 3000],
  [60, 'Sokejiv', 3000],
  [40, 'Spelunky', 3000],
  [41, 'Machinarium', 4500],
  [59, 'Santa', 5000],
  [27, 'Morpher', 7000],
];
export const HATS: [number, string, number][] = [
  [3, 'Arrow Head', 300],
  [4, 'Antenas', 300],
  [6, 'J-Hat', 500],
  [7, 'Top Hat', 500],
  [8, 'PJ Cap', 900],
  [31, 'Mirror', 900],
  [9, 'Turban', 1000],
  [26, 'Rap Cap', 1100],
  [10, 'Devil Horns', 1300],
  [11, 'Party Cap', 1500],
  [35, 'Idea', 1700],
  [13, 'Sombrero', 1900],
  [30, 'Ball Cap', 1900],
  [34, 'Fedora', 2000],
  [16, 'Army Cap', 2000],
  [29, 'Guard', 2100],
  [32, 'Kitten', 2300],
  [37, 'Octopus', 2500],
  [39, 'Truxhat', 2600],
];

// geometry taken from the placed clips of shopgraphic stage space skinsandhats at its page-0
// position
const SAH_X = 56.25,
  SAH_Y = 76.4,
  SAH_PLACED = 56.3;
const GOODS = {
  skins: {
    x: 100.05,
    y: 76.4,
    mask: [92, 77.5, 658, 280.2] as Rect,
    back: [58.2, 81, 92.2, 279] as Rect,
    fwd: [657.5, 81, 691.5, 279] as Rect,
  },
  hats: {
    x: 96.3,
    y: 294.25,
    mask: [91.4, 292.1, 657.5, 390.2] as Rect,
    back: [58.1, 294.4, 92.1, 391.4] as Rect,
    fwd: [657.8, 294.4, 691.8, 391.4] as Rect,
  },
};
const SPECIAL: Record<string, Rect> = {
  nostalgia: [802.6, 73.1, 960.6, 391.1],
  rainbow: [964.5, 73.1, 1122.5, 391.1],
  flamingHat: [1126.5, 73.1, 1284.5, 391.1],
  swapper: [1288.1, 73.1, 1446.1, 391.1],
};
const PAGE_BACK: Rect = [2.2, 73.1, 49.2, 391.2],
  PAGE_FWD: Rect = [700.1, 73.1, 747.1, 391.2];
const YES: Rect = [258, 209.6, 365.2, 245.2],
  NO: Rect = [385, 209.6, 492.2, 245.2];
const MONEY_AT = [588.2, 37.2];
// mtx packs name price label buttonchild rect on page 0 stage space
const MTX_PRICE: Record<string, number> = {
  MTXMisc: 35,
  MTXGold: 60,
  MTXMedieval: 85,
  MTXWut: 35,
  MTXUnlock: 400,
  MTXEvil: 85,
  MTXDeadly: 35,
  MTXXp: 50,
  MTXParty: 85,
  MTXGoggles: 2500,
};
// the message clip frame per special label surepanel.message labels
const MSG: Record<string, number> = {
  party: 8,
  evil: 9,
  medieval: 10,
  misc: 11,
  deadly: 12,
  wut: 13,
  gold: 14,
  unlock: 15,
  xp: 16,
  goggles: 18,
};

const outline = (t: PIXI.Text, c: number, w: number) => {
  const st = t.style as any;
  st.stroke = c;
  st.strokeThickness = w;
  st.lineJoin = 'round';
};
const mk = (size: number, fill: number, glow: number, w: number, align = 'left', ls = 0) => {
  const t = new PIXI.Text('', { fontFamily: FONT, fontSize: size, fill, align, letterSpacing: ls } as any);
  outline(t, glow, w);
  return t;
};
const ease = (k: number) => 1 - (1 - k) * (1 - k); // tweenlite default quad.easeout

class Tween {
  t = 0;
  constructor(
    public from: number,
    public to: number,
    public dur: number,
  ) {}
  get v() {
    return this.from + (this.to - this.from) * ease(Math.min(1, this.t / this.dur));
  }
  get done() {
    return this.t >= this.dur;
  }
}

interface Btn {
  box: PIXI.Container;
  clip: VecClip;
  name: string;
  id: number;
  price: number;
  x: number;
  owned: boolean;
  hover: boolean;
}

// the shop page shop.as + shopgraphic it lives 500 px below the menu menustate slides the whole
// menu up to it
export class Shop {
  root = new PIXI.Container();
  cursor = 'default';
  private ui: VecClip;
  private a: VecAssets;
  private page = 0;
  private pageTw: Tween | null = null;
  private pageX = SAH_X;
  private sk: Btn[] = [];
  private ht: Btn[] = [];
  private gSk = new PIXI.Container();
  private gHt = new PIXI.Container();
  private mSk = new PIXI.Container();
  private mHt = new PIXI.Container();
  private scrollSk = 0;
  private scrollHt = 0;
  private twSk: Tween | null = null;
  private twHt: Tween | null = null;
  private scrolling = false;
  // surepanel 1 hidden
  // show 2..30 hide 31..45
  private sure = 1;
  private sureMode: 'hidden' | 'show' | 'hold' | 'hide' = 'hidden';
  private ask: {
    skin?: string;
    hat?: string;
    extra?: string;
    special?: string;
    price: number;
    btn?: string;
    obj?: Btn;
  } = { price: 0 };
  private blinkT = -1;
  private tick = 0;
  private coins: PIXI.Text;
  private bucks: PIXI.Text;
  private mtxTxt: Record<string, PIXI.Text> = {};
  private hud: Hud;
  private mx = -1;
  private my = -1;

  constructor(a: VecAssets, ha: HudAssets) {
    this.a = a;
    this.tut = new VecClip(a, 247);
    this.tut.relative = true;
    this.tut.visible = false;
    this.tut.ctl = { tut: 3 };
    this.ui = new VecClip(a, SHOP);
    this.ui.relative = true;
    this.root.addChild(this.ui);
    // goods containers are mounted inside the placed goods sprites clipped by a mask rectangle
    // shop.added goods.mask = masker
    const mount = (m: PIXI.Container, g: PIXI.Container, gd: { x: number; y: number; mask: Rect }) => {
      const mg = new PIXI.Graphics();
      mg.beginFill(0xffffff)
        .drawRect(gd.mask[0] - gd.x, gd.mask[1] - gd.y, gd.mask[2] - gd.mask[0], gd.mask[3] - gd.mask[1])
        .endFill();
      m.addChild(mg, g);
      g.mask = mg;
    };
    mount(this.mSk, this.gSk, GOODS.skins);
    mount(this.mHt, this.gHt, GOODS.hats);
    this.ui.mounts = { 'skinsAndHats.skins.goods': this.mSk, 'skinsAndHats.hats.goods': this.mHt };
    this.ui.ctlId = {};
    SKINS.forEach((e, i) => this.sk.push(this.button(SKIN_BTN, e, i, this.gSk)));
    HATS.forEach((e, i) => this.ht.push(this.button(HAT_BTN, e, i, this.gHt)));
    this.coins = mk(28, 0xffff00, 0x232214, 3, 'left', -1);
    this.bucks = mk(28, 0x00ccff, 0x1658a0, 3, 'left', -1);
    this.root.addChild(this.coins, this.bucks);
    for (const [k, p] of Object.entries(MTX_PRICE)) {
      const t = mk(30, 0x00ccff, 0x1658a0, 3, 'center');
      t.text = String(p);
      t.anchor.set(0.5, 0);
      this.mtxTxt[k] = t;
      this.root.addChild(t);
    }
    this.hud = new Hud(ha, a, false);
    this.hud.popupOnly();
    this.root.addChild(this.hud.root);
    this.root.addChild(this.tut);
    this.refresh();
  }

  private button(cid: number, e: [number, string, number], i: number, into: PIXI.Container): Btn {
    const box = new PIXI.Container(),
      clip = new VecClip(this.a, cid);
    clip.relative = true;
    clip.ctl = { graphic: e[0] };
    box.addChild(clip);
    box.x = i * PAD;
    const price = mk(19, 0xffff00, 0x232214, 3);
    price.text = String(e[2]);
    if (cid === SKIN_BTN) {
      const nm = mk(19, 0xddb380, 0x60462b, 3, 'center', -0.5);
      nm.text = e[1];
      nm.anchor.set(0.5, 0);
      nm.position.set(2.5 + (-12.7 + 90) / 2, 3.5 - 4);
      box.addChild(nm);
      price.position.set(38.8, 176.6 - 4);
    } else price.position.set(41.8, 71.7 - 4);
    box.addChild(price);
    into.addChild(box);
    return { box, clip, name: e[1], id: e[0], price: e[2], x: i * PAD, owned: false, hover: false };
  }

  // shop.updatemoney
  refresh() {
    const d = Save.data;
    const has = (l: [number, string, number][], n: string) => l.some(x => x[1] === n);
    for (const b of this.sk) b.owned = has(d.skinsUnlocked, b.name);
    for (const b of this.ht) b.owned = has(d.hatsUnlocked, b.name);
  }

  // menustate.showshop
  // game.showtut 3 quick-tutorial popup quicktut 247 when paging from the skin/hat page 2 to the
  // mtx pages
  private tut!: VecClip;
  private tutF = 1;
  private tutTimer = 0;
  open() {
    this.page = 0;
    this.pageX = SAH_X;
    this.pageTw = null;
    this.sureMode = 'hidden';
    this.sure = 1;
    this.refresh();
  }

  private get pageOffset() {
    return this.pageX - SAH_PLACED;
  }
  private inGoods(x: number, y: number, which: 'skins' | 'hats') {
    const g = GOODS[which],
      o = this.pageOffset;
    return ins(x, y, [g.mask[0] + o, g.mask[1], g.mask[2] + o, g.mask[3]]);
  }
  private btnRect(b: Btn, which: 'skins' | 'hats'): Rect {
    const g = GOODS[which],
      o = this.pageOffset,
      sc = which === 'skins' ? this.scrollSk : this.scrollHt;
    const x0 = g.x + o + b.x + sc;
    return which === 'skins'
      ? [x0 - 3.3, g.y - 1.5, x0 + 86.5, g.y + 195.5]
      : [x0, g.y - 0.5, x0 + 89, g.y + 91];
  }
  private shifted(r: Rect): Rect {
    const o = this.pageOffset;
    return [r[0] + o, r[1], r[2] + o, r[3]];
  }

  hover(x: number, y: number) {
    this.mx = x;
    this.my = y;
    let hit = false;
    const panelUp = this.sureMode === 'hold';
    if (panelUp) hit = ins(x, y, YES) || ins(x, y, NO);
    else {
      for (const [which, list] of [
        ['skins', this.sk],
        ['hats', this.ht],
      ] as const)
        for (const b of list) {
          const over = this.inGoods(x, y, which) && ins(x, y, this.btnRect(b, which));
          b.hover = over;
          if (over && !b.owned) hit = true;
        }
      const pg = this.page;
      if (pg === 0) {
        for (const w of ['skins', 'hats'] as const) {
          const g = GOODS[w];
          if (ins(x, y, this.shifted(g.back)) || ins(x, y, this.shifted(g.fwd))) hit = true;
        }
      }
      if (pg === 1) for (const k of Object.keys(SPECIAL)) if (ins(x, y, this.shifted(SPECIAL[k]))) hit = true;
      if (ins(x, y, PAGE_BACK) && this.page > 0) hit = true;
      if (ins(x, y, PAGE_FWD) && this.page < 3) hit = true;
    }
    if (this.hud.popupWaiting && this.hud.overOk(x, y)) hit = true;
    this.hud.point(x, y);
    this.cursor = hit ? 'pointer' : 'default';
  }

  // true while the buy dialog or an unlock popup owns the clicks the back button is covered
  get blocking() {
    return this.sureMode !== 'hidden' || this.hud.popupActive || this.tutF !== 1;
  }
  private showSure() {
    this.sureMode = 'show';
    this.sure = 2;
    Audio.sfx('Slide');
  }
  private blink() {
    this.blinkT = 0;
    Audio.sfx('NotEnoughMoney');
  }

  click(x: number, y: number) {
    if (this.hud.popupWaiting) {
      if (this.hud.overOk(x, y)) this.hud.hidePopup();
      return;
    }
    if (this.hud.popupActive) return;
    const d = Save.data;
    if (this.sureMode === 'hold') {
      if (ins(x, y, YES)) this.actualBuy();
      else if (ins(x, y, NO)) {
        this.ask = { price: 0 };
        this.hideSure();
      }
      return;
    }
    if (this.tutF !== 1) {
      if (this.tutF >= 19 && this.tutF < 21 && ins(x, y, [278, 300, 471, 349])) this.tutF = 21;
      return;
    }
    if (this.sureMode !== 'hidden') return;
    if (ins(x, y, PAGE_FWD) && this.page < 3 && !this.pageTw) {
      if (this.page === 1 && Save.data.mtxOwned.length === 0 && this.tutTimer <= 0) {
        this.tutF = 2;
        this.tutTimer = 45 * 60;
      }
      Audio.sfx('ShopPage');
      this.pageTw = new Tween(this.pageX, this.pageX - 750, 0.5 * TICK);
      this.page++;
      return;
    }
    if (ins(x, y, PAGE_BACK) && this.page > 0 && !this.pageTw) {
      Audio.sfx('ShopPage');
      this.pageTw = new Tween(this.pageX, this.pageX + 750, 0.5 * TICK);
      this.page--;
      return;
    }
    if (this.page === 0) {
      for (const [which, list] of [
        ['skins', this.sk],
        ['hats', this.ht],
      ] as const) {
        const g = GOODS[which];
        if (ins(x, y, this.shifted(g.back))) {
          this.scroll(which, -1);
          return;
        }
        if (ins(x, y, this.shifted(g.fwd))) {
          this.scroll(which, 1);
          return;
        }
        if (!this.inGoods(x, y, which)) continue;
        for (const b of list)
          if (ins(x, y, this.btnRect(b, which))) {
            if (!b.owned && d.coins >= b.price) {
              this.ask =
                which === 'skins'
                  ? { skin: b.name, price: b.price, obj: b }
                  : { hat: b.name, price: b.price, obj: b };
              this.showSure();
            } else if (!b.owned) this.blink();
            return;
          }
      }
    }
    if (this.page === 1) {
      const sp: [string, number, string][] = [
        ['nostalgia', 2000, 'nostalgia'],
        ['rainbow', 6000, 'rainbowTrail'],
        ['flamingHat', 99999, 'flameHat'],
        ['swapper', 999999, 'swapper'],
      ];
      for (const [k, price, extra] of sp)
        if (ins(x, y, this.shifted(SPECIAL[k]))) {
          if (this.specialOwned(k)) return;
          if (d.coins >= price) {
            this.ask = { extra, price };
            this.showSure();
          } else this.blink();
          return;
        }
    }
    if (this.page >= 2) {
      for (const k of Object.keys(MTX_PRICE)) {
        const r = this.mtxRect(k);
        if (!r || !ins(x, y, r)) continue;
        this.ask = { special: k.slice(3).toLowerCase(), price: MTX_PRICE[k], btn: k };
        this.showSure();
        return;
      }
    }
  }

  private specialOwned(k: string) {
    const d = Save.data;
    return k === 'nostalgia'
      ? false // shop reads nostalgiaf which is never set
      : k === 'swapper'
        ? d.swapper
        : k === 'flamingHat'
          ? d.flamingHat
          : d.rainbowTrail;
  }

  // mtx button rectangles buttonchild placements page 0 stage space + page offset
  private mtxCache: Record<string, Rect> | null = null;
  private mtxRect(k: string): Rect | null {
    if (!this.mtxCache) this.mtxCache = this.computeMtx();
    const r = this.mtxCache[k];
    return r ? this.shifted(r) : null;
  }
  private computeMtx(): Record<string, Rect> {
    const sc = this.a.scene,
      out: Record<string, Rect> = {};
    const place = (cid: number, name: string, f = 1) => sc[cid].fr![f - 1].find(o => o.n === name)!;
    const sah = place(SHOP, 'skinsAndHats'),
      mtxP = place(4396, 'mtxButtons'),
      mtx = sc[mtxP.i!];
    // stage position of the mtxbuttons origin = skinsandhats placed + mtxbuttons placed
    const bx = sah.m![4] + mtxP.m![4],
      by = sah.m![5] + mtxP.m![5];
    for (const o of mtx.fr![0])
      if (o.n && o.n.startsWith('MTX')) {
        const sub = sc[o.i!].fr![0].find(q => q.n === 'buttonChild')!;
        const bb = this.bboxOf(sub.i!);
        const px = bx + o.m![4] + sub.m![4],
          py = by + o.m![5] + sub.m![5],
          s = sub.m!;
        out[o.n] = [px + bb[0] * s[0], py + bb[1] * s[3], px + bb[2] * s[0], py + bb[3] * s[3]];
      }
    return out;
  }
  // bounding box of a clips first frame shapes only in its own space
  private bboxOf(cid: number, depth = 0): Rect {
    const sc = this.a.scene[cid];
    if (sc.t !== 's') return (sc.b as number[]).slice(0, 4) as Rect;
    let r: Rect | null = null;
    for (const o of sc.fr![0]) {
      if (o.i === undefined || depth > 5) continue;
      const m = o.m ?? [1, 0, 0, 1, 0, 0];
      const b = this.a.scene[o.i].t === 's' ? this.bboxOf(o.i, depth + 1) : (this.a.scene[o.i].b as number[]);
      if (!b) continue;
      const xs = [b[0], b[2]].flatMap(X => [b[1], b[3]].map(Y => m[0] * X + m[2] * Y + m[4])),
        ys = [b[0], b[2]].flatMap(X => [b[1], b[3]].map(Y => m[1] * X + m[3] * Y + m[5]));
      const q: Rect = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      r = r ? [Math.min(r[0], q[0]), Math.min(r[1], q[1]), Math.max(r[2], q[2]), Math.max(r[3], q[3])] : q;
    }
    return r ?? [0, 0, 0, 0];
  }

  private scroll(which: 'skins' | 'hats', dir: -1 | 1) {
    if (this.scrolling) return;
    const n = which === 'skins' ? SKINS.length : HATS.length;
    const sc = which === 'skins' ? this.scrollSk : this.scrollHt;
    const idx = Math.round(-sc / PAD); // math.round goods.x - 41 / pad * -1
    const lim = which === 'skins' ? n - 3 : n - 1;
    if (dir === -1) {
      if (idx > 0) this.startScroll(which, sc + PAD + 1);
    } else if (idx < lim) this.startScroll(which, sc - PAD - 1);
  }
  private startScroll(which: 'skins' | 'hats', to: number) {
    const tw = new Tween(which === 'skins' ? this.scrollSk : this.scrollHt, to, 0.125 * TICK);
    if (which === 'skins') this.twSk = tw;
    else this.twHt = tw;
    this.scrolling = true;
  }

  private hideSure() {
    this.sureMode = 'hide';
    this.sure = 31;
  }

  // shop.actualbuy
  private actualBuy() {
    Audio.sfx('Buy');
    const d = Save.data,
      k = this.ask;
    if (k.special === undefined) {
      if (k.skin) {
        const e = SKINS.find(s => s[1] === k.skin)!;
        if (e[2] <= d.coins && !k.obj!.owned) {
          d.coins -= e[2];
          (d as any).moneySpent += e[2];
          if (e[0] === 40) d.hatsUnlocked.push([17, 'Bonus1', 0]);
          if (e[0] === 41) d.hatsUnlocked.push([18, 'Bonus2', 0]);
          if (e[0] === 59) d.hatsUnlocked.push([33, 'Bonus3', 0]);
          d.skinsUnlocked.push([e[0], e[1], e[2]]);
          Save.flush();
        }
      }
      if (k.hat) {
        const e = HATS.find(s => s[1] === k.hat)!;
        if (e[2] <= d.coins && !k.obj!.owned) {
          d.coins -= e[2];
          (d as any).moneySpent += e[2];
          d.hatsUnlocked.push([e[0], e[1], e[2]]);
          Save.flush();
        }
      }
      if (k.extra) {
        let popup = 0;
        const spend = (p: number) => {
          d.coins -= p;
          d.moneySpent += p;
        };
        if (k.extra === 'nostalgia') {
          spend(2000);
          for (const [i, n] of [
            [31, 'Meaner'],
            [32, 'Blazer'],
            [33, 'Pickle'],
            [34, 'Aerial'],
            [35, 'Circuit'],
            [36, 'Masker'],
            [37, 'Serrs'],
            [38, 'Lemon'],
            [39, 'Slippey'],
          ] as [number, string][])
            d.skinsUnlocked.push([i, n, 0]);
          d.nostalgia = true;
          popup = 31;
        }
        if (k.extra === 'swapper') {
          spend(999999);
          d.skinsUnlocked.push([70, 'Swapper', 0]);
          d.swapper = true;
          popup = 52;
        }
        if (k.extra === 'flameHat') {
          spend(99999);
          d.trailsUnlocked.push([29, 'FlameHat', 0]);
          d.flamingHat = true;
          popup = 36;
        }
        if (k.extra === 'rainbowTrail') {
          spend(6000);
          d.trailsUnlocked.push([18, 'RainbowTrail', 0]);
          d.rainbowTrail = true;
          popup = 35;
        }
        Save.flush();
        if (popup) this.hud.showUnlock(popup);
      }
      this.ask = { price: 0 };
      this.hideSure();
      this.refresh();
      return;
    }
    // mtx pack paid with blue coins
    if (k.price <= d.blueCoins) {
      if (k.price > 0) d.blueCoins -= k.price;
      if (k.special === 'gold') d.coins += 50000;
      else {
        d.mtxOwned.push(k.btn!);
        const S = (a: [number, string][]) => a.forEach(x => d.skinsUnlocked.push([x[0], x[1], 0])),
          T = (a: [number, string][]) => a.forEach(x => d.trailsUnlocked.push([x[0], x[1], 0])),
          H = (a: [number, string][]) => a.forEach(x => d.hatsUnlocked.push([x[0], x[1], 0]));
        const sp = k.special;
        if (sp === 'wut')
          T([
            [11, 'Carrots'],
            [35, 'Cupcake'],
            [14, 'Potatoes'],
            [13, 'Bees'],
          ]);
        if (sp === 'misc')
          T([
            [7, 'Wind'],
            [9, 'Candies'],
            [33, 'Atoms'],
            [8, 'Health'],
          ]);
        if (sp === 'deadly')
          T([
            [6, 'Skull'],
            [4, 'Bombs'],
            [3, 'Smoke'],
            [5, 'Shurikens'],
          ]);
        if (sp === 'party') {
          S([
            [44, 'Disco'],
            [47, 'Playa'],
            [48, 'Letichia'],
          ]);
          H([[27, 'Playa Top']]);
        }
        if (sp === 'evil') {
          S([
            [25, 'Droid'],
            [53, 'Atlantic'],
            [54, 'Thoreau'],
          ]);
          T([[2, 'Magic']]);
        }
        if (sp === 'medieval') {
          S([
            [49, 'Wizard'],
            [50, 'Siegius'],
            [52, 'Assassin'],
          ]);
          H([[28, 'Helmet']]);
        }
        if (sp === 'goggles') {
          d.lightGoggles = true;
          H([[40, 'Goggles']]);
        }
        if (sp === 'unlock') this.unlockEverything();
      }
      Save.flush();
    }
    this.ask = { price: 0 };
    this.hideSure();
    this.refresh();
  }

  // mtxunlock every costume hat and trail plus level 30
  private unlockEverything() {
    const d = Save.data as any;
    d.parts = [0, 0, 0, 0, 0, 0, 0];
    const all = ALL as unknown as {
      skins: [number, string, number][];
      hats: [number, string, number][];
      trails: [number, string, number][];
    };
    {
      d.skinsUnlocked = all.skins.map(x => [x[0], x[1], 9001]);
      d.hatsUnlocked = all.hats.map(x => [x[0], x[1], 0]);
      d.trailsUnlocked = all.trails.map(x => [x[0], x[1], 0]);
    }
    d.mtxOwned = [
      'MTXWut',
      'MTXMisc',
      'MTXDeadly',
      'MTXEvil',
      'MTXParty',
      'MTXMedieval',
      'MTXXp',
      'MTXUnlock',
    ];
    d.rainbowTrail = d.flamingHat = d.nostalgia = d.swapper = true;
    d.xpLevel = 30;
    d.xp = 50000;
  }

  // one 45 hz tick
  step() {
    this.tick++;
    this.tutTimer--;
    if (this.tutF >= 2 && this.tutF < 20) this.tutF++;
    else if (this.tutF >= 21) {
      this.tutF++;
      if (this.tutF > 35) this.tutF = 1;
    }
    this.tut.visible = this.tutF !== 1;
    if (this.tut.visible) this.tut.setFrame(this.tutF, this.tick);
    if (this.pageTw) {
      this.pageTw.t++;
      this.pageX = this.pageTw.v;
      if (this.pageTw.done) {
        this.pageX = this.pageTw.to;
        this.pageTw = null;
      }
    }
    for (const w of ['skins', 'hats'] as const) {
      const tw = w === 'skins' ? this.twSk : this.twHt;
      if (!tw) continue;
      tw.t++;
      if (w === 'skins') this.scrollSk = tw.v;
      else this.scrollHt = tw.v;
      if (tw.done) {
        if (w === 'skins') {
          this.scrollSk = tw.to;
          this.twSk = null;
        } else {
          this.scrollHt = tw.to;
          this.twHt = null;
        }
        this.scrolling = false;
      }
    }
    if (this.sureMode === 'show') {
      if (this.sure < 30) this.sure++;
      if (this.sure >= 30) this.sureMode = 'hold';
    } else if (this.sureMode === 'hide') {
      if (this.sure < 45) this.sure++;
      else {
        this.sureMode = 'hidden';
        this.sure = 1;
      }
    }
    if (this.blinkT >= 0) this.blinkT++;
    if (this.blinkT > 18) this.blinkT = -1;
    this.hud.stepPopup();
    this.draw();
  }

  private draw() {
    const d = Save.data,
      ui = this.ui;
    ui.pos = { skinsAndHats: [this.pageX, SAH_Y] };
    const scr = (list: Btn[], c: PIXI.Container, sc: number, which: 'skins' | 'hats') => {
      c.x = sc;
      list.forEach(b => b.clip.setFrame(b.owned ? 3 : b.hover ? 2 : 1, this.tick));
      void which;
    };
    scr(this.sk, this.gSk, this.scrollSk, 'skins');
    scr(this.ht, this.gHt, this.scrollHt, 'hats');
    const idxS = Math.round(-this.scrollSk / PAD),
      idxH = Math.round(-this.scrollHt / PAD);
    const arrows = (idx: number, last: number) => ({
      back: idx === 0 ? false : undefined,
      forward: idx === last ? false : undefined,
    });
    const sa = arrows(idxS, SKINS.length - 6),
      ha = arrows(idxH, HATS.length - 6);
    const pg = Math.round(this.pageX - SAH_PLACED);
    const sw = {
      forward: pg === 0 || pg === -750 || pg === -1500 ? undefined : pg === -2250 ? false : undefined,
      backward: pg === 0 ? false : undefined,
    };
    const clean = (o: Record<string, any>) =>
      Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
    ui.sub = {
      skins: clean(sa),
      hats: clean(ha),
      switchPage: clean({
        forward: this.page === 3 ? false : undefined,
        backward: this.page === 0 ? false : undefined,
      }),
    };
    void sw;
    const msg = this.ask.special ? (MSG[this.ask.special] ?? 1) : this.ask.extra === 'riskWheel' ? 3 : 1;
    const own = (k: string) => (this.specialOwned(k) ? 3 : 1);
    const mtx: Record<string, number> = {};
    for (const k of Object.keys(MTX_PRICE)) mtx['MTX' + k.slice(3)] = d.mtxOwned.indexOf(k) !== -1 ? 2 : 1;
    ui.ctl = {
      masker: false,
      waitingPurchase: 1,
      risk: 1,
      shopTitle: this.page + 1,
      money: this.page + 1 <= 2 ? 1 : 2,
      surePanel: this.sure,
      message: msg,
      nostalgia: own('nostalgia'),
      swapper: own('swapper'),
      flamingHat: own('flamingHat'),
      rainbow: own('rainbow'),
      ...mtx,
    };
    ui.alphaBy = this.blinkT >= 0 ? { money: this.blinkT % 9 < 4 ? 0 : 1 } : {};
    ui.setFrame(1, this.tick);
    // text overlays
    const frame2 = this.page + 1 > 2;
    // money clip frame 1 shows the coin count frame 2 pages 3-4 the blue-coin count in the same
    // spot
    this.coins.text = String(Math.round(d.coins));
    this.coins.position.set(MONEY_AT[0] + 41, MONEY_AT[1] - 13.3 - 4);
    this.coins.visible = !frame2;
    this.bucks.text = String(Math.round(d.blueCoins));
    this.bucks.position.set(MONEY_AT[0] + 41.3, MONEY_AT[1] - 13.3 - 4);
    this.bucks.visible = frame2;
    this.coins.alpha = this.bucks.alpha = this.blinkT >= 0 ? (this.blinkT % 9 < 4 ? 0 : 1) : 1;
    for (const k of Object.keys(MTX_PRICE)) {
      const r = this.mtxPriceAt(k);
      const t = this.mtxTxt[k];
      t.visible = this.page >= 2 && !!r && this.sure === 1;
      if (r) t.position.set(r[0] + this.pageOffset, r[1] - 4);
    }
  }
  private mtxPrices: Record<string, [number, number]> | null = null;
  private mtxPriceAt(k: string): [number, number] | null {
    if (!this.mtxPrices) {
      const sc = this.a.scene,
        out: Record<string, [number, number]> = {};
      const place = (cid: number, name: string) => sc[cid].fr![0].find(o => o.n === name)!;
      const sah = place(SHOP, 'skinsAndHats'),
        mtxP = place(4396, 'mtxButtons');
      const bx = sah.m![4] + mtxP.m![4],
        by = sah.m![5] + mtxP.m![5];
      for (const o of sc[mtxP.i!].fr![0])
        if (o.n && o.n.startsWith('MTX')) {
          const pr = sc[o.i!].fr![0].find(q => q.n === 'price')!;
          out[o.n] = [bx + o.m![4] + pr.m![4], by + o.m![5] + pr.m![5]];
        }
      this.mtxPrices = out;
    }
    return this.mtxPrices[k] ?? null;
  }
}
