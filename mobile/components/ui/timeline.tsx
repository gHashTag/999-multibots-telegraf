"use client";
import { useScroll, useTransform, motion } from "framer-motion";
import React, { useEffect, useRef, useState } from "react";

interface TimelineEntry {
  title: string;
  content: React.ReactNode;
}

export const Timeline = ({ data }: { data: TimelineEntry[] }) => {
  const ref = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setHeight(rect.height);
    }
  }, [ref]);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 10%", "end 50%"],
  });

  const heightTransform = useTransform(scrollYProgress, [0, 1], [0, height]);
  const opacityTransform = useTransform(scrollYProgress, [0, 0.1], [0, 1]);

  return (
    <div
      className="w-full bg-transparent font-sans"
      ref={containerRef}
    >
      <div ref={ref} className="relative max-w-5xl mx-auto pb-20 px-4 md:px-8">
        {/* Вертикальная полоса слева - шире для лучшего выравнивания */}
        <div
          style={{
            height: height + "px",
          }}
          className="absolute left-[18px] md:left-[34px] top-0 overflow-hidden w-[4px] bg-[linear-gradient(to_bottom,var(--tw-gradient-stops))] from-transparent from-[0%] via-[var(--brand-color)]/20 to-transparent to-[99%]"
        >
          <motion.div
            style={{
              height: heightTransform,
              opacity: opacityTransform,
            }}
            className="absolute inset-x-0 top-0 w-[4px] bg-gradient-to-t from-brand via-[var(--brand-color)] to-transparent from-[0%] via-[10%] rounded-full shadow-[0_0_15px_rgba(246,255,0,0.8)]"
          />
        </div>

        {/* Timeline items */}
        {data.map((item, index) => (
          <div
            key={index}
            className="relative pb-20 last:pb-0 first:pt-8"
          >
            {/* Dot на полосе - крупнее и ярче */}
            <div className="absolute left-[6px] md:left-[22px] top-8 z-40 first:top-8">
              <div className="h-8 w-8 rounded-full bg-[#0c0a09] flex items-center justify-center border-3 border-brand shadow-[0_0_30px_rgba(246,255,0,0.6)]">
                <div className="h-4 w-4 rounded-full bg-brand shadow-[0_0_15px_rgba(246,255,0,1)]" />
              </div>
            </div>

            {/* Контент справа от линии с увеличенными отступами */}
            <div className="ml-16 md:ml-20 pt-4">
              {/* Заголовок недели - крупнее и ярче */}
              <div className="mb-8 bg-gradient-to-r from-brand/20 to-transparent p-4 rounded-r-xl border-l-4 border-brand">
                <h3 className="text-2xl md:text-3xl font-bold text-brand drop-shadow-[0_0_15px_rgba(246,255,0,0.5)]">
                  {item.title}
                </h3>
              </div>

              {/* Контент */}
              <div className="w-full">
                {item.content}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
