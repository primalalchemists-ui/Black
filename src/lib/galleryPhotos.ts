const LOKAL = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
  src: `/images/zdjecia/lokal/${n}.webp`,
  alt: `Centrum Spotkań Black — wnętrze lokalu`,
}))

const IMPREZY_PHOTOS = [1, 2, 3, 4, 5].map((n) => ({
  src: `/images/zdjecia/imprezy/${n}.webp`,
  alt: `Impreza okolicznościowa w Centrum Spotkań Black`,
}))

const JEDZENIE_PHOTOS = [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((n) => ({
  src: `/images/zdjecia/jedzenie/zdjecia/${n}.webp`,
  alt: `Danie z menu restauracji Centrum Spotkań Black`,
}))

/** Strona główna: lokal → imprezy → jedzenie */
export const GALLERY_PHOTOS = [
  ...LOKAL,
  ...IMPREZY_PHOTOS,
  ...JEDZENIE_PHOTOS,
] as const

/** Zakładka imprezy: imprezy → lokal → jedzenie */
export const GALLERY_PHOTOS_IMPREZY = [
  ...IMPREZY_PHOTOS,
  ...LOKAL,
  ...JEDZENIE_PHOTOS,
] as const
