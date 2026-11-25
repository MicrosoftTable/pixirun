import { Audio } from './audio';
import * as PIXI from 'pixi.js';
import { HudAssets, Save, FONT } from './hud';
import { PlayerRig } from './rig';
import { VecAssets, VecClip, VecShape } from './vec';
import { TrailAssets } from './trailfx';

type Rect = [number, number, number, number];
const ins = (x: number, y: number, r: Rect) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
const mod = (v: number, n: number) => (v < 0 ? n - 1 : v > n - 1 ? 0 : v);

// the runner page, sits 800px to the right of the menu and the menu slides over to it
// lives 800 px to the right of the menu menustate slides over to it
export class Editor {
  root = new PIXI.Container();
  onBack: (() => void) | null = null;
  private over!: VecClip;
  private rig: PlayerRig;
  private idx = 0;
  private clock = 0;

  private txt: Record<string, PIXI.Text> = {};
  private names: PIXI.Text[] = [];
  private lvl: PIXI.Text;
  private sub = 0;
  private static IDLE_DIV = 2; // ticks per idle frame
  cursor = 'default';
  visible = false;
  // up to 20 trail clips float up from behind the runner
  private pcont = new PIXI.Container();
  private parts: { c: PIXI.Container; spr: PIXI.Sprite; rs: number; age: number; id: number }[] = [];
  private ptime = 0;
  private trailId = 1;

  // hit zones in editor space from the placed clips of editorscreen
  private static MAJOR: Record<string, Rect> = {
    skinB: [33, 151, 67, 289],
    skinF: [256, 151, 290, 289],
    hatB: [33, 81, 67, 143],
    hatF: [256, 81, 290, 143],
    trailB: [33, 296, 67, 358],
    trailF: [256, 296, 290, 358],
  };
  private static ROWS: Record<string, number> = {
    head: 126,
    expression: 160,
    torso: 213,
    arm: 247,
    leg: 305,
  };
  private static BACK: Rect = [476, 340, 665, 388];
  private static RANDOM: Rect = [322, 342, 466, 388];

  constructor(
    private a: HudAssets,
    rigA: VecAssets,
    private ta: TrailAssets,
  ) {
    const m = a.man;
    const under = new VecShape(rigA, 889);
    under.position.set(168.6, 223.6);
    this.root.addChild(under); // the dark panel editorscreen.editor depth 1
    // preview runner is the player clip scaled 1.814 looping idle
    this.pcont.position.set(103, 346.95);
    this.pcont.scale.set(0.83, 1);
    this.root.addChild(this.pcont); // depth 2 of the editor clip under the runner
    this.rig = new PlayerRig(rigA);
    this.rig.root.transform.setFromMatrix(new PIXI.Matrix(1.814, 0, 0, 1.814, 173.85, 179.45));
    this.root.addChild(this.rig.root);
    // arrows buttons and stats go above the particles and runner
    this.over = new VecClip(rigA, 1921);
    this.over.ctlId = { 889: false, 891: false, 1883: false };
    this.over.ctl = { level: 1 };
    this.root.addChild(this.over);
    const mk = (size: number, fill: number, align = 'center', lh = 0) =>
      new PIXI.Text('', {
        fontFamily: FONT,
        fontSize: size,
        fill,
        align,
        lineHeight: lh || undefined,
      } as any);
    const dim = 21 * 0.94;
    this.txt.won = mk(dim, 0x66ff00);
    this.txt.lost = mk(dim, 0xff0000);
    this.txt.col1 = mk(dim, 0xdfbe99, 'center', 24.3 * 0.94);
    this.txt.col2 = mk(dim, 0xdfbe99, 'center', 23.8 * 0.94);
    // text fields get a 5px glow outline in the glow colour
    const outline = (t: PIXI.Text, c: number) => {
      const st = t.style as any;
      st.stroke = c;
      st.strokeThickness = 4;
      st.lineJoin = 'round';
    };
    outline(this.txt.won, 0x006600);
    outline(this.txt.lost, 0x660000);
    outline(this.txt.col1, 0x5d4328);
    outline(this.txt.col2, 0x5d4328);

    for (const k of ['won', 'lost', 'col1', 'col2']) {
      this.txt[k].anchor.set(0.5, 0);
      this.root.addChild(this.txt[k]);
    }
    this.txt.won.position.set(326.9 + 95.9, 211.9);
    this.txt.lost.position.set(326.9 + 95.9, 234.4);
    this.txt.col1.position.set(326.9 + 95.9, 255.4);
    this.txt.col2.position.set(524.9 + 97.5, 212.4);
    for (let i = 0; i < 6; i++) {
      const t = mk(19, 0xddb380);
      outline(t, 0x60462b);
      (t.style as any).strokeThickness = 3;
      t.anchor.set(0.5, 0);
      t.position.set(326.8 + i * 63.4 + 38.65, 166.5);
      this.names.push(t);
      this.root.addChild(t);
    }
    this.lvl = mk(30 * 0.76, 0xffffff);
    (this.lvl.style as any).stroke = 0x9a9a9a;
    (this.lvl.style as any).strokeThickness = 3;
    (this.lvl.style as any).lineJoin = 'round';
    this.lvl.anchor.set(0.5, 0);
    this.lvl.position.set(44.2, 25.2);
    this.root.addChild(this.lvl);
    this.refresh();
  }

  // editor.updateskins / updatestats
  refresh() {
    const d = Save.data,
      m = this.a.man;
    const sk = d.skinsUnlocked,
      n = sk.length;
    this.vis = [];
    for (let i = 0; i < 6; i++) {
      // last six unlocked costumes, extra buttons hidden below six
      const vis = n === 4 ? i < 4 : n === 5 ? i < 5 : true;
      const e = n < 6 ? sk[i] : sk[n - 6 + i];
      const t = this.names[i];
      t.visible = vis;
      t.text = e ? e[1] : 'Whitner';
      this.vis.push(vis);
      this.subs['skin' + (i + 1)] = { graphic: e ? e[0] : 1, ...(vis ? {} : {}) };
      if (!vis) this.hide['skin' + (i + 1)] = false;
      else delete this.hide['skin' + (i + 1)];
    }
    const lk = Save.look();
    this.trailId = lk.trail ?? 1;
    this.rig.setLook(lk);
    const hours = Math.floor(d.time / 60),
      mins = d.time - hours * 60; // game.refreshtime save.time counts minutes starts at 1
    this.txt.won.text = 'Matches Won: ' + d.matchesWon;
    this.txt.lost.text = 'Matches Lost: ' + d.matchesLost;
    this.txt.col1.text =
      'Total Matches: ' +
      (d.matchesWon + d.matchesLost) +
      '\n High Score: ' +
      Math.round(d.coopHighScore) +
      '\n Distance Ran: ' +
      Math.round(d.distanceRan);
    this.txt.col2.text =
      'Costumes: ' +
      n +
      '\n Hats: ' +
      (d.hatsUnlocked.length - 1) +
      '\n Tasks Completed: ' +
      Math.min(10, d.tasksUnlocked) +
      '\n Coins Spent: ' +
      d.moneySpent +
      '\n Time Played: ' +
      (hours < 10 ? '0' : '') +
      hours +
      'h ' +
      (mins < 10 ? '0' : '') +
      mins +
      'm';
    // game.updatestatsmc level circle + bar
    this.lvl.text = String(d.xpLevel);
    const pct = Math.max(0, Math.min(1, Save.xpPercent()));
    this.over.sx = { bar: Math.max(0.0001, (pct * 285) / 285.55) };
    this.barOn = pct > 0;
    this.drawOver();
  }
  private subs: Record<string, any> = {};
  private hide: Record<string, false> = {};
  private vis: boolean[] = [];
  private barOn = true;
  private drawOver() {
    this.over.ctl = { level: 1, ...this.hide, ...(this.barOn ? {} : { bar: false }) } as any;
    this.over.sub = {};
    for (const k of Object.keys(this.subs)) this.over.sub[k] = this.subs[k];
    this.over.setFrame(1, this.clock);
  }

  step() {
    this.sub = (this.sub + 1) % Editor.IDLE_DIV;
    this.clock++;
    if (!this.sub) this.idx = (this.idx + 1) % 65; // idle 447..511 then back to idle
    this.rig.update(447 + this.idx, 1, this.clock);
    this.drawOver();
    if (this.parts.length < 20 && this.ptime > 5) {
      const r = this.ta.rec(this.trailId, 0);
      if (r) {
        const c = new PIXI.Container(),
          spr = new PIXI.Sprite(this.ta.tex(r));
        spr.position.set(r.ox, r.oy);
        spr.scale.set(1 / this.ta.man.z);
        c.addChild(spr);
        c.scale.set(1.2 + Math.random() * 0.5);
        c.x = Math.random() * 137;
        this.pcont.addChild(c);
        this.parts.push({
          c,
          spr,
          rs: (Math.random() * 4 + 2) * (Math.random() < 0.5 ? -1 : 1),
          age: 0,
          id: this.trailId,
        });
      }
      this.ptime = 0;
    }
    for (const p of this.parts) {
      p.c.y -= 5;
      p.c.alpha -= 0.02;
      p.c.rotation += (p.rs * Math.PI) / 180;
      if (this.ta.hasAnim(p.id)) {
        p.age++;
        const r = this.ta.rec(p.id, p.age);
        p.spr.visible = !!r;
        if (r) {
          p.spr.texture = this.ta.tex(r);
          p.spr.position.set(r.ox, r.oy);
        }
      }
    }
    this.parts = this.parts.filter(p => {
      if (p.c.alpha <= 0.05) {
        p.c.destroy({ children: true });
        return false;
      }
      return true;
    });
    this.ptime++;
  }

  private micro(x: number, y: number): string | null {
    for (const [k, cy] of Object.entries(Editor.ROWS)) {
      if (y < cy - 14 || y > cy + 14) continue;
      if (x >= 80 && x <= 106) return k + 'B';
      if (x >= 218 && x <= 244) return k + 'F';
    }
    return null;
  }
  private major(x: number, y: number): string | null {
    for (const [k, r] of Object.entries(Editor.MAJOR)) if (ins(x, y, r)) return k;
    return null;
  }
  private recent(x: number, y: number): number {
    for (let i = 0; i < 6; i++)
      if (this.vis[i] && ins(x, y, [333 + i * 63.4, 62, 392 + i * 63.4, 168])) return i;
    return -1;
  }

  hover(x: number, y: number) {
    const hit =
      this.micro(x, y) ||
      this.major(x, y) ||
      this.recent(x, y) >= 0 ||
      ins(x, y, Editor.BACK) ||
      ins(x, y, Editor.RANDOM);
    this.cursor = hit ? 'pointer' : 'default';
  }

  click(x: number, y: number) {
    const d = Save.data,
      P = d.parts,
      ns = d.skinsUnlocked.length;
    const mj = this.major(x, y),
      mc = this.micro(x, y),
      rc = this.recent(x, y);
    if (mj) {
      // editor.changemajor
      Audio.sfx('ClickEditorBig');
      const dir = mj.endsWith('F') ? 1 : -1;
      if (mj.startsWith('skin')) {
        P[2] = mod(P[2] + dir, ns);
        P[0] = P[1] = P[3] = P[4] = P[2];
      } else if (mj.startsWith('hat')) P[5] = mod(P[5] + dir, d.hatsUnlocked.length);
      else P[6] = mod(P[6] + dir, d.trailsUnlocked.length);
    } else if (mc) {
      // editor.changemicro
      Audio.sfx('ClickEditorSmall');
      const dir = mc.endsWith('F') ? 1 : -1,
        idx = { head: 0, expression: 1, torso: 2, arm: 3, leg: 4 }[mc.slice(0, -1) as 'head'];
      P[idx] = mod(P[idx] + dir, ns);
    } else if (rc >= 0) {
      // editor.selectrecent
      const e = ns < 6 ? d.skinsUnlocked[rc] : d.skinsUnlocked[ns - 6 + rc];
      const at = d.skinsUnlocked.findIndex(s => s[0] === e[0]);
      P[2] = P[0] = P[1] = P[3] = P[4] = Math.max(0, at);
    } else if (ins(x, y, Editor.RANDOM)) {
      // editor.randomskin
      Audio.sfx('ClickEditorBig');
      const r = () => Math.floor(Math.random() * ns);
      const v = [r(), r(), r(), r(), r(), r()];
      P[2] = v[0];
      P[0] = v[1];
      P[1] = v[2];
      P[3] = v[3];
      P[4] = v[4];
      P[6] = Math.floor(Math.random() * d.trailsUnlocked.length);
      P[5] = Math.floor(Math.random() * d.hatsUnlocked.length);
    } else if (ins(x, y, Editor.BACK)) {
      Audio.sfx('ClickPlank');
      Save.flush();
      if (this.onBack) this.onBack();
      return;
    }
    Save.flush();
    this.refresh();
  }
}
