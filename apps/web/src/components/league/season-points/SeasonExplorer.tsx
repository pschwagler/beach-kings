'use client';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, ChevronRight, Download, Search, ShieldCheck, Volleyball, X } from 'lucide-react';
import { filterByGp, gpRange } from './gp-filter';
import type { SeasonPointsData } from '@beach-kings/shared';
import ProgressChart from './ProgressChart';
import { number, change, date, initials, sessionsFor, chartColor } from './model';

type Sort = 'points' | 'games' | 'name';
export default function SeasonExplorer({ season }: { season: SeasonPointsData }) {
  const [selected, setSelected] = useState(season.players[0].id);
  const [search, setSearch] = useState('');
  const [minGp, setMinGp] = useState('');
  const hasGpFilter = minGp !== '';
  const rangeError = gpRange(minGp,'').error;
  const eligiblePlayers = useMemo(() => filterByGp(season.players,minGp,''), [minGp,season]);
  const [sort, setSort] = useState<Sort>('points');
  const [ascending, setAscending] = useState(false);
  const [mode, setMode] = useState<'calendar'|'game'>('calendar');
  const [checkedIds, setCheckedIds] = useState<string[]>([season.players[0].id]);
  const chartPlayers = useMemo(() => eligiblePlayers.filter(p => p.complete && checkedIds.includes(p.id)), [checkedIds,eligiblePlayers]);
  const player = eligiblePlayers.find(p => p.id === selected) ?? eligiblePlayers[0] ?? season.players.find(p => p.id === selected)!;
  const hiddenSelections = checkedIds.length - chartPlayers.length;
  const roster = useMemo(() => [...eligiblePlayers].filter(p => p.name.toLowerCase().includes(search.toLowerCase().trim())).sort((a,b) => {
    const diff = sort === 'name' ? a.name.localeCompare(b.name) : a[sort]-b[sort];
    return (ascending ? diff : -diff) || a.rank-b.rank;
  }), [search,sort,ascending,eligiblePlayers]);
  const history = sessionsFor(player,season);
  const peak = Math.max(season.baseline,...player.history.map(h=>h.points));
  const totalGames = season.sessions.reduce((n,s)=>n+s.games,0);
  const lastDate = season.sessions.at(-1)?.date ?? season.startDate;
  const rate = player.games ? player.wins/player.games*100 : 0;
  function select(id: string) {
    setSelected(id);
    setCheckedIds(ids => ids.length <= 1 ? [id] : ids.includes(id) ? ids : [...ids,id]);
    if (window.matchMedia('(max-width: 620px)').matches) {
      document.querySelector('.player-panel')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }
  }
  function resetGp() { setMinGp(''); }
  function sortBy(field: Sort) { if(sort===field) setAscending(!ascending); else {setSort(field);setAscending(field==='name');} }
  function download() {
    const rows = [['Player','Date','Game','Points','Change','Result'], ...player.history.map((h,i)=>[player.name,h.date,i+1,h.points,h.change,h.result])];
    const csv = rows.map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    const a=document.createElement('a');a.href=url;a.download=`season-points-${player.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <>
    <main id="season" className="season-explorer">
      <section className="intro">
        <div><div className="eyebrow">{season.league}</div><h1>{season.season} <em>Points exploration</em></h1><p>Check players to compare their points. Click a name for individual details.</p><div className="season-dates">{date(season.startDate)} — {season.endDate ? date(season.endDate) : 'Ongoing'}</div></div>
        <div className="season-totals" aria-label="Season totals"><div><b>{season.players.length}</b><span>players</span></div><div><b>{totalGames}</b><span>games</span></div><div><b>{season.sessions.length}</b><span>sessions</span></div></div>
      </section>
      <div className="dashboard">
        <aside className="roster-panel" aria-label="Player selector">
          <div className="roster-title"><h2>The players</h2><span>{chartPlayers.length} selected</span></div>
          <label className="search"><Search size={16}/><input aria-label="Find a player" placeholder="Find a player…" value={search} onChange={e=>setSearch(e.target.value)}/>{search && <button aria-label="Clear player search" onClick={()=>setSearch('')}><X size={15}/></button>}</label>
          <fieldset className="gp-filter"><legend>Season games played (GP)</legend><div className="gp-filter-fields">
            <label>Min GP<input type="number" inputMode="numeric" min="0" step="1" placeholder="0" aria-label="Minimum games played" aria-describedby="gp-filter-summary" aria-invalid={!!rangeError} value={minGp} onChange={e=>setMinGp(e.target.value)}/></label>
            {hasGpFilter && <button type="button" onClick={resetGp} aria-label="Reset games played filter">Reset</button>}
          </div><p id="gp-filter-summary" className={rangeError?'gp-filter-error':''} role={rangeError?'alert':'status'}>{rangeError ?? `${eligiblePlayers.length} of ${season.players.length} players${hiddenSelections ? ` · ${hiddenSelections} checked outside GP range` : ''}`}</p></fieldset>
          <div className="roster-head"><span>Plot / #</span><button onClick={()=>sortBy('name')}>Player {sort==='name' && (ascending ? <ArrowUp size={11}/> : <ArrowDown size={11}/>)}</button><button onClick={()=>sortBy('games')}>GP {sort==='games' && (ascending ? <ArrowUp size={11}/> : <ArrowDown size={11}/>)}</button><button onClick={()=>sortBy('points')}>PTS {sort==='points' && (ascending ? <ArrowUp size={11}/> : <ArrowDown size={11}/>)}</button></div>
          <div className="roster-list">{roster.map(p => <div className={`player-row ${p.id===player.id?'selected':''}`} key={p.id} data-player={p.id}>
            <label className="player-check-rank"><input type="checkbox" aria-label={`Plot ${p.name}`} checked={checkedIds.includes(p.id)} onChange={e=>{const checked=e.target.checked;setCheckedIds(ids => checked ? [...ids,p.id] : ids.filter(id=>id!==p.id));}} style={{accentColor:chartColor(p,player.id)}}/><span className="rank">{p.rank.toString().padStart(2,'0')}</span></label>
            <button className="player-name" aria-pressed={p.id===player.id} onClick={()=>select(p.id)}>{p.name}{p.id===player.id && <ChevronRight size={14}/>}</button><span className="games">{p.games}</span><strong>{number(p.points)}</strong></div>)}{roster.length===0 && <div className="empty">{hasGpFilter ? 'No players match these filters.' : `No players match “${search}”.`}<button onClick={()=>{setSearch('');resetGp();}}>Reset filters</button></div>}</div>
          <div className="roster-foot"><span className="mini-line"/>Checkboxes plot players · Names open details</div>
        </aside>
        <section className="player-panel" aria-live="polite" aria-atomic="false">
          {eligiblePlayers.length === 0 ? <div className="chart chart-empty gp-empty"><b>No players in this GP range</b><p>{rangeError ?? 'Adjust the minimum games played to see players and their charts.'}</p><button onClick={resetGp}>Reset GP filter</button></div> : <>
          <div className="player-heading"><div className="player-identity"><div className="avatar">{initials(player.name)}</div><div><span className="eyebrow">PLAYER SPOTLIGHT <span>/</span> RANK {player.rank}</span><h2 data-testid="selected-player-name">{player.name}</h2></div></div><div className="current-points"><span>SEASON POINTS</span><strong data-testid="selected-player-points">{number(player.points)}</strong><small className={player.points>=season.baseline?'positive':'negative'}>{change(player.points-season.baseline)} this season</small></div></div>
          <div className="player-stats"><div><span>Games played</span><strong>{player.games}</strong></div><div><span>Record</span><strong>{player.wins}<small> — </small>{player.games-player.wins}</strong></div><div><span>Win rate</span><strong>{number(rate,0)}<small>%</small></strong></div><div><span>Season peak</span><strong>{number(peak)}</strong></div></div>
          <div className="chart-heading"><div><h3>Points over time</h3><p>{season.scoringSystem === 'season_rating' ? 'Season rating' : 'Cumulative points'} · starting from {season.baseline}</p></div><div className="segmented" aria-label="Chart timeline"><button aria-pressed={mode==='calendar'} className={mode==='calendar'?'active':''} onClick={()=>setMode('calendar')}>Calendar</button><button aria-pressed={mode==='game'} className={mode==='game'?'active':''} onClick={()=>setMode('game')}>Game by game</button></div></div>
          {!player.complete && <p role="status">History is awaiting calculation. Refresh to try again; no incomplete curve is plotted.</p>}
          <ProgressChart player={player} season={season} players={chartPlayers} mode={mode} onSelect={select}/>
          <div className="chart-actions"><div className="selection-actions"><span>{chartPlayers.length} plotted</span><button onClick={()=>setCheckedIds(eligiblePlayers.slice(0,5).map(p=>p.id))}>Top 5</button><button onClick={()=>setCheckedIds(eligiblePlayers.map(p=>p.id))}>All{hasGpFilter ? ' matching' : ''}</button><button onClick={()=>setCheckedIds([player.id])}>Only spotlight</button><button onClick={()=>setCheckedIds([])}>Clear</button></div><button onClick={download}><Download size={14}/>Export player history</button></div>
          </>}
        </section>
      </div>
      {eligiblePlayers.length > 0 && <section className="history-section"><div className="history-intro"><span className="eyebrow">THE DETAILS</span><h2>One session at a time.</h2><p>{player.name}’s points after each session.<br/>Most recent first.</p><div className="scoring-note"><span className="note-mark">i</span><p><b>Why can points go down?</b>{season.scoringSystem === 'season_rating' ? 'This season uses a performance rating starting at 100. Results move it up or down.' : 'Points follow this season’s configured win and loss values, starting at zero.'}</p></div></div><div className="history-table-wrap"><table className="history-table"><caption className="sr-only">{player.name} session history</caption><thead><tr><th>Session date</th><th>GP</th><th>W–L</th><th>Change</th><th>Points</th></tr></thead><tbody>{history.map(s => <tr key={s.id}><th scope="row">{date(s.date,true)}</th><td>{s.played}</td><td>{s.wins}–{s.losses}</td><td className={s.change>=0?'positive':'negative'}>{change(s.change)}</td><td><b>{number(s.points)}</b></td></tr>)}</tbody></table></div></section>}
      <footer>Official season results · Updated {new Date(season.fetchedAt).toLocaleString()}</footer>
    </main>
  </>;
}
