import { Save } from './hud';

// task.as
export interface TaskT {
  taskType: string;
  message: string;
  timesToDo: number;
  xp: number;
}
export const mkTask = (taskType: string, n: number, level = 1): TaskT => {
  const xp = level === 2 ? 150 : level === 3 ? 300 : 80;
  const msg: Record<string, string> = {
    slideSeconds: 'Slide for ' + n + ' seconds in a run',
    rollSeconds: 'Roll for ' + n + ' seconds in a run',
    jumpTimes: 'Jump ' + n + ' times in a single run',
    smashTimes: 'Break ' + n + ' obstacles in a single run',
    warpTimes: 'Warp ' + n + ' times in a single run',
    powerUpTimes:
      n === 1 ? 'Get ' + n + ' powerup in a single run' : 'Get ' + n + ' powerups in a single run',
    hoverSeconds: 'Hover ' + n + ' seconds in a single run',
    noMotionSeconds: 'Last ' + n + ' sec. without moving horizontally',
    scoreCheck: 'Get a score of ' + n + ' points',
  };
  return { taskType, message: msg[taskType] ?? '', timesToDo: n, xp };
};
// menustate.easytasklist / mediumtasklist / hardtasklist
export const EASY = (): TaskT[] => [
  mkTask('slideSeconds', 10),
  mkTask('rollSeconds', 10),
  mkTask('smashTimes', 5),
  mkTask('powerUpTimes', 1),
  mkTask('scoreCheck', 500),
  mkTask('hoverSeconds', 10),
  mkTask('noMotionSeconds', 10),
];
export const MEDIUM = (): TaskT[] => [
  mkTask('slideSeconds', 20, 2),
  mkTask('rollSeconds', 20, 2),
  mkTask('jumpTimes', 50, 2),
  mkTask('smashTimes', 10, 2),
  mkTask('warpTimes', 2, 2),
  mkTask('powerUpTimes', 3, 2),
  mkTask('scoreCheck', 1000, 2),
  mkTask('hoverSeconds', 20, 2),
  mkTask('noMotionSeconds', 20, 2),
];
export const HARD = (): TaskT[] => [
  mkTask('slideSeconds', 30, 3),
  mkTask('rollSeconds', 30, 3),
  mkTask('jumpTimes', 100, 3),
  mkTask('smashTimes', 20, 3),
  mkTask('powerUpTimes', 6, 3),
  mkTask('scoreCheck', 1500, 3),
  mkTask('hoverSeconds', 30, 3),
  mkTask('noMotionSeconds', 30, 3),
];

export interface RunStats {
  slide: number;
  roll: number;
  jump: number;
  smash: number;
  warp: number;
  power: number;
  hover: number;
  noMotion: number;
}
export const emptyStats = (): RunStats => ({
  slide: 0,
  roll: 0,
  jump: 0,
  smash: 0,
  warp: 0,
  power: 0,
  hover: 0,
  noMotion: 0,
});

const same = (a: TaskT, b: TaskT) =>
  a && b && a.taskType === b.taskType && a.timesToDo === b.timesToDo && a.xp === b.xp;
const shuffle = <T>(a: T[]) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
};

// menustate task helpers + the game.notificationlist queue
export const Tasks = {
  notifications: [] as [string, string][],
  // menustate.clearsavedata the first three tasks of a shuffled easy list
  init() {
    const d = Save.data;
    if (!d.tasksList || d.tasksList.length === 0) {
      d.tasksList = [];
      d.chosenTasks = [];
      this.addSet(EASY());
      this.shuffle();
      this.newTask(1, false);
      this.newTask(2, false);
      this.newTask(3, false);
    }
    Save.flush();
  },
  addSet(l: TaskT[]) {
    for (const t of l) Save.data.tasksList.push(t);
  },
  shuffle() {
    shuffle(Save.data.tasksList);
  },
  // menustate.newtask replace chosen task n with a task that is not currently chosen
  newTask(n: number, flush = true) {
    const d = Save.data,
      ch = d.chosenTasks;
    const old = [ch[0], ch[1], ch[2]];
    if (ch.length < 3) ch[n - 1] = d.tasksList[n - 1];
    if (ch.length === 3) {
      let pick: TaskT | null = null;
      // every candidate overwrites the previous one the last wins
      for (const t of d.tasksList) if (!old.some(o => same(o, t))) pick = t;
      this.shuffle();
      const cand = d.tasksList.filter(t => !old.some(o => same(o, t)));
      if (pick && cand.length) pick = cand[cand.length - 1];
      if (pick) ch[n - 1] = pick;
    }
    if (flush) Save.flush();
  },
  // playstate.savequick finished tasks give their xp and are replaced returns the xp gained
  evaluate(s: RunStats, score: number): number {
    const d = Save.data;
    let xp = 0;
    this.shuffle();
    const val: Record<string, number> = {
      smashTimes: s.smash,
      slideSeconds: s.slide,
      rollSeconds: s.roll,
      jumpTimes: s.jump,
      warpTimes: s.warp,
      powerUpTimes: s.power,
      hoverSeconds: s.hover,
      noMotionSeconds: s.noMotion,
      scoreCheck: score,
    };
    for (let i = 1; i <= d.chosenTasks.length; i++) {
      const t = d.chosenTasks[i - 1];
      if (t && t.timesToDo <= (val[t.taskType] ?? -1)) {
        const msg = t.message;
        this.newTask(i);
        xp += t.xp;
        const nm = d.chosenTasks[i - 1].message;
        this.notify(msg, nm);
      }
    }
    return xp;
  },
  // game.showtasknotification
  notify(oldText: string, newText: string) {
    this.notifications.push([oldText, newText]);
    const d = Save.data;
    if (d.tasksUnlocked === 3) this.addSet(MEDIUM());
    if (d.tasksUnlocked === 8) this.addSet(HARD());
    d.tasksUnlocked++;
    d.taskDone++;
    Save.flush();
  },
};

// task notification clip, slides down from the top when there is a new one
// tasks.notifications has an entry
import * as PIXI from 'pixi.js';
import { VecAssets, VecClip } from './vec';
import { FONT } from './hud';
export class TaskNotif {
  root = new PIXI.Container();
  private clip: VecClip;
  private f = 1;
  private tf = 1;
  private t = 0;
  private hiding = false;
  private tx: PIXI.Text[] = [];
  private boxes: PIXI.Container[] = [];
  constructor(a: VecAssets) {
    this.clip = new VecClip(a, 167);
    this.clip.relative = true;
    this.root.addChild(this.clip);
    for (let i = 0; i < 2; i++) {
      const t = new PIXI.Text('', {
        fontFamily: FONT,
        fontSize: 18,
        fill: 0xdfbe99,
        wordWrap: true,
        wordWrapWidth: 168,
        lineHeight: 22,
      } as any);
      const st = t.style as any;
      st.stroke = 0x5d4328;
      st.strokeThickness = 4;
      st.lineJoin = 'round';
      t.position.set(2, 2);
      const b = new PIXI.Container();
      b.addChild(t);
      this.boxes.push(b);
      this.tx.push(t);
    }
    this.clip.mounts = { 'popup.tasktext.task1': this.boxes[0], 'popup.tasktext.task2': this.boxes[1] };
    this.draw();
  }
  private draw() {
    this.clip.ctl = { tasktext: this.tf, tasks: false };
    this.clip.setFrame(this.f, this.t);
  }
  step() {
    this.t++;
    if (Tasks.notifications.length > 0 && this.f === 1) {
      const [o, n] = Tasks.notifications.shift()!;
      this.tx[0].text = o;
      this.tx[1].text = n;
      this.f = 2;
      this.tf = 1;
      this.hiding = false;
    }
    if (this.f !== 1) {
      if (this.tf < 146) this.tf++;
      if (!this.hiding) {
        if (this.f < 15) this.f++;
      } else {
        this.f++;
        if (this.f > 30) this.f = 1;
      }
      if (!this.hiding && this.tf === 146) {
        this.hiding = true;
        this.f = 16;
      }
    } else this.tf = 1;
    this.root.visible = this.f !== 1;
    this.draw();
  }
}
