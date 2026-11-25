import * as PIXI from 'pixi.js';
import { VecAssets, VecClip, Ctl } from './vec';

// what the character wears frame numbers into the costume clips game.setskin
export interface Look {
  head: number;
  expr: number;
  body: number;
  arm: number;
  leg: number;
  hat: number;
  flame: boolean;
  trail?: number;
}
export const DEFAULT_LOOK: Look = {
  head: 1,
  expr: 1,
  body: 1,
  arm: 1,
  leg: 1,
  hat: 1,
  flame: false,
  trail: 1,
};

const PLAYER = 1883; // playergraphic2

// the runner, the swfs own player clip drawn as vectors
// costume clips get stopped on the chosen frame, everything else is the original timeline
export class PlayerRig {
  root = new PIXI.Container();
  private clip: VecClip;
  private look: Look = { ...DEFAULT_LOOK };
  trailMarker = { x: 0, y: 0, d: 1 };
  shield = false;

  constructor(private a: VecAssets) {
    this.clip = new VecClip(a, PLAYER);
    this.clip.relative = true;
    this.root.addChild(this.clip);
  }
  setLook(l: Look) {
    this.look = { ...l };
  }
  get trailId() {
    return this.look.trail ?? 1;
  }

  // frame 1-based timeline frame head phead pose 1..4 t tick clock
  update(frame: number, head: number, t: number) {
    const lk = this.look;
    const ctl: Ctl = {
      p_body: lk.body,
      p_arm_1a: lk.arm,
      p_arm_2a: lk.arm,
      p_arm_1b: lk.arm,
      p_arm_2b: lk.arm,
      p_leg_1a: lk.leg,
      p_leg_2a: lk.leg,
      p_leg_1b: lk.leg,
      p_leg_2b: lk.leg,
      phead: head,
      playerheadcolor: lk.head,
      playerexpresion: lk.expr,
      playerhat: lk.hat,
      flame: lk.flame ? (t % 30) + 1 : false,
      shield: this.shield ? 1 : false,
      trailMarker: false,
    };
    this.clip.ctl = ctl;
    this.clip.setFrame(frame, t);
    const m = this.clip.placements(frame).find(o => o.n === 'trailMarker');
    if (m && m.m) {
      this.trailMarker.x = m.m[4];
      this.trailMarker.y = m.m[5];
      this.trailMarker.d = m.m[3];
    }
  }
}
