import * as PIXI from 'pixi.js';
import { Assets, Game, Keys, TICK_MS, W, H, type LevelName } from './game';
import { Menu } from './menu';
import { Editor } from './editor';
import { Shop } from './shop';
import { TaskNotif, Tasks } from './tasks';
import { Audio } from './audio';
import { soundHook, VecShape, GlowFilter } from './vec';
import { HudAssets, Sys, Save, Hud } from './hud';

// bar wipe transition between screens, 20px bars over 1.1s
// keep the 2d canvases in cpu memory, chrome gpu backs them otherwise and every upload stalls, big reason for low fps on chromebooks
{
  const gc = HTMLCanvasElement.prototype.getContext as any;
  (HTMLCanvasElement.prototype as any).getContext = function (
    this: HTMLCanvasElement,
    type: string,
    opts?: any,
  ) {
    return gc.call(this, type, type === '2d' ? { willReadFrequently: true, ...(opts || {}) } : opts);
  };
}

class BarsTransition {
  root = new PIXI.Container();
  private cols: PIXI.Sprite[] = [];
  t = 0;
  done = false;
  static readonly TICKS = 49.5 + 0.5;
  constructor(snapshot: PIXI.Texture) {
    const n = Math.floor(W / 20),
      w = W / n;
    for (let j = 0; j < n; j++) {
      // fractional scales make the snapshot a bit smaller than 750x400, clamp the strip then stretch back
      const bt = snapshot.baseTexture,
        sw = bt.width / bt.resolution,
        sh = bt.height / bt.resolution,
        fx = sw / W,
        fy = sh / H;
      const s = new PIXI.Sprite(
        new PIXI.Texture(bt, new PIXI.Rectangle(j * w * fx, 0, Math.min(w * fx, sw - j * w * fx), sh)),
      );
      s.scale.set(1 / fx, 1 / fy);
      s.x = j * w;
      this.cols.push(s);
      this.root.addChild(s);
    }
  }
  step() {
    this.t++;
    const off = 255 - 510 * Math.min(1, Math.max(0, this.t - 0.5) / 49.5);
    const n = this.cols.length;
    this.cols.forEach((s, j) => {
      s.alpha = Math.min(1, Math.max(0, (255 * ((j + 1) / n) + off) / 255));
    });
    if (this.t >= 50) this.done = true;
  }
}

// msaa smooths edges but software renderers cant handle it
function hwGpu(): boolean {
  if (/[?&]aa=0/.test(location.search)) return false;
  if (/[?&]aa=1/.test(location.search)) return true;
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    const r = ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    return !/swiftshader|llvmpipe|software|softpipe/i.test(r);
  } catch (e) {
    return true;
  }
}

async function main() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const app = new PIXI.Application({
    view: canvas,
    width: W,
    height: H,
    backgroundColor: 0x000000,
    antialias: false,
    resolution: 1,
    autoStart: false,
  });
  const assets = new Assets();
  assets.vec.renderer = app.renderer as PIXI.Renderer;
  const hudAssets = new HudAssets();
  await Promise.all([assets.load('./'), hudAssets.load('./')]);
  // render at the size the canvas is actually shown at
  const fitRes = () => {
    const s = Math.min(innerWidth / W, innerHeight / H),
      r = Math.max(0.5, Math.min(2, s * (window.devicePixelRatio || 1)) * [1, 0.7, 0.5][Sys.quality]);
    app.renderer.resolution = r;
    app.renderer.resize(W, H);
    assets.vec.setScale(r);
    canvas.style.width = W * s + 'px';
    canvas.style.height = H * s + 'px';
  };
  window.addEventListener('resize', fitRes);
  fitRes();
  soundHook.fn = id => Audio.sfx('s' + id);
  const keys = new Keys();
  const menu = new Menu();
  await Promise.all([menu.load('./', assets.vec), assets.vec.preload([167, 3712, 3736, 3811, 247])]);
  assets.vec.preload([4420, 4221, 4228]); // shop fetched in the background not needed to show the menu
  menu.onQuality = () => {
    Sys.quality = (Sys.quality + 1) % 3;
    fitRes();
  }; // stage.quality high to medium to low
  const shop = new Shop(assets.vec, hudAssets);
  menu.attachShop(shop);
  // game.unlockedscreen over the menu mega wheel prizes
  menu.attachPopup(new Hud(hudAssets, assets.vec, false));
  const editor = new Editor(hudAssets, assets.vec, assets.trails);
  editor.root.x = W;
  editor.root.visible = false;
  const gameRoot = new PIXI.Container();
  gameRoot.visible = false;
  const slideRoot = new PIXI.Container();
  slideRoot.addChild(menu.root, editor.root);
  const taskNotif = new TaskNotif(assets.vec);
  app.stage.addChild(gameRoot, slideRoot, taskNotif.root);
  let game: Game | null = null;
  let trans: BarsTransition | null = null;
  let mode: 'menu' | 'game' | 'editor' = 'menu';
  let slide = 0,
    slideDir = 0;

  const snapshot = (root: PIXI.Container) => {
    app.renderer.render(root);
    return app.renderer.generateTexture(root, { region: new PIXI.Rectangle(0, 0, W, H) });
  };
  const cover = (snap: PIXI.Texture) => {
    trans = new BarsTransition(snap);
    app.stage.addChild(trans.root);
  };
  let bulkDone = false;
  // rasterise and upload the levels art over a few frames so the first run doesnt hitch
  let warmWait: (() => void) | null = null,
    warmEnd = 0;
  const warmThen = (level: LevelName | null, counting: boolean) => {
    doStart(level, counting);
  };
  const startGame = (level: LevelName | null, counting: boolean) => {
    // only wait for the shared art and this levels sheets, the rest keeps loading behind
    const lv = assets.vec.preload([assets.levels[level ?? 'village'].root]);
    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      warmThen(level, counting);
    };
    setTimeout(go, 20000); // never hang on a stalled download start anyway art streams in as it arrives
    const fail = (e: any) => {
      console.warn('preload', e);
      go();
    };
    if (bulkDone) lv.then(go, fail);
    else
      Promise.all([assets.startBulk(), lv]).then(() => {
        bulkDone = true;
        go();
      }, fail);
  };
  const doStart = (level: LevelName | null, counting: boolean) => {
    game = new Game(gameRoot, assets, keys, hudAssets, level !== null, level ?? 'village', counting);
    mode = 'game';
    const LM: Record<string, 'Village' | 'Caves' | 'Castle' | 'Factory' | 'Ruins'> = {
      village: 'Village',
      cave: 'Caves',
      castle: 'Castle',
      factory: 'Factory',
      ruins: 'Ruins',
    };
    Audio.enterArea(LM[level ?? 'village'], 0); // playstate enterarea <level background>
    game.onExit = to => {
      if (!game || trans) return;
      game.render();
      const snap = snapshot(gameRoot);
      const wasCampaign = game.wonLevel,
        wasCounting = game.countingAsWin;
      if (to === 'restart' || to === 'restartKey') {
        if (to === 'restart') game.afterTryAgain();
        game.start();
      } else {
        game = null;
        mode = 'menu';
        gameRoot.removeChildren();
        gameRoot.visible = false;
        Audio.enterArea('MenuSound', 0);
        menu.root.visible = true;
        menu.showAfterGame(wasCampaign, wasCounting);
      }
      cover(snap);
    };
    (window as any).__game = game;
  };
  const begin = (level: LevelName | null, counting: boolean) => {
    if (mode !== 'menu') return;
    const snap = snapshot(menu.root);
    gameRoot.removeChildren();
    gameRoot.visible = true;
    startGame(level, counting);
    cover(snap);
    menu.root.visible = false;
  };
  menu.onStart = (level, counting) => begin(level, counting);
  menu.onSurvival = () => begin(null, false);

  // menustate.gotoeditor / back the whole stage shifts 800 px over one second quad.easeout
  const slideTo = (dir: 1 | -1) => {
    slide = 0;
    slideDir = dir;
    editor.root.visible = true;
    if (dir === 1) {
      editor.refresh();
      mode = 'editor';
    }
  };
  menu.onRunner = () => {
    if (mode === 'menu') slideTo(1);
  };
  editor.onBack = () => {
    if (!slideDir) slideTo(-1);
  };
  const setSlide = (p: number) => {
    const e = 1 - (1 - p) * (1 - p);
    slideRoot.x = -W * (slideDir === 1 ? e : 1 - e);
  };

  const pt = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) * W) / r.width, ((e.clientY - r.top) * H) / r.height];
  };
  canvas.addEventListener('pointermove', e => {
    const [x, y] = pt(e);
    if (mode === 'menu') {
      menu.hover(x, y);
      canvas.style.cursor = menu.cursor;
    } else if (mode === 'editor') {
      if (!slideDir) editor.hover(x - 0, y);
      canvas.style.cursor = editor.cursor;
    } else if (game) canvas.style.cursor = game.hover(x, y);
  });
  window.addEventListener('pointerup', e => {
    const [x, y] = pt(e);
    if (mode === 'menu') menu.release(x, y);
  });
  window.addEventListener('pointercancel', () => {
    if (mode === 'menu') menu.release(-999, -999);
  });
  canvas.addEventListener('pointerdown', e => {
    const [x, y] = pt(e);
    if (mode === 'menu') menu.click(x, y);
    else if (mode === 'editor') {
      if (!slideDir) editor.click(x, y);
    } else if (game) game.click(x, y);
  });
  // wasd = arrows, q cycles quality, konami code gets checked on key up
  const WASD: Record<number, number> = { 87: 38, 83: 40, 68: 39, 65: 37 };
  const KNAME: Record<number, string> = { 38: 'UP', 40: 'DOWN', 37: 'LEFT', 39: 'RIGHT', 32: 'SPACE' };
  for (let c = 65; c <= 90; c++) KNAME[c] = String.fromCharCode(c);
  for (let c = 48; c <= 57; c++)
    KNAME[c] = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'][c - 48];
  let lastKeys = '';
  const kd = (e: KeyboardEvent) => {
    const code = mode === 'game' ? (WASD[e.keyCode] ?? e.keyCode) : e.keyCode;
    if (e.keyCode === 32 && mode === 'menu') menu.space();
    if (e.keyCode === 81) {
      Sys.quality = (Sys.quality + 1) % 3;
      fitRes();
    }
    if (KNAME[code]) lastKeys = (lastKeys + KNAME[code]).slice(-120);
    if (keys.down(code)) e.preventDefault();
  };
  const ku = (e: KeyboardEvent) => {
    const code = mode === 'game' ? (WASD[e.keyCode] ?? e.keyCode) : e.keyCode;
    if (keys.up(code)) e.preventDefault();
    if (lastKeys.indexOf('UPUPDOWNDOWNLEFTRIGHTLEFTRIGHTBA') !== -1 && !(Save.data as any).konami) {
      const d = Save.data as any;
      d.xpLevel = 2;
      d.coins += 5000;
      d.konami = true;
      Save.flush(); // konami code level 2 unlocks survival + 5000 coins
      editor.refresh();
    }
  };
  // audio only starts after a click or keypress
  setInterval(() => {
    if (Save.data.time) {
      Save.data.time++;
      Save.flush();
    }
  }, 60000); // game.timer +1 minute of play time every 60 s
  const gesture = () => {
    Audio.unlock();
    window.removeEventListener('pointerdown', gesture);
    window.removeEventListener('keydown', gesture);
  };
  window.addEventListener('pointerdown', gesture);
  window.addEventListener('keydown', gesture);
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  window.addEventListener('blur', () => keys.reset());

  // compile the filter shaders while still in the menu, real gpu drivers stall for ages on first use
  const warmShaders = () => {
    const rt = PIXI.RenderTexture.create({ width: 16, height: 16 });
    const mk = (): PIXI.Sprite => {
      const s = new PIXI.Sprite(PIXI.Texture.WHITE);
      s.width = s.height = 8;
      return s;
    };
    const steps: (() => void)[] = [
      () => {
        const s = mk();
        s.filters = [new GlowFilter([255, 255, 255, 255], 5, 5, 4)];
        app.renderer.render(s, { renderTexture: rt });
      },
      () => {
        const s = mk();
        s.filters = [new PIXI.ColorMatrixFilter()];
        app.renderer.render(s, { renderTexture: rt });
      },
      () => {
        const c = new PIXI.Container(),
          s = mk(),
          k = mk();
        c.addChild(k, s);
        s.mask = k;
        app.renderer.render(c, { renderTexture: rt });
      },
      () => {
        const c = new PIXI.Container(),
          s = mk(),
          k = mk();
        k.texture = PIXI.Texture.WHITE;
        c.addChild(k, s);
        s.mask = k;
        k.renderable = true;
        app.renderer.render(c, { renderTexture: rt });
      },
      () => {
        const s = mk();
        s.filters = [new PIXI.BlurFilter(2)];
        app.renderer.render(s, { renderTexture: rt });
      },
    ];
    let i = 0;
    const next = () => {
      if (i < steps.length) {
        try {
          steps[i++]();
        } catch (e) {
          console.warn('warm', e);
        }
        setTimeout(next, 120);
      } else rt.destroy(true);
    };
    setTimeout(next, 1500);
  };
  let errN = 0;
  const fail = (w: string, e: any) => {
    if (errN++ < 5) console.error('[' + w + ']', e);
    (window as any).__err = String((e && e.stack) || e).slice(0, 600);
  };
  const tick = () => {
    Audio.step();
    if (mode === 'menu' || mode === 'editor') {
      menu.step();
      if (mode === 'editor') editor.step();
      if (slideDir) {
        slide++;
        setSlide(Math.min(1, slide / 45));
        if (slide >= 45) {
          if (slideDir === -1) {
            mode = 'menu';
            editor.root.visible = false;
          }
          slideDir = 0;
        }
      }
    } else if (game) {
      try {
        game.step();
      } catch (e) {
        fail('game.step', e);
      }
    }
    taskNotif.step();
    if (trans) {
      trans.step();
      if (trans.done) {
        app.stage.removeChild(trans.root);
        trans = null;
      }
    }
  };
  const draw = () => {
    if (mode === 'game' && game) {
      try {
        game.render();
      } catch (e) {
        fail('game.render', e);
      }
    }
    app.render();
  };
  (window as any).__app = {
    PIXI,
    VecShape,
    app,
    audio: Audio,
    vec: assets.vec,
    notify: (a: string, b: string) => Tasks.notifications.push([a, b]),
    menu,
    editor,
    tick,
    draw,
    keys,
    get game() {
      return game;
    },
  };
  let gcN = 0,
    last = performance.now(),
    acc = 0,
    fLast = last,
    fAcc = 0,
    fN = 0;
  const loop = (t: number) => {
    requestAnimationFrame(loop); // schedule first an exception below must never kill the loop
    acc += Math.min(250, t - last);
    last = t;
    try {
      while (acc >= TICK_MS) {
        tick();
        acc -= TICK_MS;
      }
    } catch (e) {
      acc = 0;
      fail('tick', e);
    }
    try {
      draw();
    } catch (e) {
      fail('draw', e);
    }
    if (++gcN % 120 === 0) assets.vec.gc();
  };
  if (!location.search.includes('manual')) requestAnimationFrame(loop);
  (window as any).__ready = true;
  {
    const l = document.getElementById('load');
    if (l) {
      l.style.opacity = '0';
      setTimeout(() => l.remove(), 400);
    }
  }
  assets.startBulk().then(warmShaders);
}
main();
