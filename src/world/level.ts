// What a biome hands to the game: something to draw, something to collide with, and where
// the story and the fights happen.
import type * as THREE from 'three';
import type { SigilId } from '../magic/sigils';

export type EnemyKind = 'drowned' | 'spitter';

export interface SpawnGroup {
  kind: EnemyKind;
  count: number;
  /** Where the group rises from. */
  at: THREE.Vector3;
  /** Seconds after the wave begins. */
  delay: number;
}

export interface SealDef {
  /** Centre of the ward on the ground. */
  at: THREE.Vector3;
  /** Direction the ward faces (it spans perpendicular to this). */
  facing: number;
  width: number;
  height: number;
  /** 'entry' wards rise when the stand begins; 'exit' wards stand until it is won. */
  role: 'entry' | 'exit';
}

export interface StandDef {
  id: string;
  name: string;
  center: THREE.Vector3;
  /** Walking inside this radius begins the stand. */
  radius: number;
  waves: SpawnGroup[][];
  seals: SealDef[];
}

export interface JournalDef {
  id: string;
  position: THREE.Vector3;
  title: string;
  /** Paragraphs in the mage's hand. */
  text: string[];
  teaches?: SigilId;
}

export interface Level {
  id: string;
  name: string;
  night: string;
  /** Everything visible. */
  root: THREE.Object3D;
  /** World-space triangles to walk on and bump into. */
  collision: THREE.BufferGeometry;
  spawn: { position: THREE.Vector3; yaw: number };
  journals: JournalDef[];
  stands: StandDef[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  waterLevel: number;
  /** Called every frame for things like water and flames. */
  update?: (time: number, dt: number) => void;
}
