import { QueryClient } from "@tanstack/react-query";

export function getQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          const status = (error as { status?: number } | null)?.status;
          if (status === 404) return false;
          return failureCount < 3;
        },
        refetchOnWindowFocus: false,
        staleTime: 1000 * 30,
      },
    },
  });
}
