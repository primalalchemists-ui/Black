"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import VideoGallery from "@/components/ui/VideoGallery";

const VIDEOS = [1, 2, 3, 4, 5].map((n) => ({
  src: `/images/zdjecia/jedzenie/filmy/${n}-film.webm`,
  label: `Film ${n}`,
}));

type MenuCategory = {
  id: string;
  name: string;
  order?: number;
  active?: boolean;
};

type Promo = {
  enabled?: boolean;
  promoPrice?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
};

type MenuItem = {
  id: string;
  name: string;
  description?: string;
  price: number;
  order?: number;
  active?: boolean;
  promo?: Promo;
  category:
    | string
    | {
        id: string;
        name: string;
        order?: number;
        active?: boolean;
      };
};

type DishOfDayGlobal = {
  item?:
    | string
    | (MenuItem & {
        category?: MenuItem["category"];
      })
    | null;
  customTitle?: string | null;
  customDescription?: string | null;
  validUntil?: string | null;
};

type PayloadListResponse<T> = {
  docs: T[];
  totalDocs: number;
  limit: number;
  page: number;
  totalPages: number;
};

function formatPLN(amount: number) {
  return `${amount.toFixed(0)} zł`;
}

function isPromoActive(promo?: Promo) {
  if (!promo?.enabled) return false;
  if (typeof promo.promoPrice !== "number") return false;

  const now = Date.now();
  const startsOk = promo.startsAt ? new Date(promo.startsAt).getTime() <= now : true;
  const endsOk = promo.endsAt ? new Date(promo.endsAt).getTime() >= now : true;

  return startsOk && endsOk;
}

function getEffectivePrice(item: MenuItem) {
  const promoActive = isPromoActive(item.promo);
  return {
    promoActive,
    promoPrice: promoActive ? (item.promo?.promoPrice as number) : undefined,
    basePrice: item.price,
  };
}

function MotionWrap({
  k,
  children,
  className,
}: {
  k: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      key={k}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function DishSkeleton() {
  return (
    <div className="grid gap-3">
      <div className="h-5 w-2/3 rounded-md bg-amber-200/60 animate-pulse" />
      <div className="h-4 w-1/2 rounded-md bg-amber-200/40 animate-pulse" />
      <div className="h-5 w-1/4 rounded-md bg-amber-200/60 animate-pulse mt-1" />
    </div>
  );
}

function CategoriesSkeleton() {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-8 w-24 rounded-full bg-muted animate-pulse" />
      ))}
    </div>
  );
}

function MenuSkeleton() {
  return (
    <div className="divide-y divide-border/50">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-start justify-between gap-4 px-6 py-4">
          <div className="flex-1 grid gap-2">
            <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
            <div className="h-3 w-2/3 rounded bg-muted animate-pulse" />
          </div>
          <div className="h-4 w-14 rounded bg-muted animate-pulse shrink-0" />
        </div>
      ))}
    </div>
  );
}

export default function RestauracjaPage() {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [dishOfDay, setDishOfDay] = useState<DishOfDayGlobal | null>(null);

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [catsRes, itemsRes, dishRes] = await Promise.all([
          fetch("/api/menu-categories?where[active][equals]=true&limit=1000&sort=order", { cache: "no-store" }),
          fetch("/api/menu-items?where[active][equals]=true&depth=2&limit=1000&sort=order", { cache: "no-store" }),
          fetch("/api/globals/dish-of-day?depth=3", { cache: "no-store" }),
        ]);

        if (!catsRes.ok) throw new Error("Nie udało się pobrać kategorii menu.");
        if (!itemsRes.ok) throw new Error("Nie udało się pobrać pozycji menu.");
        if (!dishRes.ok) throw new Error("Nie udało się pobrać 'Dania dnia'.");

        const catsJson = (await catsRes.json()) as PayloadListResponse<MenuCategory>;
        const itemsJson = (await itemsRes.json()) as PayloadListResponse<MenuItem>;
        const dishJson = (await dishRes.json()) as DishOfDayGlobal;

        if (cancelled) return;

        const sortedCats = [...(catsJson.docs || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const sortedItems = [...(itemsJson.docs || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        setCategories(sortedCats);
        setItems(sortedItems);
        setDishOfDay(dishJson ?? null);

        setActiveCategoryId((prev) => prev ?? (sortedCats[0]?.id ?? null));
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Błąd ładowania danych.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeCategory = useMemo(
    () => categories.find((c) => c.id === activeCategoryId) ?? null,
    [categories, activeCategoryId]
  );

  const filteredItems = useMemo(() => {
    if (!activeCategoryId) return [];
    return items
      .filter((i) => {
        const cat = i.category;
        const catId = typeof cat === "string" ? cat : cat?.id;
        return catId === activeCategoryId;
      })
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [items, activeCategoryId]);

  const dish = useMemo(() => {
    if (!dishOfDay) return null;

    const validUntilOk = dishOfDay.validUntil ? new Date(dishOfDay.validUntil).getTime() >= Date.now() : true;
    if (!validUntilOk) return null;

    const item = dishOfDay.item && typeof dishOfDay.item === "object" ? (dishOfDay.item as MenuItem) : null;

    const title = dishOfDay.customTitle?.trim()
      ? dishOfDay.customTitle
      : item?.name
      ? `Danie dnia: ${item.name}`
      : "Danie dnia";

    const desc = dishOfDay.customDescription?.trim() ? dishOfDay.customDescription : item?.description ?? "";

    const basePrice = item?.price;
    const priceInfo = item ? getEffectivePrice(item) : null;

    return {
      title,
      desc,
      basePrice,
      promoActive: priceInfo?.promoActive ?? false,
      promoPrice: priceInfo?.promoPrice,
    };
  }, [dishOfDay]);

  return (
    <div className="grid gap-10 px-4 py-6 md:py-0 md:px-0">
      {/* Header + Filmy */}
      <div className="grid gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Restauracja</h1>
            <p className="mt-1 text-sm text-muted-foreground">Smaczne jedzenie w dobrym towarzystwie</p>
          </div>
          <Button asChild className="shrink-0 mt-1 md:hidden">
            <Link href="/rezerwacje/stoliki">Rezerwuj stolik</Link>
          </Button>
        </div>

        <VideoGallery videos={VIDEOS} title="" titleId="restauracja-videos-title" />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Danie dnia */}
      <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--brand)/0.35)] bg-card px-6 py-5">
        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-amber-100/60 pointer-events-none" />
        <div className="absolute -right-4 bottom-0 h-20 w-20 rounded-full bg-amber-200/30 pointer-events-none" />
        <div className="relative">
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--brand-soft))] px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[hsl(var(--brand-foreground))]">
            ✦ Polecamy dzisiaj
          </div>
          <AnimatePresence mode="wait" initial={false}>
            {loading ? (
              <MotionWrap k="dish-loading">
                <DishSkeleton />
              </MotionWrap>
            ) : dish ? (
              <MotionWrap k="dish-ready">
                <div className="text-lg font-semibold leading-snug">{dish.title}</div>
                {dish.desc ? (
                  <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{dish.desc}</p>
                ) : null}
                {typeof dish.basePrice === "number" ? (
                  <div className="mt-3">
                    {dish.promoActive && typeof dish.promoPrice === "number" ? (
                      <span className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground line-through">{formatPLN(dish.basePrice)}</span>
                        <span className="text-lg font-bold text-amber-800">{formatPLN(dish.promoPrice)}</span>
                      </span>
                    ) : (
                      <span className="text-lg font-bold text-amber-800">{formatPLN(dish.basePrice)}</span>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">Nie wybrano pozycji w CMS.</p>
                )}
              </MotionWrap>
            ) : (
              <MotionWrap k="dish-empty">
                <p className="text-sm text-muted-foreground">Brak aktywnego dania dnia.</p>
              </MotionWrap>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Menu */}
      <div className="grid gap-6">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold tracking-tight whitespace-nowrap">Menu</h2>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Kategorie */}
        <AnimatePresence mode="wait" initial={false}>
          {loading ? (
            <MotionWrap k="cats-loading">
              <CategoriesSkeleton />
            </MotionWrap>
          ) : (
            <MotionWrap k="cats-ready" className="flex flex-wrap gap-2">
              <>
                {categories.map((c) => {
                  const isActive = c.id === activeCategoryId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setActiveCategoryId(c.id)}
                      className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-150 ${
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted text-foreground hover:bg-[hsl(var(--brand-soft))] hover:text-[hsl(var(--brand-foreground))]"
                      }`}
                    >
                      {c.name}
                    </button>
                  );
                })}
                {categories.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Brak kategorii w CMS (albo są nieaktywne).</p>
                ) : null}
              </>
            </MotionWrap>
          )}
        </AnimatePresence>

        {/* Lista pozycji */}
        <div className="rounded-2xl border bg-card overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            {loading ? (
              <MotionWrap k="menu-loading">
                <MenuSkeleton />
              </MotionWrap>
            ) : (
              <MotionWrap k="menu-ready" className="divide-y divide-border/60">
                <>
                  {filteredItems.map((item) => {
                    const { promoActive, promoPrice, basePrice } = getEffectivePrice(item);

                    return (
                      <div
                        key={item.id}
                        className="flex items-start justify-between gap-4 px-6 py-4 transition-colors hover:bg-amber-50/50"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold leading-snug">{item.name}</div>
                          {item.description ? (
                            <div className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                              {item.description}
                            </div>
                          ) : null}
                        </div>

                        <div className="shrink-0 text-sm font-semibold">
                          {promoActive && typeof promoPrice === "number" ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="text-xs font-normal text-muted-foreground line-through">
                                {formatPLN(basePrice)}
                              </span>
                              <span className="text-amber-800">{formatPLN(promoPrice)}</span>
                            </div>
                          ) : (
                            <span>{formatPLN(basePrice)}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  <AnimatePresence mode="wait" initial={false}>
                    {activeCategory && filteredItems.length === 0 ? (
                      <motion.p
                        key={`empty-${activeCategory.id}`}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.2 }}
                        className="px-6 py-10 text-sm text-muted-foreground text-center"
                      >
                        Brak pozycji w tej kategorii.
                      </motion.p>
                    ) : null}

                    {!activeCategoryId ? (
                      <motion.p
                        key="pick-cat"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.2 }}
                        className="px-6 py-10 text-sm text-muted-foreground text-center"
                      >
                        Wybierz kategorię.
                      </motion.p>
                    ) : null}
                  </AnimatePresence>
                </>
              </MotionWrap>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
