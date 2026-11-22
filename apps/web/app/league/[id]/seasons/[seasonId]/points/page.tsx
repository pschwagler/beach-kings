import SeasonPointsPage from '../../../../../../src/components/league/season-points/SeasonPointsPage';
export const metadata = { title: 'Season points' };
export default async function Page({ params }: { params: Promise<{id:string;seasonId:string}> }) {
  const {id,seasonId} = await params;
  return <SeasonPointsPage leagueId={Number(id)} seasonId={Number(seasonId)}/>;
}
