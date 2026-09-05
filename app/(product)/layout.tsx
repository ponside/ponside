import type { ReactNode } from "react";
import type { Viewport } from "next";
import { AppShell } from "@/components/product/app-shell";
import { ProductProviders } from "@/components/product/product-providers";
import "../product.css";

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0F1011",
};

export default function ProductLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <ProductProviders><AppShell>{children}</AppShell></ProductProviders>;
}
