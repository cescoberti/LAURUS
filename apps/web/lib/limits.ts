/**
 * Voting lists one member may produce per rolling 24 hours. Admins are exempt.
 *
 * Its own file, with nothing server-side in it, so that the onboarding text
 * (a client component) and the rate limiter (server) read the same number.
 */
export const DAILY_VL_LIMIT = 5;
