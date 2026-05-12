import { TRPCError } from '@trpc/server';
import { loginSchema } from '../../shared/schemas';
import { clearLogin, setLoggedIn, verifyLogin } from '../auth';
import { publicProcedure, router } from '../trpc';

export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.user),
  login: publicProcedure.input(loginSchema).mutation(async ({ ctx, input }) => {
    const user = await verifyLogin(input.email, input.password);
    if (!user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Email or password is incorrect.' });
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
