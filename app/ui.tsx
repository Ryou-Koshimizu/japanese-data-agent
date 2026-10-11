'use client';
import { useState, useRef } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { Analysis, RequestInput, Event } from '../src/core/contracts';
import { examples, schema } from '../src/core/schema';
function Graph({ result }: { result: Analysis }) {
  const c = result.chart;
  if (c.type === 'metric')
    return (
      <div className="metric">
        {String(result.table.rows[0]?.[c.y!])}
        <span>{c.y}</span>
      </div>
    );
  if (c.type === 'table') return null;
  return (
    <div className="graph">
      <ResponsiveContainer width="100%" height={280}>
        {c.type === 'line' ? (
          <LineChart data={result.table.rows}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey={c.x} tick={{ fontSize: 11 }} />
            <YAxis width={65} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line
              isAnimationActive={false}
              type="monotone"
              dataKey={c.y}
              stroke="#087d75"
              strokeWidth={3}
              dot={false}
            />
          </LineChart>
        ) : (
          <BarChart data={result.table.rows}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey={c.x} tick={{ fontSize: 11 }} />
            <YAxis width={65} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey={c.y} fill="#087d75" radius={[5, 5, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
function csv(result: Analysis) {
  const escape = (v: unknown) =>
    '"' +
    String(v ?? '')
      .replace(/"/g, '""')
      .replace(/^[\s=+@-]/, "'") +
    '"';
  const text =
    '\ufeff' +
    [
      result.table.columns,
      ...result.table.rows.map((r) => result.table.columns.map((c) => r[c])),
    ]
      .map((row) => row.map(escape).join(','))
      .join('\r\n');
  const url = URL.createObjectURL(
    new Blob([text], { type: 'text/csv;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = 'analysis.csv';
  a.click();
  URL.revokeObjectURL(url);
}
export default function Client({ mode }: { mode: 'demo' | 'live' }) {
  const [question, setQuestion] = useState('');
  const [cards, setCards] = useState<{ question: string; result: Analysis }[]>(
    [],
  );
  const [steps, setSteps] = useState<string[]>([]);
  const [sql, setSql] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState(false);
  const controller = useRef<AbortController | null>(null);
  async function submit(q: string) {
    if (busy || !q.trim()) return;
    setBusy(true);
    setError('');
    setSteps([]);
    setSql('');
    setQuestion('');
    controller.current = new AbortController();
    let history: RequestInput['history'] = cards
      .filter((c) => c.result.kind === 'answer')
      .slice(-6)
      .map((c) => ({
        question: c.question,
        sql: c.result.sql,
        summary: c.result.message,
      }));
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ question: q, history }),
        signal: controller.current.signal,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? '通信に失敗しました。');
      }
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      function consume(line: string) {
        if (!line.trim()) return;
        const event = JSON.parse(line) as Event & { message?: string };
        if (event.type === 'step') setSteps((s) => [...s, event.stage]);
        if (event.type === 'sql') setSql(event.sql);
        if (event.type === 'result')
          setCards((c) => [...c, { question: q, result: event.result }]);
        if ((event as { type: string }).type === 'error')
          throw new Error(event.message);
      }
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop()!;
        lines.forEach(consume);
        if (done) {
          consume(buffer);
          break;
        }
      }
    } catch (e) {
      setError(
        (e as Error).name === 'AbortError'
          ? '分析を停止しました。'
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
      controller.current = null;
    }
  }
  return (
    <div className="shell">
      <aside>
        <a className="brand" href="/">
          分析室<span>DATA AGENT HARNESS</span>
        </a>
        <p className="aside-copy">
          日本語の問いから、
          <br />
          確かめられる答えへ。
        </p>
        <div className="mode">
          {mode === 'demo'
            ? '固定回答デモ · API不要'
            : '実AI · 自分のAPIで実行'}
        </div>
        <details className="schema">
          <summary>分析できるデータ</summary>
          <pre>{schema}</pre>
        </details>
        <div className="aside-foot">
          <a href="https://github.com/Ryou-Koshimizu/japanese-data-agent">
            GitHub ↗
          </a>
          <span>LLM精度：未測定</span>
        </div>
      </aside>
      <main>
        <header>
          <span>EC ANALYTICS</span>
          <span className="pill">{mode === 'demo' ? 'DEMO' : 'LIVE'}</span>
        </header>
        <div className="conversation">
          <section className="intro">
            <span className="eyebrow">見たい数字を、あなたの言葉で。</span>
            <h1>
              データに、
              <br />
              質問してみましょう。
            </h1>
            <p>売上の推移や商品ごとの違いを、グラフ・表・SQLで確認できます。</p>
            <div className="examples">
              {examples.map((q) => (
                <button key={q} disabled={busy} onClick={() => submit(q)}>
                  {q}
                  <span>↗</span>
                </button>
              ))}
            </div>
            {mode === 'demo' && (
              <p className="notice">
                現在は画面確認用の固定回答です。AI分析・DB実行は行いません。
              </p>
            )}
          </section>
          {cards.map((c, i) => (
            <section className="exchange" key={i}>
              <p className="user-question">{c.question}</p>
              <article className="answer">
                <div className="answer-label">
                  {c.result.kind === 'answer'
                    ? '分析結果'
                    : c.result.kind === 'clarify'
                      ? '確認が必要です'
                      : c.result.kind === 'refuse'
                        ? '実行を拒否しました'
                        : '実行エラー'}
                  <span>
                    {c.result.mode === 'demo'
                      ? '固定回答'
                      : `${c.result.elapsedMs}ms · ${c.result.attempts}回実行`}
                  </span>
                </div>
                <p>{c.result.message}</p>
                <Graph result={c.result} />
                {c.result.table.rows.length > 0 && (
                  <details>
                    <summary>
                      集計表 · {c.result.table.rows.length}行
                      {c.result.table.truncated ? '（上限で省略）' : ''}
                    </summary>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            {c.result.table.columns.map((x) => (
                              <th key={x}>{x}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {c.result.table.rows.map((r, j) => (
                            <tr key={j}>
                              {c.result.table.columns.map((x) => (
                                <td key={x}>{String(r[x] ?? '—')}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button onClick={() => csv(c.result)}>CSVを保存</button>
                  </details>
                )}
                <details>
                  <summary>生成SQLを確認</summary>
                  <pre>{c.result.sql || 'SQLは生成されていません。'}</pre>
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(c.result.sql);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                  >
                    {copied ? 'コピーしました' : 'SQLをコピー'}
                  </button>
                </details>
                <small>
                  入力 {c.result.usage.inputTokens} / 出力{' '}
                  {c.result.usage.outputTokens} tokens · 費用{' '}
                  {c.result.costJpy === null
                    ? '未測定'
                    : `${c.result.costJpy.toFixed(2)}円（設定単価による推計）`}
                </small>
              </article>
            </section>
          ))}
          {busy && (
            <div className="progress" role="status" aria-live="polite">
              {steps.map((s, i) => (
                <span key={i}>{s}</span>
              ))}
              {sql && (
                <details>
                  <summary>生成中のSQL</summary>
                  <pre>{sql}</pre>
                </details>
              )}
            </div>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(question);
          }}
          className="composer"
        >
          <label htmlFor="question" className="sr-only">
            データへの質問
          </label>
          <div>
            <input
              id="question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={1500}
              placeholder="例：先月の売上を東京だけで比較して"
              disabled={busy}
            />
            {busy ? (
              <button type="button" onClick={() => controller.current?.abort()}>
                停止
              </button>
            ) : (
              <button disabled={!question.trim()} type="submit">
                分析する ↑
              </button>
            )}
          </div>
          <small>基準日 2026-10-01 · 架空ECデータ · SELECTのみ実行</small>
          {mode === 'live' && (
            <details>
              <summary>アクセス用トークン</summary>
              <input
                aria-label="アクセス用トークン"
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <small>
                Claude APIキーは入力せず、サーバー環境変数に設定してください。
              </small>
            </details>
          )}
        </form>
      </main>
    </div>
  );
}
