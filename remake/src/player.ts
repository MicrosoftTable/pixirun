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
import { Timeline, Timer, PLAYER_STOPS } from './timeline';
import { Keys } from './keys';
import { PlayerRig } from './rig';
import { Audio } from './audio';
import type { Game } from './game';

export class Player {
  x = 100;
  y = 500;
  vx = 0;
  vy = 0;
  hoverTime = 150;
  floatTime = 1200;
  rollPermissionTime = 700;
  slideTime = 1200;
  rolling = false;
  jumping = false;
  sliding = false;
  hover = true;
  canRoll = false;
  canStand = false;
  gx = 0;
  floatInAir = false;
  canFloat = true;
  xSpeed = 7;
  dead = false;
  deathCamOffset = 0;
  alreadyKilledEnterFrame = false;
  invincibility = 0;
  flickering = false;
  alpha = 1;
  visible = true;
  hidden = false;
  shieldOn = false;
  flickerFrame = 0;
  flickK = 0;
  wasShielded = false;
  jv = { push: 22, gravity: 1.5 };
  hoverTimer: Timer | null;
  floatTimer: Timer | null;
  rollTimer: Timer | null = null;
  slideTimer: Timer | null = null;
  loops: [string | number, number][] = [];
  tl: Timeline;
  constructor(private g: Game) {
    this.hoverTimer = new Timer(this.hoverTime);
    this.floatTimer = new Timer(this.floatTime);
    this.tl = new Timeline(936, (f, tl) => this.onEnter(f, tl));
    this.loops = [
      [1, 705],
      ['run', 33],
      ['run', 33],
      ['run', 118],
      ['run', 106],
      ['run', 230],
      ['run', 298],
      ['idle', 511],
      ['slideloop', 58],
      ['slideloop', 58],
      ['rollloop', 89],
      ['jumploop', 201],
    ];
    this.goto('idle');
  }
  onEnter(f: number, tl: Timeline) {
    if (PLAYER_STOPS.has(f)) tl.stop();
    if (f === 89) {
      tl.frame = 65;
      tl.playing = true;
    }
  }
  lf(l: string | number) {
    return typeof l === 'number' ? l : this.g.assets.labels[l];
  }
  goto(l: string | number) {
    this.tl.gotoAndPlay(this.lf(l));
  }
  get frame() {
    return this.tl.frame;
  }
  // timers
  private newTimer(ms: number, fn: () => void) {
    const t = new Timer(ms);
    t.setListener(fn);
    this.g.startTimer(t);
    return t;
  }
  jump() {
    this.hover = this.jumping = true;
    this.sliding = false;
    this.jv = { push: 23, gravity: 1.5 };
    if (!this.dead) this.goto('jump');
    this.rolling = false;
  }
  roll() {
    this.canStand = this.sliding = this.jumping = false;
    this.canRoll = this.rolling = true;
    if (!this.dead) this.goto('roll');
    if (this.slideTimer) {
      this.slideTimer.stop();
      this.slideTimer.setListener(null);
    }
    this.slideTimer = this.newTimer(this.slideTime, () => this.permitStand());
  }
  slide() {
    this.sliding = true;
    this.jumping = this.canRoll = this.rolling = this.canStand = false;
    this.slideTimer = this.newTimer(this.slideTime, () => this.permitStand());
    if (!this.dead) this.goto('slide');
  }
  permitStand() {
    this.canStand = true;
    if (!this.slideTimer) return; // original throws a null-reference here
    this.slideTimer.setListener(null);
    this.slideTimer.stop();
    this.slideTimer = null;
    if (!this.g.keys.DOWN) {
      if (this.rolling) this.unRoll();
      if (this.sliding) this.unSlide();
      this.canRoll = false;
    }
  }
  unSlide(force = false) {
    if (this.canStand || force) this.sliding = false;
    this.jumping = this.rolling = false;
    if (!this.canRoll) {
      this.rollTimer = this.newTimer(this.rollPermissionTime, () => this.preventRoll());
    }
    this.canRoll = true;
    if ((this.canStand || force) && !this.dead) this.goto('slideend');
  }
  unRoll(_f = false) {
    this.sliding = this.jumping = this.canRoll = this.rolling = false;
    if (!this.dead) this.goto('rollend');
  }
  preventRoll() {
    if (this.rollTimer) {
      this.rollTimer.setListener(null);
      this.canRoll = false;
      this.rollTimer = null;
    }
  }
  resetGravity() {
    this.jv.gravity = 1.15;
    if (this.hoverTimer) {
      this.hoverTimer.setListener(null);
      this.hoverTimer.stop();
      this.hoverTimer = null;
    }
  }
  resetFloat() {
    this.floatInAir = this.canFloat = false;
    if (this.floatTimer) {
      this.floatTimer.stop();
      this.floatTimer.setListener(null);
      this.floatTimer = null;
    }
  }
  // kill true path is only reached with a shield not used in the slice

  enterFrame() {
    const g = this.g,
      k = g.keys;
    // player.enterframe task counters 0.022222 s per tick
    if (this.gx < 800) {
      let lb = '',
        lf = -1;
      for (const [n, f] of Object.entries(g.assets.labels))
        if (f <= this.tl.frame && f > lf) {
          lf = f;
          lb = n;
        }
      if (lb === 'slideloop') g.stats.slide += 0.022222222222;
      else if (lb === 'rollloop') g.stats.roll += 0.022222222222;
      else if (lb === 'jumploop') g.stats.hover += 0.022222222222;
      else if (this.tl.frame === 120) g.stats.jump++;
    }
    if (!this.dead) {
      if (!k.LEFT && !k.RIGHT) g.stats.noMotion += 0.022222222222;
      else g.stats.noMotion = 0;
    }
    // player.flicker flickertimer 100 ms repeating
    const fk = Math.floor(g.now / 100);
    if (fk !== this.flickK) {
      this.flickK = fk;
      this.visible = this.flickering ? !this.visible : true;
      if (this.invincibility < 80) {
        if (this.alpha < 1 && this.alpha > 0.8) this.alpha = 0.4;
        else if (this.alpha <= 0.4) this.alpha = 0.98;
      }
    }
    if (this.invincibility > 0) {
      // invisibility power-up free flight translucent
      if (this.invincibility < 80) this.jv = { push: 0, gravity: 1.5 };
      else this.alpha = 0.4;
      this.invincibility--;
      this.runLoops(); // the invisibility branch runs the animation loops even when dead
      if (!this.dead) {
        if (k.RIGHT) this.vx = this.xSpeed;
        if (k.LEFT) this.vx = -this.xSpeed;
        if (k.UP) this.vy = -7;
        if (k.DOWN) this.vy = 7;
      }
      this.x += this.vx;
      this.vx *= 0.8;
      this.y += this.vy;
      this.vy *= 0.8;
      if (this.y < 50) this.y = 50;
      if (this.x > 680) this.x = 680;
      else if (this.x < 75) this.x = 75;
      this.jumping = true;
    } else {
      this.alpha = 1;
      this.invincibility = 0;
      if (!g.freeze) {
        if (!this.dead) {
          if (!this.alreadyKilledEnterFrame) {
            if (k.justPressed('UP') && !this.jumping) {
              this.jump();
              if (this.sliding) {
                this.unSlide(true);
                this.canRoll = false;
                this.preventRoll();
                if (this.slideTimer) {
                  this.slideTimer.stop();
                  this.slideTimer.setListener(null);
                }
              }
              if (this.rolling) this.unRoll(true);
            }
            if (k.justPressed('DOWN') && this.floatInAir) this.resetFloat();
            if (k.justPressed('DOWN') && !this.sliding && this.y >= 270 && !this.canRoll) this.slide();
            if (k.justPressed('DOWN') && this.y >= 270 && this.canRoll && !this.rolling) this.roll();
            if (k.justReleased('DOWN') && this.sliding) {
              if (!this.canStand) this.canRoll = true;
              this.unSlide();
            }
            if (k.justReleased('DOWN') && this.rolling && this.canStand) this.unRoll();
          }
          if (this.jumping && this.jv.push < 15 && !this.floatInAir && this.canFloat) {
            if (k.justPressed('UP') && !this.dead) {
              this.floatInAir = true;
              this.floatTimer = this.newTimer(this.floatTime, () => this.resetFloat());
              this.jv.push = 0;
              this.canFloat = false;
            }
          }
          if (!this.dead) {
            if (k.RIGHT) this.vx = this.xSpeed;
            if (k.LEFT) this.vx = -this.xSpeed;
          }
        }
        if (this.jumping) {
          if (k.justReleased('UP') && !this.dead) {
            this.hover = false;
            if (this.jv.gravity === 0) this.resetGravity();
          }
          if (this.y > 240 && this.jv.push < 0 && !this.dead) this.goto('jumpend');
          if (this.jv.push < 10 && this.hover) {
            this.jv.push -= 5;
            this.jv.gravity = 0;
            this.hover = false;
            this.hoverTimer = this.newTimer(this.hoverTime, () => this.resetGravity());
          }
          if (!this.floatInAir) {
            this.vy = -this.jv.push;
            this.jv.push -= this.jv.gravity;
          }
        }
        if (!this.floatInAir) {
          this.y += this.vy;
          this.vy = 0;
        }
        this.x += this.vx;
        this.vx *= 0.8;
        if (!this.dead) {
          if (this.x > 680) this.x = 680;
          else if (this.x < 75) this.x = 75;
        }
      }
    }
    if (this.invincibility <= 0 && !g.freeze) {
      if (this.flickerFrame > 1) {
        this.flickering = true;
        this.flickerFrame--;
        if (this.invincibility < 80) this.flickerFrame -= 2;
      } else this.flickering = false;
    }
    if (!this.dead) this.runLoops();
  }
  runLoops() {
    for (const [l, n] of this.loops) if (this.tl.frame === n - 1) this.goto(l);
  }
  // player hit rect in world/stage space
  hitRect(): number[] {
    const h = this.g.assets.pdata.hitbox[this.tl.frame - 1];
    return [this.x + h[0], this.y + h[1], this.x + h[2], this.y + h[3]];
  }
}
