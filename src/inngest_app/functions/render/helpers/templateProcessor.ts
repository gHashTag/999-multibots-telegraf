/**
 * Template JSON Processing Helper
 * Handles loading and manipulating After Effects template JSON for riddle rendering
 */

import { Logger } from 'inngest'

/**
 * Template JSON structure matching Python render-api-v3
 */
export interface TemplateSection {
  key: string
  value: Record<string, any>
}

export interface LayerSettings {
  [layerId: string]: {
    footageUrl?: string
    sourceText?: string
    position?: {
      method: string
      propertyMatchName: string
      propertyName: string
      value: [number, number] | [number, number, number]
    }
    scale?: {
      method: string
      propertyMatchName: string
      propertyName: string
      value: [number, number] | [number, number, number]
    }
    anchorPoint?: {
      method: string
      propertyMatchName: string
      propertyName: string
      value: [number, number] | [number, number, number]
    }
    fontSize?: number
    inPoint?: number
    outPoint?: number
  }
}

export interface CompositionSettings {
  [compositionId: string]: {
    workAreaDuration?: number
  }
}

export interface TextSettings {
  text: string
  position: [number, number] // Template #1 uses 2 coords [x, y]
  font_size: number
}

/**
 * Extract layer settings section from template JSON
 */
export function getLayerSettings(
  templateJson: TemplateSection[]
): LayerSettings {
  const layerSection = templateJson.find(
    section => section.key === 'layerSettings'
  )
  if (!layerSection) {
    throw new Error('Layer settings section not found in template')
  }
  return layerSection.value as LayerSettings
}

/**
 * Extract composition settings section from template JSON
 */
export function getCompositionSettings(
  templateJson: TemplateSection[]
): CompositionSettings {
  const compSection = templateJson.find(
    section => section.key === 'compositionSettings'
  )
  if (!compSection) {
    throw new Error('Composition settings section not found in template')
  }
  return compSection.value as CompositionSettings
}

/**
 * Substitute avatar URL in template (layer 4553)
 */
export function substituteAvatarUrl(
  layers: LayerSettings,
  avatarUrl: string,
  logger: Logger
): void {
  if (!layers['4553']) {
    logger.warn('Avatar layer 4553 not found in template')
    return
  }

  layers['4553'].footageUrl = avatarUrl
  logger.info(`✅ Substituted avatar URL in layer 4553`)
}

/**
 * Update circle position, scale, and anchor point (layer 4569)
 */
export function updateCircleSettings(
  layers: LayerSettings,
  circlePosition: [number, number, number],
  circleScale: [number, number, number],
  anchorPoint?: [number, number, number],
  logger?: Logger
): void {
  if (!layers['4569']) {
    logger?.warn('Circle layer 4569 not found in template')
    return
  }

  layers['4569'].position = {
    method: 'setValue',
    propertyMatchName: 'ADBE Position',
    propertyName: 'Position',
    value: circlePosition,
  }

  layers['4569'].scale = {
    method: 'setValue',
    propertyMatchName: 'ADBE Scale',
    propertyName: 'Scale',
    value: circleScale,
  }

  if (anchorPoint) {
    layers['4569'].anchorPoint = {
      method: 'setValue',
      propertyMatchName: 'ADBE Anchor Point',
      propertyName: 'Anchor Point',
      value: anchorPoint,
    }
    logger?.info(
      `✅ Updated circle position, scale, and anchor point in layer 4569`
    )
  } else {
    logger?.info(`✅ Updated circle position and scale in layer 4569`)
  }
}

/**
 * Substitute cover image URL (layer 4559)
 */
export function substituteCoverUrl(
  layers: LayerSettings,
  coverUrl: string,
  logger: Logger
): void {
  if (!layers['4559']) {
    logger.warn('Cover layer 4559 not found in template')
    return
  }

  layers['4559'].footageUrl = coverUrl
  logger.info(`✅ Substituted cover URL in layer 4559`)
}

/**
 * Substitute B-roll URLs based on layer IDs
 */
export function substituteBrollUrls(
  layers: LayerSettings,
  brollData: Array<{ layer_id: string; url: string }>,
  logger: Logger
): void {
  let substitutedCount = 0

  for (const broll of brollData) {
    const layerId = broll.layer_id
    if (layers[layerId]) {
      layers[layerId].footageUrl = broll.url
      logger.info(`✅ Substituted B-roll in layer ${layerId}`)
      substitutedCount++
    } else {
      logger.warn(`B-roll layer ${layerId} not found in template`)
    }
  }

  logger.info(
    `✅ Substituted ${substitutedCount}/${brollData.length} B-roll URLs`
  )
}

/**
 * Update intro text 1 (layer 3596)
 */
export function updateIntroText1(
  layers: LayerSettings,
  textSettings: TextSettings,
  logger: Logger
): void {
  if (!layers['3596']) {
    logger.warn('Intro text 1 layer 3596 not found in template')
    return
  }

  layers['3596'].sourceText = textSettings.text
  layers['3596'].position = {
    method: 'setValue',
    propertyMatchName: 'ADBE Position',
    propertyName: 'Position',
    value: textSettings.position,
  }
  layers['3596'].fontSize = textSettings.font_size

  logger.info(`✅ Updated intro text 1 in layer 3596`)
}

/**
 * Update intro text 2 (layer 3599)
 */
export function updateIntroText2(
  layers: LayerSettings,
  textSettings: TextSettings,
  logger: Logger
): void {
  if (!layers['3599']) {
    logger.warn('Intro text 2 layer 3599 not found in template')
    return
  }

  layers['3599'].sourceText = textSettings.text
  layers['3599'].position = {
    method: 'setValue',
    propertyMatchName: 'ADBE Position',
    propertyName: 'Position',
    value: textSettings.position,
  }
  layers['3599'].fontSize = textSettings.font_size

  logger.info(`✅ Updated intro text 2 in layer 3599`)
}

/**
 * Update composition work area duration based on avatar duration (composition 18)
 */
export function updateWorkAreaDuration(
  compositions: CompositionSettings,
  avatarDuration: number,
  logger: Logger
): void {
  if (!compositions['18']) {
    logger.warn('Composition 18 not found in template')
    return
  }

  compositions['18'].workAreaDuration = avatarDuration
  logger.info(
    `✅ Updated work area duration to ${avatarDuration}s in composition 18`
  )
}

/**
 * Extract B-roll layer timing from template
 * Returns array of layers marked with footageUrl = "broll"
 */
export function extractBrollLayers(
  templateJson: TemplateSection[]
): Array<{ layer_id: string; in_point: number; out_point: number }> {
  const layers = getLayerSettings(templateJson)
  const brollLayers: Array<{
    layer_id: string
    in_point: number
    out_point: number
  }> = []

  for (const [layerId, layerData] of Object.entries(layers)) {
    if (layerData.footageUrl === 'broll') {
      brollLayers.push({
        layer_id: layerId,
        in_point: layerData.inPoint || 0,
        out_point: layerData.outPoint || 0,
      })
    }
  }

  return brollLayers
}

/**
 * Complete template JSON substitution for riddle workflow
 * Matches Python prepare_template_json function
 */
export function processRiddleTemplate(
  templateJson: TemplateSection[],
  params: {
    avatarUrl: string
    avatarDuration: number
    coverUrl: string
    introText1: TextSettings
    introText2: TextSettings
    circlePosition: [number, number, number]
    circleScale: [number, number, number]
    circleAnchorPoint?: [number, number, number]
    brollData: Array<{ layer_id: string; url: string }>
  },
  logger: Logger
): TemplateSection[] {
  logger.info('🔄 Processing riddle template with asset substitution')

  // Get sections
  const layers = getLayerSettings(templateJson)
  const compositions = getCompositionSettings(templateJson)

  // Substitute all assets and settings
  substituteAvatarUrl(layers, params.avatarUrl, logger)
  substituteCoverUrl(layers, params.coverUrl, logger)
  updateCircleSettings(
    layers,
    params.circlePosition,
    params.circleScale,
    params.circleAnchorPoint,
    logger
  )
  substituteBrollUrls(layers, params.brollData, logger)
  updateIntroText1(layers, params.introText1, logger)
  updateIntroText2(layers, params.introText2, logger)
  updateWorkAreaDuration(compositions, params.avatarDuration, logger)

  logger.info('✅ Template processing complete')

  return templateJson
}
