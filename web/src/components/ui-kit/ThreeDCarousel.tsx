"use client";
import React, { useState, useEffect, useRef, ReactNode } from "react";
import * as Lucide from "lucide-react";

export type ThreeDCarouselProps<T> = {
  items: T[];
  renderItem: (item: T, isActive: boolean) => ReactNode;
  onActiveChange?: (item: T) => void;
  defaultActiveId?: string;
};

export function ThreeDCarousel<T>({ items, renderItem, onActiveChange, defaultActiveId }: ThreeDCarouselProps<T>) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (defaultActiveId && items.length > 0) {
      const idx = items.findIndex((item: any) => item.id === defaultActiveId);
      if (idx !== -1) {
        setActiveIndex(idx);
      }
    }
  }, [defaultActiveId, items]);
  const autoplayTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handlePrev = () => {
    const nextIndex = (activeIndex - 1 + items.length) % items.length;
    setActiveIndex(nextIndex);
    if (onActiveChange) onActiveChange(items[nextIndex]);
  };

  const handleNext = () => {
    const nextIndex = (activeIndex + 1) % items.length;
    setActiveIndex(nextIndex);
    if (onActiveChange) onActiveChange(items[nextIndex]);
  };

  const handleCardClick = (idx: number) => {
    if (idx !== activeIndex) {
      setActiveIndex(idx);
      if (onActiveChange) onActiveChange(items[idx]);
    }
  };

  // Reset timer on active index change to ensure user clicks reset the 5s window
  useEffect(() => {
    if (autoplayTimerRef.current) {
      clearInterval(autoplayTimerRef.current);
    }
    autoplayTimerRef.current = setInterval(() => {
      handleNext();
    }, 5000);

    return () => {
      if (autoplayTimerRef.current) {
        clearInterval(autoplayTimerRef.current);
      }
    };
  }, [activeIndex, items.length]);

  if (!items || items.length === 0) return null;

  return (
    <div className="relative w-full overflow-hidden py-10 flex flex-col items-center select-none">
      {/* Inline styles for keyframe loading animations */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes carousel-progress {
          0% { width: 0%; }
          100% { width: 100%; }
        }
      `}} />

      {/* 3D Stage Container */}
      <div 
        className="relative w-full max-w-4xl h-[440px] sm:h-[480px] flex items-center justify-center"
        style={{ perspective: "1200px" }}
      >
        {items.map((item, idx) => {
          // Calculate relative offset with wrap-around logic
          let offset = idx - activeIndex;
          if (offset < -items.length / 2) offset += items.length;
          if (offset > items.length / 2) offset -= items.length;

          const absOffset = Math.abs(offset);

          // Render center card, up to 2 visible cards on each side, and 1 invisible buffer card for smooth entrance/exit
          if (absOffset > 3) return null;

          const isActive = idx === activeIndex;

          let styleClasses = "";
          let transformStyle: React.CSSProperties = {};

          if (offset === 0) {
            styleClasses = "z-30 cursor-default scale-100 shadow-[0_35px_70px_rgba(212,175,55,0.18),0_15px_35px_rgba(0,0,0,0.05)] dark:shadow-[0_35px_70px_rgba(212,175,55,0.18),0_15px_35px_rgba(0,0,0,0.8)]";
            transformStyle = { transform: "translateX(0) translateZ(80px) rotateY(0deg)" };
          } else if (offset === -1 || offset === 1) {
            styleClasses = `z-20 cursor-pointer scale-90 shadow-[0_20px_45px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_45px_rgba(0,0,0,0.9)] group`;
            transformStyle = { transform: `translateX(${offset * 180}px) translateZ(-80px) rotateY(${offset * -20}deg)` };
          } else if (offset === -2 || offset === 2) {
            styleClasses = "z-10 cursor-pointer scale-75 shadow-[0_10px_30px_rgba(0,0,0,0.05)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.95)] group";
            transformStyle = { transform: `translateX(${offset > 0 ? 320 : -320}px) translateZ(-220px) rotateY(${offset > 0 ? -35 : 35}deg)` };
          } else {
            // Buffer card for smooth entrance/exit animations
            styleClasses = "z-0 opacity-0 pointer-events-none scale-50";
            transformStyle = { transform: `translateX(${offset > 0 ? 400 : -400}px) translateZ(-300px) rotateY(${offset > 0 ? -45 : 45}deg)` };
          }

          return (
            <div
              key={idx}
              onClick={() => handleCardClick(idx)}
              className={`absolute rounded-xl transition-all duration-500 ease-out overflow-hidden ${styleClasses}`}
              style={{
                ...transformStyle,
                transformStyle: "preserve-3d",
              }}
            >
              {renderItem(item, isActive)}
              
              {/* Solid overlay mask to fade inactive cards into the background without making them transparent */}
              <div 
                className={`absolute inset-[1px] z-50 pointer-events-none rounded-[11px] transition-opacity duration-500 ${
                  isActive 
                    ? "opacity-0" 
                    : absOffset === 1 
                      ? "opacity-[0.65] group-hover:opacity-50" 
                      : absOffset === 2
                        ? "opacity-[0.95]"
                        : "opacity-100"
                }`} 
                style={{ backgroundColor: "var(--bg-navy)" }}
              />
            </div>
          );
        })}
      </div>

      {/* Navigation Controls */}
      <div className="relative flex items-center gap-6 mt-8 z-40">
        <button
          onClick={handlePrev}
          className="btn-gold h-9 w-9 !px-0 rounded-full flex items-center justify-center"
          aria-label="Previous slide"
        >
          <Lucide.ChevronLeft size={18} />
        </button>

        {/* Indicators and timers */}
        <div className="flex gap-2.5 items-center">
          {items.map((_, idx) => {
            const isActive = idx === activeIndex;
            return (
              <button
                key={idx}
                onClick={() => handleCardClick(idx)}
                className={`h-2 rounded-full relative overflow-hidden transition-all duration-300 ${
                  isActive ? "w-10 bg-gold/20" : "w-2 bg-gold/30 hover:bg-gold/50"
                }`}
                aria-label={`Go to slide ${idx + 1}`}
              >
                {isActive && (
                  <div 
                    className="absolute left-0 top-0 h-full bg-gold rounded-full pointer-events-none"
                    style={{
                      animation: "carousel-progress 5000ms linear forwards",
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <button
          onClick={handleNext}
          className="btn-gold h-9 w-9 !px-0 rounded-full flex items-center justify-center"
          aria-label="Next slide"
        >
          <Lucide.ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
