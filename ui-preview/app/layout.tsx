import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../../src/static/assets/stitch-simulation/fonts.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mạch Đồng · Thử giao diện",
  description: "Bản thử sidebar và header Mạch Đồng với dữ liệu giả lập.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="vi"><body>{children}</body></html>;
}
