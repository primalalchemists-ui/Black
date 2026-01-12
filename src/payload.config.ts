// import { postgresAdapter } from '@payloadcms/db-postgres'
// import { lexicalEditor } from '@payloadcms/richtext-lexical'
// import path from 'path'
// import { buildConfig } from 'payload'
// import { fileURLToPath } from 'url'
// import sharp from 'sharp'

// import { Users } from './collections/Users'
// import { Media } from './collections/Media'

// import { Events } from './collections/Events'
// import { MenuCategories } from './collections/MenuCategories'
// import { MenuItems } from './collections/MenuItems'
// import { Resources } from './collections/Resources'
// import { Reservations } from './collections/Reservations'
// import { OccasionalInquiries } from './collections/OccasionalInquiries'
// import { Payments } from './collections/Payments'
// import { Blackouts } from './collections/Blackouts'

// import { SiteSettings } from './globals/SiteSettings'
// import { DishOfDay } from './globals/DishOfDay'
// import { ReservationSettings } from './globals/ReservationSettings'


// const filename = fileURLToPath(import.meta.url)
// const dirname = path.dirname(filename)

// export default buildConfig({
//   admin: {
//     user: Users.slug,
//     importMap: {
//       baseDir: path.resolve(dirname),
//     },
//   },
//   collections: [
//     Users,
//     Media,
//     Events,
//     MenuCategories,
//     MenuItems,
//     Resources,
//     Reservations,
//     OccasionalInquiries,
//     Payments,
//     Blackouts,
//   ],
//   globals: [
//     SiteSettings,
//     DishOfDay,
//     ReservationSettings,
//   ],

//   editor: lexicalEditor(),
//   secret: process.env.PAYLOAD_SECRET || '',
//   typescript: {
//     outputFile: path.resolve(dirname, 'payload-types.ts'),
//   },
//   db: postgresAdapter({
//     pool: {
//       connectionString: process.env.DATABASE_URL || '',
//     },
//   }),
//   sharp,
//   plugins: [],
// })

import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
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

/**
 * Fail fast — jeśli Railway nie poda DATABASE_URL albo coś nadpisuje,
 * zobaczysz to od razu w logach zamiast błędów typu "base / ENOTFOUND".
 */
const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  throw new Error('Missing DATABASE_URL env var. Add a Railway Variable Reference from Postgres -> DATABASE_URL.')
}

// Opcjonalny mini-debug (możesz usunąć po naprawie):
// console.log('DB host:', DATABASE_URL.split('@')[1]?.split('/')[0])

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },

  collections: [
    Users,
    Media,
    Events,
    MenuCategories,
    MenuItems,
    Resources,
    Reservations,
    OccasionalInquiries,
    Payments,
    Blackouts,
  ],

  globals: [SiteSettings, DishOfDay, ReservationSettings],

  editor: lexicalEditor(),

  secret: process.env.PAYLOAD_SECRET || '',

  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },

  db: postgresAdapter({
    pool: {
      connectionString: DATABASE_URL,

      /**
       * Jeśli używasz "DATABASE_PUBLIC_URL" zamiast wewnętrznego DATABASE_URL,
       * czasem trzeba włączyć SSL.
       * Na wewnętrznym Railway zwykle nie trzeba.
       */
      // ssl: { rejectUnauthorized: false },
    },
  }),

  sharp,
  plugins: [],
})
