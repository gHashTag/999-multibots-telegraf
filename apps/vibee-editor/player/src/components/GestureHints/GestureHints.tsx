// ===============================
// Gesture Hints
// First-time user tutorial hints
// ===============================

import { useState, useEffect, useCallback } from 'react';
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import {
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Heart, X, Hand
} from 'lucide-react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import './GestureHints.css';

// Track which hints have been shown
interface HintsSeen {
  swipeUp: boolean;
  swipeDown: boolean;
  doubleTap: boolean;
  longPress: boolean;
  swipeRight: boolean;
  pullToRefresh: boolean;
}

const defaultHintsSeen: HintsSeen = {
  swipeUp: false,
  swipeDown: false,
  doubleTap: false,
  longPress: false,
  swipeRight: false,
  pullToRefresh: false,
};

export const hintsSeenAtom = atomWithStorage<HintsSeen>('vibee-hints-seen', defaultHintsSeen);

// Reset all hints (for testing)
export const resetHintsAtom = atomWithStorage<boolean>('vibee-hints-reset', false);

type HintType = keyof HintsSeen;

interface GestureHintProps {
  type: HintType;
  onDismiss?: () => void;
  delay?: number; // ms before showing
  duration?: number; // ms before auto-hide (0 = manual dismiss)
}

const HINT_CONFIG: Record<HintType, {
  icon: React.ReactNode;
  animation: string;
  title: string;
  description: string;
}> = {
  swipeUp: {
    icon: <ChevronUp size={32} />,
    animation: 'hint-swipe-up',
    title: 'Swipe Up',
    description: 'Next video',
  },
  swipeDown: {
    icon: <ChevronDown size={32} />,
    animation: 'hint-swipe-down',
    title: 'Swipe Down',
    description: 'Previous video',
  },
  doubleTap: {
    icon: <Heart size={32} />,
    animation: 'hint-double-tap',
    title: 'Double Tap',
    description: 'Like video',
  },
  longPress: {
    icon: <Hand size={32} />,
    animation: 'hint-long-press',
    title: 'Long Press',
    description: 'More options',
  },
  swipeRight: {
    icon: <ChevronRight size={32} />,
    animation: 'hint-swipe-right',
    title: 'Swipe Right',
    description: 'Go back',
  },
  pullToRefresh: {
    icon: <ChevronDown size={32} />,
    animation: 'hint-pull-down',
    title: 'Pull Down',
    description: 'Refresh feed',
  },
};

export function GestureHint({
  type,
  onDismiss,
  delay = 500,
  duration = 4000,
}: GestureHintProps) {
  const [hintsSeen, setHintsSeen] = useAtom(hintsSeenAtom);
  const [visible, setVisible] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const config = HINT_CONFIG[type];

  useEffect(() => {
    // Don't show if already seen or reduced motion
    if (hintsSeen[type] || prefersReducedMotion) return;

    const showTimer = setTimeout(() => {
      setVisible(true);
    }, delay);

    return () => clearTimeout(showTimer);
  }, [type, hintsSeen, delay, prefersReducedMotion]);

  useEffect(() => {
    if (!visible || duration === 0) return;

    const hideTimer = setTimeout(() => {
      handleDismiss();
    }, duration);

    return () => clearTimeout(hideTimer);
  }, [visible, duration]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setHintsSeen(prev => ({ ...prev, [type]: true }));
    onDismiss?.();
  }, [type, setHintsSeen, onDismiss]);

  if (!visible) return null;

  return (
    <div className={`gesture-hint ${config.animation}`} onClick={handleDismiss}>
      <div className="gesture-hint__content">
        <div className="gesture-hint__icon">{config.icon}</div>
        <div className="gesture-hint__text">
          <span className="gesture-hint__title">{config.title}</span>
          <span className="gesture-hint__description">{config.description}</span>
        </div>
      </div>
      <button className="gesture-hint__close">
        <X size={16} />
      </button>
    </div>
  );
}

// Compound hints for feed
export function FeedGestureHints() {
  const [hintsSeen] = useAtom(hintsSeenAtom);
  const [currentHint, setCurrentHint] = useState<HintType | null>(null);

  useEffect(() => {
    // Show hints in sequence
    if (!hintsSeen.swipeUp) {
      setCurrentHint('swipeUp');
    } else if (!hintsSeen.doubleTap) {
      setCurrentHint('doubleTap');
    } else {
      setCurrentHint(null);
    }
  }, [hintsSeen]);

  if (!currentHint) return null;

  return (
    <GestureHint
      type={currentHint}
      onDismiss={() => {
        // Next hint will be shown automatically
      }}
    />
  );
}

// Visual swipe indicator overlay
export function SwipeIndicator({
  direction,
  visible,
}: {
  direction: 'up' | 'down' | 'left' | 'right';
  visible: boolean;
}) {
  const prefersReducedMotion = useReducedMotion();

  if (!visible || prefersReducedMotion) return null;

  const icons = {
    up: <ChevronUp size={40} />,
    down: <ChevronDown size={40} />,
    left: <ChevronLeft size={40} />,
    right: <ChevronRight size={40} />,
  };

  return (
    <div className={`swipe-indicator swipe-indicator--${direction}`}>
      {icons[direction]}
    </div>
  );
}

// Tutorial overlay for first-time users
export function OnboardingGestures({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [, setHintsSeen] = useAtom(hintsSeenAtom);

  const steps: HintType[] = ['swipeUp', 'doubleTap', 'longPress'];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      // Mark all as seen
      setHintsSeen({
        swipeUp: true,
        swipeDown: true,
        doubleTap: true,
        longPress: true,
        swipeRight: true,
        pullToRefresh: true,
      });
      onComplete();
    }
  };

  const config = HINT_CONFIG[steps[step]];

  return (
    <div className="onboarding-gestures">
      <div className="onboarding-gestures__content">
        <div className={`onboarding-gestures__demo ${config.animation}`}>
          {config.icon}
        </div>
        <h2 className="onboarding-gestures__title">{config.title}</h2>
        <p className="onboarding-gestures__description">{config.description}</p>

        <div className="onboarding-gestures__dots">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`onboarding-gestures__dot ${i === step ? 'active' : ''}`}
            />
          ))}
        </div>

        <button className="onboarding-gestures__btn" onClick={handleNext}>
          {step === steps.length - 1 ? 'Get Started' : 'Next'}
        </button>

        <button className="onboarding-gestures__skip" onClick={onComplete}>
          Skip
        </button>
      </div>
    </div>
  );
}
