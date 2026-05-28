import PhotoGallery from "@/components/ui/PhotoGallery"
import { GALLERY_PHOTOS } from "@/lib/galleryPhotos"

export default function GallerySection() {
  return (
    <div className="mx-auto w-full md:px-0">
      <PhotoGallery photos={GALLERY_PHOTOS} title="Galeria" titleId="gallery-title" />
    </div>
  )
}
