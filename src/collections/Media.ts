import type { CollectionConfig } from 'payload'
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'

const isAdmin = ({ req }: any) => req.user?.role === 'admin'
const isStaffOrAdmin = ({ req }: any) => ['admin', 'staff'].includes(req.user?.role)

export const Media: CollectionConfig = {
  slug: 'media',
  labels: {
    singular: 'Media',
    plural: 'Media',
  },
  admin: {
    group: 'Wydarzenia',
    disableDuplicate: true,
    components: {
      views: {
        list: {
          Component: '@/components/admin/MediaListView#MediaListView',
        },
      },
    },
  },
  access: {
    read: () => true,
    create: isStaffOrAdmin,
    update: isStaffOrAdmin,
    delete: isAdmin,
  },
  hooks: {
    afterDelete: [
      async ({ doc }) => {
        const filename = doc?.filename as string | undefined
        if (!filename) return

        const bucket = process.env.S3_BUCKET
        const endpoint = process.env.S3_ENDPOINT
        const region = process.env.S3_REGION
        const accessKeyId = process.env.S3_ACCESS_KEY_ID
        const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY

        if (!bucket || !endpoint || !region || !accessKeyId || !secretAccessKey) {
          console.warn('[Media] S3 env missing — skipping file deletion for:', filename)
          return
        }

        const client = new S3Client({
          endpoint,
          region,
          credentials: { accessKeyId, secretAccessKey },
          forcePathStyle: true,
        })

        try {
          await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: filename }))
          console.log('[Media] Deleted S3 file:', filename)
        } catch (err: any) {
          if (err?.name === 'NoSuchKey' || err?.Code === 'NoSuchKey') return
          console.error('[Media] Failed to delete S3 file:', filename, err?.message ?? err)
        }
      },
    ],
  },
  fields: [
    {
      name: 'alt',
      label: 'Tekst alternatywny (ALT)',
      type: 'text',
      required: true,
    },
  ],
  upload: true,
}
