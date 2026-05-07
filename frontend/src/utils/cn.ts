/**
 * Tiny class-name joiner. Avoids pulling in clsx for this scope.
 */
export function cn(...args: Array<string | false | null | undefined>): string {
  return args.filter(Boolean).join(' ');
}
