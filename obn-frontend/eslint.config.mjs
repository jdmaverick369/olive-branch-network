import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default [
  ...nextVitals,
  ...nextTypeScript,
  { ignores: [".next/**", ".next-mainnet/**", "out/**", "build/**", "next-env.d.ts"] },
];
