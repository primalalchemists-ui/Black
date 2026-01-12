// // import { postgresAdapter } from '@payloadcms/db-postgres'
// // import { lexicalEditor } from '@payloadcms/richtext-lexical'
// // import path from 'path'
// // import { buildConfig } from 'payload'
// // import { fileURLToPath } from 'url'
// // import sharp from 'sharp'

// // import { Users } from './collections/Users'
// // import { Media } from './collections/Media'

// // import { Events } from './collections/Events'
// // import { MenuCategories } from './collections/MenuCategories'
// // import { MenuItems } from './collections/MenuItems'
// // import { Resources } from './collections/Resources'
// // import { Reservations } from './collections/Reservations'
// // import { OccasionalInquiries } from './collections/OccasionalInquiries'
// // import { Payments } from './collections/Payments'
// // import { Blackouts } from './collections/Blackouts'

// // import { SiteSettings } from './globals/SiteSettings'
// // import { DishOfDay } from './globals/DishOfDay'
// // import { ReservationSettings } from './globals/ReservationSettings'


// // const filename = fileURLToPath(import.meta.url)
// // const dirname = path.dirname(filename)

// // export default buildConfig({
// //   admin: {
// //     user: Users.slug,
// //     importMap: {
// //       baseDir: path.resolve(dirname),
// //     },
// //   },
// //   collections: [
// //     Users,
// //     Media,
// //     Events,
// //     MenuCategories,
// //     MenuItems,
// //     Resources,
// //     Reservations,
// //     OccasionalInquiries,
// //     Payments,
// //     Blackouts,
// //   ],
// //   globals: [
// //     SiteSettings,
// //     DishOfDay,
// //     ReservationSettings,
// //   ],

// //   editor: lexicalEditor(),
// //   secret: process.env.PAYLOAD_SECRET || '',
// //   typescript: {
// //     outputFile: path.resolve(dirname, 'payload-types.ts'),
// //   },
// //   db: postgresAdapter({
// //     pool: {
// //       connectionString: process.env.DATABASE_URL || '',
// //     },
// //   }),
// //   sharp,
// //   plugins: [],
// // })

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

// // Build-safe: na Railway env czasem nie jest dostępny w trakcie next build.
// // Nie wywalaj builda — tylko ostrzeż, runtime i tak musi mieć DATABASE_URL.
// const DATABASE_URL = process.env.DATABASE_URL || ''
// if (!DATABASE_URL) {
//   console.warn(
//     '[Payload] DATABASE_URL is missing (likely during build). Ensure Railway provides it at runtime via Variable Reference.',
//   )
// }

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
//   globals: [SiteSettings, DishOfDay, ReservationSettings],

//   editor: lexicalEditor(),
//   secret: process.env.PAYLOAD_SECRET || '',
//   typescript: {
//     outputFile: path.resolve(dirname, 'payload-types.ts'),
//   },

//   db: postgresAdapter({
//     pool: {
//       connectionString: DATABASE_URL,
//       // Jeśli kiedykolwiek użyjesz DATABASE_PUBLIC_URL w appce (nie polecam), wtedy czasem:
//       // ssl: { rejectUnauthorized: false },
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

function buildDbUrlFromPG(): string | null {
  const { PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE } = process.env
  if (!PGHOST || !PGPORT || !PGUSER || !PGPASSWORD || !PGDATABASE) return null
  return `postgresql://${encodeURIComponent(PGUSER)}:${encodeURIComponent(PGPASSWORD)}@${PGHOST}:${PGPORT}/${PGDATABASE}`
}

// 1) Prefer DATABASE_URL
// 2) Fallback to PG* (Railway-proof)
// 3) Never throw during build, but fail in runtime production (so you don’t run a broken server)
const DATABASE_URL = process.env.DATABASE_URL || buildDbUrlFromPG() || ''

if (!DATABASE_URL) {
  // Build-safe warning
  console.warn(
    '[Payload] Missing DATABASE_URL and PG* variables. Build may still pass, but runtime must provide DB env.',
  )
}

// If you want to be strict ONLY at runtime in production:
const isProd = process.env.NODE_ENV === 'production'
if (isProd && !DATABASE_URL) {
  // This will fail on runtime start (good), but shouldn’t run during build if env is injected at runtime.
  // If Railway injects env only at runtime, this still triggers when the server starts, which is what we want.
  throw new Error('Missing DB env in production. Provide DATABASE_URL or PG* variables in Railway (Black service).')
}

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
      // Jeśli kiedyś użyjesz PUBLIC proxy (DATABASE_PUBLIC_URL), wtedy czasem potrzebne:
      // ssl: { rejectUnauthorized: false },
    },
  }),

  sharp,
  plugins: [],
})
