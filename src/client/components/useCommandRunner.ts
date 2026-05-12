import { useQueryClient } from '@tanstack/react-query';
import { trpc } from '../api/trpc';
import { useUiStore } from '../store/uiStore';
import type { CommandName } from '../../shared/commandCatalog';

export function useCommandRunner() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const mutation = trpc.commands.run.useMutation({
    onSuccess: async (result) => {
      pushToast(result.toast ?? (result.ok ? 'Command completed.' : 'Command failed.'), result.ok ? 'success' : 'error');
      await queryClient.invalidateQueries();
    },
    onError: (error) => pushToast(error.message, 'error')
  });

  return {
    runCommand: (name: CommandName, payload: Record<string, unknown> = {}, reason?: string) =>
      mutation.mutateAsync({
        name,
        payload,
        reason,
        idempotencyKey: `${name}-${crypto.randomUUID()}`
      }),
    isRunning: mutation.isLoading
  };
}
