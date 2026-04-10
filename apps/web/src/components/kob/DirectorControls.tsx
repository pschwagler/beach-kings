"use client";

import { useState } from "react";
import { Button } from "../ui/UI";
import { ChevronUp, ChevronDown, SkipForward, UserMinus, Flag } from "lucide-react";
import "./KobLive.css";

interface DirectorControlsProps {
  tournament: any;
  onAdvance: () => void;
  onDropPlayer: (playerId: number) => void;
  onComplete: () => void;
}

export default function DirectorControls({ tournament, onAdvance, onDropPlayer, onComplete }: DirectorControlsProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedDropPlayer, setSelectedDropPlayer] = useState<number | null>(null);

  const activePlayers = tournament.players?.filter((p: any) => !p.is_dropped) || [];

  const handleDrop = async () => {
    if (!selectedDropPlayer) return;
    if (!confirm(`Drop ${activePlayers.find((p: any) => p.player_id === selectedDropPlayer)?.player_name}? Their future games will become forfeits.`)) return;
    await onDropPlayer(selectedDropPlayer);
    setSelectedDropPlayer(null);
  };

  return (
    <div className="kob-director">
      <button
        type="button"
        className="kob-director__toggle"
        onClick={() => setExpanded(!expanded)}
      >
        <span>Director Controls</span>
        {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>

      {expanded && (
        <div className="kob-director__panel">
          <div className="kob-director__actions">
            <Button variant="outline" onClick={onAdvance}>
              <SkipForward size={14} /> Advance Round
            </Button>

            <Button variant="danger" onClick={onComplete}>
              <Flag size={14} /> End Tournament
            </Button>
          </div>

          <div className="kob-director__drop-section">
            <label className="kob-director__label">Drop Player</label>
            <div className="kob-director__drop-row">
              <select
                className="kob-director__select"
                value={selectedDropPlayer || ""}
                onChange={(e) => setSelectedDropPlayer(e.target.value ? parseInt(e.target.value) : null)}
              >
                <option value="">Select player...</option>
                {activePlayers.map((p: any) => (
                  <option key={p.player_id} value={p.player_id}>
                    {p.player_name || `Player ${p.player_id}`}
                  </option>
                ))}
              </select>
              <Button variant="danger" onClick={handleDrop} disabled={!selectedDropPlayer}>
                <UserMinus size={14} /> Drop
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
