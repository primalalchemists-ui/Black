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
  globals: [
    SiteSettings,
    DishOfDay,
    ReservationSettings,
  ],

  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
  }),
  sharp,
  plugins: [],
})
