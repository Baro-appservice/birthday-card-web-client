import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '생일 카드 편집기',
  description: '나만의 생일 카드를 만드는 로컬 편집기',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
