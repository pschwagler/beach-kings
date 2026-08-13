'use client';

import React from 'react';
import NavBar from '../../src/components/layout/NavBar';
import { useAuth } from '../../src/contexts/AuthContext';
import '../../src/styles/legal-pages.css';

export default function PrivacyPolicyPageRoute() {
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
            <strong>Last updated:</strong> August 11, 2026
          </p>
        </div>
        
        <section className="legal-section">
          <p className="legal-intro">
            This Privacy Policy describes how Beach League, operated by Patrick Schwagler, located in Brooklyn, NY (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), collects, uses, discloses, and protects your personal information when you use our beach volleyball league management platform and related services (the &quot;Service&quot;).
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
            <li><strong>Profile Information:</strong> Nickname, gender, skill level, height, playing position, preferred side, general location, and optional profile picture</li>
            <li><strong>Age and Consent Information:</strong> Whether the account is junior or adult, the country and state or province used for eligibility, how the age range was provided, whether guardian consent was confirmed, and when the check occurred. We do not ask for or derive an exact birthdate from an age-range response.</li>
            <li><strong>Game Data:</strong> Match results, team compositions, scores, and game statistics you enter or participate in</li>
            <li><strong>Communications:</strong> Messages, feedback, or support requests you send to us</li>
          </ul>

          <h4>1.2 Information Collected Automatically or by App Features</h4>
          <p>When you access or use the Service, we collect limited technical information needed to operate and protect it:</p>
          <ul>
            <li><strong>Operational Log Data:</strong> IP address, access time, requested route, response status, and sanitized error category</li>
            <li><strong>Authentication Data:</strong> Session tokens, refresh tokens, and login timestamps</li>
            <li><strong>Notification Data:</strong> A random app-installation identifier, Expo push token, and your notification preferences when you enable mobile notifications</li>
            <li><strong>Crash Diagnostics:</strong> When mobile crash reporting is enabled, an internal account identifier, app version, route, device and operating-system class, error type, and stack trace. We exclude contact information, message and review content, precise location, photo URLs, request and response bodies, tokens, cookies, screenshots, and session replay.</li>
          </ul>
          <p>Beach League does not currently use an advertising identifier, advertising SDK, or product-analytics SDK, and does not build a behavioral profile from app taps or page views.</p>

          <h4>1.3 Location Information</h4>
          <p>You may save a city, league location, or home court to personalize nearby results. When you choose to use a device-location feature, the app requests foreground location permission and sends your current latitude and longitude to the Service only to rank nearby locations or courts. Those precise coordinates are discarded after the request and are not stored in a location-history or profile table. You can use manual city, league-location, and court selection without device location.</p>

          <h4>1.4 Cookies and Similar Technologies</h4>
          <p>We use local storage, session storage, and similar technologies to:</p>
          <ul>
            <li>Maintain your login session</li>
            <li>Remember your preferences</li>
            <li>Cache Service data and restore app state</li>
            <li>Protect accounts and troubleshoot operational failures</li>
          </ul>
          <p>You can control these technologies through your browser settings, though disabling them may affect Service functionality.</p>

          <h3>2. How We Use Your Information</h3>
          <p>We use the information we collect for the following purposes:</p>
          <ul>
            <li><strong>Service Delivery:</strong> Create and manage your account, provide access to features, and deliver requested services</li>
            <li><strong>Authentication:</strong> Verify your identity using SMS verification codes sent to your phone number</li>
            <li><strong>Game Management:</strong> Track game results, calculate player rankings and statistics, manage league memberships and schedules</li>
            <li><strong>Communication:</strong> Send account-related notifications, security alerts, and respond to your inquiries</li>
            <li><strong>Service Improvement:</strong> Troubleshoot operational issues and improve reliability without advertising or cross-company tracking</li>
            <li><strong>Security:</strong> Detect and prevent fraud, abuse, security incidents, and other harmful activity</li>
            <li><strong>Community Safety:</strong> Process messages, reviews, photos, reports, and related safety signals using automated classification and human review to detect possible guideline violations</li>
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
            <li><strong>Apple and Google:</strong> To provide federated sign-in, credential revocation where required, and Apple push notification delivery</li>
            <li><strong>Expo Push Service:</strong> To deliver privacy-conscious mobile notification payloads to devices that have opted in</li>
            <li><strong>Email Service Provider (Resend):</strong> To send transactional account, moderation, and support email</li>
            <li><strong>Hosting and Infrastructure:</strong> To store data and host the Service</li>
            <li><strong>Database Services:</strong> To securely store and manage user data</li>
            <li><strong>Object Storage:</strong> To store profile, court, and review photos and access-controlled moderation evidence</li>
            <li><strong>Geocoding Provider:</strong> To return city, place, and nearby-location results from search text or coordinates you submit for that request</li>
            <li><strong>OpenAI:</strong> To provide automated text and image safety classification and recommendation-only case triage. We limit submissions to the content and pseudonymous identifiers needed for safety review, disable response storage where supported, and do not opt this data into model training. Provider abuse-monitoring and legally required safety retention may still apply.</li>
            <li><strong>Sentry:</strong> To receive privacy-scrubbed mobile crash diagnostics when crash reporting is enabled. Beach League uses Sentry&apos;s United States hosted region and does not enable session replay, screenshots, attachments, product analytics, or advertising tracking.</li>
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
          <p>Account deletion includes a 30-day recovery period. After permanent deletion, we erase account credentials, provider identifiers, profile details, social data, messages, photos, reviews, invitations, roster memberships, personal statistics, and rating history. The former player profile is no longer searchable, viewable, or usable for contact or interaction.</p>
          <p>We retain only the portions of completed match records needed to preserve other players&apos; histories and league records: the anonymous match position, score, winner, ranked and public flags, and the related session, league, season, and court context. The deleted participant is shown only as a non-clickable &quot;Deleted Player&quot;; public responses do not include their former player ID, profile link, avatar, or player attributes. These factual match records may be retained indefinitely because removing a participant would corrupt the records of everyone else in the match.</p>
          <p>When content is reported or restricted, a limited evidence copy may be stored in a separate access-controlled system for up to 180 days after the moderation case closes, unless a legal hold requires longer retention. Content-free moderation audit metadata may be retained for one year.</p>

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
          <p>Your information is stored and processed in the United States. The initial mobile release is intended for users in the United States and Canada. If you access the Service from outside the United States, your information will be transferred to, stored, and processed in the United States, where data protection laws may differ from those in your jurisdiction.</p>

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
          
          <p><strong>How to Exercise Your Rights:</strong> To exercise any of the above rights, please contact us at patrick@beachleaguevb.com. We will verify your identity before processing your request and respond within 45 days. You may designate an authorized agent to make requests on your behalf, subject to verification requirements.</p>

          <h4>7.3 Data Portability Process</h4>
          <p>If you request a copy of your personal information, we will provide it to you via email in a commonly used format (such as CSV or JSON) within 45 days of verifying your identity. The data export will include your account information, profile data, game statistics, and other personal information we maintain about you.</p>

          <h3>8. Teen and Children&apos;s Privacy</h3>
          <p>You must be at least 13 in the United States and at least 14 in Canada, including Québec, to create an account. We ask for a broad age range before we ask for registration details. If the age range is below the applicable minimum, we do not allow registration and do not ask for account information.</p>
          <p>Junior accounts are private by default. We do not use junior data for behavioral advertising or profiling. Juniors are excluded from public and unrestricted player discovery. Only authenticated players who are already accepted friends or share an active league may discover a junior. Direct messages involving a junior require both an accepted friendship and an active shared league; organizers communicate with juniors through shared league channels.</p>
          <p>We do not publish a junior&apos;s precise location. Device location is optional, is used only while the nearby feature is active, and can be replaced with manual city, league-location, or court selection. Profile photos and other uploads follow our moderation and audience controls.</p>
          <p>If we learn that an account belongs to someone below the applicable minimum age, we restrict the account while a trained reviewer handles deletion, preservation required by law, and any safety escalation. A parent, guardian, or other person can report an underage account or ask questions at beachleaguevb@gmail.com.</p>


          <h3>9. Changes to This Privacy Policy</h3>
          <p>We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or other factors. We will notify you of any material changes by:</p>
          <ul>
            <li>Updating the &quot;Last updated&quot; date at the top of this policy</li>
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
