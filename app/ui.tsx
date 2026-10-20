'use client';
import { useState, useRef, useEffect } from 'react';
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
import {
  ArrowDown,
  ArrowRight,
  ChartColumn,
  Check,
  CodeXml,
  Copy,
  CornerDownLeft,
  Database,
  Download,
  FileText,
  LoaderCircle,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  Square,
  Table2,
  Terminal,
} from 'lucide-react';
import type { Analysis, Event } from '../src/core/contracts';
import {
  conversationHistory,
  analysisMarkdown,
} from '../src/core/conversation';
import { examples, schema } from '../src/core/schema';
import { replayScenarios, nextReplayQuestion } from '../src/core/replays';
import { findingBlocks } from '../src/core/finding-text';
import { CountUp, TypedSql, useReducedMotion } from './motion';

const icon = { size: 16, strokeWidth: 1.6, 'aria-hidden': true } as const;
const compact = new Intl.NumberFormat('ja-JP', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const tables: [string, string, number][] = [
  ['customers', '顧客', 5000],
  ['products', '商品', 300],
  ['orders', '注文', 50000],
  ['order_items', '注文明細', 120000],
  ['campaigns', '販促', 30],
];

function Graph({ result }: { result: Analysis }) {
  const reduced = useReducedMotion();
  const c = result.chart;
  if (c.type === 'metric') {
    const value = result.table.rows[0]?.[c.y!];
    return (
      <div className="metric">
        {typeof value === 'number' ? (
          <CountUp value={value} format={(n) => String(n)} />
        ) : (
          <span className="num">{String(value)}</span>
        )}
        <span>{c.y}</span>
      </div>
    );
  }
  if (c.type === 'table') return null;
  const axis = {
    tick: { fontSize: 11, fill: 'var(--muted)', fontFamily: 'var(--mono)' },
    stroke: 'var(--line-strong)',
    tickLine: false,
  };
  const tooltip = {
    contentStyle: {
      background: 'var(--surface-2)',
      border: '1px solid var(--line-strong)',
      borderRadius: 10,
      color: 'var(--text)',
      fontFamily: 'var(--mono)',
      fontSize: 12,
    },
    labelStyle: { color: 'var(--muted)' },
    itemStyle: { color: 'var(--accent)' },
    cursor: { fill: 'rgba(255,255,255,.03)', stroke: 'var(--line-strong)' },
  };
  return (
    <div
      className="graph"
      role="img"
      aria-label={`${c.type === 'line' ? '折れ線' : '棒'}グラフ：${c.x}別の${c.y}。値は下の集計表でも確認できます。`}
    >
      <div className="graph-head" aria-hidden="true">
        <span>
          {c.x} × {c.y}
        </span>
        <span>{c.type === 'line' ? 'LINE' : 'BAR'}</span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        {c.type === 'line' ? (
          <LineChart
            data={result.table.rows}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey={c.x} {...axis} />
            <YAxis
              tickFormatter={(value: number) => compact.format(value)}
              width={56}
              {...axis}
              axisLine={false}
            />
            <Tooltip {...tooltip} />
            <Line
              isAnimationActive={!reduced}
              animationDuration={1400}
              animationEasing="ease-out"
              type="monotone"
              dataKey={c.y}
              stroke="var(--accent)"
              strokeWidth={2}
              dot={{ r: 2.5, fill: 'var(--bg)', strokeWidth: 1.5 }}
              activeDot={{ r: 4, fill: 'var(--accent)' }}
            />
          </LineChart>
        ) : (
          <BarChart
            data={result.table.rows}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="bar-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--accent)" stopOpacity={1} />
                <stop offset="1" stopColor="var(--accent)" stopOpacity={0.25} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey={c.x} {...axis} />
            <YAxis
              tickFormatter={(value: number) => compact.format(value)}
              width={56}
              {...axis}
              axisLine={false}
            />
            <Tooltip {...tooltip} />
            <Bar
              isAnimationActive={!reduced}
              animationDuration={1100}
              animationEasing="ease-out"
              dataKey={c.y}
              fill="url(#bar-fill)"
              radius={[3, 3, 0, 0]}
              maxBarSize={44}
            />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function csv(result: Analysis) {
  // Numbers stay numbers (negative amounts keep their sign). Text that a
  // spreadsheet could run as a formula gets a leading apostrophe, prepended
  // rather than replacing the first character.
  const escape = (v: unknown) => {
    const s = String(v ?? '');
    if (typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(s)) return s;
    return (
      '"' + (/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""') + '"'
    );
  };
  const text =
    '﻿' +
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

function cell(value: unknown) {
  return typeof value === 'number'
    ? new Intl.NumberFormat('ja-JP').format(value)
    : String(value ?? '—');
}

/** Decorative: a query being typed and a chart rising. Not real results. */
function HeroArt() {
  return (
    <div className="hero-art" aria-hidden="true">
      <div className="art-panel">
        <div className="art-bar">
          <Terminal {...icon} size={14} />
          <span>query.sql</span>
          <span className="art-ok">
            <Check {...icon} size={12} /> 検証済み
          </span>
        </div>
        <pre className="art-sql">
          <TypedSql
            sql={
              "SELECT c.region AS 地域,\n       sum(i.quantity * i.unit_price) AS 売上\n  FROM demo.orders o\n  JOIN demo.order_items i ON i.order_id = o.id\n  JOIN demo.customers c ON c.id = o.customer_id\n WHERE o.status = 'completed'\n GROUP BY 1\n ORDER BY 2 DESC;"
            }
            speed={22}
            maxDuration={3200}
            loop={2600}
          />
        </pre>
        <div className="art-chart">
          {[92, 70, 58, 51, 38].map((h, i) => (
            <span key={i} style={{ '--h': `${h}%`, '--i': i } as never} />
          ))}
        </div>
        <div className="art-foot">
          <span>SELECTのみ</span>
          <span>読み取り専用</span>
          <span>5秒で打ち切り</span>
        </div>
      </div>
    </div>
  );
}

export default function Client({
  mode,
  provider = 'claude',
}: {
  mode: 'demo' | 'live';
  provider?: 'claude' | 'codex';
}) {
  const [question, setQuestion] = useState('');
  const [cards, setCards] = useState<{ question: string; result: Analysis }[]>(
    [],
  );
  const [steps, setSteps] = useState<string[]>([]);
  const [sql, setSql] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState<number | null>(null);
  const [lastQuestion, setLastQuestion] = useState('');
  const resultRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (cards.length) resultRef.current?.focus({ preventScroll: true });
    resultRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [cards.length]);
  const controller = useRef<AbortController | null>(null);
  async function submit(q: string, fresh = false) {
    if (busy || !q.trim()) return;
    if (fresh) setCards([]);
    setBusy(true);
    setError('');
    setSteps([]);
    setSql('');
    setLastQuestion(q);
    controller.current = new AbortController();
    const history = fresh ? [] : conversationHistory(cards);
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
        if (event.type === 'result') {
          setCards((c) => [...c, { question: q, result: event.result }]);
          setQuestion('');
        }
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
  const reset = () => {
    setCards([]);
    setQuestion('');
    setError('');
    inputRef.current?.focus();
  };
  const modeLabel =
    mode === 'demo'
      ? '公開デモ · AI呼び出しなし'
      : provider === 'codex'
        ? '実AI · ChatGPTサブスクで実行'
        : '実AI · 自分のAPIで実行';
  return (
    <div className="shell">
      <div className="backdrop" aria-hidden="true">
        <div className="grid-plane" />
        <div className="glow" />
        <div className="noise" />
      </div>
      <a className="skip-link" href="#analysis-main">
        分析画面へスキップ
      </a>
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">
            <ChartColumn {...icon} size={18} />
          </span>
          <span className="brand-text">
            分析室<small>JP DATA AGENT</small>
          </span>
        </a>
        <nav className="topnav" aria-label="操作">
          <button className="ghost" disabled={busy} onClick={reset}>
            <Plus {...icon} />
            <span className="label">新しい分析</span>
          </button>
          <a className="ghost" href="#data">
            <Database {...icon} />
            <span className="label">データ定義</span>
          </a>
          <a
            className="ghost"
            href="https://github.com/Ryou-Koshimizu/japanese-data-agent"
          >
            <CodeXml {...icon} />
            <span className="label">ソースと検証記録</span>
          </a>
        </nav>
      </header>
      <main id="analysis-main">
        <section
          className={`hero ${cards.length ? 'hero-compact' : ''}`}
          aria-label="質問する"
        >
          <div className="hero-copy">
            <div className="hero-meta">
              <span className="mode">
                <span className="status-dot" />
                {modeLabel}
              </span>
              <span className="eyebrow">
                日本語 → SQL → 根拠つきの答え
                <span className="blink" aria-hidden="true" />
              </span>
            </div>
            <h1>
              質問は、日本語で。
              <br />
              <em>答えは、根拠つきで。</em>
            </h1>
            <p className="lede">
              AIが集計の手順を考え、安全を確かめてから読み取り専用で実行。グラフ・表・SQLまで、その場で確かめられます。
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit(question);
              }}
              className="composer"
            >
              <label htmlFor="question">
                データへの質問
                <span>
                  {mode === 'demo'
                    ? '固定回答・実AI記録の再生'
                    : provider === 'codex'
                      ? 'ChatGPTで分析する'
                      : 'Claudeで分析する'}
                </span>
              </label>
              <div className="field">
                <span className="prompt" aria-hidden="true">
                  &gt;
                </span>
                <input
                  id="question"
                  ref={inputRef}
                  aria-describedby="question-hint"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  maxLength={1500}
                  placeholder="例：先月の売上を東京だけで比較して"
                  disabled={busy}
                  autoComplete="off"
                />
                {busy ? (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => controller.current?.abort()}
                  >
                    <Square {...icon} size={14} />
                    停止
                  </button>
                ) : (
                  <button
                    className="primary"
                    disabled={!question.trim()}
                    type="submit"
                  >
                    分析する <ArrowRight {...icon} />
                  </button>
                )}
              </div>
              <div className="composer-foot">
                <small id="question-hint">
                  基準日 2026-10-01 · 架空ECデータ ·{' '}
                  <kbd>
                    <CornerDownLeft {...icon} size={11} />
                    Enter
                  </kbd>{' '}
                  で送信
                </small>
                {mode === 'demo' && !cards.length && (
                  <a className="jump" href="#replays">
                    <Play {...icon} size={13} />
                    実AIの記録を再生
                    <ArrowDown {...icon} size={13} />
                  </a>
                )}
              </div>
              {mode === 'live' && (
                <details className="token">
                  <summary>アクセス用トークン</summary>
                  <input
                    aria-label="アクセス用トークン"
                    type="password"
                    autoComplete="off"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                  <small>
                    {provider === 'codex'
                      ? 'このMacのログイン済みCodex CLIを使います。サブスクの利用枠を消費します。'
                      : 'Claude APIキーは画面に入力せず、サーバーの環境変数に置きます。'}
                  </small>
                </details>
              )}
            </form>
          </div>
          {!cards.length && <HeroArt />}
        </section>

        {(cards.length > 0 || busy || error) && (
          <div className="conversation">
            {cards.map((c, i) => (
              <section
                className="exchange"
                key={i}
                ref={i === cards.length - 1 ? resultRef : null}
                tabIndex={-1}
                aria-label={`分析結果 ${i + 1}`}
              >
                <p className="user-question">
                  <span>Q{String(i + 1).padStart(2, '0')}</span>
                  {c.question}
                </p>
                <article className={`answer kind-${c.result.kind}`}>
                  <div className="answer-label">
                    <Sparkles {...icon} />
                    {c.result.kind === 'answer'
                      ? '分析結果'
                      : c.result.kind === 'clarify'
                        ? '確認が必要です'
                        : c.result.kind === 'refuse'
                          ? '実行を拒否しました'
                          : '実行エラー'}
                    <span className="answer-meta">
                      {c.result.mode === 'demo' ? (
                        '固定回答'
                      ) : c.result.mode === 'replay' ? (
                        <>
                          実AI記録の再生 · 記録時{' '}
                          <CountUp value={c.result.elapsedMs} format={String} />
                          ms · {c.result.attempts}回実行
                        </>
                      ) : (
                        <>
                          <CountUp value={c.result.elapsedMs} format={String} />
                          ms · {c.result.attempts}回実行
                        </>
                      )}
                    </span>
                  </div>
                  <p className="message">{c.result.message}</p>
                  {!!c.result.report?.findings.length && (
                    <details className="analysis-notes">
                      <summary>
                        数値から分かること · {c.result.report.findings.length}件
                      </summary>
                      <ul>
                        {c.result.report.findings.map((f, j) => (
                          <li key={j} style={{ '--i': j } as never}>
                            {findingBlocks(f.text).map((b, k) =>
                              b.type === 'text' ? (
                                <span key={k} className="finding-line">
                                  {b.text}
                                </span>
                              ) : (
                                <div
                                  key={k}
                                  className="table-scroll"
                                  role="region"
                                  tabIndex={0}
                                  aria-label={`発見 ${j + 1} の表`}
                                >
                                  <table>
                                    <thead>
                                      <tr>
                                        {b.columns.map((x) => (
                                          <th key={x}>{x}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {b.rows.map((r, m) => (
                                        <tr key={m}>
                                          {r.map((x, n) => (
                                            <td key={n}>{x}</td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ),
                            )}
                            <small className="cite">
                              根拠 {f.evidenceIds.join('・')}
                            </small>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {!!c.result.report?.limitations.length && (
                    <div className="analysis-notes">
                      <h3>分からないこと・制約</h3>
                      <ul>
                        {c.result.report.limitations.map((x, j) => (
                          <li key={j} style={{ '--i': j } as never}>
                            {x}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(c.result.evidence?.length ?? 0) > 1 && (
                    <div className="analysis-notes evidence">
                      <h3>調査の根拠 · {c.result.evidence!.length}件</h3>
                      {c.result.evidence!.map((e, j) => (
                        <details key={j} style={{ '--i': j } as never}>
                          <summary>
                            根拠 {j + 1}: {e.label}
                          </summary>
                          <div
                            className="table-scroll"
                            role="region"
                            tabIndex={0}
                            aria-label={`根拠 ${j + 1} の集計表`}
                          >
                            <table>
                              <thead>
                                <tr>
                                  {e.table.columns.map((x) => (
                                    <th key={x}>{x}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {e.table.rows.map((r, k) => (
                                  <tr key={k}>
                                    {e.table.columns.map((x) => (
                                      <td
                                        key={x}
                                        className={
                                          typeof r[x] === 'number' ? 'n' : ''
                                        }
                                      >
                                        {cell(r[x])}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {e.table.truncated && (
                            <small>結果の上限により省略があります。</small>
                          )}
                          <pre>
                            <TypedSql sql={e.sql} />
                          </pre>
                          <button
                            className="secondary"
                            onClick={() => csv({ ...c.result, table: e.table })}
                          >
                            <Download {...icon} />
                            根拠 {j + 1} のCSVを保存
                          </button>
                        </details>
                      ))}
                    </div>
                  )}
                  <Graph result={c.result} />
                  {c.result.table.rows.length > 0 && (
                    <details>
                      <summary>
                        <Table2 {...icon} />
                        集計表 · {c.result.table.rows.length}行
                        {c.result.table.truncated ? '（上限で省略）' : ''}
                      </summary>
                      <div
                        className="table-scroll"
                        tabIndex={0}
                        role="region"
                        aria-label="集計表。矢印キーでスクロールできます。"
                      >
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
                              <tr key={j} style={{ '--i': j } as never}>
                                {c.result.table.columns.map((x) => (
                                  <td
                                    key={x}
                                    className={
                                      typeof r[x] === 'number' ? 'n' : ''
                                    }
                                  >
                                    {cell(r[x])}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <button
                        className="secondary"
                        onClick={() => csv(c.result)}
                      >
                        <Download {...icon} />
                        CSVを保存
                      </button>
                    </details>
                  )}
                  <details>
                    <summary>
                      <CodeXml {...icon} />
                      生成SQLを確認
                    </summary>
                    <pre>
                      {c.result.sql ? (
                        <TypedSql sql={c.result.sql} />
                      ) : (
                        'SQLは生成されていません。'
                      )}
                    </pre>
                    <button
                      className="secondary"
                      disabled={!c.result.sql}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(c.result.sql);
                          setCopied(i);
                          setTimeout(() => setCopied(null), 1500);
                        } catch {
                          setError(
                            'コピーできませんでした。SQLを選択してコピーしてください。',
                          );
                        }
                      }}
                    >
                      {copied === i ? <Check {...icon} /> : <Copy {...icon} />}
                      {copied === i ? 'コピーしました' : 'SQLをコピー'}
                    </button>
                  </details>
                  <details className="usage">
                    <summary>実行情報を確認</summary>
                    <small>
                      入力 {c.result.usage.inputTokens} / 出力{' '}
                      {c.result.usage.outputTokens} tokens · 費用{' '}
                      {c.result.costJpy === null
                        ? '単価を設定すると推計を表示'
                        : `${c.result.costJpy.toFixed(2)}円（設定単価による推計）`}
                    </small>
                  </details>
                  {c.result.kind === 'answer' && (
                    <button
                      className="secondary"
                      onClick={() => {
                        const url = URL.createObjectURL(
                          new Blob([analysisMarkdown(c.question, c.result)], {
                            type: 'text/markdown;charset=utf-8',
                          }),
                        );
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'analysis-note.md';
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      <FileText {...icon} />
                      分析メモを保存
                    </button>
                  )}
                  {!!c.result.report?.nextQuestions.length &&
                    (c.result.mode === 'replay' ? (
                      <div className="analysis-notes">
                        <h3>AIが提案した次の調査</h3>
                        <ul>
                          {c.result.report.nextQuestions.map((q, j) => (
                            <li key={q} style={{ '--i': j } as never}>
                              {q}
                            </li>
                          ))}
                        </ul>
                        <small>実AIモードで実行できます。</small>
                      </div>
                    ) : (
                      <div
                        className="followups"
                        aria-label="この分析の次の質問"
                      >
                        <h3>次に調べる</h3>
                        {c.result.report.nextQuestions.map((q) => (
                          <button
                            key={q}
                            disabled={busy}
                            onClick={() => submit(q)}
                          >
                            {q} <ArrowRight {...icon} />
                          </button>
                        ))}
                      </div>
                    ))}
                </article>
              </section>
            ))}
            {!busy &&
              cards.at(-1)?.result.mode === 'replay' &&
              nextReplayQuestion(cards.at(-1)!.question) && (
                <div
                  className="followups continue"
                  role="region"
                  aria-label="記録の続き"
                >
                  <h3>記録の続きを再生</h3>
                  <button
                    onClick={() =>
                      submit(nextReplayQuestion(cards.at(-1)!.question)!)
                    }
                  >
                    <Play {...icon} size={14} />
                    {nextReplayQuestion(cards.at(-1)!.question)}{' '}
                    <ArrowRight {...icon} />
                  </button>
                </div>
              )}
            {busy && (
              <div className="progress" role="status" aria-live="polite">
                <strong>
                  <LoaderCircle {...icon} className="spin" />
                  分析を進めています
                </strong>
                <ol>
                  {steps.map((s, i) => (
                    <li key={i}>
                      <span className="step-no">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      {s}
                    </li>
                  ))}
                </ol>
                {sql && (
                  <details open>
                    <summary>生成中のSQL</summary>
                    <pre>
                      <TypedSql sql={sql} />
                    </pre>
                  </details>
                )}
              </div>
            )}
            {error && (
              <div className="error" role="alert">
                <p>{error}</p>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => submit(lastQuestion)}
                >
                  もう一度試す
                </button>
              </div>
            )}
          </div>
        )}

        <div className="below">
          <div className="tries">
            {mode === 'demo' && (
              <section
                className="suggestions"
                id="replays"
                aria-label="実AIの記録を再生"
              >
                <div className="section-heading">
                  <span>実AIの記録を再生</span>
                  <span>{replayScenarios.length}シナリオ</span>
                </div>
                <div className="examples">
                  {replayScenarios.map((s, i) => (
                    <button
                      key={s.id}
                      disabled={busy}
                      style={{ '--i': i } as never}
                      onClick={() => submit(s.questions[0], true)}
                    >
                      <span className="example-no">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="example-body">
                        <small>
                          {s.title} · {s.questions.length}ターン
                        </small>
                        <span className="example-question">{s.shows}</span>
                      </span>
                      {s.id === 'safety' ? (
                        <ShieldCheck {...icon} className="example-go" />
                      ) : (
                        <ArrowRight {...icon} className="example-go" />
                      )}
                    </button>
                  ))}
                </div>
              </section>
            )}
            <section className="suggestions" aria-label="質問例">
              <div className="section-heading">
                <span>
                  {mode === 'demo'
                    ? '固定回答で画面を試す'
                    : cards.length
                      ? '次の問いを選ぶ'
                      : 'まずは、こんな問いから'}
                </span>
                <span>質問例</span>
              </div>
              <div className="examples">
                {examples.map((q, i) => (
                  <button
                    key={q}
                    disabled={busy}
                    style={{ '--i': i + 4 } as never}
                    onClick={() => submit(q)}
                  >
                    <span className="example-no">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="example-body">
                      <small>
                        {
                          [
                            '商品ランキング',
                            '売上トレンド',
                            '地域の比較',
                            '利益の内訳',
                          ][i]
                        }
                      </small>
                      <span className="example-question">{q}</span>
                    </span>
                    <ArrowRight {...icon} className="example-go" />
                  </button>
                ))}
              </div>
            </section>
            {mode === 'demo' && (
              <div className="notice">
                <ShieldCheck {...icon} size={18} />
                <p>
                  <strong>公開デモはAIを呼び出しません</strong>
                  <span>
                    「実AIの記録を再生」は、架空データに対して実際に記録したAIの応答・SQL・集計結果をそのまま表示します。質問例は画面確認用の固定回答です。新しい質問を分析するには、自分の環境で実AIモードを起動します。
                  </span>
                </p>
              </div>
            )}
          </div>
          <aside className="dataset" id="data" aria-label="分析できるデータ">
            <div className="dataset-heading">
              <Database {...icon} />
              <span>
                ECサンプルデータ
                <small>架空データ · 2024.10—2026.09</small>
              </span>
            </div>
            <div className="dataset-stats">
              <span>
                <CountUp value={5} />
                <small>テーブル</small>
              </span>
              <span>
                <CountUp value={175330} duration={1600} />
                <small>レコード</small>
              </span>
            </div>
            <ul className="table-list">
              {tables.map(([name, label, rows], i) => (
                <li key={name} style={{ '--i': i } as never}>
                  <code>{name}</code>
                  <span>{label}</span>
                  <span
                    className="bar"
                    style={
                      {
                        '--w': `${Math.max(3, (rows / 120000) * 100)}%`,
                      } as never
                    }
                  />
                  <CountUp value={rows} />
                </li>
              ))}
            </ul>
            <details className="schema">
              <summary>データの定義を見る</summary>
              <pre tabIndex={0} aria-label="データ定義">
                {schema}
              </pre>
            </details>
            <ul className="safety">
              <li>
                <ShieldCheck {...icon} />
                SQLは構文木で検証してから実行
              </li>
              <li>
                <ShieldCheck {...icon} />
                読み取り専用の権限・5秒で打ち切り
              </li>
              <li>
                <ShieldCheck {...icon} />
                最大1,000行・修正は3回まで
              </li>
            </ul>
          </aside>
        </div>
        <footer className="foot">
          <span>MIT · 架空データ · seed 42</span>
          <a href="https://github.com/Ryou-Koshimizu/japanese-data-agent">
            github.com/Ryou-Koshimizu/japanese-data-agent
          </a>
        </footer>
      </main>
    </div>
  );
}
