"use client";

import Link from "next/link";
import { Header } from "./Header";

interface PageLayoutProps {
  children: React.ReactNode;
  rightContent?: React.ReactNode;
  showLogoAsLink?: boolean;
}

export function PageLayout({
  children,
  rightContent,
  showLogoAsLink = false,
}: PageLayoutProps) {
  return (
    <div className="h-screen w-screen bg-background flex flex-col">
      <header className="flex justify-between items-start py-8 px-12 shrink-0">
        <div className="flex flex-col gap-2">
          <Header asLink={showLogoAsLink} />
          <Link
            href="/"
            className="text-xs text-muted-foreground-dim hover:text-foreground transition-colors"
          >
            ← Panel de publicación
          </Link>
        </div>
        {rightContent}
      </header>
      {children}
    </div>
  );
}
