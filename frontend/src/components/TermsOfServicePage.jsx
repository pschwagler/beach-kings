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
          <p><strong>Last updated:</strong> December 2, 2024</p>
          
          <p>These Terms of Service ("Terms") govern your access to and use of Beach League, a beach volleyball league management platform operated by Patrick Schwagler, located in New York ("we," "us," or "our"). By accessing or using our services, you agree to be bound by these Terms.</p>

          <h3>1. Acceptance of Terms</h3>
          <p>By creating an account, accessing, or using Beach League (the "Service"), you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree to these Terms, you may not access or use our Service.</p>
          
          <h3>2. Eligibility</h3>
          <p>You must be at least 18 years of age to use this Service. By using the Service, you represent and warrant that you are at least 18 years old and have the legal capacity to enter into these Terms. The Service is intended for users in the United States.</p>

          <h3>3. Description of Service</h3>
          <p>Beach League provides a platform for managing beach volleyball leagues, tracking game statistics, calculating player rankings using an ELO rating system, scheduling sessions, managing league memberships, and related features. The Service is provided for recreational and organizational purposes.</p>

          <h3>4. User Accounts and Registration</h3>
          <p>To use certain features of the Service, you must create an account. You agree to:</p>
          <ul>
            <li>Provide accurate, current, and complete information during registration</li>
            <li>Maintain and promptly update your account information</li>
            <li>Maintain the confidentiality of your account credentials</li>
            <li>Accept responsibility for all activities that occur under your account</li>
            <li>Notify us immediately of any unauthorized access or security breach</li>
          </ul>
          <p>We reserve the right to suspend or terminate accounts that violate these Terms or provide false information.</p>

          <h3>5. SMS/Mobile Messaging and TCPA Compliance</h3>
          <p>By providing your phone number and creating an account, you expressly consent to receive SMS text messages from Beach League for account verification purposes. This includes one-time verification codes sent via our SMS service provider (Twilio).</p>
          
          <p><strong>Message Frequency:</strong> Message frequency varies. You will primarily receive messages for account verification and authentication purposes.</p>
          
          <p><strong>Message and Data Rates:</strong> Message and data rates may apply based on your mobile carrier's plan. Please consult with your carrier for details.</p>
          
          <p><strong>Opt-Out:</strong> You can opt out of receiving SMS messages at any time by replying <strong>STOP</strong> to any message. Note that opting out may affect your ability to use certain features that require phone verification.</p>
          
          <p><strong>Help:</strong> For assistance, reply <strong>HELP</strong> to any message or contact us at beachleaguevb@gmail.com.</p>
          
          <p><strong>Supported Carriers:</strong> The Service is available on all major U.S. wireless carriers. Carriers are not liable for delayed or undelivered messages.</p>
          
          <p><strong>Privacy:</strong> Your phone number and SMS data will be used solely for the purposes described in our Privacy Policy. We do not share your mobile information with third parties for marketing purposes.</p>

          <h3>6. User Conduct and Prohibited Activities</h3>
          <p>You agree not to engage in any of the following prohibited activities:</p>
          <ul>
            <li><strong>Harassment or Abuse:</strong> Harassing, threatening, intimidating, or abusing other users</li>
            <li><strong>Hate Speech:</strong> Posting content that promotes violence, discrimination, or hatred based on race, ethnicity, religion, gender, sexual orientation, disability, or other protected characteristics</li>
            <li><strong>Impersonation:</strong> Impersonating any person or entity, or falsely stating or misrepresenting your affiliation with any person or entity</li>
            <li><strong>False Information:</strong> Providing false, inaccurate, or misleading information about yourself, your statistics, or game results</li>
            <li><strong>Unauthorized Access:</strong> Attempting to gain unauthorized access to the Service, other user accounts, or computer systems</li>
            <li><strong>Automated Access:</strong> Using bots, scrapers, or automated means to access the Service without permission</li>
            <li><strong>Disruption:</strong> Interfering with or disrupting the Service or servers/networks connected to the Service</li>
            <li><strong>Illegal Activity:</strong> Using the Service for any illegal purpose or in violation of any local, state, national, or international law</li>
            <li><strong>Spam:</strong> Sending unsolicited or unauthorized advertising, promotional materials, spam, or any other form of solicitation</li>
            <li><strong>Intellectual Property Violation:</strong> Violating any intellectual property rights, including copyrights, trademarks, or patents</li>
          </ul>
          <p>We reserve the right to investigate violations and take appropriate action, including account suspension or termination, and cooperation with law enforcement.</p>

          <h3>7. Physical Activity and Sports Participation</h3>
          <p style={{ backgroundColor: '#fef2f2', padding: '1rem', borderRadius: '8px', border: '1px solid #fca5a5', margin: '1rem 0' }}>
            <strong>IMPORTANT - ASSUMPTION OF RISK:</strong> Beach volleyball and all sports activities involve inherent risks, including but not limited to the risk of physical injury, disability, or death. By using this Service to participate in, organize, or track volleyball games and leagues, you acknowledge and assume all risks associated with physical sports participation. You are solely responsible for assessing your own physical fitness and consulting with a physician before participating in any physical activity. BEACH LEAGUE AND ITS OPERATOR ARE NOT RESPONSIBLE FOR ANY INJURIES, ACCIDENTS, OR HEALTH ISSUES THAT OCCUR DURING VOLLEYBALL GAMES OR RELATED ACTIVITIES.
          </p>

          <h3>8. Intellectual Property Rights</h3>
          <p><strong>Our Content:</strong> The Service, including its design, features, text, graphics, logos, and software, is owned by us and protected by copyright, trademark, and other intellectual property laws. You may not copy, modify, distribute, sell, or reproduce any part of the Service without our written permission.</p>
          
          <p><strong>User Content:</strong> You retain ownership of any content you submit to the Service, including profile information, game results, and other data ("User Content"). By submitting User Content, you grant us a worldwide, non-exclusive, royalty-free license to use, display, reproduce, and distribute your User Content solely for the purpose of operating and improving the Service.</p>
          
          <p><strong>Feedback:</strong> Any feedback, suggestions, or ideas you provide about the Service become our property, and we may use them without compensation or attribution.</p>

          <h3>9. Fees and Payment</h3>
          <p>Currently, Beach League is provided free of charge. We reserve the right to introduce fees for certain features, services, or premium functionality in the future. If we introduce paid features, we will provide notice and obtain your consent before charging any fees. Any future fees will be clearly disclosed, and you will have the option to accept or decline paid services.</p>

          <h3>10. Disclaimers and Warranties</h3>
          <p style={{ textTransform: 'uppercase', backgroundColor: '#f0f0f0', padding: '1rem', borderRadius: '8px', margin: '1rem 0' }}>
            <strong>The Service is provided "as is" and "as available" without warranties of any kind, either express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that the Service will be uninterrupted, secure, or error-free, or that any defects will be corrected. We do not guarantee the accuracy, completeness, or reliability of any content, statistics, rankings, or information provided through the Service.</strong>
          </p>

          <h3>11. Limitation of Liability</h3>
          <p style={{ textTransform: 'uppercase', backgroundColor: '#f0f0f0', padding: '1rem', borderRadius: '8px', margin: '1rem 0' }}>
            <strong>To the maximum extent permitted by law, Beach League and its operator shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, use, goodwill, or other intangible losses, resulting from: (a) your access to or use of or inability to access or use the Service; (b) any conduct or content of any third party on the Service; (c) any content obtained from the Service; (d) unauthorized access, use, or alteration of your transmissions or content; or (e) any physical injuries or property damage arising from your participation in volleyball or sports activities, whether based on warranty, contract, tort (including negligence), or any other legal theory, whether or not we have been informed of the possibility of such damage.</strong>
          </p>
          <p style={{ textTransform: 'uppercase' }}>
            <strong>In no event shall our total liability to you for all claims exceed the amount of one hundred dollars ($100) or the amount you have paid us in the past twelve months, whichever is greater.</strong>
          </p>

          <h3>12. Indemnification</h3>
          <p>You agree to defend, indemnify, and hold harmless Beach League, its operator, and their respective affiliates, officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, costs, expenses, or fees (including reasonable attorneys' fees) arising from: (a) your use of the Service; (b) your violation of these Terms; (c) your violation of any rights of another party; (d) any injuries or damages arising from your participation in volleyball or sports activities; or (e) any content you submit to the Service.</p>

          <h3>13. Termination</h3>
          <p><strong>By You:</strong> You may terminate your account at any time by contacting us at beachleaguevb@gmail.com or using account deletion features within the Service.</p>
          
          <p><strong>By Us:</strong> We reserve the right to suspend or terminate your account and access to the Service immediately, without prior notice or liability, for any reason, including but not limited to:</p>
          <ul>
            <li>Violation of these Terms</li>
            <li>Fraudulent, abusive, or illegal activity</li>
            <li>Extended periods of inactivity</li>
            <li>At our discretion for operational or business reasons</li>
          </ul>
          <p>Upon termination, your right to use the Service will immediately cease. Provisions that by their nature should survive termination shall survive, including ownership provisions, warranty disclaimers, indemnity, and limitations of liability.</p>

          <h3>14. Dispute Resolution and Governing Law</h3>
          <p><strong>Governing Law:</strong> These Terms shall be governed by and construed in accordance with the laws of the State of New York, without regard to its conflict of law provisions.</p>
          
          <p><strong>Informal Resolution:</strong> Before filing any formal legal action, you agree to first contact us at beachleaguevb@gmail.com and attempt to resolve any dispute informally for at least 30 days.</p>
          
          <p><strong>Jurisdiction:</strong> If informal resolution is unsuccessful, any legal action or proceeding arising under these Terms shall be brought exclusively in the state or federal courts located in New York, and you consent to the personal jurisdiction of such courts.</p>

          <h3>15. Changes to Terms</h3>
          <p>We reserve the right to modify or replace these Terms at any time at our sole discretion. If we make material changes, we will provide notice by updating the "Last updated" date at the top of these Terms and, if you have an account, by sending a notice to your registered email address. Your continued use of the Service after such modifications constitutes your acceptance of the updated Terms. We encourage you to review these Terms periodically.</p>

          <h3>16. Severability</h3>
          <p>If any provision of these Terms is found to be unenforceable or invalid by a court of competent jurisdiction, that provision shall be limited or eliminated to the minimum extent necessary so that these Terms shall otherwise remain in full force and effect and enforceable.</p>

          <h3>17. Entire Agreement</h3>
          <p>These Terms, together with our Privacy Policy, constitute the entire agreement between you and Beach League regarding the Service and supersede all prior agreements and understandings, whether written or oral, regarding the subject matter.</p>

          <h3>18. Contact Information</h3>
          <p>If you have any questions, concerns, or requests regarding these Terms of Service, please contact us at:</p>
          <p><strong>Email:</strong> beachleaguevb@gmail.com</p>
          <p><strong>Service Name:</strong> Beach League</p>
          <p><strong>Location:</strong> New York, United States</p>
        </section>
      </main>
    </div>
  );
}
