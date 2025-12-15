'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MessageSquare, Mail } from 'lucide-react';
import FeedbackModal from './FeedbackModal';

export default function Footer() {
  const router = useRouter();
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  const handleNavigation = (e, path) => {
    e.preventDefault();
    router.push(path);
  };

  return (
    <>
      <footer className="site-footer">
        <div className="footer-content">
          <div className="footer-links">
            <Link 
              href="/terms-of-service" 
              className="footer-link"
              onClick={(e) => handleNavigation(e, '/terms-of-service')}
            >
              Terms of Service
            </Link>
            <span className="footer-separator">•</span>
            <Link 
              href="/privacy-policy" 
              className="footer-link"
              onClick={(e) => handleNavigation(e, '/privacy-policy')}
            >
              Privacy Policy
            </Link>
            <span className="footer-separator">•</span>
            <Link 
              href="/contribute" 
              className="footer-link"
              onClick={(e) => handleNavigation(e, '/contribute')}
            >
              Contribute
            </Link>
            <span className="footer-separator">•</span>
            <a href="mailto:beachleaguevb@gmail.com?subject=Inquiry%20from%20Beach%20League" className="footer-link contact-link">
              <Mail size={14} />
              Contact Us
            </a>
            <span className="footer-separator">•</span>
            <button 
              className="footer-link feedback-button" 
              onClick={() => setIsFeedbackOpen(true)}
            >
              <MessageSquare size={14} />
              Leave Feedback
            </button>
          </div>
          <div className="footer-copyright">
            © {new Date().getFullYear()} Beach League. All rights reserved.
          </div>
        </div>
      </footer>

      <FeedbackModal 
        isOpen={isFeedbackOpen} 
        onClose={() => setIsFeedbackOpen(false)} 
      />
    </>
  );
}
