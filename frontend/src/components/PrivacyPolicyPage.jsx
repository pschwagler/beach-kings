import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { navigateTo } from '../Router';

export default function PrivacyPolicyPage() {
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
        <h1>Privacy Policy</h1>
      </header>
      
      <main className="page-content" style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
        <section className="legal-section">
          <h2>Privacy Policy</h2>
          <p>Last updated: {new Date().toLocaleDateString()}</p>
          
          <h3>1. Information We Collect</h3>
          <p>We collect information you provide directly to us, such as when you create an account, update your profile, or communicate with us. This may include your name, phone number, email address, and other information you choose to provide.</p>
          
          <h3>2. How We Use Your Information</h3>
          <p>We use the information we collect to provide, maintain, and improve our services, including to:</p>
          <ul>
            <li>Create and manage your account</li>
            <li>Process your transactions</li>
            <li>Send you technical notices, updates, security alerts, and support messages</li>
            <li>Respond to your comments, questions, and requests</li>
          </ul>

          <h3>3. Information Sharing</h3>
          <p>We do not share your personal information with third parties except as described in this policy.</p>
          <div style={{ backgroundColor: '#f0f9ff', padding: '1rem', borderRadius: '8px', border: '1px solid #bae6fd', margin: '1rem 0' }}>
            <strong>Mobile Information:</strong> No mobile information will be shared with third parties/affiliates for marketing/promotional purposes. All the above categories exclude text messaging originator opt-in data and consent; this information will not be shared with any third parties.
          </div>

          <h3>4. Security</h3>
          <p>We take reasonable measures to help protect information about you from loss, theft, misuse, and unauthorized access, disclosure, alteration, and destruction.</p>

          <h3>5. Contact Us</h3>
          <p>If you have any questions about this Privacy Policy, please contact us.</p>
        </section>
      </main>
    </div>
  );
}
