import { commandInputSchema } from '../../shared/schemas';
import { executeCommand } from '../services/commandBus';
import { protectedProcedure, router } from '../trpc';

export const commandsRouter = router({
  run: protectedProcedure.input(commandInputSchema).mutation(async ({ ctx, input }) => {
    return executeCommand(input, ctx.user, ctx.io);
  })
});
