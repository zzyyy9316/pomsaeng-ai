import "./style.css";

export const metadata = {
  title: "폼생AI Scout v3",
  description: "숏폼 벤치마킹 리서치 AI"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
