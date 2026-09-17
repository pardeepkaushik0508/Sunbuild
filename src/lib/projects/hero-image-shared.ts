/** Shared client/server constants for project home banner images. */

export const MAX_HERO_IMAGES = 8;

/** Tailwind-safe grid class for N square hero tiles. */
export function heroSquareGridClass(count: number): string {
  if (count <= 1) return "grid-cols-1 max-w-md";
  if (count === 2) return "grid-cols-2";
  if (count === 3) return "grid-cols-3";
  return "grid-cols-2 sm:grid-cols-4";
}

export function projectHeroImageUrls(project: {
  heroImageUrl?: string | null;
  heroImageUrls?: string[] | null;
}): string[] {
  if (project.heroImageUrls && project.heroImageUrls.length > 0) {
    return project.heroImageUrls.filter(Boolean);
  }
  if (project.heroImageUrl) return [project.heroImageUrl];
  return [];
}
