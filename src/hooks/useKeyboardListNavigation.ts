import { KeyboardEvent, useEffect, useRef, useState } from "react";

interface KeyboardListNavigationOptions<T> {
  items: T[];
  isOpen: boolean;
  listId: string;
  resetKey?: string;
  onOpen?: () => void;
  onClose: () => void;
  onSelect: (item: T) => void;
}

export function useKeyboardListNavigation<T>({
  items,
  isOpen,
  listId,
  resetKey = "",
  onOpen,
  onClose,
  onSelect
}: KeyboardListNavigationOptions<T>) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const optionRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    setActiveIndex(isOpen && items.length > 0 ? 0 : -1);
  }, [isOpen, items.length, resetKey]);

  useEffect(() => {
    if (activeIndex < 0) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") return;
    if (!isOpen) {
      if (event.key === "Enter") return;
      event.preventDefault();
      onOpen?.();
      setActiveIndex(event.key === "ArrowUp" ? Math.max(items.length - 1, 0) : 0);
      return;
    }
    if (items.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => index < 0 ? 0 : (index + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => index <= 0 ? items.length - 1 : index - 1);
    } else if (activeIndex >= 0) {
      event.preventDefault();
      onSelect(items[activeIndex]);
    }
  };

  return {
    activeIndex,
    activeDescendant: activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined,
    onKeyDown,
    getOptionProps: (index: number) => ({
      id: `${listId}-option-${index}`,
      role: "option" as const,
      "aria-selected": activeIndex === index,
      ref: (element: HTMLElement | null) => {
        optionRefs.current[index] = element;
      },
      onMouseEnter: () => setActiveIndex(index)
    })
  };
}
