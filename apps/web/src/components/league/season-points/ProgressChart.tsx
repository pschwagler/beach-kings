'use client';
import { useMemo, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import type { SeasonPointsData } from '@beach-kings/shared';
import NearestLineInteraction from './NearestLineInteraction';
import { calendarData, date, number, change, sessionSummary, chartColor, type Player } from './model';

export default function ProgressChart({ player, players, mode, onSelect, season }: {
  season: SeasonPointsData; player: Player; players: Player[]; mode: 'calendar' | 'game'; onSelect: (id: string) => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hover = players.find(p => p.id === hoveredId) ?? null;
  const ids = useMemo(() => players.map(p => p.id), [players]);
  const renderedPlayers = hover ? [...players.filter(p => p.id !== hover.id), hover] : players;
  const data = useMemo(() => {
    if (mode === 'calendar') return calendarData(players,season);
    const maxGames = Math.max(0, ...players.map(p => p.games));
    return Array.from({length: maxGames + 1}, (_, x) => {
      const row: Record<string, number> = { x };
      for (const p of players) {
        if (x === 0) row[p.id] = season.baseline;
        else if (p.history[x - 1]) row[p.id] = p.history[x - 1].points;
      }
      return row;
    });
  }, [mode, players, season]);
  const ticks = mode === 'calendar' ? data.filter((_,i) => i%2 === 0 || i === data.length-1).map(d => d.x) : undefined;
  if (!players.length) return <div className="chart chart-empty"><b>Choose players to compare</b><p>Check one or more players in the list to see their points over time.</p></div>;
  return <>
    <div className="chart-focus-bar" role="status" aria-live="polite" data-testid="chart-focus-name">{hover ? <><i style={{background:chartColor(hover,player.id)}}/><strong>{hover.name}</strong><span>Click line to view player</span></> : <span>Hover a line to identify a player · Click or tap to view their details</span>}</div>
    <div className="chart" onPointerLeave={() => setHoveredId(null)} data-testid="progress-chart" role="group" aria-label={`Season points chart for ${players.length} selected player${players.length === 1 ? '' : 's'}.`}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={data} margin={{ top: 20, right: 14, bottom: 10, left: -19 }}>
          <CartesianGrid vertical={false} stroke="var(--gray-200)" strokeDasharray="3 4" />
          <XAxis dataKey="x" type="number" domain={['dataMin','dataMax']} ticks={ticks} tickFormatter={v => mode === 'calendar' ? date(new Date(v).toISOString()) : `${v}`} tickLine={false} axisLine={false} minTickGap={28} tick={{ fill: 'var(--ocean-gray-dark)', fontSize: 12 }} dy={10} allowDecimals={false}/>
          <YAxis domain={[(v: number) => Math.floor((Math.min(v,season.baseline)-8)/10)*10, (v: number) => Math.ceil((Math.max(v,season.baseline)+8)/10)*10]} tickLine={false} axisLine={false} tick={{fill:'var(--ocean-gray-dark)',fontSize:12}} tickFormatter={v => number(v,0)} />
          <ReferenceLine y={season.baseline} stroke="var(--ocean-gray)" strokeDasharray="5 5" label={{ value: `${season.baseline} · starting points`, fill: 'var(--ocean-gray-dark)', fontSize: 11, position: 'insideBottomLeft' }} />
          <Tooltip wrapperStyle={{pointerEvents: 'auto'}} content={({active, payload, label}) => {
            if (!active || !payload?.length) return null;
            const x = Number(label);
            const day = mode === 'calendar' ? new Date(x).toISOString().slice(0,10) : null;
            const isStart = mode === 'calendar' ? day === season.startDate : x === 0;
            return <div className="chart-tooltip" data-testid="session-tooltip"><b>{isStart ? 'Season start' : day ? date(day,true) : `Game ${x}`}</b>
              {[...payload].sort((a,b) => Number(b.dataKey === hover?.id) - Number(a.dataKey === hover?.id)).map(item => {
                const p = players.find(p => p.id === item.dataKey);
                if (!p || item.value == null) return null;
                const game = p.history[x-1];
                const summary = day ? sessionSummary(p,day,season) : { games: isStart ? 0 : 1, change: game?.change ?? 0 };
                return <div className={`tooltip-player ${hover?.id === p.id ? 'tooltip-nearest' : ''}`} key={p.id} data-tooltip-player={p.id}>
                  <div><span>{p.name}</span><strong style={{color:chartColor(p,player.id)}}>{number(Number(item.value))} <small>pts</small></strong></div>
                  <div className="tooltip-detail"><span className={summary.change >= 0 ? 'positive' : 'negative'}>{isStart ? 'Starting points' : `${change(summary.change)} pts ${day ? 'since last session' : 'this game'}`}</span><span>{summary.games} {summary.games === 1 ? 'game' : 'games'}{day && !isStart && !summary.games ? ' · did not play' : ''}</span></div>
                </div>;
              })}</div>;
          }} />
          {renderedPlayers.map(p => <Line key={p.id} className={`player-line player-line-${p.id} ${hover?.id === p.id ? 'hovered-line' : ''}`} type="linear" dataKey={p.id} stroke={chartColor(p,player.id)} strokeWidth={hover?.id === p.id ? 4.5 : p.id === player.id ? 3 : 2} strokeOpacity={hover ? hover.id === p.id ? 1 : .16 : p.id === player.id ? 1 : .8} dot={{r:hover?.id === p.id ? 4.5 : 3,fill:chartColor(p,player.id),stroke:'var(--bg-surface)',strokeWidth:2,opacity:hover && hover.id !== p.id ? .18 : 1}} activeDot={{r:hover?.id === p.id ? 8 : hover ? 3 : 6,fill:chartColor(p,player.id),stroke:'var(--bg-surface)',strokeWidth:3,opacity:hover && hover.id !== p.id ? .18 : 1}} isAnimationActive={false} connectNulls={false}/>)}
          <NearestLineInteraction data={data} ids={ids} preferredId={hover?.id ?? player.id} onHover={setHoveredId} onSelect={onSelect}/>
        </LineChart>
      </ResponsiveContainer>
    </div>
    <div className="chart-caption"><span>{mode === 'calendar' ? 'Hover or tap a session dot for points change and games' : 'Points after each recorded game · Game number, not calendar date'}</span><span>Starts at {season.baseline}</span></div>
    {players.length > 1 && <div className="legend" aria-label="Selected players">{players.map(p => <button key={p.id} onClick={() => onSelect(p.id)} onMouseEnter={() => setHoveredId(p.id)} onMouseLeave={() => setHoveredId(null)} onFocus={() => setHoveredId(p.id)} onBlur={() => setHoveredId(null)} className={hover?.id === p.id ? 'legend-nearest' : ''} aria-pressed={p.id === player.id}><i style={{background:chartColor(p,player.id)}}/>{p.name}</button>)}</div>}
  </>;
}
