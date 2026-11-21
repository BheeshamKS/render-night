import { z } from 'zod';

export const NATIVE_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tga'] as const;
export const PROXY_REQUIRED_EXTENSIONS = ['exr', 'tif', 'tiff', 'dpx', 'hdr'] as const;
export const SUPPORTED_SEQUENCE_EXTENSIONS = [
  ...NATIVE_IMAGE_EXTENSIONS,
  ...PROXY_REQUIRED_EXTENSIONS,
] as const;

export const imageSequenceInfoSchema = z.object({
  directory: z.string(),
  baseName: z.string(),
  extension: z.string(),
  pattern: z.string(),
  padding: z.number().int().min(1),
  startFrame: z.number().int(),
  endFrame: z.number().int(),
  totalFrames: z.number().int().min(0),
  frames: z.array(z.number().int()),
  filePaths: z.record(z.coerce.number(), z.string()),
  missingFrames: z.array(z.number().int()),
  isNativeFormat: z.boolean(),
});

export type ImageSequenceInfo = z.infer<typeof imageSequenceInfoSchema>;
