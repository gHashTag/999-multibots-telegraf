/**
 * Mock для SceneContextScene из Telegraf
 */
export class SceneContextScene {
  constructor(ctx) {
    this.ctx = ctx;
    this.current = null;
    this.state = {};
  }

  enter(sceneId, defaultState, silent) {
    this.current = sceneId;
    this.state = defaultState || {};
    return Promise.resolve();
  }

  reenter() {
    return Promise.resolve();
  }

  leave() {
    this.current = null;
    this.state = {};
    return Promise.resolve();
  }
}

import type { SceneSession, SceneSessionData } from './session'

export interface SceneContext<S extends SceneSession = SceneSession> {
  scene: {
    state: any
    session: S
    current?: string
    enter: (sceneId: string, initialState?: any, silent?: boolean) => Promise<any>
    reenter: (initialState?: any) => Promise<any>
    leave: () => Promise<any>
  }
}

export interface SceneContextOptions<S extends SceneSession = SceneSession> {
  sessionName: string
  defaultSession: () => S
  ttl?: number
}

export interface WizardContext extends SceneContext {
  wizard: WizardContextWizard
}

export interface WizardContextWizard {
  state: any
  cursor: number
  next: () => Promise<any>
  back: () => Promise<any>
  selectStep: (index: number) => Promise<any>
} 