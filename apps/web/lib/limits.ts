/**
 * Voting lists one user may produce per rolling 24 hours: 5 for a member, 10 for
 * an admin. The cap is what bounds the model spend of the split agents, so it
 * applies to admins too, with a higher number.
 *
 * Its own file, with nothing server-side in it, so that the onboarding text
 * (a client component) and the rate limiter (server) read the same numbers.
 */
export const DAILY_VL_LIMIT = 5;
export const ADMIN_DAILY_VL_LIMIT = 10;

export const dailyLimitFor = (isAdmin: boolean): number => (isAdmin ? ADMIN_DAILY_VL_LIMIT : DAILY_VL_LIMIT);
