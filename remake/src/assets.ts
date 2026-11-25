import * as PIXI from 'pixi.js';
import {
  FPS,
  TICK_MS,
  W,
  H,
  CHUNK,
  GROUND_Y,
  Fr,
  Manifest,
  PatItem,
  BgItem,
  LevelData,
  PlayerData,
  LevelName,
  LEVEL_CFG,
} from './types';
import { TrailAssets } from './trailfx';
import { VecAssets } from './vec';

export const loadImage = (url: string) =>
  new Promise<PIXI.BaseTexture>((res, rej) => {
    const img = new Image();
    img.onload = () => res(new PIXI.BaseTexture(img));
    img.onerror = () => rej(new Error('load ' + url));
    img.src = url;
  });

export class Assets {
  trails = new TrailAssets();
  vec = new VecAssets();
  manifest!: Manifest;
  levels!: Record<string, LevelData>;
  pdata!: PlayerData;
  playerBase: PIXI.BaseTexture[] = [];
  obstBase: PIXI.BaseTexture[] = [];
  bgTex: Record<string, PIXI.Texture> = {};
  private cache = new Map<string, PIXI.Texture>();
  labels: Record<string, number> = {};
  bulk: Promise<void> = Promise.resolve();
  bulkRoots: number[] = [];
  private bulkOn = false;
  // level and player art loads in the background once the menu is up, game start waits for it
  startBulk() {
    if (!this.bulkOn) {
      this.bulkOn = true;
      this.bulk = this.vec.preload(this.bulkRoots);
    }
    return this.bulk;
  }
  async load(base: string) {
    const j = (u: string) => fetch(base + u).then(r => r.json());
    // fetch everything at once, doing it one by one is what made the black screen so long
    let lv: any;
    [this.manifest, lv, this.pdata] = (await Promise.all([
      j('assets/manifest.json'),
      j('data/levels.json'),
      j('data/player.json'),
      this.trails.load(base),
      this.vec.load(base, []),
    ])) as any;
    this.levels = lv.levels;
    this.bulkRoots = [
      1883,
      2568,
      2481,
      2489,
      2141,
      2936,
      2563,
      717,
      2350,
      2055,
      3017,
      2062,
      2938,
      2483,
      ...Object.keys(this.manifest.sprites).map(Number),
      ...Object.keys(this.manifest.shapes).map(Number),
    ];
    for (const [f, n] of Object.entries(this.pdata.labels)) this.labels[n] = +f;
  }
  tex(kind: 'p' | 'o', f: Fr, key: string): PIXI.Texture {
    let t = this.cache.get(key);
    if (!t) {
      const b = kind === 'p' ? this.playerBase[f.p] : this.obstBase[f.p];
      t = new PIXI.Texture(b, new PIXI.Rectangle(f.x, f.y, f.w, f.h));
      this.cache.set(key, t);
    }
    return t;
  }
}
