"use client";
import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Download,
  Search,
  X,
} from "lucide-react";
import { filterByGp, gpRange } from "./gp-filter";
import type { SeasonPointsData } from "@beach-kings/shared";
import PlayerAvatar from "../../player/PlayerAvatar";
import SegmentedControl from "../../ui/SegmentedControl";
import { Button } from "../../ui/UI";
import ProgressChart from "./ProgressChart";
import { number, change, date, chartColor, csvCell } from "./model";

type Sort = "points" | "games" | "name";
export default function SeasonExplorer({
  season,
}: {
  season: SeasonPointsData;
}) {
  const [selected, setSelected] = useState(season.players[0].id);
  const [search, setSearch] = useState("");
  const [minGp, setMinGp] = useState("");
  const hasGpFilter = minGp !== "";
  const rangeError = gpRange(minGp, "").error;
  const eligiblePlayers = useMemo(
    () => filterByGp(season.players, minGp, ""),
    [minGp, season],
  );
  const [sort, setSort] = useState<Sort>("points");
  const [ascending, setAscending] = useState(false);
  const [mode, setMode] = useState<"calendar" | "game">("calendar");
  const [checkedIds, setCheckedIds] = useState<string[]>([
    season.players[0].id,
  ]);
  const chartPlayers = useMemo(
    () =>
      eligiblePlayers.filter((p) => p.complete && checkedIds.includes(p.id)),
    [checkedIds, eligiblePlayers],
  );
  const player =
    eligiblePlayers.find((p) => p.id === selected) ??
    eligiblePlayers[0] ??
    season.players.find((p) => p.id === selected)!;
  const hiddenSelections = checkedIds.filter(
    (id) => !eligiblePlayers.some((p) => p.id === id),
  ).length;
  const roster = useMemo(
    () =>
      [...eligiblePlayers]
        .filter((p) =>
          p.name.toLowerCase().includes(search.toLowerCase().trim()),
        )
        .sort((a, b) => {
          const diff =
            sort === "name" ? a.name.localeCompare(b.name) : a[sort] - b[sort];
          return (ascending ? diff : -diff) || a.rank - b.rank;
        }),
    [search, sort, ascending, eligiblePlayers],
  );
  const selectedRosterCount = roster.filter((p) =>
    checkedIds.includes(p.id),
  ).length;
  const allRosterSelected =
    roster.length > 0 && selectedRosterCount === roster.length;
  function toggleRoster() {
    const rosterIds = new Set(roster.map((p) => p.id));
    setCheckedIds((ids) =>
      allRosterSelected
        ? ids.filter((id) => !rosterIds.has(id))
        : [...new Set([...ids, ...rosterIds])],
    );
  }
  const peak = Math.max(
    season.baseline,
    ...player.history.map((h) => h.points),
  );
  const totalGames = season.sessions.reduce((n, s) => n + s.games, 0);
  const rate = player.games ? (player.wins / player.games) * 100 : 0;
  function select(id: string) {
    setSelected(id);
    setCheckedIds((ids) =>
      ids.length <= 1 ? [id] : ids.includes(id) ? ids : [...ids, id],
    );
    if (window.matchMedia("(max-width: 850px)").matches) {
      document.querySelector(".player-panel")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    }
  }
  function resetGp() {
    setMinGp("");
  }
  function sortBy(field: Sort) {
    if (sort === field) setAscending(!ascending);
    else {
      setSort(field);
      setAscending(field === "name");
    }
  }
  function download() {
    const rows = [
      ["Player", "Date", "Game", "Points", "Change", "Result"],
      ...player.history.map((h, i) => [
        player.name,
        h.date,
        i + 1,
        h.points,
        h.change,
        h.result,
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `season-points-${player.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <main id="season" className="season-explorer">
        <section className="intro">
          <div>
            <div className="eyebrow">{season.league}</div>
            <h1>{season.season}</h1>
            <div className="season-dates">
              {date(season.startDate)} —{" "}
              {season.endDate ? date(season.endDate) : "Ongoing"}
            </div>
          </div>
          <div className="season-totals" aria-label="Season totals">
            <div>
              <b>{season.players.length}</b>
              <span>players</span>
            </div>
            <div>
              <b>{totalGames}</b>
              <span>games</span>
            </div>
            <div>
              <b>{season.sessions.length}</b>
              <span>sessions</span>
            </div>
          </div>
        </section>
        <div className="dashboard">
          <aside className="roster-panel" aria-label="Player selector">
            <div className="roster-title">
              <h2>Players</h2>
              <span>{chartPlayers.length} selected</span>
            </div>
            <label className="search">
              <Search size={16} />
              <input
                aria-label="Find a player"
                placeholder="Find a player…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  aria-label="Clear player search"
                  onClick={() => setSearch("")}
                >
                  <X size={15} />
                </button>
              )}
            </label>
            <fieldset className="gp-filter">
              <legend>Season games played (GP)</legend>
              <div className="gp-filter-fields">
                <label>
                  Min GP
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    placeholder="0"
                    aria-label="Minimum games played"
                    aria-describedby="gp-filter-summary"
                    aria-invalid={!!rangeError}
                    value={minGp}
                    onChange={(e) => setMinGp(e.target.value)}
                  />
                </label>
                {hasGpFilter && (
                  <button
                    type="button"
                    onClick={resetGp}
                    aria-label="Reset games played filter"
                  >
                    Reset
                  </button>
                )}
              </div>
              <p
                id="gp-filter-summary"
                className={rangeError ? "gp-filter-error" : ""}
                role={rangeError ? "alert" : "status"}
              >
                {rangeError ??
                  `${eligiblePlayers.length} of ${season.players.length} players${hiddenSelections ? ` · ${hiddenSelections} checked outside GP range` : ""}`}
              </p>
            </fieldset>
            <label className="select-all-players">
              <input
                type="checkbox"
                checked={allRosterSelected}
                ref={(input) => {
                  if (input)
                    input.indeterminate =
                      selectedRosterCount > 0 && !allRosterSelected;
                }}
                onChange={toggleRoster}
                disabled={roster.length === 0}
              />
              <span>
                Select all
                {search.trim() || hasGpFilter
                  ? " matching players"
                  : " players"}
              </span>
            </label>
            <div className="roster-head">
              <span>Plot / #</span>
              <button onClick={() => sortBy("name")}>
                Player{" "}
                {sort === "name" &&
                  (ascending ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
              </button>
              <button onClick={() => sortBy("games")}>
                GP{" "}
                {sort === "games" &&
                  (ascending ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
              </button>
              <button onClick={() => sortBy("points")}>
                PTS{" "}
                {sort === "points" &&
                  (ascending ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
              </button>
            </div>
            <div className="roster-list">
              {roster.map((p) => (
                <div
                  className={`player-row ${p.id === player.id ? "selected" : ""}`}
                  key={p.id}
                  data-player={p.id}
                >
                  <label className="player-check-rank">
                    <input
                      type="checkbox"
                      aria-label={`Plot ${p.name}`}
                      checked={checkedIds.includes(p.id)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setCheckedIds((ids) =>
                          checked
                            ? [...ids, p.id]
                            : ids.filter((id) => id !== p.id),
                        );
                      }}
                      style={{ accentColor: chartColor(p, player.id) }}
                    />
                    <span className="rank">
                      {p.rank.toString().padStart(2, "0")}
                    </span>
                  </label>
                  <button
                    className="player-name"
                    aria-pressed={p.id === player.id}
                    onClick={() => select(p.id)}
                  >
                    <PlayerAvatar
                      avatar={p.avatar}
                      name={p.name}
                      size="small"
                    />
                    <span className="player-row-name">{p.name}</span>
                    {p.id === player.id && <ChevronRight size={14} />}
                  </button>
                  <span className="games">{p.games}</span>
                  <strong>{number(p.points)}</strong>
                </div>
              ))}
              {roster.length === 0 && (
                <div className="empty">
                  {hasGpFilter
                    ? "No players match these filters."
                    : `No players match “${search}”.`}
                  <button
                    onClick={() => {
                      setSearch("");
                      resetGp();
                    }}
                  >
                    Reset filters
                  </button>
                </div>
              )}
            </div>
            <div className="roster-foot">
              <span className="mini-line" />
              Checkboxes plot players · Names open details
            </div>
          </aside>
          <section
            className="player-panel"
            aria-live="polite"
            aria-atomic="false"
          >
            {eligiblePlayers.length === 0 ? (
              <div className="chart chart-empty gp-empty">
                <b>No players in this GP range</b>
                <p>
                  {rangeError ??
                    "Adjust the minimum games played to see players and their charts."}
                </p>
                <button onClick={resetGp}>Reset GP filter</button>
              </div>
            ) : (
              <>
                <div className="player-heading">
                  <div className="player-identity">
                    <PlayerAvatar avatar={player.avatar} name={player.name} />
                    <div>
                      <span className="player-rank">Rank #{player.rank}</span>
                      <h2 data-testid="selected-player-name">{player.name}</h2>
                    </div>
                  </div>
                  <div className="current-points">
                    <span>Season points</span>
                    <strong data-testid="selected-player-points">
                      {number(player.points)}
                    </strong>
                    <small
                      className={
                        player.points >= season.baseline
                          ? "positive"
                          : "negative"
                      }
                    >
                      {change(player.points - season.baseline)} this season
                    </small>
                  </div>
                </div>
                <div className="player-stats">
                  <div>
                    <span>Games played</span>
                    <strong>{player.games}</strong>
                  </div>
                  <div>
                    <span>Record</span>
                    <strong>
                      {player.wins}
                      <small> — </small>
                      {player.games - player.wins}
                    </strong>
                  </div>
                  <div>
                    <span>Win rate</span>
                    <strong>
                      {number(rate, 0)}
                      <small>%</small>
                    </strong>
                  </div>
                  <div>
                    <span>Season peak</span>
                    <strong>{number(peak)}</strong>
                  </div>
                </div>
                <div className="chart-heading">
                  <div>
                    <h3>Points over time</h3>
                    <p>
                      {season.scoringSystem === "season_rating"
                        ? "Season rating"
                        : "Cumulative points"}{" "}
                      · starting from {season.baseline}
                    </p>
                  </div>
                  <SegmentedControl
                    value={mode}
                    options={[
                      { value: "calendar", label: "Calendar" },
                      { value: "game", label: "Game by game" },
                    ]}
                    onChange={setMode}
                    label="Chart timeline"
                  />
                </div>
                {!player.complete && (
                  <p role="status">
                    Season calculations are pending. The chart will be available
                    once points history is complete.
                  </p>
                )}
                <ProgressChart
                  player={player}
                  season={season}
                  players={chartPlayers}
                  mode={mode}
                  onSelect={select}
                />
                <div className="chart-actions">
                  <div className="selection-actions">
                    <span>{chartPlayers.length} plotted</span>
                    <button
                      onClick={() =>
                        setCheckedIds(
                          eligiblePlayers.slice(0, 5).map((p) => p.id),
                        )
                      }
                    >
                      Top 5
                    </button>
                    <button
                      onClick={() =>
                        setCheckedIds(eligiblePlayers.map((p) => p.id))
                      }
                    >
                      All{hasGpFilter ? " matching" : ""}
                    </button>
                    <button onClick={() => setCheckedIds([player.id])}>
                      Only this player
                    </button>
                    <button onClick={() => setCheckedIds([])}>Clear</button>
                  </div>
                  <Button variant="ghost" size="small" onClick={download}>
                    <Download size={14} />
                    Export CSV
                  </Button>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
