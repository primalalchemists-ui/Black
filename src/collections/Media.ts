import type { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  labels: {
    singular: 'Media',
    plural: 'Media',
  },
  admin: {
    group: 'Wydarzenia',
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
