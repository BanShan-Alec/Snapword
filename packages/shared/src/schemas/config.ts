import { z } from 'zod';
import {
  DEFAULT_LANGUAGE,
  DEFAULT_THEME_MODE,
  LANGUAGE_MODES,
  THEME_MODES,
} from '../constants/preferences';

export const configBaseSchema = z.object({
  theme: z.enum(THEME_MODES),
  minimizeToTray: z.boolean(),
  closeBehaviorConfirmed: z.boolean(),
  language: z.enum(LANGUAGE_MODES),
  autoCheckUpdate: z.boolean(),
  serverCounter: z.number().int(),
});

export const configSchema = z.object({
  theme: z.enum(THEME_MODES).default(DEFAULT_THEME_MODE),
  minimizeToTray: z.boolean().default(true),
  closeBehaviorConfirmed: z.boolean().default(false),
  language: z.enum(LANGUAGE_MODES).default(DEFAULT_LANGUAGE),
  autoCheckUpdate: z.boolean().default(true),
  serverCounter: z.number().int().default(0),
});

export type AppConfig = z.infer<typeof configSchema>;

export const updateConfigInputSchema = configBaseSchema.partial();
export type UpdateConfigInput = z.infer<typeof updateConfigInputSchema>;

// 默认值单一来源：由 configSchema 各字段的 .default() 派生，勿在此手写字面量
export const DEFAULT_CONFIG: AppConfig = configSchema.parse({});
