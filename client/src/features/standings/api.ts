
import { fetchJsonApi, API_BASE } from '../../api/base';

export async function getPeriodStandings(periodId?: number, leagueId?: number): Promise<any> {
  const lid = leagueId || 1;
  return fetchJsonApi(`${API_BASE}/period/current?leagueId=${lid}`);
}
