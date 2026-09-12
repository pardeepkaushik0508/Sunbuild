import { startNavigationProgress } from "@/lib/navigation-progress";

type RouterLike = {
  push: (href: string) => void;
};

/** router.push with global navigation loader feedback. */
export function pushWithProgress(router: RouterLike, href: string) {
  startNavigationProgress();
  router.push(href);
}
