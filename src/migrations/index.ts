import * as migration_20260106_030855 from './20260106_030855';
import * as migration_20260106_214915 from './20260106_214915';
import * as migration_20260111_183413 from './20260111_183413';
import * as migration_20260528_fix_privacy_policy_pdf_column from './20260528_fix_privacy_policy_pdf_column';
import * as migration_20260621_add_nip_to_site_settings from './20260621_add_nip_to_site_settings';
import * as migration_20260705_add_reservation_number from './20260705_add_reservation_number';
import * as migration_20260708_add_event_type_fields from './20260708_add_event_type_fields';
import * as migration_20260708_fix_events_kind from './20260708_fix_events_kind';
import * as migration_20260712_add_reservation_segments from './20260712_add_reservation_segments';
import * as migration_20260712_add_occasional_inquiry_payment_fields from './20260712_add_occasional_inquiry_payment_fields';
import * as migration_20260712_add_expires_at_to_reservations from './20260712_add_expires_at_to_reservations';
import * as migration_20260712_add_internal_note_to_reservations from './20260712_add_internal_note_to_reservations';

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
  {
    up: migration_20260705_add_reservation_number.up,
    down: migration_20260705_add_reservation_number.down,
    name: '20260705_add_reservation_number',
  },
  {
    up: migration_20260708_add_event_type_fields.up,
    down: migration_20260708_add_event_type_fields.down,
    name: '20260708_add_event_type_fields',
  },
  {
    up: migration_20260708_fix_events_kind.up,
    down: migration_20260708_fix_events_kind.down,
    name: '20260708_fix_events_kind',
  },
  {
    up: migration_20260712_add_reservation_segments.up,
    down: migration_20260712_add_reservation_segments.down,
    name: '20260712_add_reservation_segments',
  },
  {
    up: migration_20260712_add_occasional_inquiry_payment_fields.up,
    down: migration_20260712_add_occasional_inquiry_payment_fields.down,
    name: '20260712_add_occasional_inquiry_payment_fields',
  },
  {
    up: migration_20260712_add_expires_at_to_reservations.up,
    down: migration_20260712_add_expires_at_to_reservations.down,
    name: '20260712_add_expires_at_to_reservations',
  },
  {
    up: migration_20260712_add_internal_note_to_reservations.up,
    down: migration_20260712_add_internal_note_to_reservations.down,
    name: '20260712_add_internal_note_to_reservations',
  },
];
