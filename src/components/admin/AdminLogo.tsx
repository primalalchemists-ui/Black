import Image from 'next/image'

export function AdminLogo() {
  return (
    <div style={{ padding: '0.25rem 0.5rem', display: 'flex', alignItems: 'center' }}>
      <Image
        src="/images/logo/logo-2-icon.png"
        alt="BLACK"
        width={90}
        height={44}
        style={{ objectFit: 'contain', objectPosition: 'left center' }}
        priority
      />
    </div>
  )
}

export default AdminLogo
