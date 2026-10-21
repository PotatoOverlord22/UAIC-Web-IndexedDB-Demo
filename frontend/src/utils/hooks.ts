import { useEffect, useState } from "react";

interface AsyncState<T> {
  data?: T;
  error?: Error;
  loading: boolean;
}

interface Settled<T> {
  load?: (signal: AbortSignal) => Promise<T>;
  data?: T;
  error?: Error;
}

export function useAsync<T>(load: (signal: AbortSignal) => Promise<T>): AsyncState<T> {
  const [settled, setSettled] = useState<Settled<T>>({});

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(
      (data) => !controller.signal.aborted && setSettled({ load, data }),
      (error: Error) => !controller.signal.aborted && setSettled({ load, error }),
    );
    return () => controller.abort();
  }, [load]);

  const current = settled.load === load;
  return { data: settled.data, error: current ? settled.error : undefined, loading: !current };
}

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
