/**
 * True when one sentence names a cause (因果・原因・要因) and says it is not
 * established by these numbers (断定できない・未特定・証明ではない・追加データが
 * 必要 など). A sentence that names a cause as fact, such as 「原因は広告です」,
 * does not count.
 */
export function statesCausalLimit(texts: string[]) {
  const cause = /因果|原因|要因/;
  const open =
    /断定|未特定|特定(?:でき|され|して)|証明|示しません|示さない|不明|分から|わから|判断でき|切り分け|追加データ|検証(?:する|には|が必要)/;
  return texts
    .join('。')
    .split(/[。\n]/)
    .some((sentence) => cause.test(sentence) && open.test(sentence));
}
