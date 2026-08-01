import { useCallback, useRef, useState } from "react";

const MIN_RATIO = 0.3;
const MAX_RATIO = 0.7;

function resistedRatio(value: number) {
  if (value < MIN_RATIO) return MIN_RATIO - (MIN_RATIO - value) * 0.16;
  if (value > MAX_RATIO) return MAX_RATIO + (value - MAX_RATIO) * 0.16;
  return value;
}

/** Pointer-captured, one-to-one split resizing with gentle edge resistance. */
export function usePanelResize(initialRatio = 0.55) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(initialRatio);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const divider = event.currentTarget;
    divider.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      const bounds = containerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      setRatio(resistedRatio((moveEvent.clientX - bounds.left) / bounds.width));
    };

    const onUp = () => {
      divider.removeEventListener("pointermove", onMove);
      setRatio((current) => Math.min(MAX_RATIO, Math.max(MIN_RATIO, current)));
    };

    divider.addEventListener("pointermove", onMove);
    divider.addEventListener("pointerup", onUp, { once: true });
    divider.addEventListener("pointercancel", onUp, { once: true });
  }, []);

  return { containerRef, ratio, dividerProps: { onPointerDown } };
}
