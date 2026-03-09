import Image from 'next/image'
import Link from 'next/link'

export function HomeFundingLogo() {
  return (
    <section
      aria-label="Informacja o dofinansowaniu"
      className="border-t"
    >
      <Link
        href="/dofinansowanie"
        aria-label="Przejdź do strony z informacją o dofinansowaniu projektu"
        className="block w-full focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <div className="relative w-full h-[120px] md:h-[160px]">
          <Image
            src="/images/logo/logotyp-unia.png"
            alt="Logotyp Funduszy Europejskich i NextGenerationEU"
            fill
            priority
            className="object-contain"
          />
        </div>

        <span className="sr-only">
          Dofinansowanie – informacje o projekcie
        </span>
      </Link>
    </section>
  )
}
