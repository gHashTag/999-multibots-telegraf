import { ModeEnum } from './price/helpers/modelsCost'

export interface SessionData {
  mode?: ModeEnum;
  wizard?: any;
  __scenes?: any;
  prompt?: string;
  userModel?: {
    model_url: string;
  };
  selectedModel?: string;
  subscription?: string;
  attempts?: number;
  amount?: number;
  targetScene?: string | null;
}

export const defaultSession = () => ({
  mode: undefined,
  wizard: {},
  __scenes: {},
  prompt: undefined,
  userModel: undefined,
  selectedModel: undefined,
  subscription: undefined,
  attempts: 0,
  amount: 0,
  targetScene: null
}) 