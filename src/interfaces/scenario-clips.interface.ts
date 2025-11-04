/**
 * Scenario Clips Interface Stub
 */

export interface ScenarioClip {
  id: string;
  title: string;
  description: string;
  duration: number;
}

export interface GenerateScenarioClipsPayload {
  scenarioId: string;
  userId: string;
  clips: ScenarioClip[];
}
