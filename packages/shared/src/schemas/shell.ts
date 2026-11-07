import { z } from 'zod';

export const showItemInFolderInputSchema = z.object({
  path: z.string().min(1, 'Path must not be empty'),
});

export type ShowItemInFolderInput = z.infer<typeof showItemInFolderInputSchema>;
