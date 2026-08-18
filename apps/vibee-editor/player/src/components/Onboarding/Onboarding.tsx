// ===============================
// Onboarding Flow
// First-time user tutorial
// ===============================

import { useState, useEffect, useCallback } from 'react';
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import {
  Video, Wand2, Share2, Users, Sparkles,
  ChevronRight, ChevronLeft, X
} from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import { useHaptic } from '@/hooks/useHaptic';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import './Onboarding.css';

// Track onboarding completion
export const onboardingCompletedAtom = atomWithStorage('vibee-onboarding-completed', false);
export const onboardingStepAtom = atomWithStorage('vibee-onboarding-step', 0);

interface OnboardingStep {
  id: string;
  icon: React.ReactNode;
  titleKey: string;
  descriptionKey: string;
  image?: string;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    icon: <Sparkles size={48} />,
    titleKey: 'onboarding.welcome.title',
    descriptionKey: 'onboarding.welcome.description',
  },
  {
    id: 'create',
    icon: <Wand2 size={48} />,
    titleKey: 'onboarding.create.title',
    descriptionKey: 'onboarding.create.description',
  },
  {
    id: 'discover',
    icon: <Video size={48} />,
    titleKey: 'onboarding.discover.title',
    descriptionKey: 'onboarding.discover.description',
  },
  {
    id: 'share',
    icon: <Share2 size={48} />,
    titleKey: 'onboarding.share.title',
    descriptionKey: 'onboarding.share.description',
  },
  {
    id: 'community',
    icon: <Users size={48} />,
    titleKey: 'onboarding.community.title',
    descriptionKey: 'onboarding.community.description',
  },
];

interface OnboardingProps {
  onComplete?: () => void;
  onSkip?: () => void;
}

export function Onboarding({ onComplete, onSkip }: OnboardingProps) {
  const { t } = useLanguage();
  const [completed, setCompleted] = useAtom(onboardingCompletedAtom);
  const [currentStep, setCurrentStep] = useAtom(onboardingStepAtom);
  const { selection } = useHaptic();
  const prefersReducedMotion = useReducedMotion();

  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;
  const step = ONBOARDING_STEPS[currentStep];

  const handleNext = useCallback(() => {
    selection();
    if (isLastStep) {
      setCompleted(true);
      setCurrentStep(0);
      onComplete?.();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  }, [isLastStep, setCompleted, setCurrentStep, selection, onComplete]);

  const handleBack = useCallback(() => {
    selection();
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep, setCurrentStep, selection]);

  const handleSkip = useCallback(() => {
    selection();
    setCompleted(true);
    setCurrentStep(0);
    onSkip?.();
  }, [setCompleted, setCurrentStep, selection, onSkip]);

  const handleDotClick = useCallback((index: number) => {
    selection();
    setCurrentStep(index);
  }, [setCurrentStep, selection]);

  // Don't show if already completed
  if (completed) return null;

  return (
    <div className="onboarding">
      <button className="onboarding__skip" onClick={handleSkip}>
        <X size={20} />
      </button>

      <div
        className="onboarding__content"
        style={{
          animation: prefersReducedMotion ? 'none' : undefined,
        }}
      >
        <div className="onboarding__icon">{step.icon}</div>
        <h1 className="onboarding__title">{t(step.titleKey)}</h1>
        <p className="onboarding__description">{t(step.descriptionKey)}</p>
      </div>

      <div className="onboarding__dots">
        {ONBOARDING_STEPS.map((_, index) => (
          <button
            key={index}
            className={`onboarding__dot ${index === currentStep ? 'active' : ''}`}
            onClick={() => handleDotClick(index)}
            aria-label={`Go to step ${index + 1}`}
          />
        ))}
      </div>

      <div className="onboarding__actions">
        {currentStep > 0 && (
          <button className="onboarding__btn onboarding__btn--secondary" onClick={handleBack}>
            <ChevronLeft size={20} />
            {t('onboarding.back')}
          </button>
        )}
        <button className="onboarding__btn onboarding__btn--primary" onClick={handleNext}>
          {isLastStep ? t('onboarding.getStarted') : t('onboarding.next')}
          {!isLastStep && <ChevronRight size={20} />}
        </button>
      </div>
    </div>
  );
}

// Inline tooltip hint for specific features
interface FeatureHintProps {
  id: string;
  children: React.ReactNode;
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export function FeatureHint({
  id,
  children,
  title,
  description,
  position = 'bottom',
}: FeatureHintProps) {
  const [hintsShown, setHintsShown] = useAtom(
    atomWithStorage<Record<string, boolean>>('vibee-feature-hints', {})
  );
  const [visible, setVisible] = useState(false);
  const { selection } = useHaptic();

  useEffect(() => {
    if (!hintsShown[id]) {
      const timer = setTimeout(() => setVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [id, hintsShown]);

  const handleDismiss = useCallback(() => {
    selection();
    setVisible(false);
    setHintsShown(prev => ({ ...prev, [id]: true }));
  }, [id, setHintsShown, selection]);

  return (
    <div className="feature-hint-wrapper">
      {children}
      {visible && (
        <div className={`feature-hint feature-hint--${position}`}>
          <div className="feature-hint__content">
            <h4 className="feature-hint__title">{title}</h4>
            <p className="feature-hint__description">{description}</p>
          </div>
          <button className="feature-hint__dismiss" onClick={handleDismiss}>
            Got it
          </button>
        </div>
      )}
    </div>
  );
}

// Check if onboarding should be shown
export function useOnboardingCheck() {
  const [completed] = useAtom(onboardingCompletedAtom);
  return !completed;
}
