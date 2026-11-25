import * as PIXI from 'pixi.js';
import { loadImage } from './game';

interface Rec {
  x: number;
  y: number;
  w: number;
  h: number;
  ox: number;
  oy: number;
}
interface TrailMan {
  trail: (Rec | null)[];
  rainbow: (Rec | null)[];
  anim: Record<string, { loop: boolean; frames: (Rec | null)[] }>;
  z: number;
  page: string;
  markerH: number;
}

export class TrailAssets {
  man!: TrailMan;
  base!: PIXI.BaseTexture;
  private cache = new Map<Rec, PIXI.Texture>();
  async load(base: string) {
    this.man = await fetch(base + 'assets/trails.json').then(r => r.json());
    this.base = await loadImage(base + 'assets/' + this.man.page);
  }
  // art for a trail frame, 29 and 31 hold a nested clip that plays once
  rec(id: number, age: number): Rec | null {
    const an = this.man.anim[id];
    if (!an) return this.man.trail[id - 1] ?? null;
    const n = an.frames.length;
    return an.frames[an.loop ? age % n : Math.min(age, n - 1)];
  }
  hasAnim(id: number) {
    return !!this.man.anim[id];
  }
  tex(r: Rec) {
    let t = this.cache.get(r);
    if (!t) {
      t = new PIXI.Texture(this.base, new PIXI.Rectangle(r.x, r.y, r.w, r.h));
      this.cache.set(r, t);
    }
    return t;
  }
}

interface Part {
  c: PIXI.Container;
  spr: PIXI.Sprite;
  rSpeed: number;
  age: number;
  id: number;
}

// trail particles, a trail clip every other tick or a rainbow one every tick for trail 18
export class TrailFx {
  world = new PIXI.Container();
  stage = new PIXI.Container();
  private parts: Part[] = [];
  private rainbow: Part[] = [];
  private canParticle = false;
  private fadeT = -1;
  private spawnX = 0;
  // playstate.rainbowspawner a new movieclip so it starts at 0 0 and eases toward the player
  private spawnY = 0;
  constructor(
    private a: TrailAssets,
    private rng: () => number = Math.random,
  ) {}

  private make(r: Rec, parent: PIXI.Container, id = 0): Part {
    const c = new PIXI.Container(),
      spr = new PIXI.Sprite(this.a.tex(r));
    spr.position.set(r.ox, r.oy);
    spr.scale.set(1 / this.a.man.z);
    c.addChild(spr);
    parent.addChild(c);
    return { c, spr, rSpeed: (this.rng() * 4 + 2) * (this.rng() < 0.5 ? -1 : 1), age: 0, id };
  }

  // player x y in stage space, layerx is the world scroll
  update(o: {
    x: number;
    y: number;
    gx: number;
    dead: boolean;
    trail: number;
    left: boolean;
    layerX: number;
    marker: { y: number; d: number };
  }) {
    const man = this.a.man;
    this.spawnX += (o.x + o.gx - 15 - this.spawnX) / 5;
    this.spawnY += (o.y - this.spawnY) / 5;
    // spawn a particle if alive and marker is set, then wait a tick before the next
    if (!o.dead && this.canParticle && o.trail !== 18) {
      const r = this.a.rec(o.trail, 0);
      if (r) {
        const p = this.make(r, this.world, o.trail);
        p.c.position.set(o.x - o.layerX, o.y + o.marker.y + this.rng() * Math.abs(o.marker.d) * man.markerH);
        p.c.rotation = this.rng() * Math.PI * 2;
        p.c.scale.set(this.rng() * 0.4 + 0.6);
        this.parts.push(p);
      }
      this.canParticle = false;
    } else if (!this.canParticle) this.canParticle = true;
    if (!o.dead && o.trail === 18) {
      // frame 1 is empty the sprite is re-textured every tick from the clips frame
      const r = man.rainbow.find(x => x);
      if (r) {
        const p = this.make(r, this.stage);
        p.spr.visible = false;
        p.c.position.set(this.spawnX, this.spawnY);
        this.rainbow.push(p);
      }
      // tweenlite.to container 0.5 alpha 0 on both containers
    } else if ((o.dead || o.gx > 800) && this.fadeT < 0) this.fadeT = 0;
    if (this.fadeT >= 0) {
      this.fadeT++;
      const u = Math.min(1, this.fadeT / 22.5);
      this.world.alpha = this.stage.alpha = (1 - u) * (1 - u); // tweenlites default ease is quad.easeout
    }
    for (const p of this.parts) {
      p.c.alpha -= 0.02;
      p.c.x -= 1.5;
      if (o.left) p.c.x -= 1.5;
      p.c.rotation += (p.rSpeed * Math.PI) / 180;
      if (p.id && this.a.hasAnim(p.id)) {
        p.age++;
        const r = this.a.rec(p.id, p.age);
        p.spr.visible = !!r;
        if (r) {
          p.spr.texture = this.a.tex(r);
          p.spr.position.set(r.ox, r.oy);
        }
      }
    }
    this.parts = this.parts.filter(p => {
      if (p.c.alpha <= 0.03) {
        p.c.destroy({ children: true });
        return false;
      }
      return true;
    });
    for (const p of this.rainbow) {
      p.c.x -= 10;
      if (o.left) p.c.x -= 1.5;
      p.age = Math.min(p.age + 1, man.rainbow.length - 1);
      const r = man.rainbow[p.age];
      p.spr.visible = !!r;
      if (r) {
        p.spr.texture = this.a.tex(r);
        p.spr.position.set(r.ox, r.oy);
      }
    }
    this.rainbow = this.rainbow.filter(p => {
      if (p.c.x < -100) {
        p.c.destroy({ children: true });
        return false;
      }
      return true;
    });
  }
  destroy() {
    this.world.destroy({ children: true });
    this.stage.destroy({ children: true });
  }
}
