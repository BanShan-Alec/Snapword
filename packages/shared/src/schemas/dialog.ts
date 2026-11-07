import { z } from 'zod';

export const openFileInputSchema = z
  .object({
    title: z.string().optional(),
    filters: z
      .array(
        z.object({
          name: z.string(),
          extensions: z.array(z.string()),
        }),
      )
      .optional(),
    multiSelections: z.boolean().optional(),
  })
  .optional();

export type OpenFileInput = z.infer<typeof openFileInputSchema>;

export const openDirectoryInputSchema = z
  .object({
    title: z.string().optional(),
  })
  .optional();

export type OpenDirectoryInput = z.infer<typeof openDirectoryInputSchema>;

export const saveFileInputSchema = z
  .object({
    title: z.string().optional(),
    defaultPath: z.string().optional(),
    filters: z
      .array(
        z.object({
          name: z.string(),
          extensions: z.array(z.string()),
        }),
      )
      .optional(),
    content: z.string().optional(),
  })
  .optional();

export type SaveFileInput = z.infer<typeof saveFileInputSchema>;
