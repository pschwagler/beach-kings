import { useState, useMemo } from 'react';
import { Calendar, Plus, X } from 'lucide-react';
import { Button } from '../ui/UI';
import { useLeague } from '../../contexts/LeagueContext';
import { useAuth } from '../../contexts/AuthContext';
import { createLeagueSession } from '../../services/api';

export default function LeagueSessionsTab({ leagueId, showMessage }) {
  const { members } = useLeague();
  const { currentUserPlayer } = useAuth();
  
  const [showCreateSessionModal, setShowCreateSessionModal] = useState(false);
  const [sessionFormData, setSessionFormData] = useState({
    name: '',
    date: new Date().toISOString().split('T')[0]
  });

  // Compute isAdmin from context
  const isAdmin = useMemo(() => {
    if (!currentUserPlayer || !members.length) return false;
    const userMember = members.find(m => m.player_id === currentUserPlayer.id);
    return userMember?.role === 'admin';
  }, [currentUserPlayer, members]);

  const handleCreateSession = async () => {
    try {
      const dateStr = sessionFormData.date;
      // Convert YYYY-MM-DD to MM/DD/YYYY format
      const [year, month, day] = dateStr.split('-');
      const formattedDate = `${parseInt(month)}/${parseInt(day)}/${year}`;
      
      await createLeagueSession(leagueId, {
        date: formattedDate,
        name: sessionFormData.name || undefined
      });
      showMessage?.('success', 'Session created successfully');
      setShowCreateSessionModal(false);
      setSessionFormData({ name: '', date: new Date().toISOString().split('T')[0] });
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to create session');
    }
  };
  return (
    <>
      <div className="league-section">
        <div className="section-header">
          <h2 className="section-title">
            <Calendar size={20} />
            Sessions
          </h2>
          {isAdmin && (
            <Button 
              variant="success" 
              size="small"
              onClick={() => setShowCreateSessionModal(true)}
            >
              <Plus size={16} />
              Schedule Session
            </Button>
          )}
        </div>
        
        <div className="empty-state">
          <Calendar size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
          <p>Schedule sessions for your league. Sessions are where matches are played.</p>
        </div>
      </div>

      {/* Create Session Modal */}
      {showCreateSessionModal && (
        <div className="modal-overlay" onClick={() => setShowCreateSessionModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Schedule New Session</h2>
              <Button variant="close" onClick={() => setShowCreateSessionModal(false)}>
                <X size={20} />
              </Button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="session-name">Session Name (Optional)</label>
                <input
                  id="session-name"
                  type="text"
                  value={sessionFormData.name}
                  onChange={(e) => setSessionFormData({ ...sessionFormData, name: e.target.value })}
                  placeholder="e.g., Week 1"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="session-date">
                  Date <span className="required">*</span>
                </label>
                <input
                  id="session-date"
                  type="date"
                  value={sessionFormData.date}
                  onChange={(e) => setSessionFormData({ ...sessionFormData, date: e.target.value })}
                  className="form-input"
                  required
                />
              </div>
            </div>
            <div className="modal-actions">
              <Button onClick={() => setShowCreateSessionModal(false)}>Cancel</Button>
              <Button 
                variant="success" 
                onClick={handleCreateSession}
                disabled={!sessionFormData.date}
              >
                Schedule Session
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

