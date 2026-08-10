import { useEffect, useState } from 'react';

/** 狭い画面かどうか。CSS 側のブレークポイントと必ず揃える */
export const NARROW_QUERY = '(max-width: 900px)';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);

  return matches;
}
