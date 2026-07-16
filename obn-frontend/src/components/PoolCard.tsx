// src/components/PoolCard.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import clsx from "clsx";
import { useTheme } from "@/hooks/useTheme";

interface PoolCardProps {
  pid: number;
  logo: string;
  name: string;
  description: string;
  live: boolean;
}

export default function PoolCard({ pid, logo, name, description, live }: PoolCardProps) {
  const theme = useTheme();

  const CardContent = (
    <div
      className={clsx(
        "flex items-center gap-3 rounded-xl border px-4 py-3 w-full transition-colors",
        live ? "cursor-pointer hover:opacity-90" : "opacity-60 cursor-not-allowed"
      )}
      style={{
        color: "var(--card-text)",
        backgroundColor: theme === "dark" ? "var(--card-bg)" : "#ecfdf5",
        borderColor: theme === "dark" ? "var(--card-border)" : "#10b981",
      }}
    >
      {/* Logo */}
      <div className="shrink-0">
        <Image
          src={logo}
          alt={name}
          width={64}
          height={64}
          className="h-16 w-16 object-contain rounded-md"
          style={{ border: "1px solid #000000" }}
          priority={pid === 0}
        />
      </div>

      {/* Name + description */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold leading-tight" style={{ color: "var(--card-text)" }}>
          {name}
        </p>
        <p className="text-[10px] leading-snug mt-1" style={{ color: "var(--card-subtext)" }}>
          {description}
        </p>
      </div>
    </div>
  );

  return (
    <>
      {live ? <Link href={`/stake-earn-contribute/${pid}`} style={{ textDecoration: 'none' }} className="w-full block">{CardContent}</Link> : CardContent}
    </>
  );
}
