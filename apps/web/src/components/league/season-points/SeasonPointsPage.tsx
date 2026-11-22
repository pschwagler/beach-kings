'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { SeasonPointsData } from '@beach-kings/shared';
import { getSeasonPoints } from '../../../services/endpoints/seasonPoints';
import { useAuth } from '../../../contexts/AuthContext';
import { useAuthModal } from '../../../contexts/AuthModalContext';
import NavBar from '../../layout/NavBar';
import SeasonExplorer from './SeasonExplorer';
import './SeasonExplorer.css';

export default function SeasonPointsPage({leagueId,seasonId}:{leagueId:number;seasonId:number}) {
  const auth=useAuth(); const {openAuthModal}=useAuthModal();
  const [response,setResponse]=useState<{key:string;data:SeasonPointsData}|null>(null);
  const [error,setError]=useState(''); const [loading,setLoading]=useState(true); const [refresh,setRefresh]=useState(0);
  const key=`${auth.user?.id}:${leagueId}:${seasonId}`;
  const data=response?.key===key?response.data:null;
  useEffect(()=>{
    if(!auth.isAuthenticated)return;
    const controller=new AbortController();let active=true;
    setLoading(true);setError('');
    if(!Number.isSafeInteger(leagueId)||leagueId<=0||!Number.isSafeInteger(seasonId)||seasonId<=0){setError('Season not found.');setLoading(false);return;}
    getSeasonPoints(leagueId,seasonId,controller.signal)
      .then(r=>{if(active)setResponse({key,data:r});})
      .catch(e=>{if(active)setError(e.response?.status===403?'You do not have access to this league.':e.response?.status===404?'Season not found.':'Could not load season points. Please retry.');})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;controller.abort();};
  },[key,leagueId,seasonId,auth.isAuthenticated,refresh]);
  return <><NavBar isLoggedIn={auth.isAuthenticated} user={auth.user} currentUserPlayer={auth.currentUserPlayer} onSignOut={auth.logout} onSignIn={()=>openAuthModal('sign-in')} onSignUp={()=>openAuthModal('sign-up')}/>
    <div className="season-explorer-toolbar"><Link href={`/league/${leagueId}?tab=rankings&season=${seasonId}`}>← Back to season leaderboard</Link></div>
    {auth.isInitializing?<p className="season-explorer-state" role="status">Loading account…</p>:!auth.isAuthenticated?<div className="season-explorer-state"><h1>Season points</h1><button className="league-text-button" onClick={()=>openAuthModal('sign-in')}>Sign in to explore this season</button></div>:error?<div className="season-explorer-state" role="alert">{error}<button onClick={()=>setRefresh(n=>n+1)}>Retry</button></div>:loading?<p className="season-explorer-state" role="status">Loading season points…</p>:data?.players.length?<SeasonExplorer key={key} season={data}/>:<p className="season-explorer-state">No official results for this season yet.</p>}
  </>;
}
