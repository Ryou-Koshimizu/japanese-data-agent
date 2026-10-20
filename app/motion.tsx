'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

const reducedQuery = '(prefers-reduced-motion: reduce)';

/** True when the viewer asked the system for less motion. */
export function useReducedMotion() {
  return useSyncExternalStore(
    (notify) => {
      const media = window.matchMedia(reducedQuery);
      media.addEventListener('change', notify);
      return () => media.removeEventListener('change', notify);
    },
    () => window.matchMedia(reducedQuery).matches,
    () => false,
  );
}

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/**
 * Counts a number up from zero. The final text is exactly `format(value)`,
 * so what is read, copied or tested never differs from the real value.
 */
export function CountUp({
  value,
  format = (n) => new Intl.NumberFormat('ja-JP').format(n),
  duration = 1100,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (reduced || !Number.isFinite(value)) return;
    let frame = 0;
    const start = performance.now();
    const decimals = Number.isInteger(value) ? 0 : 1;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const current = value * easeOutExpo(t);
      setShown(t >= 1 ? null : Number(current.toFixed(decimals)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduced]);
  return (
    <span className={`num ${className ?? ''}`}>{format(shown ?? value)}</span>
  );
}

const keywords = new Set(
  (
    'select from where join left right inner outer full cross on group by order ' +
    'having limit offset as and or not in is null case when then else end with ' +
    'union all distinct between like ilike asc desc over partition filter ' +
    'interval date true false using exists any'
  ).split(' '),
);
const functions = new Set(
  (
    'sum count avg min max round coalesce nullif to_char date_trunc extract ' +
    'cast lag lead rank dense_rank row_number abs greatest least percentile_cont'
  ).split(' '),
);

type Token = { text: string; kind: string };

/** A small, display-only SQL highlighter. It never changes the text. */
export function tokenizeSql(sql: string): Token[] {
  const pattern =
    /(--[^\n]*)|('(?:[^']|'')*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|(\s+)|([^\sA-Za-z0-9_'-]+|-)/g;
  const tokens: Token[] = [];
  for (const m of sql.matchAll(pattern)) {
    const [text, comment, string, number, word] = m;
    let kind = 'plain';
    if (comment) kind = 'comment';
    else if (string) kind = 'string';
    else if (number) kind = 'number';
    else if (word) {
      const lower = word.toLowerCase();
      kind = keywords.has(lower)
        ? 'keyword'
        : functions.has(lower)
          ? 'function'
          : 'plain';
    } else if (/^[(),.;*=<>+/:|-]+$/.test(text)) kind = 'punct';
    tokens.push({ text, kind });
  }
  // Anything the pattern skipped is kept verbatim so the text stays identical.
  if (tokens.map((t) => t.text).join('') !== sql)
    return [{ text: sql, kind: 'plain' }];
  return tokens;
}

/**
 * Types the SQL out character by character once it is shown. The
 * full statement is always in the DOM; characters not yet "typed" are only
 * visually hidden, so the layout does not jump and copy/read/test always get
 * the whole statement.
 */
export function TypedSql({
  sql,
  speed = 14,
  maxDuration = 1600,
  loop,
}: {
  sql: string;
  speed?: number;
  maxDuration?: number;
  /** Pause in ms before typing again; omit to type once. */
  loop?: number;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement | null>(null);
  const [seen, setSeen] = useState(false);
  const [cycle, setCycle] = useState(0);
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (reduced || seen || !node) return;
    // Start once the statement is laid out (e.g. its <details> is opened).
    if (typeof ResizeObserver === 'undefined') return setSeen(true);
    const observer = new ResizeObserver(() => {
      if (node.getClientRects().length) {
        setSeen(true);
        observer.disconnect();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [reduced, seen]);
  useEffect(() => {
    if (reduced || !seen) return;
    const total = sql.length;
    const duration = Math.max(1, Math.min(maxDuration, total * speed));
    const start = performance.now();
    let frame = 0;
    let pause: ReturnType<typeof setTimeout> | undefined;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setCount(t >= 1 ? null : Math.floor(total * t));
      if (t < 1) frame = requestAnimationFrame(tick);
      else if (loop) pause = setTimeout(() => setCycle((c) => c + 1), loop);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(pause);
    };
  }, [sql, speed, maxDuration, reduced, seen, loop, cycle]);
  // Before it is first seen, nothing is typed yet (unless motion is reduced).
  const visible = reduced ? sql.length : seen ? (count ?? sql.length) : 0;
  const typing = !reduced && seen && count !== null;
  const out: React.ReactNode[] = [];
  let offset = 0;
  let caretPlaced = false;
  tokenizeSql(sql).forEach((token, i) => {
    const start = offset;
    const end = offset + token.text.length;
    offset = end;
    if (end <= visible) {
      out.push(
        <span key={i} className={`tok-${token.kind}`}>
          {token.text}
        </span>,
      );
      return;
    }
    const cut = caretPlaced ? 0 : Math.max(0, visible - start);
    if (cut)
      out.push(
        <span key={`${i}a`} className={`tok-${token.kind}`}>
          {token.text.slice(0, cut)}
        </span>,
      );
    if (!caretPlaced) {
      out.push(<span key="caret" className="caret" aria-hidden="true" />);
      caretPlaced = true;
    }
    out.push(
      <span key={`${i}b`} className={`tok-${token.kind} untyped`}>
        {token.text.slice(cut)}
      </span>,
    );
  });
  return (
    <code ref={ref} className={`sql ${typing ? 'typing' : ''}`}>
      {out}
    </code>
  );
}
