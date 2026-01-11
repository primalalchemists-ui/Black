import * as migration_20260106_030855 from './20260106_030855';
import * as migration_20260106_214915 from './20260106_214915';

export const migrations = [
  {
    up: migration_20260106_030855.up,
    down: migration_20260106_030855.down,
    name: '20260106_030855',
  },
  {
    up: migration_20260106_214915.up,
    down: migration_20260106_214915.down,
    name: '20260106_214915'
  },
];
