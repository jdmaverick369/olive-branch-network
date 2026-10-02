/**
 * An address shortened to fit phone header widths: more characters on wider phones.
 * From md up it shows `wide` (the short form by default, so desktop layouts stay as they were).
 */
export function FittedAddress({ address, separator = "…", wide = "short" }: { address: string; separator?: string; wide?: "short" | "full" }) {
  const cut = (head: number, tail: number) => `${address.slice(0, head)}${separator}${address.slice(-tail)}`;
  return (
    <>
      <span className="min-[360px]:hidden">{cut(6, 4)}</span>
      <span className="hidden min-[360px]:inline min-[430px]:hidden">{cut(8, 6)}</span>
      <span className="hidden min-[430px]:inline md:hidden">{cut(10, 8)}</span>
      <span className="hidden md:inline lg:hidden">{wide === "full" ? cut(10, 8) : cut(6, 4)}</span>
      <span className="hidden lg:inline">{wide === "full" ? address : cut(6, 4)}</span>
    </>
  );
}
