import "./style.css";

export const metadata = {
  title: "폼생AI Scout Pro",
  description: "숏폼 리서치와 벤치마킹 AI"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
