'use client';

import './JoinLeaguePrompt.css';

/**
 * JoinLeaguePrompt Component
 * 
 * Displays a prompt for non-members to join a league.
 * Shows different messaging and button text based on whether the league is open or requires approval.
 * 
 * @param {Object} props
 * @param {Object} props.league - The league object containing name and is_open properties
 * @param {Function} props.onJoinLeague - Callback function to handle join/request to join action
 */
export default function JoinLeaguePrompt({ league, onJoinLeague }) {
  return (
    <div className="join-league-prompt">
      <h1 className="join-league-prompt__title">
        {league.name}
      </h1>
      <p className="join-league-prompt__description">
        You are not a member of this league. {league.is_open ? 'Join now to start playing!' : 'Request to join and a league administrator will review your request.'}
      </p>
      <button 
        onClick={onJoinLeague}
        className="join-league-prompt__button"
      >
        {league.is_open ? 'Join League' : 'Request to Join'}
      </button>
    </div>
  );
}
