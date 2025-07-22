"use client";

import Link from "next/link";

interface PoolCardProps {
  pid: number; // 🆕 pool ID for navigation
  logo: string;
  name: string;
  description: string;
}

export default function PoolCard({
  pid,
  logo,
  name,
  description,
}: PoolCardProps) {
  return (
    <Link
      href={`/dashboard/${pid}`}
      className="
        flex flex-col items-center
        rounded-lg shadow-md border border-green-300
        bg-green-200
        p-6 text-center cursor-pointer
        hover:scale-105 hover:shadow-xl
        transition-transform
      "
      style={{ minHeight: "350px", width: "100%" }}
    >
      <img src={logo} alt={name} className="h-24 w-24 object-contain mb-4" />
      <h2 className="text-xl font-bold mb-2">{name}</h2>
      <p className="text-sm text-gray-800 mb-4">{description}</p>
      {/* 🔥 Entire card is now a clickable Link */}
    </Link>
  );
}
