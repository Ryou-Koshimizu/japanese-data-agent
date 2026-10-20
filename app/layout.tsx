import '@fontsource-variable/noto-sans-jp';
import '@fontsource-variable/geist-mono';
import './globals.css';
export const metadata = {
  title: '日本語データ分析エージェント',
  description:
    '日本語で質問すると、AIがSQLを検証してから読み取り専用で実行し、根拠つきで答える分析エージェント。',
};
export const viewport = {
  themeColor: '#050506',
  colorScheme: 'dark',
  viewportFit: 'cover',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
