import * as PIXI from 'pixi.js';

export const FPS = 45;
export const TICK_MS = 1000 / FPS;
export const W = 750,
  H = 400;
export const CHUNK = 1500;
export const GROUND_Y = 360;

export interface Fr {
  p: number;
  x: number;
  y: number;
  w: number;
  h: number;
  ox: number;
  oy: number;
}
export interface Manifest {
  pages: { player: string[]; obst: string[] };
  player: { frames: Fr[] };
  sprites: Record<string, { origin: number[]; n: number; frames: Fr[] }>;
  shapes: Record<string, { origin: number[]; frames: Fr[] }>;
  bgs: Record<string, { file: string; w: number; h: number }>;
}
export interface PatItem {
  name: string | null;
  id: number;
  kind: 'sprite' | 'shape';
  m: number[];
  depth: number;
  hitBox?: number[];
  frames?: number;
  labels?: Record<string, string>;
}
export interface BgItem extends PatItem {
  bounds?: number[];
}
export interface LevelData {
  root: number;
  bgClip: number;
  obsClip: number;
  obsM: number[];
  bgM: number[];
  patterns: PatItem[][];
  backgrounds: Record<string, BgItem[]>;
}
export type LevelName = 'village' | 'cave' | 'castle' | 'factory' | 'ruins';
export const LEVEL_ORDER: LevelName[] = ['village', 'cave', 'castle', 'factory', 'ruins'];
// playstate constructor backgroundstofinish / startingspeed / ovveridecoin / overridescore and the
// unlock reward playstate.enterframe
export const LEVEL_CFG: Record<
  LevelName,
  { finish: number; speed: number; coin: number; score: number; skin: [number, string]; card: number }
> = {
  village: { finish: 1, speed: 8, coin: 200, score: 215, skin: [61, 'Athlete'], card: 37 },
  cave: { finish: 9, speed: 10, coin: 500, score: 415, skin: [63, 'Caveman'], card: 38 },
  castle: { finish: 14, speed: 11, coin: 800, score: 715, skin: [65, 'Badhair'], card: 39 },
  factory: { finish: 19, speed: 12, coin: 1200, score: 1115, skin: [62, 'Sheepy'], card: 40 },
  ruins: { finish: 20, speed: 13, coin: 2000, score: 1500, skin: [64, 'Kassax'], card: 41 },
};
export interface PlayerData {
  labels: Record<string, string>;
  hitbox: number[][];
}
