export const dynamic = 'force-dynamic';
import Client from './ui';
export default function Page() {
  return <Client mode={process.env.AGENT_MODE === 'live' ? 'live' : 'demo'} />;
}
