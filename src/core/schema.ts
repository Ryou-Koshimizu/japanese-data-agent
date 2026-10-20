export const referenceDate = '2026-10-01';
export const tables = [
  'customers',
  'products',
  'orders',
  'order_items',
  'campaigns',
] as const;
export const schema = `基準日時: 2026-10-01 (日本時間)。データ期間: 2024-10-01〜2026-09-30。
売上=completed注文のorder_items.quantity * unit_price。キャンセル・返金は売上に含めない。
販売数量=completed注文のorder_items.quantityの合計。売上と同じくキャンセル・返金は含めない。
先月=2026-09。直近12か月=2025-10〜2026-09。前年比=前年同月との比較。
金額は日本円。粗利=quantity*(unit_price-products.cost)。割引後価格はunit_priceに反映済み。
リピート顧客=completed注文が期間内2件以上。リピート率=該当顧客数/購入顧客数。
demo.customers(id整数, region地域, age_group年代, registered_at日付, tier会員ランク)
 地域=東京/大阪/神奈川/愛知/福岡。年代=20代/30代/40代/50代/60代。
demo.products(id整数, name商品名, categoryカテゴリ, price定価, cost原価)
 カテゴリ=家電/食品/衣料/家具/美容。
demo.orders(id整数, customer_id顧客ID, ordered_at日付, status状態, channel流入)
 状態=completed/cancelled/refunded。流入=web/app/marketplace。
demo.order_items(id整数, order_id注文ID, product_id商品ID, quantity数量, unit_price販売単価)
demo.campaigns(id整数, name名前, start_date開始, end_date終了, discount_rate割引率, category対象)
許可されるのは上記のdemoスキーマの5テーブルのみ。SELECT単文のみ。`;
export const examples = [
  '先月の売上トップ10の商品は？',
  '直近12か月の月別売上の推移を見せて',
  '地域別の売上を比較して',
  'カテゴリ別の粗利を見せて',
];
