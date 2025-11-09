"use client"

import { memo } from "react"
import { motion, Variants } from "framer-motion"
import { cn } from "../../lib/utils"

type AnimationVariant = "fadeIn" | "blurIn" | "slideUp"

interface TextAnimateProps {
  children: string
  className?: string
  delay?: number
  animation?: AnimationVariant
}

const animations: Record<AnimationVariant, { item: Variants }> = {
  fadeIn: {
    item: {
      hidden: { opacity: 0, y: 20 },
      show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
    },
  },
  blurIn: {
    item: {
      hidden: { opacity: 0, filter: "blur(10px)" },
      show: { opacity: 1, filter: "blur(0px)", transition: { duration: 0.6 } },
    },
  },
  slideUp: {
    item: {
      hidden: { y: 30, opacity: 0 },
      show: { y: 0, opacity: 1, transition: { duration: 0.5 } },
    },
  },
}

const TextAnimateBase = ({
  children,
  className,
  delay = 0,
  animation = "fadeIn",
}: TextAnimateProps) => {
  const words = children.split(" ")
  const { item } = animations[animation]

  return (
    <motion.div
      initial="hidden"
      animate="show"
      transition={{ staggerChildren: 0.1, delayChildren: delay }}
      className={cn("inline-block", className)}
    >
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          variants={item}
          className="inline-block mr-2"
        >
          {word}
        </motion.span>
      ))}
    </motion.div>
  )
}

export const TextAnimate = memo(TextAnimateBase)
