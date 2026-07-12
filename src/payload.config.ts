import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { pl } from '@payloadcms/translations/languages/pl'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Events } from './collections/Events'
import { MenuCategories } from './collections/MenuCategories'
import { MenuItems } from './collections/MenuItems'
import { Resources } from './collections/Resources'
import { Reservations } from './collections/Reservations'
import { OccasionalInquiries } from './collections/OccasionalInquiries'
import { Payments } from './collections/Payments'
import { Blackouts } from './collections/Blackouts'

import { SiteSettings } from './globals/SiteSettings'
import { DishOfDay } from './globals/DishOfDay'
import { ReservationSettings } from './globals/ReservationSettings'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// DB
const DATABASE_URL = process.env.DATABASE_URL || ''
if (!DATABASE_URL) {
  console.warn('[Payload] DATABASE_URL is missing (likely during build). Make sure it exists at runtime.')
}

// S3 (Supabase)
const S3_BUCKET = process.env.S3_BUCKET || ''
const S3_ENDPOINT = process.env.S3_ENDPOINT || ''
const S3_REGION = process.env.S3_REGION || ''
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID || ''
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY || ''

const hasS3 =
  S3_BUCKET && S3_ENDPOINT && S3_REGION && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY

if (!hasS3) {
  console.warn(
    '[Payload] S3 envs missing. Media uploads will NOT work until you set: S3_BUCKET, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.',
  )
}

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    components: {
      graphics: {
        Logo: '@/components/admin/AdminLogo#AdminLogo',
        Icon: '@/components/admin/AdminIcon#AdminIcon',
      },
      views: {
        dashboard: {
          Component: '@/components/admin/AdminDashboard#AdminDashboard',
        },
      },
    },
    meta: {
      titleSuffix: ' — BLACK',
    },
  },

  i18n: {
    supportedLanguages: { pl },
    fallbackLanguage: 'pl',
    translations: {
      pl: {
        general: {
          createNew: 'Dodaj nowy',
          noResults: 'Brak wyników',
        },
      },
    },
  },

  collections: [
    // Obsługa
    Reservations,
    Payments,
    Blackouts,
    OccasionalInquiries,
    // Restauracja
    MenuCategories,
    MenuItems,
    // Wydarzenia
    Events,
    Media,
    // Ustawienia
    Resources,
    // Administracja
    Users,
  ],

  globals: [
    // Restauracja
    DishOfDay,
    // Ustawienia
    ReservationSettings,
    SiteSettings,
  ],

  editor: lexicalEditor(),

  secret: process.env.PAYLOAD_SECRET || '',

  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },

  db: postgresAdapter({
    pool: {
      connectionString: DATABASE_URL,
    },
    push: false,
  }),

  plugins: [
    ...(hasS3
      ? [
          s3Storage({
            collections: {
              // zakładam że slug w Media to "media"
              media: true,
            },
            bucket: S3_BUCKET,
            config: {
              credentials: {
                accessKeyId: S3_ACCESS_KEY_ID,
                secretAccessKey: S3_SECRET_ACCESS_KEY,
              },
              region: S3_REGION,
              endpoint: S3_ENDPOINT,
              // Supabase S3 wymaga:
              forcePathStyle: true,
            },
          }),
        ]
      : []),
  ],

  sharp,
})
