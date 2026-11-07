import { useEffect, useState } from "react";

export function useSearch(input, search) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = input.trim();
    if (query.length < 3) {
      setOptions([]);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const results = await search(query).catch(() => []);
      if (!cancelled) {
        setOptions(results);
        setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [input, search]);

  return { options, loading };
}
