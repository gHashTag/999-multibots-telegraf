"use client"

import React, { useEffect, useRef, useState } from "react"
import { CardContainer, CardBody, CardItem } from "./card-3d"
import { Check } from "lucide-react"
import { cn } from "../../lib/utils"

interface ModuleData {
  icon: string
  title: string
  duration: string
  description: string
  items: string[]
  resultIcon: React.ReactNode
  resultLabel: string
  resultText: string
  isHighlighted?: boolean
  gradientFrom?: string
  gradientTo?: string
  accentColor?: string
}

interface ModulesCarousel3DProps {
  modules: ModuleData[]
  autoScrollInterval?: number
  initialDelay?: number
}

export function ModulesCarousel3D({
  modules,
  autoScrollInterval = 3000,
  initialDelay = 3000,
}: ModulesCarousel3DProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const autoScrollTimer = useRef<NodeJS.Timeout | null>(null)
  const initialDelayTimer = useRef<NodeJS.Timeout | null>(null)

  // Auto-scroll logic
  useEffect(() => {
    const startAutoScroll = () => {
      if (autoScrollTimer.current) {
        clearInterval(autoScrollTimer.current)
      }

      autoScrollTimer.current = setInterval(() => {
        if (!isPaused && scrollContainerRef.current) {
          const container = scrollContainerRef.current
          const cardWidth = container.querySelector(".module-card")?.clientWidth || 0
          const gap = 16
          const scrollAmount = cardWidth + gap

          const nextIndex = (currentIndex + 1) % modules.length

          container.scrollTo({
            left: scrollAmount * nextIndex,
            behavior: "smooth",
          })

          setCurrentIndex(nextIndex)
        }
      }, autoScrollInterval)
    }

    initialDelayTimer.current = setTimeout(() => {
      startAutoScroll()
    }, initialDelay)

    return () => {
      if (autoScrollTimer.current) clearInterval(autoScrollTimer.current)
      if (initialDelayTimer.current) clearTimeout(initialDelayTimer.current)
    }
  }, [isPaused, currentIndex, modules.length, autoScrollInterval, initialDelay])

  // Touch/swipe detection
  const touchStartX = useRef<number>(0)
  const touchEndX = useRef<number>(0)

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    setIsPaused(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX
  }

  const handleTouchEnd = () => {
    const swipeThreshold = 50
    const diff = touchStartX.current - touchEndX.current

    if (Math.abs(diff) > swipeThreshold && scrollContainerRef.current) {
      const container = scrollContainerRef.current
      const cardWidth = container.querySelector(".module-card")?.clientWidth || 0
      const gap = 16
      const scrollAmount = cardWidth + gap

      if (diff > 0) {
        const nextIndex = Math.min(currentIndex + 1, modules.length - 1)
        container.scrollTo({
          left: scrollAmount * nextIndex,
          behavior: "smooth",
        })
        setCurrentIndex(nextIndex)
      } else {
        const prevIndex = Math.max(currentIndex - 1, 0)
        container.scrollTo({
          left: scrollAmount * prevIndex,
          behavior: "smooth",
        })
        setCurrentIndex(prevIndex)
      }
    }

    setTimeout(() => setIsPaused(false), 2000)
  }

  const handleMouseEnter = () => setIsPaused(true)
  const handleMouseLeave = () => setIsPaused(false)

  return (
    <div className="relative w-full mt-8">
      {/* Horizontal scroll container */}
      <div
        ref={scrollContainerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory",
          "scrollbar-hide",
          "pb-6 px-8 md:px-12 lg:px-8"
        )}
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          scrollPaddingInline: "2rem",
        }}
      >
        {modules.map((module, index) => (
          <div
            key={index}
            className="module-card flex-shrink-0 w-[85vw] sm:w-[45vw] md:w-[30vw] lg:w-[18vw] snap-center"
          >
            <CardContainer className="w-full h-full">
              <CardBody
                className="relative w-full min-h-[450px] sm:min-h-[480px] md:min-h-[520px] p-6 rounded-2xl border border-white/20 backdrop-blur-xl transition-all duration-300 shadow-2xl hover:shadow-[0_20px_60px_rgba(0,0,0,0.5)] hover:scale-[1.02] flex flex-col group overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${module.gradientFrom || 'rgba(255,255,255,0.1)'} 0%, ${module.gradientTo || 'rgba(255,255,255,0.05)'} 100%)`,
                }}
              >
                {/* Glassmorphism overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-white/5 to-transparent opacity-50" />

                {/* Content */}
                <div className="relative z-10 flex flex-col h-full">
                  {/* Header */}
                  <CardItem
                    translateZ={50}
                    className="flex flex-col gap-2 mb-4"
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-4xl shrink-0 drop-shadow-lg">{module.icon}</span>
                      <div className="flex flex-col gap-1">
                        <h4 className="text-base font-bold text-white leading-tight tracking-tight">
                          {module.title}
                        </h4>
                        <span className="text-white/70 text-sm font-medium">
                          {module.duration}
                        </span>
                      </div>
                    </div>
                  </CardItem>

                  {/* Description */}
                  <CardItem translateZ={40} className="mb-4">
                    <p className="text-white/80 text-sm leading-relaxed">{module.description}</p>
                  </CardItem>

                  {/* Items list */}
                  <CardItem translateZ={30} className="grid grid-cols-1 gap-2.5 mb-4 flex-1">
                    {module.items.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-2.5">
                        <Check
                          className="w-4 h-4 shrink-0 mt-0.5"
                          style={{ color: module.accentColor || '#f6ff00' }}
                        />
                        <span className="text-white/90 text-sm leading-relaxed">{item}</span>
                      </div>
                    ))}
                  </CardItem>

                  {/* Result box */}
                  <CardItem translateZ={35}>
                    <div
                      className="p-3 rounded-xl backdrop-blur-md border transition-all"
                      style={{
                        backgroundColor: `${module.accentColor || '#f6ff00'}15`,
                        borderColor: `${module.accentColor || '#f6ff00'}40`,
                      }}
                    >
                      <div className="flex items-start gap-2.5">
                        <div
                          className="shrink-0 mt-0.5"
                          style={{
                            color: module.accentColor || '#f6ff00',
                            filter: `drop-shadow(0 0 8px ${module.accentColor || '#f6ff00'})`
                          }}
                        >
                          {module.resultIcon}
                        </div>
                        <div className="flex flex-col gap-1">
                          <span
                            className="font-bold text-sm"
                            style={{ color: module.accentColor || '#f6ff00' }}
                          >
                            {module.resultLabel}
                          </span>
                          <span className="text-white text-sm leading-relaxed font-medium">
                            {module.resultText}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardItem>
                </div>
              </CardBody>
            </CardContainer>
          </div>
        ))}
      </div>

      {/* Progress indicators */}
      <div className="flex justify-center gap-2 mt-6">
        {modules.map((_, index) => (
          <button
            key={index}
            onClick={() => {
              if (scrollContainerRef.current) {
                const container = scrollContainerRef.current
                const cardWidth = container.querySelector(".module-card")?.clientWidth || 0
                const gap = 16
                container.scrollTo({
                  left: (cardWidth + gap) * index,
                  behavior: "smooth",
                })
                setCurrentIndex(index)
                setIsPaused(true)
                setTimeout(() => setIsPaused(false), 2000)
              }
            }}
            className={cn(
              "w-2 h-2 rounded-full transition-all",
              currentIndex === index
                ? "bg-brand w-8"
                : "bg-gray-600 hover:bg-gray-400"
            )}
            aria-label={`Go to module ${index + 1}`}
          />
        ))}
      </div>

      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  )
}
