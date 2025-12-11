import { CheckCircle } from "lucide-react";
import "../WhatsAppPage.css";

function GroupSelector({ 
  groups, 
  loadingGroups, 
  selectedGroup, 
  onGroupChange 
}) {
  return (
    <div className="whatsapp-config-box">
      <h2 className="whatsapp-config-title">
        <CheckCircle size={24} />
        Configure Target Group
      </h2>

      <div>
        <div className="whatsapp-form-group">
          <label className="whatsapp-form-label">
            Select Group
          </label>
          {loadingGroups ? (
            <div className="whatsapp-loading-groups">
              Loading groups...
            </div>
          ) : groups.length === 0 ? (
            <div className="whatsapp-no-groups">
              No group chats found. Make sure you have group chats in WhatsApp.
            </div>
          ) : (
            <select
              value={selectedGroup}
              onChange={onGroupChange}
              className="whatsapp-select"
            >
              <option value="">-- Select a group --</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name} ({group.participantCount} members)
                </option>
              ))}
            </select>
          )}
          <small className="whatsapp-form-hint">
            This group will receive automated messages when new players sign up
          </small>
        </div>

        {selectedGroup && (
          <div className="whatsapp-group-configured">
            <div className="whatsapp-configured-header">
              <CheckCircle size={20} color="#4caf50" />
              <strong className="whatsapp-configured-title">Group Configured</strong>
            </div>
            <p className="whatsapp-configured-message">
              Automated signup notifications will be sent to this group.
            </p>
          </div>
        )}

        <div className="whatsapp-info-box">
          <p className="whatsapp-info-text">
            <strong>Coming Soon:</strong> Automated messages will be sent to the selected group when new players register for volleyball sessions.
          </p>
        </div>
      </div>
    </div>
  );
}

export default GroupSelector;

