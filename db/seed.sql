-- Fixed arithmetic seed 42; no external data. Called inside an admin transaction.
INSERT INTO demo.customers
SELECT n, (ARRAY['東京','大阪','神奈川','愛知','福岡'])[(('x'||substr(md5('42:region:'||n),1,7))::bit(28)::integer)%5+1],
 (ARRAY['20代','30代','40代','50代','60代'])[(('x'||substr(md5('42:age:'||n),1,7))::bit(28)::integer)%5+1],
 DATE '2023-01-01' + (n*17+42)%500, (ARRAY['standard','silver','gold'])[(('x'||substr(md5('42:tier:'||n),1,7))::bit(28)::integer)%3+1]
FROM generate_series(1,5000) AS n;
INSERT INTO demo.products
SELECT n, '商品 ' || n, (ARRAY['家電','食品','衣料','家具','美容'])[(n+42)%5+1],
 500 + (n*137+42)%19500, round((500 + (n*137+42)%19500)*0.58,2)
FROM generate_series(1,300) AS n;
INSERT INTO demo.orders
SELECT n, (n*37+42)%5000+1, DATE '2024-10-01' + (n*17+42)%730,
 CASE WHEN (DATE '2024-10-01' + (n*17+42)%730 >= DATE '2026-09-01' AND n%3=0) OR n%19=0 THEN 'cancelled' WHEN n%41=0 THEN 'refunded' ELSE 'completed' END,
 (ARRAY['web','app','marketplace'])[(n*7+42)%3+1]
FROM generate_series(1,50000) AS n;
INSERT INTO demo.order_items
SELECT n, (n*31+42)%50000+1, p.id, (('x'||substr(md5('42:tier:'||n),1,7))::bit(28)::integer)%3+1, round(p.price * CASE WHEN n%7=0 THEN 0.9 ELSE 1 END,2)
FROM generate_series(1,120000) AS n
JOIN demo.products p ON p.id=(n*19+42)%300+1;
INSERT INTO demo.campaigns
SELECT n, '販促 '||n, DATE '2024-10-01'+(n*23)%700, DATE '2024-10-01'+(n*23)%700+10, 0.10,
 (ARRAY['家電','食品','衣料','家具','美容'])[(n+42)%5+1]
FROM generate_series(1,30) AS n;
