export interface TokenContext {
  project: string;
  scene: string;
  camera: string;
  frame?: number;
}

/**
 * Expand tokens in output path template:
 * - {project} -> filename or project name
 * - {scene} -> scene name
 * - {camera} -> camera name
 * - #{1,8} -> frame number padded to hash count if frame is defined, otherwise left intact
 */
export function expandTokens(template: string, ctx: TokenContext): string {
  if (!template) return '';

  let out = template
    .replace(/\{project\}/g, ctx.project)
    .replace(/\{scene\}/g, ctx.scene)
    .replace(/\{camera\}/g, ctx.camera);

  if (ctx.frame !== undefined) {
    out = out.replace(/(#+)/g, (_match, hashes: string) => {
      const len = hashes.length;
      return String(ctx.frame).padStart(len, '0');
    });
  }

  return out;
}

/**
 * Expand tokens for UI preview: defaults frame to 1 if not explicitly provided.
 */
export function previewTokens(template: string, ctx: TokenContext): string {
  return expandTokens(template, {
    ...ctx,
    frame: ctx.frame ?? 1,
  });
}
