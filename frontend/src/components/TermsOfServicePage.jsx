import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { navigateTo } from '../Router';

export default function TermsOfServicePage() {
  return (
    <div className="page-container">
      <header className="page-header">
        <button 
          className="back-button" 
          onClick={() => navigateTo('/')}
          aria-label="Back to home"
        >
          <ArrowLeft size={24} />
        </button>
        <h1>Terms of Service</h1>
      </header>
      
      <main className="page-content" style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
        <section className="legal-section">
          <h2>Terms of Service</h2>
          <p>Last updated: {new Date().toLocaleDateString()}</p>
          
          <h3>1. Acceptance of Terms</h3>
          <p>By accessing or using our services, you agree to be bound by these Terms of Service. If you do not agree to these terms, you may not access or use our services.</p>
          
          <h3>2. SMS/Mobile Messaging</h3>
          <p>By providing your phone number, you agree to receive a one-time verification code from Beach League. Message and data rates may apply. Message frequency varies.</p>
          <p>You can reply <strong>HELP</strong> for help or <strong>STOP</strong> to cancel at any time.</p>
          <p>Carriers are not liable for delayed or undelivered messages.</p>

          <h3>3. User Accounts</h3>
          <p>You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.</p>

          <h3>4. Prohibited Conduct</h3>
          <p>You agree not to violate any applicable law, contract, intellectual property right, or other third-party right or commit a tort, and that you are solely responsible for your conduct while using our services.</p>

          <h3>5. Termination</h3>
          <p>We reserve the right to terminate or suspend your access to our services immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.</p>

          <h3>6. Contact Us</h3>
          <p>If you have any questions about these Terms, please contact us.</p>
        </section>
      </main>
    </div>
  );
}
