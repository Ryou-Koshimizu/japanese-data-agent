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
import type { Analysis, Event } from '../src/core/contracts';
import {
  conversationHistory,
  analysisMarkdown,
} from '../src/core/conversation';
import { examples, schema } from '../src/core/schema';
type IconName =
  | 'chart'
  | 'arrow'
  | 'plus'
  | 'database'
  | 'shield'
  | 'code'
  | 'spark'
  | 'download'
  | 'copy';
function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    chart: 'M4 20V10m8 10V4m8 16v-7M2 22h20',
    arrow: 'M5 12h14m-6-6 6 6-6 6',
    plus: 'M12 5v14M5 12h14',
    database:
      'M20 6c0 2-4 3-8 3S4 8 4 6s4-3 8-3 8 1 8 3Zm0 0v12c0 2-4 3-8 3s-8-1-8-3V6m0 6c0 2 4 3 8 3s8-1 8-3',
    shield: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Zm-4 9 3 3 5-6',
    code: 'm8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18',
    spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
    download: 'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',
    copy: 'M9 9h12v12H9V9ZM15 9V3H3v12h6',
  };
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
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
    <div
      className="graph"
      role="img"
      aria-label={`${c.type === 'line' ? '折れ線' : '棒'}グラフ：${c.x}別の${c.y}。値は下の集計表でも確認できます。`}
    >
      <ResponsiveContainer width="100%" height={280}>
        {c.type === 'line' ? (
          <LineChart data={result.table.rows}>
            <CartesianGrid
              stroke="var(--line)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey={c.x}
              tick={{ fontSize: 12, fill: 'var(--muted)' }}
            />
            <YAxis
              tickFormatter={(value: number) =>
                new Intl.NumberFormat('ja-JP', {
                  notation: 'compact',
                  maximumFractionDigits: 1,
                }).format(value)
              }
              width={65}
              tick={{ fontSize: 12, fill: 'var(--muted)' }}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--solid)',
                border: '1px solid var(--line)',
                borderRadius: 12,
                color: 'var(--text)',
              }}
              cursor={{ fill: 'rgba(255,255,255,.04)' }}
            />
            <Line
              isAnimationActive={false}
              type="monotone"
              dataKey={c.y}
              stroke="var(--accent)"
              strokeWidth={3}
              dot={false}
            />
          </LineChart>
        ) : (
          <BarChart data={result.table.rows}>
            <CartesianGrid
              stroke="var(--line)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey={c.x}
              tick={{ fontSize: 12, fill: 'var(--muted)' }}
            />
            <YAxis
              tickFormatter={(value: number) =>
                new Intl.NumberFormat('ja-JP', {
                  notation: 'compact',
                  maximumFractionDigits: 1,
                }).format(value)
              }
              width={65}
              tick={{ fontSize: 12, fill: 'var(--muted)' }}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--solid)',
                border: '1px solid var(--line)',
                borderRadius: 12,
                color: 'var(--text)',
              }}
              cursor={{ fill: 'rgba(255,255,255,.04)' }}
            />
            <Bar
              isAnimationActive={false}
              dataKey={c.y}
              fill="var(--accent)"
              radius={[5, 5, 0, 0]}
            />
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
  async function submit(q: string) {
    if (busy || !q.trim()) return;
    setBusy(true);
    setError('');
    setSteps([]);
    setSql('');
    setLastQuestion(q);
    controller.current = new AbortController();
    const history = conversationHistory(cards);
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
  return (
    <div className="shell">
      <a className="skip-link" href="#analysis-main">
        分析画面へスキップ
      </a>
      <aside className="sidebar glass">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Icon name="chart" />
          </span>
          <span>
            分析室<small>DATA INTELLIGENCE</small>
          </span>
        </a>
        <div className="workspace-label">ワークスペース</div>
        <button
          className="nav-button selected"
          onClick={() => inputRef.current?.focus()}
        >
          <Icon name="spark" />
          データに質問
        </button>
        <button
          className="nav-button"
          disabled={busy}
          onClick={() => {
            setCards([]);
            setQuestion('');
            setError('');
            inputRef.current?.focus();
          }}
        >
          <Icon name="plus" />
          新しい分析
        </button>
        <div className="dataset-card">
          <div className="dataset-heading">
            <Icon name="database" />
            <span>
              ECサンプルデータ<small>架空データ · 2024.10—2026.09</small>
            </span>
          </div>
          <div className="dataset-stats">
            <span>
              <b>5</b> テーブル
            </span>
            <span>
              <b>175,330</b> レコード
            </span>
          </div>
          <details className="schema">
            <summary>データの定義を見る</summary>
            <pre tabIndex={0} aria-label="データ定義">
              {schema}
            </pre>
          </details>
        </div>
        <div className="aside-foot">
          <div className="safety-note">
            <Icon name="shield" />
            <span>
              読み取り専用<small>生成SQLを検証して実行</small>
            </span>
          </div>
          <a href="https://github.com/Ryou-Koshimizu/japanese-data-agent">
            <Icon name="code" />
            ソースと検証記録 <Icon name="arrow" />
          </a>
        </div>
      </aside>
      <main id="analysis-main">
        <header>
          <div className="breadcrumb">
            ワークスペース <span>/</span> <strong>EC分析</strong>
          </div>
          <div className="mode">
            <span className="status-dot" />
            {mode === 'demo'
              ? '固定回答デモ · API不要'
              : provider === 'codex'
                ? '実AI · ChatGPTサブスクで実行'
                : '実AI · 自分のAPIで実行'}
          </div>
        </header>
        <div className="conversation">
          <section className={`intro ${cards.length ? 'intro-compact' : ''}`}>
            <div className="hero-copy">
              <span className="eyebrow">
                <Icon name="spark" />
                あなたの問いが、分析のはじまり。
              </span>
              <h1>
                数字の向こうに、
                <br />
                <span>答えを見つけよう。</span>
              </h1>
              <p>
                いつもの言葉で質問するだけ。
                <br />
                売上の推移や商品の違いを、確かめられる形に。
              </p>
            </div>
            {!cards.length && (
              <div className="hero-art" aria-hidden="true">
                <div className="art-orbit" />
                <div className="art-panel">
                  <div className="art-top">
                    <span /> <span />
                    <span />
                  </div>
                  <svg viewBox="0 0 300 135" fill="none">
                    <defs>
                      <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                        <stop stopColor="#7de4d3" stopOpacity=".35" />
                        <stop offset="1" stopColor="#7de4d3" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M10 103C40 104 32 72 66 81S110 105 130 61 170 73 192 37 235 57 290 12V135H10Z"
                      fill="url(#area)"
                    />
                    <path
                      d="M10 103C40 104 32 72 66 81S110 105 130 61 170 73 192 37 235 57 290 12"
                      stroke="#7de4d3"
                      strokeWidth="3"
                    />
                    <path
                      d="M10 120h280M10 80h280M10 40h280"
                      stroke="white"
                      strokeOpacity=".08"
                    />
                  </svg>
                  <div className="art-caption">QUESTION → INSIGHT</div>
                </div>
                <div className="art-chip">
                  <Icon name="spark" />
                  言葉から、気づきへ
                </div>
              </div>
            )}
          </section>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(question);
            }}
            className="composer glass"
          >
            <label htmlFor="question">
              データへの質問
              <span>
                {mode === 'demo'
                  ? '固定回答で画面を試す'
                  : provider === 'codex'
                    ? 'ChatGPTで分析する'
                    : 'Claudeで分析する'}
              </span>
            </label>
            <div>
              <input
                id="question"
                ref={inputRef}
                aria-describedby="question-hint"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={1500}
                placeholder="例：先月の売上を東京だけで比較して"
                disabled={busy}
              />
              {busy ? (
                <button
                  type="button"
                  onClick={() => controller.current?.abort()}
                >
                  停止
                </button>
              ) : (
                <button disabled={!question.trim()} type="submit">
                  分析する <Icon name="arrow" />
                </button>
              )}
            </div>
            <small id="question-hint">
              基準日 2026-10-01 · 架空ECデータ · Enterで送信
            </small>
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
                  {provider === 'codex'
                    ? 'このMacのログイン済みCodex CLIを使います。サブスクの利用枠を消費します。'
                    : 'Claude APIキーは入力せず、サーバー環境変数に設定してください。'}
                </small>
              </details>
            )}
          </form>
          <section className="suggestions" aria-label="質問例">
            <div className="section-heading">
              <span>
                {cards.length ? '次の問いを選ぶ' : 'まずは、こんな問いから'}
              </span>
              <span>質問例</span>
            </div>
            <div className="examples">
              {examples.map((q, i) => (
                <button key={q} disabled={busy} onClick={() => submit(q)}>
                  <span className="example-icon">
                    <Icon
                      name={i === 1 ? 'chart' : i === 2 ? 'database' : 'spark'}
                    />
                  </span>
                  <span>
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
                  <Icon name="arrow" />
                </button>
              ))}
            </div>
          </section>
          {mode === 'demo' && (
            <div className="notice">
              <Icon name="shield" />
              <p>
                <strong>気軽に試せる、固定回答デモ</strong>
                <span>
                  画面体験用のサンプルを表示します。AI分析・DB実行は行いません。
                </span>
              </p>
            </div>
          )}
          <details className="mobile-data">
            <summary>
              <Icon name="database" />
              分析できるデータの定義
            </summary>
            <pre tabIndex={0} aria-label="データ定義">
              {schema}
            </pre>
          </details>
          {cards.map((c, i) => (
            <section
              className="exchange"
              key={i}
              ref={i === cards.length - 1 ? resultRef : null}
              tabIndex={-1}
              aria-label={`分析結果 ${i + 1}`}
            >
              <p className="user-question">
                <span>あなたの質問</span>
                {c.question}
              </p>
              <article className="answer glass">
                <div className="answer-label">
                  <Icon name="spark" />
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
                {!!c.result.report?.findings.length && (
                  <details className="analysis-notes">
                    <summary>
                      数値から分かること · {c.result.report.findings.length}件
                    </summary>
                    <ul>
                      {c.result.report.findings.map((f, j) => (
                        <li key={j}>
                          {f.text}{' '}
                          <small>根拠 {f.evidenceIds.join('・')}</small>
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
                        <li key={j}>{x}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {(c.result.evidence?.length ?? 0) > 1 && (
                  <div className="analysis-notes">
                    <h3>調査の根拠 · {c.result.evidence!.length}件</h3>
                    {c.result.evidence!.map((e, j) => (
                      <details key={j}>
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
                                    <td key={x}>{String(r[x] ?? '—')}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {e.table.truncated && (
                          <small>結果の上限により省略があります。</small>
                        )}
                        <pre>{e.sql}</pre>
                        <button
                          className="secondary-button"
                          onClick={() => csv({ ...c.result, table: e.table })}
                        >
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
                            <tr key={j}>
                              {c.result.table.columns.map((x) => (
                                <td key={x}>
                                  {typeof r[x] === 'number'
                                    ? new Intl.NumberFormat('ja-JP').format(
                                        r[x] as number,
                                      )
                                    : String(r[x] ?? '—')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button
                      className="secondary-button"
                      onClick={() => csv(c.result)}
                    >
                      <Icon name="download" />
                      CSVを保存
                    </button>
                  </details>
                )}
                <details>
                  <summary>
                    <Icon name="code" />
                    生成SQLを確認
                  </summary>
                  <pre>{c.result.sql || 'SQLは生成されていません。'}</pre>
                  <button
                    className="secondary-button"
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
                    <Icon name="copy" />
                    {copied === i ? 'コピーしました' : 'SQLをコピー'}
                  </button>
                </details>
                <details className="usage">
                  <summary>実行情報を確認</summary>
                  <small>
                    入力 {c.result.usage.inputTokens} / 出力{' '}
                    {c.result.usage.outputTokens} tokens · 費用{' '}
                    {c.result.costJpy === null
                      ? '未測定'
                      : `${c.result.costJpy.toFixed(2)}円（設定単価による推計）`}
                  </small>
                </details>
                {c.result.kind === 'answer' && (
                  <button
                    className="secondary-button"
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
                    <Icon name="download" />
                    分析メモを保存
                  </button>
                )}
                {!!c.result.report?.nextQuestions.length && (
                  <div className="followups" aria-label="この分析の次の質問">
                    <h3>次に調べる</h3>
                    {c.result.report.nextQuestions.map((q) => (
                      <button key={q} disabled={busy} onClick={() => submit(q)}>
                        {q} <Icon name="arrow" />
                      </button>
                    ))}
                  </div>
                )}
              </article>
            </section>
          ))}
          {busy && (
            <div className="progress" role="status" aria-live="polite">
              <strong>
                <span className="loading-dot" />
                分析を進めています
              </strong>
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
            <div className="error" role="alert">
              <p>{error}</p>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => submit(lastQuestion)}
              >
                もう一度試す
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
