"use client";

import Link from "next/link";
import Image from "next/image";

interface PoolCardProps {
  pid: number;
  logo: string; // e.g. "/charity1.png" or an allowed remote domain
  name: string;
  description: string;
  live: boolean;
}

export default function PoolCard({
  pid,
  logo,
  name,
  description,
  live,
}: PoolCardProps) {
  const CardContent = (
    <div
      className={`flex flex-col items-center rounded-lg shadow-md border border-green-300
        ${live ? "bg-green-200 cursor-pointer hover:scale-105 hover:shadow-xl" : "bg-gray-100 opacity-60 cursor-not-allowed"}
        p-6 text-center transition-transform`}
      style={{ minHeight: "350px", width: "100%" }}
    >
      <Image
        src={logo}
        alt={name}
        width={96}
        height={96}
        className="h-24 w-24 object-contain mb-4"
        priority={pid === 0}
      />
      <h2 className="text-xl font-bold mb-2">{name}</h2>
      <p className="text-sm text-gray-800 mb-4">{description}</p>
    </div>
  );

  return live ? <Link href={`/dashboard/${pid}`}>{CardContent}</Link> : CardContent;
}