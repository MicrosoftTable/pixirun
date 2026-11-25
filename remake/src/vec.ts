import * as PIXI from 'pixi.js';

// vector runtime, draws the swfs shapes at whatever resolution the screen needs

type M = number[];
interface Pl {
  d: number;
  i?: number;
  m?: M;
  c?: number[];
  n?: string;
  f?: any[];
  r?: number;
  k?: number;
  b?: number;
  v?: number;
}
// sound tags inside sprite timelines, main.ts hooks these up to audio
export const soundHook: { fn: ((id: number) => void) | null } = { fn: null };
interface Ch {
  btn?: number;
  t: 's' | 'h' | 'x' | string;
  n?: number;
  sn?: Record<string, number[]>;
  fr?: Pl[][];
  lb?: Record<string, string>;
  b?: number[];
}
interface Img {
  img: HTMLImageElement;
  w: number;
  h: number;
  bmp: boolean;
  px: boolean;
}

const IDENT_CX = [1, 1, 1, 1, 0, 0, 0, 0];
export const composeCx = (p: number[], c: number[]) => [
  p[0] * c[0],
  p[1] * c[1],
  p[2] * c[2],
  p[3] * c[3],
  c[4] * p[0] + p[4],
  c[5] * p[1] + p[5],
  c[6] * p[2] + p[6],
  c[7] * p[3] + p[7],
];

export class VecAssets {
  scene: Record<string, Ch> = {};
  private imgs = new Map<number, Img>();
  scale = 2;
  private cache = new Map<number, PIXI.Texture>();
  private live = new Set<VecShape>();
  private morphSrc = new Map<number, string>();
  private mcache = new Map<string, PIXI.Texture>();
  private mpend = new Set<string>();
  private packIdx: Record<string, number> = {};
  private packs = new Map<number, Promise<Record<string, string>>>();
  private base = '';
  private pending = new Map<number, Promise<void>>();
  private queue: (() => void)[] = [];
  private active = 0;
  async load(base: string, preload: number[] = []) {
    this.base = base;
    [this.scene, this.packIdx, this.atlas] = await Promise.all([
      fetch(base + 'vec/scene.json').then(r => r.json()),
      fetch(base + 'vec/packs.json').then(r => r.json()),
      fetch(base + 'vec/atlas.json')
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);
    await this.preload(preload);
  }
  // fetch every shape/text under these clips shapes not preloaded are fetched when first drawn
  preload(roots: number[]) {
    const seen = new Set<number>(),
      jobs: Promise<any>[] = [],
      st = [...roots],
      pages = new Set<number>();
    while (st.length) {
      const id = st.pop()!,
        c = this.scene[id];
      if (!c || seen.has(id)) continue;
      seen.add(id);
      if (c.t === 's') {
        for (const fr of c.fr!) for (const p of fr) if (p.i !== undefined) st.push(p.i);
      } else if ((c.t === 'h' || c.t === 'x') && this.atlas && this.atlas.f[id]) {
        const pg = this.atlas.f[id][0];
        if (!pages.has(pg)) {
          pages.add(pg);
          jobs.push(this.page(pg));
        }
      } else if (c.t === 'h' || c.t === 'x' || c.t === 'm') jobs.push(this.fetchImg(id));
    }
    return Promise.all(jobs).then(() => {});
  }
  private pump() {
    while (this.active < 16 && this.queue.length) {
      this.active++;
      this.queue.shift()!();
    }
  }
  private pack(k: number) {
    let p = this.packs.get(k);
    if (!p) {
      p = fetch(this.base + 'vec/pack' + k + '.json').then(r => r.json());
      this.packs.set(k, p);
    }
    return p;
  }
  private fetchImg(id: number): Promise<void> {
    let p = this.pending.get(id);
    if (p) return p;
    const c = this.scene[id],
      key = (c.t === 'h' ? 's' : c.t === 'm' ? 'm' : 't') + id;
    p = new Promise<void>(res => {
      this.queue.push(() => {
        this.pack(this.packIdx[key])
          .then(pk => pk[key])
          .then(txt => {
            if (c.t === 'm') {
              this.morphSrc.set(id, txt);
              this.active--;
              this.pump();
              res();
              for (const sp of this.live) if (sp.cid === id) sp.refresh();
              return;
            }
            const m = /width="([\d.]+)px"/.exec(txt),
              h = /height="([\d.]+)px"/.exec(txt);
            const img = new Image();
            const done = () => {
              this.active--;
              this.pump();
              res();
              for (const sp of this.live) if (sp.cid === id) sp.refresh();
            };
            // bitmap only shapes are always 1px per unit so a bigger raster doesnt help
            const fills = txt.match(/fill(?::|=")\s*[^;"]+/g) || [],
              bmp = fills.length > 0 && !/stroke/.test(txt) && fills.every(f => /url\(#Pattern/.test(f));
            img.onload = () => {
              this.imgs.set(id, {
                img,
                w: m ? +m[1] : img.width,
                h: h ? +h[1] : img.height,
                bmp,
                px: bmp && /pixelated/.test(txt),
              });
              done();
            };
            img.onerror = () => {
              console.warn('svg ' + id);
              done();
            };
            img.src = URL.createObjectURL(new Blob([txt], { type: 'image/svg+xml' }));
          })
          .catch(() => {
            this.active--;
            this.pump();
            res();
          });
      });
      this.pump();
    });
    this.pending.set(id, p);
    return p;
  }
  // raster scale = screen pixels per stage unit bucketed so resizing does not rebuild everything
  setScale(s: number) {
    const b = Math.min(6, Math.max(1, Math.ceil(s * 2) / 2));
    if (b === this.scale) return;
    this.scale = b;
    for (const t of this.cache.values()) t.destroy(true);
    this.cache.clear();
    this.bytes = 0;
    for (const t of this.mcache.values()) t.destroy(true);
    this.mcache.clear();
    this.mpend.clear();
    for (const sp of this.live) sp.refresh();
  }
  // pre-rasterised sprite sheets so theres no svg parsing at runtime
  atlas: { pages: [string, number, number][]; f: Record<string, number[]> } | null = null;
  renderer: PIXI.Renderer | null = null;
  private pages = new Map<number, Promise<PIXI.BaseTexture | null>>();
  private pageBT = new Map<number, PIXI.BaseTexture>();
  private atex = new Map<number, PIXI.Texture>();
  page(n: number) {
    let p = this.pages.get(n);
    if (!p) {
      const [fn, nearest] = this.atlas!.pages[n];
      p = new Promise<PIXI.BaseTexture | null>(res => {
        const img = new Image();
        img.onload = () => {
          const bt = new PIXI.BaseTexture(img, {
            mipmap: PIXI.MIPMAP_MODES.OFF,
            scaleMode: nearest ? PIXI.SCALE_MODES.NEAREST : PIXI.SCALE_MODES.LINEAR,
          });
          try {
            if (this.renderer) this.renderer.texture.bind(bt, 0);
          } catch (e) {
            console.warn('atlas upload', e);
          } // upload now not on the frame that first shows it
          this.pageBT.set(n, bt);
          res(bt);
          try {
            for (const sp of this.live) {
              const f = this.atlas!.f[sp.cid];
              if (f && f[0] === n) sp.refresh();
            }
          } catch (e) {
            console.warn('atlas refresh', e);
          }
        };
        img.onerror = () => {
          console.warn('atlas page ' + fn);
          res(null);
        };
        img.src = this.base + 'vec/atlas/' + fn;
      });
      this.pages.set(n, p);
    }
    return p;
  }
  // raster px per stage unit of a shapes texture
  texScale(id: number) {
    const f = this.atlas && this.atlas.f[id];
    return f ? f[5] : 1;
  }
  tex(id: number, mask = false): PIXI.Texture {
    const af = this.atlas && this.atlas.f[id];
    if (af) {
      const ck = mask ? -id - 1 : id;
      let t = this.atex.get(ck);
      if (t) return t;
      const bt = this.pageBT.get(af[0]);
      if (!bt) {
        this.page(af[0]);
        return PIXI.Texture.EMPTY;
      }
      if (!mask) t = new PIXI.Texture(bt, new PIXI.Rectangle(af[1], af[2], af[3], af[4]));
      else {
        const cv = document.createElement('canvas');
        cv.width = af[3];
        cv.height = af[4];
        const cx2 = cv.getContext('2d')!;
        cx2.drawImage((bt.resource as any).source, af[1], af[2], af[3], af[4], 0, 0, af[3], af[4]);
        const d = cx2.getImageData(0, 0, cv.width, cv.height),
          a = d.data;
        for (let i = 3; i < a.length; i += 4) {
          a[i] = Math.min(255, a[i] * 6);
          a[i - 1] = a[i - 2] = a[i - 3] = 255;
        }
        cx2.putImageData(d, 0, 0);
        t = new PIXI.Texture(new PIXI.BaseTexture(cv as any, { mipmap: PIXI.MIPMAP_MODES.OFF }));
      }
      this.atex.set(ck, t);
      return t;
    }
    const ck = mask ? -id - 1 : id;
    let t = this.cache.get(ck);
    if (!t) {
      const im = this.imgs.get(id);
      if (!im) {
        this.fetchImg(id);
        return PIXI.Texture.EMPTY;
      }
      const s = Math.min(im.bmp ? 1 : this.scale, 4096 / Math.max(im.w, im.h)),
        cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.ceil(im.w * s));
      cv.height = Math.max(1, Math.ceil(im.h * s));
      const cx2 = cv.getContext('2d')!;
      cx2.drawImage(im.img, 0, 0, cv.width, cv.height);
      if (mask) {
        const d = cx2.getImageData(0, 0, cv.width, cv.height),
          a = d.data;
        for (let i = 3; i < a.length; i += 4) {
          a[i] = Math.min(255, a[i] * 6);
          a[i - 1] = a[i - 2] = a[i - 3] = 255;
        }
        /* the sprite-mask filter reads the red channel any fill masks fully whatever its colour */ cx2.putImageData(
          d,
          0,
          0,
        );
      } // flash masks ignore alpha any fill masks fully
      const bt = new PIXI.BaseTexture(cv as any, {
        resolution: cv.width / im.w,
        mipmap: PIXI.MIPMAP_MODES.OFF,
        scaleMode: im.px ? PIXI.SCALE_MODES.NEAREST : PIXI.SCALE_MODES.LINEAR,
      });
      t = new PIXI.Texture(bt);
      this.cache.set(ck, t);
      this.bytes += cv.width * cv.height * 4;
    }
    return t;
  }
  // morph shape at a ratio bucket, the svg has start and end values that get blended into a static svg
  texM(id: number, b: number): PIXI.Texture | null {
    const key = id + ':' + b + ':' + this.scale,
      t = this.mcache.get(key);
    if (t) return t;
    const src = this.morphSrc.get(id);
    if (!src) {
      this.fetchImg(id);
      return null;
    }
    if (this.mpend.has(key)) return null;
    this.mpend.add(key);
    const r = b / MQ,
      doc = new DOMParser().parseFromString(src, 'image/svg+xml');
    const lerp = (a: string, c: string) => {
      const hx = /^#([0-9a-f]{6})$/i;
      if (hx.test(a) && hx.test(c)) {
        const x = parseInt(a.slice(1), 16),
          y = parseInt(c.slice(1), 16);
        let o = 0;
        for (const sh of [16, 8, 0])
          o |= Math.round(((x >> sh) & 255) * (1 - r) + ((y >> sh) & 255) * r) << sh;
        return '#' + o.toString(16).padStart(6, '0');
      }
      const na = a.match(/-?\d*\.?\d+(?:e-?\d+)?/g),
        nc = c.match(/-?\d*\.?\d+(?:e-?\d+)?/g);
      if (!na || !nc || na.length !== nc.length) return a;
      let i = 0;
      return a.replace(/-?\d*\.?\d+(?:e-?\d+)?/g, () => {
        const v = +na[i] * (1 - r) + +nc[i] * r;
        i++;
        return String(Math.round(v * 1000) / 1000);
      });
    };
    for (const an of Array.from(doc.getElementsByTagName('animate'))) {
      const v = (an.getAttribute('values') || '').split(';'),
        at = an.getAttribute('attributeName')!;
      if (v.length >= 2)
        an.parentNode!.nodeType === 1 &&
          (an.parentNode as Element).setAttribute(at, lerp(v[0], v[v.length - 1]));
    }
    for (const an of Array.from(doc.getElementsByTagName('animate'))) an.remove();
    const txt = new XMLSerializer().serializeToString(doc);
    const m = /width="([\d.]+)px"/.exec(src),
      h = /height="([\d.]+)px"/.exec(src);
    const img = new Image();
    img.onload = () => {
      const w = m ? +m[1] : img.width,
        hh = h ? +h[1] : img.height,
        s = Math.min(this.scale, 4096 / Math.max(w, hh)),
        cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.ceil(w * s));
      cv.height = Math.max(1, Math.ceil(hh * s));
      cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
      this.mcache.set(
        key,
        new PIXI.Texture(
          new PIXI.BaseTexture(cv as any, { resolution: cv.width / w, mipmap: PIXI.MIPMAP_MODES.OFF }),
        ),
      );
      for (const sp of this.live) if (sp.cid === id) sp.refresh();
    };
    img.onerror = () => console.warn('morph ' + id);
    img.src = URL.createObjectURL(new Blob([txt], { type: 'image/svg+xml' }));
    return null;
  }
  private warmQ: number[] = [];
  // queue every plain shape under these clips so its ready before first draw
  warm(roots: number[]) {
    const seen = new Set<number>(),
      st = [...roots];
    while (st.length) {
      const id = st.pop()!,
        c = this.scene[id];
      if (!c || seen.has(id)) continue;
      seen.add(id);
      if (c.t === 's') {
        for (const fr of c.fr!) for (const p of fr) if (p.i !== undefined) st.push(p.i);
      } else if (c.t === 'h' || c.t === 'x') this.warmQ.push(id);
    }
  }
  get warming() {
    return this.warmQ.length;
  }
  // spend up to ms rasterising queued shapes so the first frame doesnt hitch
  warmStep(r: PIXI.Renderer, ms: number) {
    const t0 = performance.now();
    let miss = 0;
    while (this.warmQ.length && performance.now() - t0 < ms && miss <= this.warmQ.length) {
      const id = this.warmQ.pop()!;
      if (!this.imgs.has(id)) {
        if (!this.pending.has(id)) this.fetchImg(id);
        this.warmQ.unshift(id);
        miss++;
        continue;
      }
      miss = 0;
      const t = this.tex(id);
      if (t !== PIXI.Texture.EMPTY) r.texture.bind(t, 0);
    }
  }
  private bytes = 0;
  // free rasters nothing is using once the cache is over budget
  gc(budget = 160e6) {
    if (this.bytes <= budget) return;
    const used = new Set<number>(),
      usedM = new Set<PIXI.Texture>();
    for (const sp of this.live) {
      used.add(sp.cid);
      used.add(-sp.cid - 1);
      usedM.add(sp.spr.texture);
    }
    for (const [k, t] of this.cache)
      if (!used.has(k)) {
        const b = t.baseTexture;
        this.bytes -= b.realWidth * b.realHeight * 4;
        t.destroy(true);
        this.cache.delete(k);
        if (this.bytes <= budget * 0.7) break;
      }
    for (const [k, t] of this.mcache)
      if (!usedM.has(t)) {
        t.destroy(true);
        this.mcache.delete(k);
        this.mpend.delete(k);
      }
  }
  register(s: VecShape) {
    this.live.add(s);
  }
  unregister(s: VecShape) {
    this.live.delete(s);
  }
}

const MQ = 64;
export class VecShape extends PIXI.Container {
  spr = new PIXI.Sprite();
  private rb = 0;
  asMask = false;
  setRatio(r: number) {
    const b = Math.round((r / 65535) * MQ);
    if (b !== this.rb) {
      this.rb = b;
      this.refresh();
    }
  }
  constructor(
    private a: VecAssets,
    public cid: number,
  ) {
    super();
    const b = a.scene[cid].b!;
    this.spr.position.set(b[0], b[1]);
    this.addChild(this.spr);
    this.refresh();
    a.register(this);
  }
  private tintRgb = 0xffffff;
  private tintA = 1;
  // colour transform of the placement tint + alpha
  setTint(rgb: number, alpha: number) {
    if (rgb === this.tintRgb && alpha === this.tintA) return;
    this.tintRgb = rgb;
    this.tintA = alpha;
    this.spr.tint = rgb;
    this.spr.alpha = alpha;
  }
  refresh() {
    const t = this.a.scene[this.cid].t;
    if (t === 'm') {
      const x = this.a.texM(this.cid, this.rb);
      if (x) this.spr.texture = x;
      this.spr.scale.set(1);
      return;
    }
    this.spr.texture = this.a.tex(this.cid, this.asMask);
    this.spr.scale.set(1 / this.a.texScale(this.cid));
  }
  destroy(o?: any) {
    this.a.unregister(this);
    super.destroy(o);
  }
}

// box-blurred alpha glow swf glowfilter one pass source composited over it
export class GlowFilter extends PIXI.Filter {
  constructor(
    col: number[],
    private bx: number,
    private by: number,
    strength: number,
  ) {
    super(
      undefined,
      `
precision highp float;
varying vec2 vTextureCoord; uniform sampler2D uSampler; uniform vec4 inputSize;
uniform vec4 uColor; uniform vec2 uStepPx; uniform vec2 uR; uniform float uStrength;
void main() {
  vec4 src = texture2D(uSampler, vTextureCoord);
  float acc = 0.0, cnt = 0.0;
  for (int j = -12; j <= 12; j++) { if (abs(float(j)) > uR.y) continue;
    for (int i = -12; i <= 12; i++) { if (abs(float(i)) > uR.x) continue;
      acc += texture2D(uSampler, vTextureCoord + vec2(float(i) * uStepPx.x, float(j) * uStepPx.y) * inputSize.zw).a; cnt += 1.0; } }
  float g = clamp(acc / cnt * uStrength, 0.0, 1.0) * uColor.a;
  gl_FragColor = src + vec4(uColor.rgb * g, g) * (1.0 - src.a);
}`,
      {
        uColor: [col[0] / 255, col[1] / 255, col[2] / 255, col[3] / 255],
        uStepPx: [1, 1],
        uR: [1, 1],
        uStrength: strength,
      },
    );
  }
  // px filter texture pixels per stage unit
  setScale(px: number) {
    // jpexs/flash box blur of width w spans w-1 stage px
    const wd = (b: number) => Math.max(0, b - 1) * px,
      r = (b: number) => Math.min(12, Math.max(0, Math.round(wd(b) / 2)));
    const rx = r(this.bx),
      ry = r(this.by);
    this.uniforms.uR = [rx, ry];
    this.uniforms.uStepPx = [rx ? wd(this.bx) / (2 * rx + 1) : 1, ry ? wd(this.by) / (2 * ry + 1) : 1];
    this.padding = Math.ceil((Math.max(this.bx, this.by) * px) / 2 + 2);
    this.resolution = px;
  }
}

// a colour transform with add terms cannot be pushed down to the leaves exactly apply it to the
// node as a matrix filter
function cxFilter(cx: number[]) {
  const f = new PIXI.ColorMatrixFilter();
  f.matrix = [
    cx[0],
    0,
    0,
    0,
    cx[4] / 255,
    0,
    cx[1],
    0,
    0,
    cx[5] / 255,
    0,
    0,
    cx[2],
    0,
    cx[6] / 255,
    0,
    0,
    0,
    cx[3],
    cx[7] / 255,
  ] as any;
  return f;
}
const hasAdd = (c: number[]) => c[4] !== 0 || c[5] !== 0 || c[6] !== 0 || c[7] !== 0;

type Kid = {
  born: number;
  cid: number;
  node: PIXI.Container;
  clip: VecClip | null;
  shape: VecShape | null;
  glow: GlowFilter | null;
  cm?: PIXI.ColorMatrixFilter;
  cxf: PIXI.ColorMatrixFilter | null;
  cxKey: string;
};
export type Ctl = Record<string, number | false>;

export class VecClip extends PIXI.Container {
  private kids = new Map<number, Kid>();
  cx = IDENT_CX;
  frame = 0;
  // relative nested clips run from the tick they appeared flash restarts a clip each time it is
  // placed otherwise they follow the clock directly
  relative = false;
  // named children whose frame is set by code stopped clips or hidden false e.g p_body 3 shield
  // false
  ctl: Ctl = {};
  // named children moved by code name to x y replaces the placed translation
  pos: Record<string, [number, number]> = {};
  // same as ctl but keyed by character id
  ctlId: Record<number, number | false> = {};
  // per-instance overrides for a named childs own children e.g
  // skin1 graphic 5 and x-scale overrides by name
  sub: Record<string, Ctl> = {};
  sx: Record<string, number> = {};
  // code-owned containers attached inside a named child dot path of the named ancestors e.g
  // skinsandhats.hats.goods
  mounts: Record<string, PIXI.Container> = {};
  path = '';
  // alpha of a named child set by code tweenlite blink etc
  alphaBy: Record<string, number> = {};
  // rotation degrees added to the placed rotation of a named child keyed by its dot path
  rot: Record<string, number> = {};
  constructor(
    private a: VecAssets,
    public cid: number,
  ) {
    super();
  }
  get total() {
    return this.a.scene[this.cid].n ?? 1;
  }
  placements(f: number) {
    const sc = this.a.scene[this.cid];
    return sc.fr![Math.min(Math.max(f, 1), sc.n!) - 1];
  }
  // f 1-based frame of this clip t clock ticks that drives nested clips
  private lastF = 0;
  private shown() {
    for (let n: PIXI.Container | null = this; n; n = n.parent) if (!n.visible) return false;
    return true;
  }
  setFrame(f: number, t = f - 1) {
    const list = this.placements(f);
    if (f !== this.lastF) {
      this.lastF = f;
      const sn = this.a.scene[this.cid].sn;
      if (sn && soundHook.fn && this.shown()) for (const id of sn[f] ?? []) soundHook.fn(id);
    }
    this.frame = f;
    const alive = new Set<number>();
    let mask: { node: PIXI.Container; upTo: number } | null = null;
    list.forEach((p, z) => {
      if (p.i === undefined) return;
      alive.add(p.d);
      let k = this.kids.get(p.d);
      if (k && k.cid !== p.i) {
        k.node.destroy({ children: true });
        this.kids.delete(p.d);
        k = undefined;
      }
      if (!k) {
        const ch = this.a.scene[p.i];
        let node: PIXI.Container,
          clip: VecClip | null = null,
          shape: VecShape | null = null;
        if (ch.t === 's') {
          clip = new VecClip(this.a, p.i);
          node = clip;
        } else if (ch.t === 'h' || ch.t === 'x' || ch.t === 'm') {
          shape = new VecShape(this.a, p.i);
          node = shape;
        } else {
          node = new PIXI.Container();
        }
        k = { born: t, cid: p.i, node, clip, shape, glow: null, cxf: null, cxKey: '' };
        this.kids.set(p.d, k);
        this.addChild(node);
      }
      const ctl = (p.n !== undefined ? this.ctl[p.n] : undefined) ?? this.ctlId[p.i];
      const npath = p.n !== undefined ? (this.path ? this.path + '.' + p.n : p.n) : this.path;
      const mt = p.n !== undefined ? this.mounts[npath] : undefined;
      if (mt && mt.parent !== k.node) k.node.addChild(mt);
      k.node.visible = !(p.n && /^hit/i.test(p.n)) && ctl !== false; // hit boxes are logic only
      this.setChildIndex(k.node, Math.min(z, this.children.length - 1));
      if (p.m)
        k.node.transform.setFromMatrix(new PIXI.Matrix(p.m[0], p.m[1], p.m[2], p.m[3], p.m[4], p.m[5]));
      const po = p.n !== undefined ? this.pos[p.n] : undefined;
      if (po) k.node.position.set(po[0], po[1]);
      const ab = p.n !== undefined ? this.alphaBy[p.n] : undefined;
      if (ab !== undefined) k.node.alpha = ab;
      else if (k.node.alpha !== 1 && !k.shape) k.node.alpha = 1;
      const ro = p.n !== undefined ? this.rot[npath] : undefined;
      if (ro !== undefined && p.m) k.node.rotation = Math.atan2(p.m[1], p.m[0]) + (ro * Math.PI) / 180;
      const sx = p.n !== undefined ? this.sx[p.n] : undefined;
      if (sx !== undefined) k.node.scale.x = (p.m ? Math.hypot(p.m[0], p.m[1]) : 1) * sx;
      let cx = p.c ? composeCx(this.cx, p.c) : this.cx;
      // colour-transform alpha reaches code-owned content too
      if (mt) mt.alpha = Math.min(1, Math.max(0, cx[3]));
      if (hasAdd(cx) && !hasAdd(this.cx)) {
        // an add term starts here apply the transform on this node and give the children identity
        const key = cx.join();
        if (k.cxKey !== key) {
          k.cxf = cxFilter(cx);
          k.cxKey = key;
        }
        cx = IDENT_CX;
      } else if (k.cxf) {
        k.cxf = null;
        k.cxKey = '';
      }
      if (k.clip) {
        k.clip.mounts = this.mounts;
        k.clip.path = npath;
        k.clip.alphaBy = this.alphaBy;
        k.clip.rot = this.rot;
        k.clip.cx = cx;
        k.clip.ctl = this.ctl;
        k.clip.pos = this.pos;
        k.clip.ctlId = this.ctlId;
        k.clip.sx = this.sx;
        k.clip.sub = this.sub;
        const sb = p.n !== undefined ? this.sub[p.n] : undefined;
        k.clip.ctl = sb ? { ...this.ctl, ...sb } : this.ctl;
        k.clip.relative = this.relative;
        const lt = this.relative ? Math.max(0, t - k.born) : t;
        const n = k.clip.total;
        const fr = typeof ctl === 'number' ? ctl : n > 1 && !this.a.scene[p.i].btn ? (lt % n) + 1 : 1;
        k.clip.setFrame(fr, this.relative ? t : lt);
      } else if (k.shape) {
        if (this.a.scene[k.cid].t === 'm') k.shape.setRatio(p.r ?? 0);
        const c = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
        k.shape.setTint((c(cx[0]) << 16) | (c(cx[1]) << 8) | c(cx[2]), Math.min(1, Math.max(0, cx[3])));
      }
      const fl: PIXI.Filter[] = [];
      if (p.f && !k.glow) {
        const g = p.f.find(x => x.t === 'glow');
        if (g) k.glow = new GlowFilter(g.c, g.bx, g.by, g.s);
      }
      if (k.glow) {
        k.glow.setScale(this.a.scale);
        fl.push(k.glow);
      }
      if (p.f && !k.cm) {
        const c = p.f.find(x => x.t === 'cmat');
        if (c) {
          const f = new PIXI.ColorMatrixFilter();
          const m = c.m.slice();
          for (const i of [4, 9, 14, 19]) m[i] /= 255;
          f.matrix = m as any;
          k.cm = f;
        }
      }
      if (k.cm) fl.push(k.cm);
      if (k.cxf) fl.push(k.cxf);
      k.node.filters = fl.length ? fl : null;
      // masks clipdepth the layers above up to clip depth are clipped by this shape
      if (mask && p.d <= mask.upTo) k.node.mask = mask.node as any;
      else if (p.k !== undefined) {
        if (k.shape && !k.shape.asMask) {
          k.shape.asMask = true;
          k.shape.refresh();
        }
        mask = { node: k.shape ? k.shape.spr : k.node, upTo: p.k };
        k.node.mask = null;
        k.node.renderable = false;
      } else k.node.mask = null;
    });
    for (const [d, k] of this.kids)
      if (!alive.has(d)) {
        k.node.destroy({ children: true });
        this.kids.delete(d);
      }
  }
}
