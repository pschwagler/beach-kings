import {
  scoresheetKeys,
  scoresheetQueries,
} from "@/features/scoresheets/queries";
import { api } from "@/lib/api";

jest.mock("@/lib/api", () => ({ api: { getScoresheetJob: jest.fn() } }));

test("isolates job results by account and league and forwards cancellation", async () => {
  expect(scoresheetKeys.job(1, 7, 4)).not.toEqual(scoresheetKeys.job(2, 7, 4));
  expect(scoresheetKeys.job(1, 7, 4)).not.toEqual(scoresheetKeys.job(1, 8, 4));
  expect(scoresheetQueries.job(0, 7, 4).enabled).toBe(false);
  expect(scoresheetQueries.job(1, 7, null).enabled).toBe(false);
  const signal = new AbortController().signal;
  const options = scoresheetQueries.job(1, 7, 4);
  await options.queryFn?.({ signal } as never);
  expect(api.getScoresheetJob).toHaveBeenCalledWith(7, 4, { signal });
});
test("polls pending jobs and stops on completion, failure, or network error", () => {
  const interval = scoresheetQueries.job(1, 7, 4).refetchInterval as Function;
  expect(interval({ state: { data: { status: "RUNNING" } } })).toBe(2000);
  for (const status of ["COMPLETED", "FAILED"]) {
    expect(interval({ state: { data: { status } } })).toBe(false);
  }
  expect(interval({ state: { status: "error" } })).toBe(false);
});
