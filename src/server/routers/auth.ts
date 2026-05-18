import { TRPCError } from '@trpc/server';
import { loginSchema } from '../../shared/schemas';
import { clearLogin, setLoggedIn, verifyLogin } from '../auth';
import { publicProcedure, router } from '../trpc';
import { isRateLimited, recordFailedAttempt, clearRateLimit } from '../rateLimiter';

export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.user),
  login: publicProcedure.input(loginSchema).mutation(async ({ ctx, input }) => {
    // Rate limiting check
    const clientIp = (ctx.req.ip || ctx.req.socket.remoteAddress || 'unknown').toString();

    if (isRateLimited(clientIp)) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many failed login attempts. Please try again in 15 minutes.'
      });
    }

    const user = await verifyLogin(input.email, input.password);

    if (!user) {
      // Record failed attempt for rate limiting
      recordFailedAttempt(clientIp);
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Email or password is incorrect.' });
    }

    // Successful login - clear rate limit
    clearRateLimit(clientIp);

    await setLoggedIn(ctx.req, user.id);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };
  }),
  logout: publicProcedure.mutation(async ({ ctx }) => {
    await clearLogin(ctx.req, ctx.res);
    return { ok: true };
  })
});
