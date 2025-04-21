export function makeMockContext(
  update: Update | Update.CallbackQueryUpdate,
  session: Partial<MySessionData> = {},
  sceneState: Scenes.WizardSessionData['state'] = { step: 0 }
): MyContext {
  const baseSession: MySessionData = {
    __scenes: { current: '', state: sceneState },
  }

  const mockScene: Partial<
    Scenes.SceneContextScene<MyContext, Scenes.WizardSessionData>
  > = {
    enter: jest.fn(),
    leave: jest.fn(),
    reenter: jest.fn(),
    session: { ...baseSession.__scenes },
    state: sceneState,
  }

  const partialCtx = {
    // ... other properties
    // @ts-ignore
    scene: mockScene as Scenes.SceneContextScene<
      MyContext,
      Scenes.WizardSessionData
    >,
    session: baseSession,
    state: {},
    // @ts-ignore
    wizard: mockWizard as Scenes.WizardContextWizard<MyContext>,
    // ... other properties
  }

  return partialCtx as MyContext
}
