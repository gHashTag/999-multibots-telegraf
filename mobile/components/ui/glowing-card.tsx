"use client"

import React, { useRef, useState } from "react"
import { cn } from "../../lib/utils"

interface GlowingCardProps {
  children: React.ReactNode
  className?: string
  glowColor?: string
  spread?: number
  intensity?: number
}

export const GlowingCard = ({
  children,
  className,
  glowColor = "var(--brand-color)",
  spread = 150,
  intensity = 0.6,
}: GlowingCardProps) => {
  const cardRef = useRef<HTMLDivElement>(null)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [isHovering, setIsHovering] = useState(false)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return

    const rect = cardRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    setMousePosition({ x, y })
  }

  const handleMouseEnter = () => {
    setIsHovering(true)
  }

  const handleMouseLeave = () => {
    setIsHovering(false)
  }

  // Calculate opacity in hex for the glow color
  const glowOpacityHex = Math.round(intensity * 255).toString(16).padStart(2, '0')

  return (
    <div
      ref={cardRef}
      className={cn("relative group overflow-hidden rounded-2xl", className)}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Glowing spotlight effect that follows cursor */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-20"
        style={{
          background: isHovering
            ? `radial-gradient(${spread}px circle at ${mousePosition.x}px ${mousePosition.y}px, ${glowColor}${glowOpacityHex}, transparent 70%)`
            : 'transparent',
        }}
      />

      {/* Stronger border glow */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-10"
        style={{
          boxShadow: isHovering
            ? `0 0 30px ${glowColor}80, inset 0 0 20px ${glowColor}40`
            : 'none',
          borderRadius: '1rem',
        }}
      />

      {/* Content */}
      <div className="relative z-30">{children}</div>
    </div>
  )
}
