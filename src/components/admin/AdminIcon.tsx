import Image from 'next/image'

export function AdminIcon() {
  return (
    <Image
      src="/images/logo/logo-2-icon.png"
      alt="B"
      width={32}
      height={32}
      style={{ objectFit: 'contain' }}
      priority
    />
  )
}

export default AdminIcon
