"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
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
  const [api, setApi] = useState<CarouselApi | null>(null);
  const [index, setIndex] = useState(0);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const total = items.length;
  const prevLengthRef = useRef<number>(items.length);

  const canSlide = total > 1;

  useEffect(() => {
    if (!api) return;
    const onSelect = () => {
      setIndex(api.selectedScrollSnap());
      setCanScrollPrev(api.canScrollPrev());
      setCanScrollNext(api.canScrollNext());
    };
    onSelect();
    api.on("select", onSelect);
    api.on("reInit", onSelect);
    return () => {
      api.off("select", onSelect);
      api.off("reInit", onSelect);
    };
  }, [api]);

  // Reset or shift index when набор слайдов меняется
  useEffect(() => {
    if (!api) return;
    const prevLength = prevLengthRef.current;
    if (total === 0) {
      setIndex(0);
      prevLengthRef.current = total;
      return;
    }
    if (total !== prevLength) {
      api.reInit();
      if (total > prevLength) {
        api.scrollTo(total - 1);
      } else {
        api.scrollTo(Math.min(index, total - 1));
      }
      prevLengthRef.current = total;
    }
  }, [api, total, index]);

  const content = useMemo(
    () =>
      items.map((item) => (
        <CarouselItem key={item.key} className="pl-0">
          {item.node}
        </CarouselItem>
      )),
    [items],
  );

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
              onClick={() => api?.scrollPrev()}
              aria-label={t(prevKey)}
              disabled={!canScrollPrev}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => api?.scrollNext()}
              aria-label={t(nextKey)}
              disabled={!canScrollNext}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
      <div className="w-full overflow-hidden rounded-md border bg-muted/10">
        <Carousel className="w-full" setApi={setApi} opts={{ loop: canSlide, align: "start" }}>
          <CarouselContent className="ml-0">{content}</CarouselContent>
        </Carousel>
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
              onClick={() => api?.scrollTo(i)}
              aria-label={t(labelKey, { current: i + 1, total })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
