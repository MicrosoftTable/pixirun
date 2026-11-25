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
import { Assets } from './assets';
import { Timeline } from './timeline';
import { VecClip, VecShape } from './vec';

export class Obstacle {
  container = new PIXI.Container();
  clip: VecClip | null = null;
  shape: VecShape | null = null;
  tl: Timeline | null = null;
  hit: number[] | null = null; // absolute rect world space chunk offset applied
  name: string;
  labelAt: Record<number, string> = {};
  nFrames = 1;
  stopAt: Set<number>;
  constructor(
    public item: PatItem,
    public offsetX: number,
    a: Assets,
  ) {
    this.name = item.name ?? '';
    const m = item.m;
    this.container.transform.setFromMatrix(new PIXI.Matrix(m[0], m[1], m[2], m[3], m[4] + offsetX, m[5]));
    if (item.hitBox)
      this.hit = [item.hitBox[0] + offsetX, item.hitBox[1], item.hitBox[2] + offsetX, item.hitBox[3]];
    this.stopAt = new Set();
    if (item.kind === 'sprite') {
      this.clip = new VecClip(a.vec, item.id);
      this.container.addChild(this.clip);
      this.nFrames = a.vec.scene[item.id].n!;
      // break_roll objects stop on frame 1, at the end of the break anim and on the last frame
      if (/break_roll/.test(this.name)) {
        const nb = Object.entries(item.labels ?? {}).find(([, v]) => v === 'nobreak');
        if (nb) this.stopAt = new Set([1, +nb[0] - 1, a.vec.scene[item.id].n!]);
      }
      // powerup frames 1-7 are the types, 8 on is the pickup anim
      if (item.id === 2141) this.stopAt = new Set([1, 2, 3, 4, 5, 6, 7, 17]);
      if (this.nFrames > 1) {
        this.tl = new Timeline(this.nFrames, (f, tl) => {
          if (this.stopAt.has(f)) tl.stop();
        });
        if (this.stopAt.has(1)) this.tl.playing = false;
      }
    } else {
      this.shape = new VecShape(a.vec, item.id);
      this.container.addChild(this.shape);
    }
    this.apply(a);
  }
  get frame() {
    return this.tl ? this.tl.frame : 1;
  }
  label(): string {
    // currentlabel nearest label at or before frame
    const f = this.frame;
    let best = '';
    for (const [k, v] of Object.entries(this.item.labels ?? {})) if (+k <= f) best = v;
    return best;
  }
  gotoAndPlay(lbl: string) {
    for (const [k, v] of Object.entries(this.item.labels ?? {}))
      if (v === lbl && this.tl) {
        this.tl.gotoAndPlay(+k);
      }
  }
  apply(_a: Assets) {
    if (this.clip) this.clip.setFrame(this.frame, this.frame - 1);
  }
}
