
import { fetchJsonApi, API_BASE } from '../../api/base';

export async function getPeriodStandings(periodId?: number, leagueId?: number): Promise<any> {
  const leagueParam = leagueId && leagueId !== 1 ? `?leagueId=${leagueId}` : '';
  return fetchJsonApi(`${API_BASE}/period/current${leagueParam}`);
}
