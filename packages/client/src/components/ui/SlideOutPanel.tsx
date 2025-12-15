import { useEffect, useRef, useState } from "react";

interface SlideOutPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  side?: "left" | "right";
  width?: string;
}

export function SlideOutPanel({
  isOpen,
  onClose,
  title,
  children,
  side = "right",
  width = "w-80",
}: SlideOutPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  // Handle open/close animations
  useEffect(() => {
    if (isOpen) {
      // Mount immediately, then trigger animation on next frame
      setIsVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true);
        });
      });
    } else {
      // Start closing animation
      setIsAnimating(false);
      // Wait for animation to complete before unmounting
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 300); // Match transition duration
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when open (with scrollbar compensation)
  useEffect(() => {
    if (isVisible) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    };
  }, [isVisible]);

  // Focus trap
  useEffect(() => {
    if (!isAnimating || !panelRef.current) return;

    const panel = panelRef.current;
    const focusableElements = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    };

    panel.addEventListener("keydown", handleTabKey);
    firstElement?.focus();

    return () => panel.removeEventListener("keydown", handleTabKey);
  }, [isAnimating]);

  if (!isVisible) return null;

  const positionClasses = side === "right" ? "right-0 border-l" : "left-0 border-r";

  const panelTransform = side === "right"
    ? isAnimating ? "translate-x-0" : "translate-x-full"
    : isAnimating ? "translate-x-0" : "-translate-x-full";

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          isAnimating ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`absolute inset-y-0 ${positionClasses} ${width} max-w-[90vw] bg-black/95 border-white/10 flex flex-col shadow-xl transition-transform duration-300 ease-out ${panelTransform}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="slideout-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-black/90 border-b border-white/10 shrink-0">
          <h3 id="slideout-title" className="text-sm font-semibold text-white/90">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded transition-colors"
            aria-label="Close panel"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {children}
        </div>
      </div>
    </div>
  );
}
