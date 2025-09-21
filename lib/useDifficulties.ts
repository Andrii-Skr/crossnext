"use client";

import { useQuery } from "@tanstack/react-query";
import { fetcher } from "@/lib/fetcher";

export function useDifficulties(enabled: boolean = true) {
  return useQuery({
    queryKey: ["difficulties"],
    queryFn: async () => {
      const res = await fetcher<{ items: number[] }>("/api/difficulties");
      return res.items;
    },
    enabled,
    // Difficulties are slow-changing; cache aggressively
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
