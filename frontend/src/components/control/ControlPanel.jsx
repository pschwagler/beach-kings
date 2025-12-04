import { useState } from 'react';
import { RefreshCw, ExternalLink, Loader2, MessageCircle, Download } from 'lucide-react';
import { Button } from '../ui/UI';
import ConfirmationModal from '../modal/ConfirmationModal';
import { exportMatchesToCSV } from '../../services/api';

const GOOGLE_SHEETS_URL = 'https://docs.google.com/spreadsheets/d/1KZhd5prjzDjDTJCvg0b1fxVAM-uGDBxsHJJwKBKrBIA/edit?usp=sharing';

export default function ControlPanel({ onLoadFromSheets }) {
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const handleLoadFromSheets = async () => {
    setShowConfirmModal(false);
    setIsLoading(true);
    
    // First, download a backup of current matches
    try {
      await exportMatchesToCSV();
    } catch (error) {
      console.error('Error creating backup:', error);
      // Continue with refresh even if backup fails
    }
    
    // Then proceed with loading from sheets
    await onLoadFromSheets();
    setIsLoading(false);
  };

  const handleWhatsAppClick = () => {
    window.location.href = '/whatsapp';
  };

  const handleExportCSV = async () => {
    try {
      await exportMatchesToCSV();
    } catch (error) {
      console.error('Error exporting CSV:', error);
      alert('Failed to export CSV. Please try again.');
    }
  };

  return (
    <>
      <div className="controls">
        <Button
          onClick={() => setShowConfirmModal(true)}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 size={18} className="spin" />
              Loading...
            </>
          ) : (
            <>
              <RefreshCw size={18} />
              Refresh from Google Sheets
            </>
          )}
        </Button>
        
        <a href={GOOGLE_SHEETS_URL} target="_blank" rel="noopener noreferrer" className="no-underline">
          <Button variant="success">
            <ExternalLink size={18} />
            View Input Data
          </Button>
        </a>

        <Button variant="secondary" onClick={handleExportCSV}>
          <Download size={18} />
          Export to CSV
        </Button>

        <Button variant="whatsapp" onClick={handleWhatsAppClick}>
          <MessageCircle size={18} />
          WhatsApp
        </Button>
      </div>

      <ConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleLoadFromSheets}
        title="Refresh from Google Sheets"
        message="Are you sure you want to refresh from Google Sheets? This will replace all current data. Any games not in the sheet will be permanently deleted. A backup CSV will be automatically downloaded before refreshing."
        confirmText="Refresh Data"
        cancelText="Cancel"
      />
    </>
  );
}

