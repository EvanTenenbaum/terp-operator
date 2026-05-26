/**
 * Shared banner key constants (TER-1587, CAP-033).
 *
 * Each key is a stable string identifier stored in the `banner_key` column of
 * `user_dismissed_banners`. Keep keys short (≤ 64 chars) and snake_case.
 * Never change a key after it has been used in production — existing dismissal
 * records in the DB reference it by this string.
 */
export const BANNER_KEYS = {
  /** Credit engine shadow-mode orientation banner (ShadowModeBanner). */
  SHADOW_MODE: 'shadow-mode'
} as const;

export type BannerKey = (typeof BANNER_KEYS)[keyof typeof BANNER_KEYS];
