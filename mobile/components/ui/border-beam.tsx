"use client"

import { motion } from "framer-motion"

interface BorderBeamProps {
  size?: number
  duration?: number
  colorFrom?: string
  colorTo?: string
}

export const BorderBeam = ({
  size = 200,
  duration = 15,
  colorFrom = "#a855f7",
  colorTo = "#ec4899",
}: BorderBeamProps) => {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 rounded-[inherit]"
      style={{
        background: `linear-gradient(90deg, transparent, ${colorFrom}, ${colorTo}, transparent)`,
        backgroundSize: `${size}% 100%`,
      }}
      animate={{
        backgroundPosition: ["0% 0%", "200% 0%"],
      }}
      transition={{
        duration,
        repeat: Infinity,
        ease: "linear",
      }}
    />
  )
}
