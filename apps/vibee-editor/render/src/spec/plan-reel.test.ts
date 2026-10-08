/**
 * The tests of plan-reel.t27, run against the code that carries it:
 * src/agent/plan-reel.ts (the rules and the course reader). The press itself
 * is held end to end in agent/a-story-reel-for-any-client.test.ts ("a press
 * on a plan card"), the plan's answer in agent/plan-reel.test.ts.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as SPEC from './plan-reel.gen'
import * as STORY from './crm-story-reel.gen'
import {
  callOf,
  cardTaken,
  courseWhole,
  lessonAdded,
  pressOffered,
  previewHeight,
  previewShown,
  previewsShown,
  scenesFor,
} from '../agent/plan-reel'
import { storyPriceEstimate } from '../agent/story-template'
import { pictureOf, posterSwept, postersThisRound } from '../agent/reel-poster'

describe('plan-reel.t27, against the host', () => {
  it('a card offers the press only while it is an idea and nothing is being made', () => {
    expect(pressOffered(SPEC.STATUS_IDEA, false)).toBe(true)
    expect(pressOffered(SPEC.STATUS_IDEA, true)).toBe(false)
    expect(pressOffered(SPEC.STATUS_DOING, false)).toBe(false)
    expect(pressOffered(SPEC.STATUS_DONE, false)).toBe(false)
  })

  it('a press takes the card it was made on, and only an idea', () => {
    expect(cardTaken(SPEC.STATUS_IDEA)).toBe(true)
    expect(cardTaken(SPEC.STATUS_DOING)).toBe(false)
    expect(cardTaken(SPEC.STATUS_DONE)).toBe(false)
  })

  it('a reel that came out stands on its card', () => {
    expect(previewShown(true)).toBe(true)
    expect(previewShown(false)).toBe(false)
  })

  it('the first reel from the plan is the trial, one scene', () => {
    expect(scenesFor(0)).toBe(SPEC.TRIAL_SCENES)
    expect(scenesFor(0)).toBe(1)
    expect(scenesFor(1)).toBe(SPEC.FULL_SCENES)
    expect(scenesFor(9)).toBe(SPEC.FULL_SCENES)
    expect(SPEC.TRIAL_SCENES).toBeLessThan(SPEC.FULL_SCENES)
  })

  it('a lesson card ends on its lesson', () => {
    expect(callOf(true)).toBe(SPEC.CALL_LESSON)
    expect(callOf(false)).toBe(SPEC.CALL_OWN)
  })

  it('the course is taken in whole or not at all, and never twice', () => {
    expect(courseWhole(27)).toBe(true)
    expect(courseWhole(26)).toBe(false)
    expect(courseWhole(0)).toBe(false)
    expect(lessonAdded(false)).toBe(true)
    expect(lessonAdded(true)).toBe(false)
  })

  it('the cabinet shows at most three reels, as 9:16 pictures', () => {
    expect(previewsShown(0)).toBe(0)
    expect(previewsShown(2)).toBe(2)
    expect(previewsShown(3)).toBe(3)
    expect(previewsShown(12)).toBe(SPEC.PREVIEWS_MAX)
    expect(previewHeight(SPEC.PREVIEW_CARD_PX)).toBe(128)
    expect(previewHeight(90)).toBe(160)
  })

  it('a kept poster is the picture, anything else leaves the frame to the browser', () => {
    expect(pictureOf(SPEC.POSTER_KEPT)).toBe(SPEC.PICTURE_POSTER)
    expect(pictureOf(SPEC.POSTER_NONE)).toBe(SPEC.PICTURE_FRAME)
    expect(pictureOf(SPEC.POSTER_TRIED)).toBe(SPEC.PICTURE_FRAME)
  })

  it("the poster is the card's width at the densest screen, 9:16", () => {
    expect(SPEC.POSTER_W).toBe(SPEC.PREVIEW_CARD_PX * SPEC.POSTER_DENSITY)
    expect(previewHeight(SPEC.POSTER_W)).toBe(384)
  })

  it('the sweep draws a poster once, only for a reel that came out', () => {
    expect(posterSwept(true, SPEC.POSTER_NONE)).toBe(true)
    expect(posterSwept(true, SPEC.POSTER_TRIED)).toBe(false)
    expect(posterSwept(true, SPEC.POSTER_KEPT)).toBe(false)
    expect(posterSwept(false, SPEC.POSTER_NONE)).toBe(false)
    expect(postersThisRound(0)).toBe(0)
    expect(postersThisRound(2)).toBe(2)
    expect(postersThisRound(40)).toBe(SPEC.POSTER_SWEEP_MAX)
  })
})

describe('plan-reel.t27 and the story template it presses', () => {
  it("the full reel is the template's own count", () => {
    expect(SPEC.FULL_SCENES).toBe(STORY.SCENES_DEFAULT)
    expect(SPEC.TRIAL_SCENES).toBeGreaterThanOrEqual(STORY.SCENES_MIN)
  })

  it('the trial costs less than a full reel, named before the press', () => {
    expect(storyPriceEstimate(SPEC.TRIAL_SCENES)).toBeLessThan(
      storyPriceEstimate(SPEC.FULL_SCENES)
    )
  })

  it('the host restates no number the spec owns', () => {
    const src = readFileSync(join(__dirname, '../agent/plan-reel.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(src).not.toMatch(/t27\.ai\/#\/course\//)
    expect(src).not.toMatch(/raw\.githubusercontent/)
    expect(src).not.toMatch(/\b(27|72|1000)\b/)
  })

  it('the poster restates none of its numbers', () => {
    const src = readFileSync(join(__dirname, '../agent/reel-poster.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(src).not.toMatch(/\b216\b/)
    expect(src).not.toMatch(/'-ss',\s*'[\d.]+'/)
    expect(src).not.toMatch(/scale=\d/)
    expect(src).not.toMatch(/LIMIT \d/)
  })
})
