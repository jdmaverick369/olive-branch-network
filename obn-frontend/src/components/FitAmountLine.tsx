"use client";

import { useLayoutEffect, useRef, type ComponentProps, type ReactNode } from "react";

/** All amount rows in a card share the scale required by its longest row. */
export function FitAmountGroup({ children, ...props }: ComponentProps<"div">) {
  const groupRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const rows = Array.from(group.querySelectorAll<HTMLDivElement>("[data-amount-line]"));
    const pairs = rows.map(container => ({ container, line: container.firstElementChild as HTMLDivElement }));
    const fit = () => {
      const scale = Math.min(1, ...pairs.map(({ container, line }) =>
        container.clientWidth / Math.max(1, line.offsetWidth)));
      for (const { container, line } of pairs) {
        line.style.transform = `scale(${scale})`;
        line.style.marginLeft = `${Math.max(0, (container.clientWidth - line.offsetWidth * scale) / 2)}px`;
        container.style.height = `${line.offsetHeight * scale}px`;
      }
    };
    const observer = new ResizeObserver(fit);
    for (const { container, line } of pairs) {
      observer.observe(container);
      observer.observe(line);
    }
    fit();
    return () => observer.disconnect();
  }, []);

  return <div {...props} ref={groupRef}>{children}</div>;
}

export function FitAmountLine({ children, size = "text-[min(3.4vw,0.875rem)]" }: { children: ReactNode; size?: string }) {
  return (
    <div data-amount-line className="w-full min-w-0 [contain:inline-size]">
      <div className={`flex w-max origin-top-left items-baseline ${size} whitespace-nowrap [&>*]:shrink-0 [&>*]:whitespace-nowrap [&_span]:whitespace-nowrap`}>
        {children}
      </div>
    </div>
  );
}
