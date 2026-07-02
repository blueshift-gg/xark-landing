import type { ReactNode } from "react";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";

import "./landing.css";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="xk">
      <Header />
      {children}
      <Footer />
    </div>
  );
}
