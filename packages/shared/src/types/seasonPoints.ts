export interface SeasonPointEvent {
  match: number;
  session: string;
  date: string;
  points: number;
  change: number;
  result: "W" | "L" | "D";
}
export interface SeasonPointsPlayer {
  id: string;
  name: string;
  avatar?: string | null;
  rank: number;
  games: number;
  wins: number;
  points: number;
  complete: boolean;
  history: SeasonPointEvent[];
}
export interface SeasonPointsData {
  league: string;
  season: string;
  startDate: string;
  endDate: string | null;
  scoringSystem: string;
  baseline: number;
  fetchedAt: string;
  players: SeasonPointsPlayer[];
  sessions: { id: string; date: string; status: string; games: number }[];
}
