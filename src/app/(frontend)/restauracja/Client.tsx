"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type MenuCategory = {
  id: string;
  name: string;
  order?: number;
  active?: boolean;
};

type Promo = {
  enabled?: boolean;
  promoPrice?: number | null;
  startsAt?: string | null; // ISO
  endsAt?: string | null; // ISO
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
      <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
      <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
      <div className="h-4 w-1/3 rounded bg-muted animate-pulse" />
    </div>
  );
}

function CategoriesSkeleton() {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-9 w-28 rounded-md bg-muted animate-pulse" />
      ))}
    </div>
  );
}

function MenuSkeleton() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-[44px_1fr_auto] items-center gap-3 border-b pb-3 last:border-b-0 last:pb-0"
        >
          <div className="h-4 w-6 rounded bg-muted animate-pulse" />
          <div className="grid gap-2">
            <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
            <div className="h-3 w-2/3 rounded bg-muted animate-pulse" />
          </div>
          <div className="h-4 w-14 rounded bg-muted animate-pulse justify-self-end" />
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
          fetch("/api/menu-categories?where[active][equals]=true&sort=order", { cache: "no-store" }),
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
    <div className="grid gap-8 px-4 py-6 md:py-0 md:px-0">
      <div className="flex justify-between">
        <h1 className="text-3xl font-semibold">Restauracja</h1>
        <Button asChild className="md:mt-3 mr-4">
          <Link href="/rezerwacje/stoliki">Rezerwuj stolik</Link>
        </Button>
      </div>

      {error ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-red-600">{error}</p>
            <p className="text-sm text-muted-foreground mt-2">
              Sprawdź czy Payload działa pod <code>/api</code> oraz czy kolekcje mają poprawne slugi.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* TOP: Danie dnia */}
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
        <Card>
          <CardHeader>
            <CardTitle>Danie dnia</CardTitle>
          </CardHeader>

          <CardContent className="grid gap-2">
            <AnimatePresence mode="wait" initial={false}>
              {loading ? (
                <MotionWrap k="dish-loading">
                  <DishSkeleton />
                </MotionWrap>
              ) : dish ? (
                <MotionWrap k="dish-ready">
                  <>
                    <div className="font-medium">{dish.title}</div>
                    {dish.desc ? <p className="text-sm text-muted-foreground">{dish.desc}</p> : null}

                    {typeof dish.basePrice === "number" ? (
                      <div className="pt-2 text-sm font-semibold">
                        {dish.promoActive && typeof dish.promoPrice === "number" ? (
                          <span className="flex items-center gap-2">
                            <span className="text-muted-foreground line-through">{formatPLN(dish.basePrice)}</span>
                            <span>{formatPLN(dish.promoPrice)}</span>
                          </span>
                        ) : (
                          <span>{formatPLN(dish.basePrice)}</span>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nie wybrano pozycji w CMS.</p>
                    )}
                  </>
                </MotionWrap>
              ) : (
                <MotionWrap k="dish-empty">
                  <p className="text-sm text-muted-foreground">Brak aktywnego dania dnia.</p>
                </MotionWrap>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </div>

      {/* MENU */}
      <div className="grid gap-4">
        <h2 className="text-2xl font-semibold">Menu</h2>

        {/* Kategorie z CMS */}
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
                    <Button
                      key={c.id}
                      variant={isActive ? "default" : "outline"}
                      className="h-9"
                      onClick={() => setActiveCategoryId(c.id)}
                    >
                      {c.name}
                    </Button>
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
        <Card>
          <CardContent className="pt-6">
            <AnimatePresence mode="wait" initial={false}>
              {loading ? (
                <MotionWrap k="menu-loading">
                  <MenuSkeleton />
                </MotionWrap>
              ) : (
                <MotionWrap k="menu-ready" className="grid gap-3">
                  <>
                    {filteredItems.map((item, idx) => {
                      const { promoActive, promoPrice, basePrice } = getEffectivePrice(item);

                      return (
                        <div
                          key={item.id}
                          className="grid grid-cols-[44px_1fr_auto] items-center gap-3 border-b pb-3 last:border-b-0 last:pb-0"
                        >
                          <div className="text-sm text-muted-foreground">{(idx + 1).toString()}.</div>

                          <div>
                            <div className="font-medium">{item.name}</div>
                            {item.description ? (
                              <div className="text-xs text-muted-foreground">{item.description}</div>
                            ) : null}
                          </div>

                          <div className="text-sm font-semibold">
                            {promoActive && typeof promoPrice === "number" ? (
                              <span className="flex items-center gap-2">
                                <span className="text-muted-foreground line-through">{formatPLN(basePrice)}</span>
                                <span>{formatPLN(promoPrice)}</span>
                              </span>
                            ) : (
                              <span>{formatPLN(basePrice)}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Animacja listy przy zmianie kategorii */}
                    <AnimatePresence mode="wait" initial={false}>
                      {activeCategory && filteredItems.length === 0 ? (
                        <motion.p
                          key={`empty-${activeCategory.id}`}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.2 }}
                          className="pt-4 text-sm text-muted-foreground"
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
                          className="pt-4 text-sm text-muted-foreground"
                        >
                          Wybierz kategorię.
                        </motion.p>
                      ) : null}
                    </AnimatePresence>
                  </>
                </MotionWrap>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
