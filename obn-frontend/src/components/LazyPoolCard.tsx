"use client";

import PoolCard from "./PoolCard";

interface LazyPoolCardProps {
  pid: number;
  logo: string;
  name: string;
  description: string;
  live: boolean;
}

export default function LazyPoolCard(props: LazyPoolCardProps) {
  return <PoolCard {...props} />;
}
