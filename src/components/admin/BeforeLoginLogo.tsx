import Image from 'next/image'

export function BeforeLoginLogo() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginBottom: '2rem',
      }}
    >
      <Image
        src="/images/logo/logo.png"
        alt="BLACK"
        width={130}
        height={64}
        style={{ objectFit: 'contain' }}
        priority
      />
      <p
        style={{
          marginTop: '0.5rem',
          fontSize: '0.8rem',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: '#6F6A61',
        }}
      >
        Panel administracyjny
      </p>
    </div>
  )
}

export default BeforeLoginLogo
