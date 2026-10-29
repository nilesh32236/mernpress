import type { Principal } from '../content/types.js';

export type OptionGroup = 'general' | 'reading' | 'writing';

export interface GetOptionsInput {
  group?: string;
}

export interface UpdateOptionsInput {
  group: string;
  values: Record<string, unknown>;
}

export interface OptionService {
  getOptions(principal: Principal, input?: GetOptionsInput): Promise<Record<string, unknown>>;
  updateOptions(principal: Principal, input: UpdateOptionsInput): Promise<Record<string, unknown>>;
}
