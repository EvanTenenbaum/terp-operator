import { trpc } from '../../api/trpc';
import { WorkspacePanel } from '../WorkspacePanel';

interface Props { contactId: string; }

export function ContactHistoryPanel({ contactId }: Props) {
  const { data } = trpc.queries.relatedCommands.useQuery({ contactId }, { enabled: Boolean(contactId) });
  const commands = data ?? [];

  return (
    <WorkspacePanel panelId="contact-history" title="Command History"
      subtitle={`${commands.length} entries`}>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="text-left text-xs font-medium text-zinc-500 px-3 py-2">When</th>
              <th className="text-left text-xs font-medium text-zinc-500 px-3 py-2">Command</th>
              <th className="text-left text-xs font-medium text-zinc-500 px-3 py-2">Actor</th>
              <th className="text-left text-xs font-medium text-zinc-500 px-3 py-2">Result</th>
            </tr>
          </thead>
          <tbody>
            {commands.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-4 text-sm text-zinc-400 text-center">No commands yet.</td></tr>
            )}
            {(commands as Record<string, unknown>[]).map((cmd) => (
              <tr key={String(cmd.id)} className="border-t border-line">
                <td className="px-3 py-2 text-xs text-zinc-500">{new Date(String(cmd.createdAt)).toLocaleString('en-US')}</td>
                <td className="px-3 py-2">{String(cmd.commandName ?? '—')}</td>
                <td className="px-3 py-2">{String(cmd.actorName ?? '—')}</td>
                <td className="px-3 py-2">{String(cmd.toast ?? '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </WorkspacePanel>
  );
}
