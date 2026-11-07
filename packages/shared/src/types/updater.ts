import type { z } from 'zod';
import type {
  releaseInfoSchema,
  updaterMockActionSchema,
  updaterProgressSchema,
  updaterSnapshotSchema,
  updaterStateSchema,
} from '../schemas/updater';

export type UpdaterState = z.infer<typeof updaterStateSchema>;
export type UpdaterProgress = z.infer<typeof updaterProgressSchema>;
export type ReleaseInfo = z.infer<typeof releaseInfoSchema>;
export type UpdaterSnapshot = z.infer<typeof updaterSnapshotSchema>;
export type UpdaterMockAction = z.infer<typeof updaterMockActionSchema>;
