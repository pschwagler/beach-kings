import React from 'react';
import NavBar from './layout/NavBar';
import { useAuth } from '../contexts/AuthContext';

export default function PrivacyPolicyPage() {
  const { isAuthenticated, user, currentUserPlayer, logout } = useAuth();

  return (
    <div className="legal-page-container">
      <NavBar
        isLoggedIn={isAuthenticated}
        user={user}
        currentUserPlayer={currentUserPlayer}
        onSignOut={logout}
      />
      
      <main className="legal-page-main">
        <div className="legal-page-header">
          <h1 className="legal-page-title">
            Privacy Policy
          </h1>
          <p className="legal-page-date">
            <strong>Last updated:</strong> December 2, 2025
          </p>
        </div>
        
        <section className="legal-section">
          <p className="legal-intro">
            This Privacy Policy describes how Beach League, operated by Patrick Schwagler, located in Brooklyn, NY ("we," "us," or "our"), collects, uses, discloses, and protects your personal information when you use our beach volleyball league management platform and related services (the "Service").
          </p>

          <h3>
            1. Information We Collect
          </h3>
          
          <h4>
            1.1 Information You Provide Directly
          </h4>
          <p>We collect information you provide when you create an account, update your profile, or use the Service, including:</p>
          <ul>
            <li><strong>Account Information:</strong> Name, email address, phone number, and password</li>
            <li><strong>Profile Information:</strong> Nickname, gender, skill level, age, height, playing position, preferred side, location, and optional profile picture</li>
            <li><strong>Game Data:</strong> Match results, team compositions, scores, and game statistics you enter or participate in</li>
            <li><strong>Communications:</strong> Messages, feedback, or support requests you send to us</li>
          </ul>

          <h4>1.2 Information Collected Automatically</h4>
          <p>When you access or use the Service, we automatically collect certain information, including:</p>
          <ul>
            <li><strong>Usage Information:</strong> Pages viewed, features used, time spent on the Service, and other usage patterns</li>
            <li><strong>Device Information:</strong> Device type, operating system, browser type and version, unique device identifiers</li>
            <li><strong>Log Data:</strong> IP address, access times, referring URLs, and error logs</li>
            <li><strong>Authentication Data:</strong> Session tokens, refresh tokens, and login timestamps</li>
          </ul>

          <h4>1.3 Cookies and Similar Technologies</h4>
          <p>We use local storage, session storage, and similar technologies to:</p>
          <ul>
            <li>Maintain your login session</li>
            <li>Remember your preferences</li>
            <li>Analyze Service usage and performance</li>
            <li>Improve user experience</li>
          </ul>
          <p>You can control these technologies through your browser settings, though disabling them may affect Service functionality.</p>

          <h3>2. How We Use Your Information</h3>
          <p>We use the information we collect for the following purposes:</p>
          <ul>
            <li><strong>Service Delivery:</strong> Create and manage your account, provide access to features, and deliver requested services</li>
            <li><strong>Authentication:</strong> Verify your identity using SMS verification codes sent to your phone number</li>
            <li><strong>Game Management:</strong> Track game results, calculate player rankings and statistics, manage league memberships and schedules</li>
            <li><strong>Communication:</strong> Send account-related notifications, security alerts, and respond to your inquiries</li>
            <li><strong>Service Improvement:</strong> Analyze usage patterns, troubleshoot issues, and develop new features</li>
            <li><strong>Security:</strong> Detect and prevent fraud, abuse, security incidents, and other harmful activity</li>
            <li><strong>Legal Compliance:</strong> Comply with legal obligations and enforce our Terms of Service</li>
          </ul>

          <h3>3. How We Share Your Information</h3>
          <p>We do not sell your personal information. We may share your information in the following limited circumstances:</p>
          
          <h4>3.1 Within the Service</h4>
          <p>Certain information is visible to other users as part of the Service functionality:</p>
          <ul>
            <li>Your profile information (name, nickname, skill level, statistics) is visible to other members of leagues you join</li>
            <li>Game results and statistics are visible to league members</li>
            <li>Player rankings and match history may be visible to league members</li>
          </ul>

          <h4>3.2 Service Providers</h4>
          <p>We share information with third-party service providers who perform services on our behalf:</p>
          <ul>
            <li><strong>SMS Service Provider (Twilio):</strong> To send verification codes and account-related SMS messages</li>
            <li><strong>Hosting and Infrastructure:</strong> To store data and host the Service</li>
            <li><strong>Database Services:</strong> To securely store and manage user data</li>
          </ul>
          <p>These service providers are contractually obligated to use your information only for the purposes we specify and to maintain appropriate security measures.</p>

          <h4>3.3 Mobile Information Protection</h4>
          <div className="legal-info-box">
            <strong>Important:</strong> No mobile information will be shared with third parties or affiliates for marketing or promotional purposes. Text messaging originator opt-in data and consent will not be shared with any third parties, except as necessary to deliver SMS verification codes through our service provider.
          </div>

          <h4>3.4 Legal Requirements</h4>
          <p>We may disclose your information if required by law or in response to valid legal requests, such as:</p>
          <ul>
            <li>Compliance with legal obligations, court orders, or subpoenas</li>
            <li>Protection of our rights, property, or safety, or that of others</li>
            <li>Investigation of fraud, security issues, or illegal activity</li>
            <li>Enforcement of our Terms of Service</li>
          </ul>

          <h4>3.5 Business Transfers</h4>
          <p>If we are involved in a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction. We will provide notice before your information becomes subject to a different privacy policy.</p>

          <h3>4. Data Retention</h3>
          <p>We retain your personal information for as long as your account is active or as needed to provide you the Service. We will retain and use your information as necessary to:</p>
          <ul>
            <li>Maintain your account and provide ongoing services</li>
            <li>Preserve historical game data and statistics for league records</li>
            <li>Comply with legal obligations (such as tax or accounting requirements)</li>
            <li>Resolve disputes and enforce our agreements</li>
          </ul>
          <p>We retain data for a reasonable period after account closure or inactivity to allow for potential account recovery and to maintain league historical records. You may request deletion of your data at any time as described in Section 7.</p>

          <h3>5. Data Security</h3>
          <p>We implement reasonable technical and organizational security measures to protect your personal information from unauthorized access, disclosure, alteration, and destruction, including:</p>
          <ul>
            <li><strong>Encryption:</strong> Data is encrypted in transit using HTTPS/TLS protocols</li>
            <li><strong>Password Security:</strong> Passwords are hashed using industry-standard bcrypt algorithms and never stored in plain text</li>
            <li><strong>Authentication:</strong> JWT-based authentication with secure token management</li>
            <li><strong>Access Controls:</strong> Limited access to personal data on a need-to-know basis</li>
            <li><strong>Secure Infrastructure:</strong> Data stored on secure servers with regular security updates</li>
          </ul>
          <p>However, no method of transmission or storage is 100% secure. While we strive to protect your information, we cannot guarantee absolute security. You are responsible for maintaining the confidentiality of your account credentials.</p>

          <h3>6. Data Storage and International Users</h3>
          <p>Your information is stored and processed in the United States. The Service is intended for users in the United States. If you access the Service from outside the United States, your information will be transferred to, stored, and processed in the United States, where data protection laws may differ from those in your jurisdiction. By using the Service, you consent to the transfer and processing of your information in the United States.</p>

          <h3>7. Your Privacy Rights</h3>
          
          <h4>7.1 General Rights</h4>
          <p>You have the following rights regarding your personal information:</p>
          <ul>
            <li><strong>Access:</strong> Request access to the personal information we hold about you</li>
            <li><strong>Correction:</strong> Update or correct inaccurate information through your account settings or by contacting us</li>
            <li><strong>Deletion:</strong> Request deletion of your personal information, subject to certain legal exceptions</li>
            <li><strong>Portability:</strong> Request a copy of your personal information in a portable format</li>
            <li><strong>Opt-Out:</strong> Opt out of SMS messages by replying STOP or by contacting us</li>
          </ul>

          <h4>7.2 California Privacy Rights (CCPA)</h4>
          <p>If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA):</p>
          <ul>
            <li><strong>Right to Know:</strong> You have the right to request disclosure of the categories and specific pieces of personal information we have collected about you, the categories of sources, the business purposes for collection, and the categories of third parties with whom we share information</li>
            <li><strong>Right to Delete:</strong> You have the right to request deletion of your personal information, subject to certain exceptions (e.g., completing transactions, legal compliance, security purposes)</li>
            <li><strong>Right to Non-Discrimination:</strong> You have the right not to receive discriminatory treatment for exercising your privacy rights</li>
            <li><strong>No Sale of Personal Information:</strong> We do not sell your personal information to third parties</li>
          </ul>
          
          <p><strong>How to Exercise Your Rights:</strong> To exercise any of the above rights, please contact us at patrick@beachleague.com. We will verify your identity before processing your request and respond within 45 days. You may designate an authorized agent to make requests on your behalf, subject to verification requirements.</p>

          <h4>7.3 Data Portability Process</h4>
          <p>If you request a copy of your personal information, we will provide it to you via email in a commonly used format (such as CSV or JSON) within 45 days of verifying your identity. The data export will include your account information, profile data, game statistics, and other personal information we maintain about you.</p>

          <h3>8. Children's Privacy</h3>
          <p>The Service is not intended for individuals under the age of 18. We do not knowingly collect personal information from children under 18. If you are under 18, do not use the Service or provide any personal information. If we learn that we have collected personal information from a person under 18, we will promptly delete that information. If you believe we may have information from a child under 18, please contact us immediately at beachleaguevb@gmail.com.</p>

          <h3>9. Changes to This Privacy Policy</h3>
          <p>We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or other factors. We will notify you of any material changes by:</p>
          <ul>
            <li>Updating the "Last updated" date at the top of this policy</li>
            <li>Sending an email notification to your registered email address</li>
            <li>Displaying a prominent notice within the Service</li>
          </ul>
          <p>Your continued use of the Service after the effective date of the updated Privacy Policy constitutes your acceptance of the changes. We encourage you to review this Privacy Policy periodically.</p>

          <h3>10. Third-Party Links</h3>
          <p>The Service may contain links to third-party websites or services. We are not responsible for the privacy practices of these third parties. We encourage you to review the privacy policies of any third-party sites you visit.</p>

          <h3>11. Contact Us</h3>
          <p>If you have any questions, concerns, or requests regarding this Privacy Policy or our privacy practices, including requests to exercise your privacy rights, please contact us at:</p>
          <p><strong>Email:</strong> beachleaguevb@gmail.com</p>
          <p><strong>Service Name:</strong> Beach League</p>
          <p><strong>Operator:</strong> Patrick Schwagler</p>
          <p><strong>Location:</strong> Brooklyn, NY, United States</p>
          
          <p className="legal-footer-note">
            We will respond to your inquiry within a reasonable timeframe, typically within 45 days for privacy rights requests.
          </p>
        </section>
      </main>
    </div>
  );
}
