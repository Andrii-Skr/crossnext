"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CarouselItem = { key: string; node: ReactNode };

export function DefinitionCarousel({
  items,
  className,
  labelKey = "pendingDefinitionIndex",
  prevKey = "pendingPrev",
  nextKey = "pendingNext",
}: {
  items: CarouselItem[];
  className?: string;
  labelKey?: string;
  prevKey?: string;
  nextKey?: string;
}) {
  const t = useTranslations();
  const [index, setIndex] = useState(0);
  const total = items.length;
  const prevLengthRef = useRef<number>(items.length);

  // Reset or shift index when набор слайдов меняется
  useEffect(() => {
    const prevLength = prevLengthRef.current;
    if (total === 0) {
      setIndex(0);
    } else if (total > prevLength) {
      setIndex(total - 1);
    } else {
      setIndex((i) => Math.min(i, Math.max(0, total - 1)));
    }
    prevLengthRef.current = total;
  }, [total]);

  const canSlide = total > 1;

  const content = useMemo(
    () =>
      items.map((item) => (
        <div key={item.key} className="w-full min-w-0 shrink-0 basis-full px-0">
          {item.node}
        </div>
      )),
    [items],
  );

  const prev = useCallback(() => {
    if (total === 0) return;
    setIndex((i) => (i === 0 ? total - 1 : i - 1));
  }, [total]);
  const next = useCallback(() => {
    if (total === 0) return;
    setIndex((i) => (i + 1) % total);
  }, [total]);

  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);
  const swipeThreshold = 40;

  useEffect(() => {
    if (touchStartX === null || touchEndX === null) return;
    const delta = touchEndX - touchStartX;
    if (Math.abs(delta) >= swipeThreshold) {
      if (delta < 0) next();
      else prev();
    }
    setTouchStartX(null);
    setTouchEndX(null);
  }, [touchEndX, touchStartX, next, prev]);

  return (
    <div className={cn("space-y-2 w-full min-w-0", className)}>
      {canSlide && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t(labelKey, { current: index + 1, total })}</span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={prev}
              aria-label={t(prevKey)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={next}
              aria-label={t(nextKey)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
      <div
        className="w-full overflow-hidden rounded-md border bg-muted/10"
        onTouchStart={(e) => setTouchStartX(e.touches[0]?.clientX ?? null)}
        onTouchEnd={(e) => setTouchEndX(e.changedTouches[0]?.clientX ?? null)}
      >
        <div
          className="flex w-full min-w-0 transition-transform duration-300 ease-in-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {content}
        </div>
      </div>
      {canSlide && (
        <div className="flex items-center justify-center gap-1">
          {items.map((item, i) => (
            <button
              key={item.key}
              type="button"
              className={cn(
                "h-2 w-2 rounded-full transition-colors",
                i === index ? "bg-primary" : "bg-muted-foreground/40",
              )}
              onClick={() => setIndex(i)}
              aria-label={t(labelKey, { current: i + 1, total })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
