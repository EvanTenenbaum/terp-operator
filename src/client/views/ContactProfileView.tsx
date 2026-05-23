import { useParams } from 'react-router-dom';

export function ContactProfileView() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Contact Profile</h1>
      <p className="text-sm text-zinc-500 mt-1">Contact ID: {id}</p>
      <p className="text-sm text-zinc-400 mt-4">Full profile coming soon…</p>
    </div>
  );
}
