import { useEffect, useId, useRef, useState } from 'react';

/**
 * Mermaid の図（要件 3.2 の図解生成）。
 *
 * mermaid は小さくないので、**図が実際に現れたときだけ**動的 import で読み込む。
 * 初期表示の重さと引き換えにする価値はない。
 */
export function Mermaid({ code }: { readonly code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { default: mermaid } = await import('mermaid');
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default',
        });
        const { svg } = await mermaid.render(`mermaid-${id}`, code);
        if (cancelled) return;
        const container = containerRef.current;
        if (container) container.innerHTML = svg;
        setError(null);
      } catch (cause) {
        if (cancelled) return;
        // 図が壊れていてもノートは読めるべきなので、原文に落とす
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, id]);

  if (error) {
    return (
      <div className="diagram-error">
        <p className="muted">図を描けませんでした</p>
        <pre>{code}</pre>
      </div>
    );
  }

  return <div className="diagram" ref={containerRef} />;
}
