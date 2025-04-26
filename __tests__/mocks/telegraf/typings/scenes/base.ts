/**
 * Mock для BaseScene из Telegraf
 */
export class BaseScene {
  constructor(id: string, options?: any) {
    this.id = id;
    this.options = options || {};
  }

  id: string;
  options: any = {};

  enter(middleware: any) {
    return this;
  }

  leave(middleware: any) {
    return this;
  }

  hears(trigger: any, middleware: any) {
    return this;
  }

  action(trigger: any, middleware: any) {
    return this;
  }

  command(command: string, middleware: any) {
    return this;
  }

  use(middleware: any) {
    return this;
  }
}

export class WizardScene extends BaseScene {
  constructor(id: string, ...steps: any[]) {
    super(id);
    this.steps = steps || [];
  }

  steps: any[] = [];
} 