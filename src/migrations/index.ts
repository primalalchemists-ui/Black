import * as migration_20260106_030855 from './20260106_030855';
import * as migration_20260106_214915 from './20260106_214915';
import * as migration_20260111_183413 from './20260111_183413';
import * as migration_20260528_fix_privacy_policy_pdf_column from './20260528_fix_privacy_policy_pdf_column';
import * as migration_20260621_add_nip_to_site_settings from './20260621_add_nip_to_site_settings';

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
    name: '20260111_183413',
  },
  {
    up: migration_20260528_fix_privacy_policy_pdf_column.up,
    down: migration_20260528_fix_privacy_policy_pdf_column.down,
    name: '20260528_fix_privacy_policy_pdf_column',
  },
  {
    up: migration_20260621_add_nip_to_site_settings.up,
    down: migration_20260621_add_nip_to_site_settings.down,
    name: '20260621_add_nip_to_site_settings',
  },
];
