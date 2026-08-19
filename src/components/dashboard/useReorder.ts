"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/**
 * Pointer-and-keyboard reordering shared by the card grid and the account
 * sheet's league list, so both write to the same saved order.
 *
 * The drag commits once, on release: a list that reshuffles under the finger
 * makes the drop target impossible to aim at.
 */
export function useReorder({
  attribute,
  onMove,
}: {
  /** Data attribute (camelCase dataset key) marking a droppable row. */
  attribute: string;
  onMove: (activeKey: string, targetKey: string) => void;
}) {
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const draggingKeyRef = useRef<string | null>(null);
  const dropTargetKeyRef = useRef<string | null>(null);
  const selector = `[data-${attribute.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}]`;

  function reset(event: ReactPointerEvent<HTMLElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    draggingKeyRef.current = null;
    dropTargetKeyRef.current = null;
    setDraggingKey(null);
    setDropTargetKey(null);
  }

  return {
    draggingKey,
    dropTargetKey,
    handleProps(key: string) {
      return {
        onPointerDown(event: ReactPointerEvent<HTMLElement>) {
          if (!event.isPrimary) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          draggingKeyRef.current = key;
          dropTargetKeyRef.current = key;
          setDraggingKey(key);
          setDropTargetKey(key);
        },
        onPointerMove(event: ReactPointerEvent<HTMLElement>) {
          if (!draggingKeyRef.current) return;
          const target = document
            .elementFromPoint(event.clientX, event.clientY)
            ?.closest<HTMLElement>(selector)?.dataset[attribute];
          if (!target || target === dropTargetKeyRef.current) return;
          dropTargetKeyRef.current = target;
          setDropTargetKey(target);
        },
        onPointerUp(event: ReactPointerEvent<HTMLElement>) {
          const activeKey = draggingKeyRef.current;
          const targetKey = dropTargetKeyRef.current;
          reset(event);
          if (activeKey && targetKey && activeKey !== targetKey) onMove(activeKey, targetKey);
        },
        onPointerCancel: reset,
      };
    },
  };
}
