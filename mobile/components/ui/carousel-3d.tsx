"use client"

import React, { useEffect, useRef, useState } from "react"
import { CardContainer, CardBody, CardItem } from "./card-3d"
import { Check } from "lucide-react"
import { cn } from "../../lib/utils"

interface Card3DData {
  icon: React.ReactNode
  title: string
  items: string[]
  image?: string
}

interface Carousel3DProps {
  cards: Card3DData[]
  autoScrollInterval?: number
  initialDelay?: number
}

export function Carousel3D({
  cards,
  autoScrollInterval = 3000,
  initialDelay = 3000,
}: Carousel3DProps) {
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
          const cardWidth = container.querySelector(".card-item")?.clientWidth || 0
          const gap = 24 // 1.5rem gap
          const scrollAmount = cardWidth + gap

          // Calculate next index
          const nextIndex = (currentIndex + 1) % cards.length

          // Scroll to next card
          container.scrollTo({
            left: scrollAmount * nextIndex,
            behavior: "smooth",
          })

          setCurrentIndex(nextIndex)
        }
      }, autoScrollInterval)
    }

    // Initial delay before starting auto-scroll
    initialDelayTimer.current = setTimeout(() => {
      startAutoScroll()
    }, initialDelay)

    return () => {
      if (autoScrollTimer.current) clearInterval(autoScrollTimer.current)
      if (initialDelayTimer.current) clearTimeout(initialDelayTimer.current)
    }
  }, [isPaused, currentIndex, cards.length, autoScrollInterval, initialDelay])

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
      const cardWidth = container.querySelector(".card-item")?.clientWidth || 0
      const gap = 24
      const scrollAmount = cardWidth + gap

      if (diff > 0) {
        // Swipe left - next card
        const nextIndex = Math.min(currentIndex + 1, cards.length - 1)
        container.scrollTo({
          left: scrollAmount * nextIndex,
          behavior: "smooth",
        })
        setCurrentIndex(nextIndex)
      } else {
        // Swipe right - previous card
        const prevIndex = Math.max(currentIndex - 1, 0)
        container.scrollTo({
          left: scrollAmount * prevIndex,
          behavior: "smooth",
        })
        setCurrentIndex(prevIndex)
      }
    }

    // Resume auto-scroll after 2 seconds of inactivity
    setTimeout(() => setIsPaused(false), 2000)
  }

  // Mouse interaction - pause on hover
  const handleMouseEnter = () => setIsPaused(true)
  const handleMouseLeave = () => setIsPaused(false)

  return (
    <div className="relative w-full">
      {/* Horizontal scroll container */}
      <div
        ref={scrollContainerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "flex gap-6 overflow-x-auto scroll-smooth snap-x snap-mandatory",
          "scrollbar-hide", // Hide scrollbar
          "pb-6 px-8 md:px-12 lg:px-16" // Padding for scroll and sides
        )}
        style={{
          scrollbarWidth: "none", // Firefox
          msOverflowStyle: "none", // IE/Edge
          scrollPaddingInline: "2rem", // Proper snap padding
        }}
      >
        {cards.map((card, index) => (
          <div
            key={index}
            className="card-item flex-shrink-0 w-[85vw] md:w-[45vw] lg:w-[22vw] snap-center"
          >
            <CardContainer className="w-full h-full">
              <CardBody className="relative w-full min-h-[500px] md:min-h-[550px] lg:min-h-[600px] p-6 md:p-8 bg-gradient-to-br from-[#141210] to-[#0c0a09] rounded-xl border border-[#3b2a13] hover:border-brand/40 transition-all shadow-xl flex flex-col">
                {/* Image */}
                {card.image && (
                  <CardItem
                    translateZ={50}
                    className="w-full mb-6 rounded-lg overflow-hidden"
                  >
                    <img
                      src={card.image}
                      alt={card.title}
                      className="w-full h-40 md:h-48 lg:h-56 object-cover"
                    />
                  </CardItem>
                )}

                {/* Title with icon */}
                <CardItem
                  translateZ={40}
                  className="flex items-center gap-3 mb-6"
                >
                  <div className="text-brand drop-shadow-[0_0_10px_rgba(198,169,76,0.6)] text-2xl md:text-3xl">
                    {card.icon}
                  </div>
                  <h3 className="text-lg md:text-xl font-bold text-white">{card.title}</h3>
                </CardItem>

                {/* Benefits list */}
                <CardItem translateZ={30} className="w-full flex-1">
                  <ul className="space-y-3">
                    {card.items.map((item, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2 text-gray-300"
                      >
                        <Check className="w-5 h-5 text-brand shrink-0 mt-0.5 drop-shadow-[0_0_8px_rgba(198,169,76,0.5)]" />
                        <span className="text-sm md:text-base leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardItem>
              </CardBody>
            </CardContainer>
          </div>
        ))}
      </div>

      {/* Progress indicators */}
      <div className="flex justify-center gap-2 mt-6">
        {cards.map((_, index) => (
          <button
            key={index}
            onClick={() => {
              if (scrollContainerRef.current) {
                const container = scrollContainerRef.current
                const cardWidth = container.querySelector(".card-item")?.clientWidth || 0
                const gap = 24
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
            aria-label={`Go to card ${index + 1}`}
          />
        ))}
      </div>

      {/* Hide scrollbar with CSS */}
      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  )
}
