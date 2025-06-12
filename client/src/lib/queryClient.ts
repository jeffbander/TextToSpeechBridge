import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    try {
      const text = (await res.text()) || res.statusText;
      throw new Error(`${res.status}: ${text}`);
    } catch (error) {
      throw new Error(`${res.status}: ${res.statusText}`);
    }
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    try {
      const res = await fetch(queryKey[0] as string, {
        credentials: "include",
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    } catch (error) {
      console.error('Query error:', error);
      if (unauthorizedBehavior === "returnNull") {
        return null;
      }
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "returnNull" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 120000, // 2 minutes to reduce database hits
      gcTime: 600000, // 10 minutes - longer cache retention
      retry: (failureCount, error: any) => {
        if (error?.message?.includes('4') && !error?.message?.includes('408') && !error?.message?.includes('429')) {
          return false;
        }
        return failureCount < 2; // Reduced from 3 to 2
      },
      retryDelay: (attemptIndex) => Math.min(2000 * 2 ** attemptIndex, 10000), // Faster initial retry
      throwOnError: false,
    },
    mutations: {
      retry: (failureCount, error: any) => {
        if (error?.message?.includes('4')) {
          return false;
        }
        return failureCount < 1; // Only retry once
      },
      retryDelay: 2000,
      throwOnError: false,
      gcTime: 60000, // Clear mutation cache quickly
    },
  },
});
