"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useState } from "react"
import { cn } from "../../lib/utils"

export const TextFlip = ({
  text = "Build",
  words = ["Amazing", "Beautiful", "Modern", "Fast"],
  duration = 3000,
  className,
}: {
  text?: string
  words?: string[]
  duration?: number
  className?: string
}) => {
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % words.length)
    }, duration)

    return () => clearInterval(interval)
  }, [duration, words.length])

  return (
    <div className={cn("flex items-center gap-2 md:gap-3 flex-wrap justify-center", className)}>
      <motion.span
        layoutId="subtext"
        className="text-lg font-semibold tracking-tight md:text-2xl text-white"
      >
        {text}
      </motion.span>

      <motion.span
        layout
        className="relative w-fit overflow-hidden rounded-lg border border-brand/50 bg-gradient-to-r from-brand to-brand px-3 py-1.5 md:px-4 md:py-2 font-sans text-lg font-bold tracking-tight text-black shadow-[0_0_15px_rgba(246,255,0,0.3)] md:text-2xl"
      >
        <AnimatePresence mode="popLayout">
          <motion.span
            key={currentIndex}
            initial={{ y: -30, filter: "blur(8px)" }}
            animate={{
              y: 0,
              filter: "blur(0px)",
            }}
            exit={{ y: 40, filter: "blur(8px)", opacity: 0 }}
            transition={{
              duration: 0.4,
            }}
            className={cn("inline-block whitespace-nowrap")}
          >
            {words[currentIndex]}
          </motion.span>
        </AnimatePresence>
      </motion.span>
    </div>
  )
}
