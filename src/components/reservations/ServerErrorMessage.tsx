"use client"

const PHONE = "601 275 261"

export function ServerErrorMessage({ message }: { message: string }) {
  const idx = message.indexOf(PHONE)
  if (idx === -1) return <>{message}</>
  return (
    <>
      {message.slice(0, idx)}
      <a
        href="tel:601275261"
        className="font-bold underline decoration-red-700 hover:opacity-80"
      >
        {PHONE}
      </a>
      {message.slice(idx + PHONE.length)}
    </>
  )
}
