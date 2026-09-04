import type { ReactNode } from "react";
import type { Viewport } from "next";
import { AppShell } from "@/components/product/app-shell";
import "./product.css";

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f0f2f2",
};

export default function ProductLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
