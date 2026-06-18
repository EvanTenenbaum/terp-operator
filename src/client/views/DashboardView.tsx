/**
 * DashboardView — thin wrapper around the DashboardView template.
 *
 * Delegates to the template with useDefaults={true} so all 8 standard
 * operator KPI, queue, and activity widgets render automatically.
 */
import { DashboardView as DashboardTemplate } from '../templates/DashboardView';

export function DashboardView() {
  return <DashboardTemplate useDefaults />;
}
