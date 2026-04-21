import type { Metadata } from "next";
import { Fraunces, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-fraunces",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "Неосвещаемая комната Пенроуза",
  description:
    "Помещение, в котором — как бы ярко ни светил точечный источник света — всегда остаются точки, куда свет не попадает ни после одного, ни после миллиона отражений.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${fraunces.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
