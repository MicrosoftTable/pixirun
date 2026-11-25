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
  LEVEL_ORDER,
  LEVEL_CFG,
} from './types';
import { Keys } from './keys';
import { Timer, Timeline, PLAYER_STOPS } from './timeline';
import { Assets, loadImage } from './assets';
import { Obstacle } from './obstacle';
import { Player } from './player';
import { Hud, HudAssets, Save } from './hud';
import { PlayerRig } from './rig';
import { Tasks, RunStats, emptyStats } from './tasks';
import { Audio } from './audio';
import { TrailAssets, TrailFx } from './trailfx';
import { VecAssets, VecClip, VecShape } from './vec';

let warping = false;

export * from './types';
export * from './keys';
export * from './assets';

export class Game {
  assets: Assets;
  keys: Keys;
  root: PIXI.Container;
  onExit: ((to: 'menu' | 'restart' | 'restartKey') => void) | null = null;
  tick = 0;
  now = 0;
  timers: Timer[] = [];
  player!: Player;
  freeze = true;
  pause = false;
  scroll = 0;
  layerX = 0;
  chunks: Chunk[] = [];
  killed = 0;
  prevPattern = 0;
  chunkCount = 0;
  score = 0;
  counterStop = false;
  counterForCam = 0;
  deathCamFinished = false;
  startTick = 0;
  wonLevel = false;
  endLevel = false;
  levelReallyOver = false;
  endTick = 0;
  finishX = 0;
  startFlagTop: PIXI.Container | null = null;
  flagLayer = new PIXI.Container();
  hud!: Hud;
  hudAssets: HudAssets;
  campaign: boolean;
  tween: { t: number; to: number } | null = null;
  // layers
  bgLayer = new PIXI.Container();
  worldLayer = new PIXI.Container();
  playerLayer = new PIXI.Container();
  fgLayer = new PIXI.Container();
  bgSprites: PIXI.Sprite[] = [];
  bgRender: { x: number; spr: PIXI.Container }[] = [];
  rig: PlayerRig;
  fx: TrailFx | null = null;
  rng: () => number = Math.random;
  bgSet: LevelName[] = [];
  bgList: LevelName[] = [];
  timesFinished = 0;
  prevBgFrame = 0;
  cfg = LEVEL_CFG.village;
  trace: any[] = [];
  tracing = false;
  // power-ups warpeffectgraphic shield respawn
  warpClip: VecClip | null = null;
  warpFrame = 1;
  powerUpTimes = 0;
  warpTimes = 0;
  stats: RunStats = emptyStats();
  oldBodies: { rig: PlayerRig; tl: Timeline; x: number; y: number; gx: number }[] = [];
  tryingToSpawn = false;
  spawnPlayer: Player | null = null;
  tweens: { o: { alpha: number }; to: number; from: number; t: number; dur: number }[] = [];
  tweenAlpha(o: { alpha: number }, to: number, ticks: number) {
    this.tweens = this.tweens.filter(x => x.o !== o);
    this.tweens.push({ o, to, from: o.alpha, t: 0, dur: ticks });
  }

  constructor(
    root: PIXI.Container,
    assets: Assets,
    keys: Keys,
    hudAssets: HudAssets,
    campaign = false,
    public level: LevelName = 'village',
    public countingAsWin = false,
  ) {
    this.root = root;
    this.assets = assets;
    this.keys = keys;
    this.hudAssets = hudAssets;
    this.campaign = campaign;
    root.addChild(this.bgLayer, this.worldLayer, this.flagLayer, this.playerLayer, this.fgLayer);
    this.rig = new PlayerRig(assets.vec);
    this.rig.setLook(Save.look());
    this.playerLayer.addChild(this.rig.root);
    root.addChild(new PIXI.Sprite(hudAssets.grain)); // playstate addchild new grainoverlay
    this.start();
  }
  startTimer(t: Timer) {
    t.start(this.now);
    this.timers.push(t);
  }
  start() {
    this.worldLayer.removeChildren();
    this.fgLayer.removeChildren();
    this.flagLayer.removeChildren();
    this.flagLayer.x = 0;
    this.wonLevel = this.endLevel = this.levelReallyOver = false;
    this.endTick = 0;
    this.startFlagTop = null;
    this.bgLayer.removeChildren();
    this.chunks = [];
    this.bgRender = [];
    this.timers = [];
    this.killed = 0;
    this.prevPattern = 0;
    this.chunkCount = 0;
    // playstate constructor background set per-level parameters and the tutorial counter
    this.cfg = LEVEL_CFG[this.level];
    this.bgSet = this.campaign ? [this.level] : [...LEVEL_ORDER];
    this.bgList = [];
    this.timesFinished = 0;
    this.addBackgroundSet(5);
    {
      const sd = Save.data as any;
      if (sd.tutorialShow === undefined) sd.tutorialShow = 10;
      if (sd.tutorialShow <= 16) {
        const adj = this.campaign ? -1 : 0;
        if (this.campaign && this.level === 'cave') sd.tutorialShow += 100;
        sd.tutorialShow = this.campaign && this.level === 'village' && sd.tutorialShow <= 16 ? 10 + adj : 100;
      } else sd.tutorialShow = sd.tutorialShow; // already past the tutorial
      Save.flush();
    }
    this.scroll = 0;
    this.layerX = 0;
    this.score = 0;
    this.counterStop = false;
    this.counterForCam = 0;
    this.deathCamFinished = false;
    this.rewind = null;
    this.paused = false;
    if (this.pauseClip) this.pauseClip.visible = false;
    this.freeze = true;
    this.tween = null;
    this.tick = 0;
    this.now = 0;
    if (this.hud) this.root.removeChild(this.hud.root);
    this.hud = new Hud(this.hudAssets, this.assets.vec, this.campaign);
    this.root.addChild(this.hud.root);
    this.player = new Player(this);
    if (this.fx) this.fx.destroy();
    this.fx = new TrailFx(this.assets.trails, this.rng);
    this.root.addChildAt(this.fx.world, this.root.getChildIndex(this.worldLayer));
    this.root.addChildAt(this.fx.stage, this.root.getChildIndex(this.worldLayer));
    for (const b of this.oldBodies) b.rig.root.destroy({ children: true });
    this.oldBodies = [];
    this.tweens = [];
    this.tryingToSpawn = false;
    this.spawnPlayer = null;
    this.powerUpTimes = 0;
    this.warpTimes = 0;
    this.stats = emptyStats();
    this.warpFrame = 1;
    warping = false;
    this.bonusScore = 0;
    if (!this.warpClip) {
      this.warpClip = new VecClip(this.assets.vec, 2481);
      this.warpClip.relative = true;
      this.root.addChild(this.warpClip);
    }
    this.warpClip.visible = false;
    this.warpClip.setFrame(1, 0);
    this.root.addChild(this.warpClip);
    this.keys.reset();
    // run enterframe once to make chunk 0 then shift the layer
    this.playState();
    this.layerX -= 1;
  }

  // playstate.enterframe
  playState() {
    const p = this.player;
    // tween tweenlite update
    if (this.tween) {
      this.tween.t++;
      const k = Math.min(1, this.tween.t / 90);
      this.scroll = this.tween.to * (1 - (1 - k) * (1 - k));
      if (k >= 1) this.tween = null;
    }
    // tweenlite alpha tweens linear
    for (const t of this.tweens) {
      t.t++;
      t.o.alpha = t.from + (t.to - t.from) * Math.min(1, t.t / t.dur);
    }
    this.tweens = this.tweens.filter(t => t.t < t.dur);
    if (this.gxTween) {
      const g2 = this.gxTween;
      g2.t++;
      const k2 = Math.min(1, g2.t / 22),
        e2 = 1 - (1 - k2) * (1 - k2);
      p.gx = g2.from * (1 - e2);
      if (k2 >= 1) this.gxTween = null;
    }
    this.manageSpawn();
    this.manageWarp();
    if (!p.dead) {
      this.manageBackgrounds();
      if (!p.hidden) this.manageCollisions();
      this.manageEnd();
    } else this.manageDeathCam();
    if (this.rewind) {
      const r = this.rewind;
      r.t++;
      const k = Math.min(1, r.t / 45),
        e = 1 - (1 - k) * (1 - k);
      p.x = r.px + (r.tx - r.px) * e;
      this.layerX = r.lx + r.dl * e;
      this.worldLayer.x = this.fgLayer.x = this.flagLayer.x = this.layerX;
      this.bgRender.forEach((b, i) => {
        b.spr.x = r.bx[i] + r.dl * e;
      });
      if (k >= 1) this.rewind = null;
    }
    // playerphysics
    if (p.y + 90 > GROUND_Y) {
      p.y = 270;
      p.jumping = false;
      p.hover = p.canFloat = true;
    }
    // countdown simplified idle for starttick ticks then run
    if (this.tick === this.startTick) {
      p.goto('start_running');
      this.tween = { t: 0, to: this.cfg.speed };
    }
    if (this.tick === this.startTick + 19) this.freeze = false;
  }
  // playstate.enterframe the warp effect warpeffectgraphic 150 frames
  manageWarp() {
    const wc = this.warpClip!;
    if (this.warpFrame > 1) {
      this.warpFrame++;
      if (this.warpFrame > 150) {
        this.warpFrame = 1;
      }
      wc.setFrame(this.warpFrame, this.tick);
    } else if (wc.visible) {
      wc.setFrame(1, this.tick);
    }
    if (this.warpFrame > 2) {
      this.bonusScore += 2;
      for (const ch of this.fgLayer.children) if (ch.alpha === 1) this.tweenAlpha(ch, 0, 23);
      warping = true;
    } else if (this.warpFrame === 1 && warping) {
      warping = false;
      for (const ch of this.fgLayer.children) if (ch.alpha !== 1) this.tweenAlpha(ch, 1, 11);
    }
    for (const b of this.oldBodies) {
      b.x -= this.scroll;
      b.tl.advance();
    }
  }
  // xp rate is 4, halved with any mtx pack and quartered with the xp booster
  xpRate() {
    const d = Save.data;
    let r = 4;
    if (d.mtxOwned.length > 0) r *= 0.5;
    if (d.mtxOwned.indexOf('MTXXp') !== -1) r *= 0.25;
    return r;
  }
  // playstate.restartgame trying again after a counted win no longer counts as one
  afterTryAgain() {
    if (this.campaign && this.countingAsWin && this.levelReallyOver) this.countingAsWin = false;
  }
  restart = false;
  rewind: { t: number; px: number; tx: number; lx: number; dl: number; bx: number[] } | null = null;

  addBackgroundSet(k: number) {
    for (const l of this.bgSet) for (let i = 0; i < k + 1; i++) this.bgList.push(l);
  }

  manageBackgrounds() {
    const n = this.chunks.length + this.killed;
    if (this.layerX === 0) {
      // first chunk is the starting level and empty
      this.addChunk(this.chunks.length * CHUNK, this.campaign ? this.level : 'village', true, false);
    } else if ((this.layerX - 1000) * -1 > CHUNK * n) {
      const cls = this.bgList[n - 1],
        same = this.bgList[n - 1] === this.bgList[n];
      if (same) {
        let empty = false;
        if ((this.chunks.length < 2 && this.campaign) || this.wonLevel) {
          empty = true;
          if (this.campaign && !this.wonLevel) this.addFlags(1900, false);
        }
        this.addChunk(n * CHUNK, cls, empty, false);
      } else {
        // an area change during a warp shoves every existing obstacle 5000 px up display + hit box
        if (this.warpFrame >= 2)
          for (const c of this.chunks)
            for (const ob of c.obstacles) {
              ob.container.y -= 5000;
              if (ob.hit) {
                ob.hit[1] -= 5000;
                ob.hit[3] -= 5000;
              }
            }
        this.addChunk(n * CHUNK, cls, true, true); // transition piece bg frame 4 with the top_slide hazards
      } // transition piece bg frame 4 with the top_slide hazards
      if (this.campaign && this.killed > this.cfg.finish && !this.wonLevel) {
        this.wonLevel = true;
        this.addFlags(-this.layerX + 3000, true);
      }
    }
    for (const r of this.bgRender) {
      r.x -= this.scroll;
      r.spr.x = Math.trunc(r.x + 1400) - 1400;
    }
    this.layerX -= this.scroll;
    this.worldLayer.x = this.fgLayer.x = this.flagLayer.x = this.layerX;
    if (this.chunks.length > 3) {
      this.chunks[0].kill();
      this.chunks.shift();
      this.killed++;
      if (this.scroll <= 30) this.scroll += 0.15;
      const old = this.bgRender.shift();
      if (old) old.spr.destroy();
    }
    if (this.chunks.length + this.killed + 3 > this.bgList.length) {
      this.timesFinished += 2;
      this.addBackgroundSet(5 + this.timesFinished);
    }
    if (!this.counterStop) {
      this.score = Math.round(-this.layerX / 40 + this.bonusScore);
      this.hud.setScore(this.score);
    }
    if (this.campaign) this.hud.setProgress(-this.layerX / CHUNK / (this.cfg.finish + 5));
  }
  bonusScore = 0;
  // background constructor param3 = no obstacles param4 = transition piece
  addChunk(offsetX: number, lvl: LevelName, empty: boolean, transition: boolean) {
    const a = this.assets,
      L = a.levels[lvl];
    const bgFrame = transition ? 4 : Math.ceil(this.rng() * 3);
    const bgItems = L.backgrounds[String(bgFrame)],
      bgId = bgItems.find(x => x.name === 'bg')!.id;
    const spr = new VecClip(a.vec, bgId);
    spr.setFrame(1);
    spr.pivot.set(-750, -200); // the bg is drawn centred into a 1500x400 bitmap
    this.bgLayer.addChild(spr);
    const prevX = this.bgRender.length
      ? this.bgRender[this.bgRender.length - 1].x + CHUNK
      : offsetX + this.layerX;
    this.bgRender.push({ x: prevX, spr });
    spr.x = Math.trunc(prevX + 1400) - 1400;
    let pat = Math.ceil(this.rng() * 10);
    if (this.chunks.length > 2) while (pat === this.prevPattern) pat = Math.ceil(this.rng() * 10);
    this.prevPattern = pat;
    const sd = Save.data as any;
    if (sd.tutorialShow <= 14) pat = sd.tutorialShow; // background the tutorial patterns 9..14 of the village
    sd.tutorialShow++;
    const c = new Chunk(this, offsetX);
    if (transition) {
      for (const it of bgItems)
        if (it.name && it.name.indexOf('top_slide') === 0) {
          const m = it.m.slice();
          if (lvl === 'cave') {
            m[4] += 750;
            m[5] += 200;
          }
          const hb = it.hitBox ? it.hitBox.slice() : undefined;
          if (hb && lvl === 'cave') {
            hb[0] += 750;
            hb[2] += 750;
            hb[1] += 200;
            hb[3] += 200;
          }
          c.add({ ...it, m, hitBox: hb } as PatItem);
        }
    }
    if (!empty && !warping) c.build(L.patterns[pat - 1]);
    this.chunks.push(c);
  }

  // topflag foreground + bottomflag / bottomflagfinish flag layer behind the player
  addFlags(x: number, finish: boolean) {
    const y = 125,
      v = this.assets.vec;
    const b = new VecClip(v, finish ? 2483 : 2938);
    b.setFrame(1);
    b.position.set(x, y);
    this.flagLayer.addChild(b);
    const t = new VecClip(v, 2062);
    t.setFrame(1);
    t.position.set(x, y);
    this.fgLayer.addChild(t);
    if (finish) this.finishX = x;
    else this.startFlagTop = t;
  }
  // playstate.enterframe topstart2 collision endlevel run-out and the stage clear screen
  manageEnd() {
    const p = this.player;
    if (this.wonLevel && !this.endLevel && !p.dead) {
      const pr = p.hitRect(),
        fx = this.finishX + this.layerX;
      if (fx + 58 < pr[2] && fx + 70 > pr[0] && 125 + 18 < pr[3] && 125 + 272 > pr[1]) {
        if (this.countingAsWin) {
          const idx = LEVEL_ORDER.indexOf(this.level);
          if (Save.data.currentLevel - 1 === idx) Save.data.currentLevel += 1;
        }
        this.levelReallyOver = this.endLevel = true;
      }
    }
    if (this.endLevel) {
      // re-created every tick, first render is 1 frame in then 2 frames in
      this.scroll *= this.endTick === 0 ? 0.9556 : 0.9131;
      p.gx += 12;
      this.endTick++;
      if (this.countingAsWin && this.endTick === 1) {
        this.hud.showUnlock(this.cfg.card);
        const sk = this.cfg.skin;
        if (!Save.data.skinsUnlocked.some(x => x[0] === sk[0]))
          Save.data.skinsUnlocked.push([sk[0], sk[1], 0]);
        Save.flush();
      }

      if (!this.hud.active && (this.countingAsWin ? this.hud.popupDone : true))
        this.hud.showGameOver({
          win: true,
          message: 'STAGE CLEAR',
          coinsEarned: this.countingAsWin ? this.cfg.coin : 20,
          xpGain: (this.countingAsWin ? this.cfg.score : 10) + Tasks.evaluate(this.stats, this.score),
          score: this.score,
        });
    }
  }

  // collisions playstate.manageobstaclecollisions
  manageCollisions() {
    const p = this.player;
    const pr = p.hitRect();
    for (const c of this.chunks)
      for (const o of c.obstacles) {
        if (!o.hit) continue;
        const hr = [o.hit[0], o.hit[1], o.hit[2], o.hit[3]];
        const hitting = hr[0] < pr[2] + 0 && hr[2] > pr[0] - 0 && hr[1] < pr[3] && hr[3] > pr[1];
        // world to stage obstacle rect shifted by layerx
        const hs = [hr[0] + this.layerX, hr[1], hr[2] + this.layerX, hr[3]];
        const hit = hs[0] < pr[2] && hs[2] > pr[0] && hs[1] < pr[3] && hs[3] > pr[1];
        void hitting;
        if (!(hit && p.alpha === 1 && p.invincibility <= 0 && this.warpFrame === 1 && !p.dead && p.gx > -5))
          continue; // playstate graphic.x > -5 the spawn slide-in is not hittable
        const nm = o.name;
        if (nm.indexOf('drown') !== -1) {
          p.goto('death_splash');
          p.dead = true;
          p.deathCamOffset = -225;
        }
        if (nm.indexOf('fall') !== -1) {
          p.goto('death_fall');
          p.dead = true;
          p.deathCamOffset = -85;
        }
        if (!p.flickering) {
          if (nm.indexOf('hawt') !== -1) {
            p.goto('death_zap');
            p.dead = true;
            p.deathCamOffset = -150;
          }
          if (nm.indexOf('desintegration') !== -1) {
            p.goto('death_desintegrate');
            p.dead = true;
            p.deathCamOffset = -220;
          }
          if (nm.indexOf('lavadrow') !== -1) {
            p.goto('death_drown');
            p.dead = true;
            p.deathCamOffset = -85;
          }
          if (nm.indexOf('tripdeath') !== -1) {
            if (p.sliding) p.goto('death_slide');
            else {
              p.goto('death_trip');
              p.deathCamOffset = 35;
            }
            p.dead = true;
          }
          if (nm.indexOf('powerup') !== -1 && o.container.alpha >= 0.99 && !p.dead) {
            Audio.sfx('Powerup');
            const lb = o.label();
            if (lb === 'power_shield') p.shieldOn = true;
            else if (lb === 'power_invisible') {
              p.invincibility = 350;
              p.goto('jump');
            } else if (lb === 'power_warp') {
              this.warpClip!.visible = true;
              this.warpFrame = 2;
              while (
                this.bgList[this.chunks.length + this.killed - 1] ===
                this.bgList[this.chunks.length + this.killed]
              )
                this.bgList.splice(0, 1);
              for (const c2 of this.chunks) {
                for (const o2 of c2.obstacles)
                  if (o2.hit) {
                    o2.hit[1] -= 10000;
                    o2.hit[3] -= 10000;
                  }
                for (const o2 of c2.all) this.tweenAlpha(o2.container, 0, 45);
              }
              this.warpTimes++;
              this.stats.warp++;
            }
            o.gotoAndPlay('power_get');
            o.container.alpha = 0.95;
            this.powerUpTimes++;
            this.stats.power++;
            p.dead = false;
          }
          if (nm.indexOf('slide') !== -1) {
            if (p.jumping) {
              p.jv.push = 0;
              p.goto('death_jump');
              p.dead = true;
              p.deathCamOffset = -320;
            } else if (p.frame < 107 || p.frame > 119) {
              p.goto('death_head');
              p.dead = true;
            } else p.dead = false;
          }
          if (nm.indexOf('break_roll') !== -1) {
            if (p.rolling && !p.sliding && (o.frame === 1 || o.label() === 'nobreak')) {
              p.dead = false;
              o.gotoAndPlay('break');
              this.stats.smash++;
            } else if (!p.dead && o.frame === 1) {
              p.goto('death_slide');
              o.gotoAndPlay('nobreak');
              p.dead = true;
              p.deathCamOffset = -210;
            }
          }
        }
        if (p.dead && !p.shieldOn) this.counterStop = true;
      }
    if (p.dead && p.shieldOn) this.shieldRespawn();
  }
  // a shielded death leaves the old body behind and a new runner slides in once the area is clear
  shieldRespawn() {
    const old = this.player,
      rig = new PlayerRig(this.assets.vec);
    rig.setLook(Save.look());
    this.playerLayer.addChild(rig.root);
    const tl = new Timeline(936, (f, t) => {
      if (PLAYER_STOPS.has(f)) t.stop();
    });
    tl.frame = old.tl.frame;
    tl.playing = old.tl.playing;
    this.oldBodies.push({ rig, tl, x: old.x, y: old.y, gx: old.gx });
    if (this.oldBodies.length > 2) {
      const b = this.oldBodies.shift()!;
      b.rig.root.destroy({ children: true });
    }
    for (const t of this.timers)
      if (t.listener) {
        t.setListener(null);
        t.stop();
      }
    const np = new Player(this);
    np.y = 500;
    this.spawnPlayer = np;
    this.tryingToSpawn = true;
    this.player = np;
    this.player.hidden = true;
  }
  // new runner only enters when nothing hazardous is in the safe area
  manageSpawn() {
    if (!this.tryingToSpawn) return;
    let can = true;
    // playstate the safe-area test only runs outside campaign this.canspawn && !playingcampaign
    if (!this.campaign)
      for (const c of this.chunks)
        for (const o of c.obstacles) {
          if (!o.hit) continue;
          const h = [o.hit[0] + this.layerX, o.hit[1], o.hit[2] + this.layerX, o.hit[3]];
          if (h[0] < 248 && h[2] > 0 && h[1] < 400.95 && h[3] > 0) can = false;
        }
    if (!can) return;
    const p = this.player;
    p.hidden = false;
    p.gx = -100 - 0;
    p.flickerFrame = 120;
    p.shieldOn = false;
    p.goto('run');
    this.tryingToSpawn = false;
    this.gxTween = { t: 0, from: -100 };
  }
  gxTween: { t: number; from: number } | null = null;

  manageDeathCam() {
    const p = this.player;
    if (this.counterForCam < 60 && !this.deathCamFinished) {
      p.x -= this.scroll;
      this.manageBackgrounds();
      this.counterForCam++;
    } else if (this.scroll > 1 && !this.deathCamFinished) {
      p.x -= this.scroll;
      this.manageBackgrounds();
      this.scroll *= 0.95;
    } else if (!this.deathCamFinished) {
      this.deathCamFinished = true;
      Audio.sfx('Rewind');
      if (!this.levelReallyOver && this.startFlagTop) this.startFlagTop.visible = false;
      const d = Math.abs(150 - p.x);
      this.rewind = {
        t: 0,
        px: p.x,
        tx: 150 - p.deathCamOffset,
        lx: this.layerX,
        dl: d - p.deathCamOffset,
        bx: this.bgRender.map(r => r.spr.x),
      };
      this.hud.showGameOver({
        win: false,
        message: this.campaign ? 'FAILED' : 'Your score: ' + this.score,
        coinsEarned: this.campaign ? 0 : Math.round(this.score / 5),
        bank: Math.round(this.score / 5),
        xpGain: (this.campaign ? 10 : this.score / this.xpRate()) + Tasks.evaluate(this.stats, this.score),
        score: this.score,
      });
    }
  }

  // fixed tick
  pPrev = false;
  paused = false;
  pauseClip: VecClip | null = null;
  step() {
    Audio.setDown(this.hud.active);
    // playstate.enterframe p toggles pause only while the game-over screen is not up everything
    // else is skipped while paused
    const pDown = this.keys.P,
      pEdge = pDown && !this.pPrev;
    this.pPrev = pDown; // one toggle per key press
    if (pEdge && !this.hud.active) {
      this.paused = !this.paused;
      // player.unpausestuff restarts its timers from the full delay pausestuff stopped them
      if (!this.paused)
        for (const t of [
          this.player.hoverTimer,
          this.player.floatTimer,
          this.player.rollTimer,
          this.player.slideTimer,
        ])
          if (t && t.running) t.due = this.now + t.delayMs;
      if (!this.pauseClip) {
        this.pauseClip = new VecClip(this.assets.vec, 2568);
        this.pauseClip.setFrame(1, 0);
      }
      this.root.addChild(this.pauseClip);
      this.pauseClip.visible = this.paused;
    }
    if (this.paused) {
      this.keys.update();
      return;
    }
    this.now = this.tick * TICK_MS;
    // timers
    const due = this.timers.filter(t => t.running && t.due <= this.now).sort((a, b) => a.due - b.due);
    for (const t of due) {
      t.stop();
      if (t.listener) {
        const fn = t.listener;
        fn();
      }
    }
    this.timers = this.timers.filter(t => t.running);
    this.playState();
    this.player.enterFrame();
    if (this.fx) {
      const pl = this.player;
      // original particles sit in flaglayer whose x is backgroundlayer.x + 1 only bg took the extra
      // --x at start
      this.fx.world.x = this.layerX + 1;
      this.fx.update({
        x: pl.x,
        y: pl.y,
        gx: pl.gx,
        dead: pl.dead,
        trail: this.rig.trailId,
        left: this.keys.LEFT,
        layerX: this.layerX,
        marker: this.rig.trailMarker,
      });
    }
    // timeline phase
    this.player.tl.advance();
    for (const c of this.chunks) for (const o of c.all) if (o.tl) o.tl.advance();
    if (this.hud.popupWaiting && this.keys.justPressed('SPACE')) this.hud.hidePopup();
    // playstate.enterframe space on the finished game-over screen restarts no try-again click so a
    // counted win stays counted
    if (this.keys.justPressed('SPACE') && this.hud.atEnd && !this.hud.popupActive && this.onExit)
      this.onExit('restartKey');
    this.hud.stepCountdown();
    this.hud.stepPopup();
    this.hud.stepGameOver();
    this.keys.update();
    if (this.tracing)
      this.trace.push({
        t: this.tick,
        x: this.player.x,
        y: this.player.y,
        f: this.player.frame,
        s: this.scroll,
        lx: this.layerX,
        sc: this.score,
        d: this.player.dead,
      });
    this.tick++;
    if (this.restart) {
      this.restart = false;
      this.start();
    }
  }
  // click on the game-over buttons only live once gameover.currentframe > 5
  click(x: number, y: number) {
    if (this.hud.popupWaiting && this.hud.overOk(x, y)) {
      this.hud.hidePopup();
      return;
    }
    const h = this.hud.hit(x, y);
    if (h && this.onExit) this.onExit(h === 'try' ? 'restart' : 'menu');
  }
  hover(x: number, y: number) {
    this.hud.point(x, y);
    return this.hud.hit(x, y) || this.hud.overOk(x, y) ? 'pointer' : 'default';
  }
  render() {
    const p = this.player,
      a = this.assets;
    this.rig.root.position.set(p.x + p.gx, p.y);
    this.rig.root.alpha = p.alpha;
    this.rig.root.visible = p.visible && !p.hidden;
    this.rig.shield = p.shieldOn;
    this.rig.update(p.tl.frame, (a.manifest.player as any).pose[p.tl.frame - 1], this.tick);
    for (const b of this.oldBodies) {
      b.rig.root.position.set(b.x + b.gx, b.y);
      b.rig.update(b.tl.frame, (a.manifest.player as any).pose[b.tl.frame - 1], this.tick);
    }
    for (const c of this.chunks) for (const o of c.all) o.apply(a);
  }
}

class Chunk {
  obstacles: Obstacle[] = [];
  all: Obstacle[] = [];
  add(it: PatItem) {
    const o = new Obstacle(it, this.offsetX, this.g.assets);
    const top = !!it.name && it.name.indexOf('top') !== -1;
    (top ? this.g.fgLayer : this.g.worldLayer).addChild(o.container);
    this.all.push(o);
    if (it.hitBox) this.obstacles.push(o);
  }
  constructor(
    private g: Game,
    public offsetX: number,
  ) {}
  build(items: PatItem[]) {
    for (const it of items) {
      let pf = 0;
      if (it.name && it.name.indexOf('powerup') !== -1) {
        // background 35 % of the powerup spots in survival frame floor random * 4 0 clamps to 1
        if (!(this.g.rng() <= 0.35 && !this.g.campaign)) continue;
        pf = Math.max(1, Math.floor(this.g.rng() * 4));
      }
      const o = new Obstacle(it, this.offsetX, this.g.assets);
      if (pf) {
        o.tl!.gotoAndStop(pf);
      }
      const top = !!it.name && it.name.indexOf('top') !== -1;
      (top ? this.g.fgLayer : this.g.worldLayer).addChild(o.container);
      this.all.push(o);
      if (it.hitBox) this.obstacles.push(o);
    }
  }
  kill() {
    for (const o of this.all) o.container.destroy({ children: true });
    this.all = [];
    this.obstacles = [];
  }
}
