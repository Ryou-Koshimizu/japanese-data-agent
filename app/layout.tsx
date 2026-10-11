import '@fontsource-variable/noto-sans-jp';
import './globals.css';
export const metadata = {
  title: '日本語データ分析エージェント',
  description: '自分のAPIキーで動く、検証可能なEC分析ハーネス。',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
