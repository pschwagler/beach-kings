import { parseCalendarDate } from "@/lib/calendarDate";

export type ScoresheetField = "photo" | "gameType" | "league" | "date";
export interface ScoresheetValidationIssue {
  readonly field: ScoresheetField;
  readonly message: string;
}

export function scoresheetInputIssue(input: {
  photo: unknown;
  gameType: "league" | "pickup" | null;
  leagueId: number;
  date: string;
}): ScoresheetValidationIssue | null {
  if (!input.photo)
    return { field: "photo", message: "Choose a scoresheet photo." };
  if (!input.gameType)
    return { field: "gameType", message: "Choose League or Pickup." };
  if (input.gameType === "league" && input.leagueId <= 0)
    return {
      field: "league",
      message: "Choose the league these games belong to.",
    };
  if (!parseCalendarDate(input.date))
    return { field: "date", message: "Choose a valid game date." };
  return null;
}
