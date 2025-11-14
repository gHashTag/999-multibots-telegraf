"use client"

import { cn } from "../../lib/utils"
import React, { useEffect, useRef, useState } from "react"

interface GlowingEffectProps {
  children: React.ReactNode
  className?: string
  blur?: number
  inactiveZone?: number
  proximity?: number
  spread?: number
  variant?: "default" | "white"
  glow?: boolean
  disabled?: boolean
  movementDuration?: number
  borderWidth?: number
}

export const GlowingEffect = ({
  children,
  className,
  blur = 0,
  inactiveZone = 0.7,
  proximity = 0,
  spread = 20,
  variant = "default",
  glow = false,
  disabled = true,
  movementDuration = 2,
  borderWidth = 1,
}: GlowingEffectProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container || disabled) return

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      setMousePosition({ x, y })
    }

    const handleMouseEnter = () => setIsHovered(true)
    const handleMouseLeave = () => setIsHovered(false)

    container.addEventListener("mousemove", handleMouseMove)
    container.addEventListener("mouseenter", handleMouseEnter)
    container.addEventListener("mouseleave", handleMouseLeave)

    return () => {
      container.removeEventListener("mousemove", handleMouseMove)
      container.removeEventListener("mouseenter", handleMouseEnter)
      container.removeEventListener("mouseleave", handleMouseLeave)
    }
  }, [disabled])

  const glowColor = variant === "white" ? "255, 255, 255" : "246, 255, 0" // var(--brand-color)

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden rounded-lg", className)}
      style={{
        ["--glow-x" as string]: `${mousePosition.x}px`,
        ["--glow-y" as string]: `${mousePosition.y}px`,
        ["--glow-blur" as string]: `${blur}px`,
        ["--glow-spread" as string]: `${spread}%`,
        ["--border-width" as string]: `${borderWidth}px`,
        ["--glow-color" as string]: glowColor,
        ["--movement-duration" as string]: `${movementDuration}s`,
      }}
    >
      {/* Glowing border effect */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 rounded-lg opacity-0 transition-opacity duration-300",
          (isHovered || glow) && !disabled && "opacity-100"
        )}
        style={{
          background: `radial-gradient(${spread}% ${spread}% at var(--glow-x) var(--glow-y), rgba(var(--glow-color), 0.8) 0%, rgba(var(--glow-color), 0.4) 50%, transparent 100%)`,
          filter: `blur(${blur}px)`,
          padding: `${borderWidth}px`,
          mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          maskComposite: "exclude",
          WebkitMaskComposite: "xor",
        }}
      />

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  )
}
