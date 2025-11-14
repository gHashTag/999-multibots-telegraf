"use client"

import React, { useEffect, useRef } from "react"
import { cn } from "../../lib/utils"

interface ParticlesProps {
  className?: string
  quantity?: number
  color?: string
}

export const Particles: React.FC<ParticlesProps> = ({
  className = "",
  quantity = 50,
  color = "#ffffff20",
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Resolve CSS variables to actual color values
    let resolvedColor = color
    if (color.includes('var(--')) {
      const varName = color.match(/var\((--[^)]+)\)/)?.[1]
      if (varName) {
        const cssValue = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()

        // Add opacity to solid colors for particles effect
        if (cssValue.startsWith('#') && cssValue.length <= 7) {
          // Convert hex to rgba with 30% opacity for better particle effect
          const r = parseInt(cssValue.slice(1, 3), 16)
          const g = parseInt(cssValue.slice(3, 5), 16)
          const b = parseInt(cssValue.slice(5, 7), 16)
          resolvedColor = `rgba(${r}, ${g}, ${b}, 0.3)`
        } else {
          resolvedColor = cssValue
        }
      }
    }

    const particles: Array<{
      x: number
      y: number
      size: number
      speedX: number
      speedY: number
      baseX: number
      baseY: number
    }> = []

    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }

    resizeCanvas()
    window.addEventListener("resize", resizeCanvas)

    // Mouse tracking
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }
    }

    canvas.addEventListener("mousemove", handleMouseMove)

    // Create particles
    for (let i = 0; i < quantity; i++) {
      const x = Math.random() * canvas.width
      const y = Math.random() * canvas.height
      particles.push({
        x,
        y,
        baseX: x,
        baseY: y,
        size: Math.random() * 2 + 0.5,
        speedX: (Math.random() - 0.5) * 0.5,
        speedY: (Math.random() - 0.5) * 0.5,
      })
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      particles.forEach((particle) => {
        // Mouse interaction
        const dx = mouseRef.current.x - particle.x
        const dy = mouseRef.current.y - particle.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        const forceDirectionX = dx / distance
        const forceDirectionY = dy / distance
        const maxDistance = 150
        const force = (maxDistance - distance) / maxDistance

        if (distance < maxDistance) {
          // Repel from mouse
          particle.x -= forceDirectionX * force * 5
          particle.y -= forceDirectionY * force * 5
        } else {
          // Return to base position
          particle.x += (particle.baseX - particle.x) * 0.05
          particle.y += (particle.baseY - particle.y) * 0.05
        }

        // Normal movement
        particle.baseX += particle.speedX
        particle.baseY += particle.speedY

        if (particle.baseX < 0 || particle.baseX > canvas.width) particle.speedX *= -1
        if (particle.baseY < 0 || particle.baseY > canvas.height) particle.speedY *= -1

        ctx.beginPath()
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
        ctx.fillStyle = resolvedColor
        ctx.fill()
      })

      requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener("resize", resizeCanvas)
      canvas.removeEventListener("mousemove", handleMouseMove)
    }
  }, [quantity, color])

  return (
    <div className={cn("absolute inset-0", className)}>
      <canvas ref={canvasRef} className="size-full" />
    </div>
  )
}
