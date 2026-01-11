import * as migration_20260106_030855 from './20260106_030855';
import * as migration_20260106_214915 from './20260106_214915';
import * as migration_20260111_183413 from './20260111_183413';

export const migrations = [
  {
    up: migration_20260106_030855.up,
    down: migration_20260106_030855.down,
    name: '20260106_030855',
  },
  {
    up: migration_20260106_214915.up,
    down: migration_20260106_214915.down,
    name: '20260106_214915',
  },
  {
    up: migration_20260111_183413.up,
    down: migration_20260111_183413.down,
    name: '20260111_183413'
  },
];
