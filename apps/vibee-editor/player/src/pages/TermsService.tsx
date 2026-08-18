import { Link } from 'react-router-dom';
import { Header } from '@/components/Header';
import './Legal.css';

function TermsServicePage() {
  return (
    <div className="legal-page">
      <Header />
      <main className="legal-content">
        <div className="legal-container">
          <h1>Terms of Service</h1>
          <p className="legal-updated">Last updated: December 30, 2025</p>

          <section>
            <h2>1. Agreement to Terms</h2>
            <p>
              By accessing or using VIBEE ("Service"), you agree to be bound by these Terms of Service ("Terms").
              If you do not agree to these Terms, please do not use our Service.
            </p>
          </section>

          <section>
            <h2>2. Description of Service</h2>
            <p>
              VIBEE is a video editing and content creation platform that allows users to create, edit, and share
              video content. Our services include AI-powered video generation, editing tools, and social media integration.
            </p>
          </section>

          <section>
            <h2>3. Account Registration</h2>
            <ul>
              <li>You must be at least 13 years old to use our Service.</li>
              <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
              <li>You agree to provide accurate and complete information when creating an account.</li>
              <li>You are responsible for all activities that occur under your account.</li>
            </ul>
          </section>

          <section>
            <h2>4. User Content</h2>

            <h3>4.1 Your Content</h3>
            <p>
              You retain ownership of content you create and upload to our Service. By uploading content,
              you grant us a worldwide, non-exclusive, royalty-free license to use, reproduce, modify,
              and display your content for the purpose of providing our services.
            </p>

            <h3>4.2 Content Guidelines</h3>
            <p>You agree not to upload or create content that:</p>
            <ul>
              <li>Violates any applicable law or regulation</li>
              <li>Infringes on intellectual property rights of others</li>
              <li>Contains hate speech, harassment, or discrimination</li>
              <li>Is sexually explicit or pornographic</li>
              <li>Promotes violence or illegal activities</li>
              <li>Contains malware or harmful code</li>
              <li>Impersonates others or is misleading</li>
            </ul>

            <h3>4.3 Content Removal</h3>
            <p>
              We reserve the right to remove any content that violates these Terms or our community guidelines
              without prior notice.
            </p>
          </section>

          <section>
            <h2>5. Intellectual Property</h2>
            <p>
              The Service, including its original content, features, and functionality, is owned by VIBEE
              and protected by international copyright, trademark, and other intellectual property laws.
            </p>
          </section>

          <section>
            <h2>6. Third-Party Services</h2>
            <p>
              Our Service integrates with third-party platforms including Instagram, Facebook, and Telegram.
              Your use of these integrations is subject to the terms and privacy policies of those platforms.
            </p>
          </section>

          <section>
            <h2>7. Payment Terms</h2>
            <ul>
              <li>Some features of our Service require payment.</li>
              <li>All fees are non-refundable unless otherwise stated.</li>
              <li>We may change our pricing at any time with reasonable notice.</li>
              <li>You are responsible for all applicable taxes.</li>
            </ul>
          </section>

          <section>
            <h2>8. Prohibited Uses</h2>
            <p>You agree not to:</p>
            <ul>
              <li>Use the Service for any illegal purpose</li>
              <li>Attempt to gain unauthorized access to our systems</li>
              <li>Interfere with or disrupt the Service</li>
              <li>Use automated systems to access the Service without permission</li>
              <li>Reverse engineer or attempt to extract source code</li>
              <li>Use the Service to send spam or unsolicited messages</li>
              <li>Violate any applicable laws or regulations</li>
            </ul>
          </section>

          <section>
            <h2>9. Disclaimer of Warranties</h2>
            <p>
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER
              EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE,
              OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS.
            </p>
          </section>

          <section>
            <h2>10. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, VIBEE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
              SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER
              INCURRED DIRECTLY OR INDIRECTLY.
            </p>
          </section>

          <section>
            <h2>11. Indemnification</h2>
            <p>
              You agree to indemnify and hold harmless VIBEE and its officers, directors, employees, and agents
              from any claims, damages, losses, liabilities, and expenses arising out of your use of the Service
              or violation of these Terms.
            </p>
          </section>

          <section>
            <h2>12. Termination</h2>
            <p>
              We may terminate or suspend your account and access to the Service immediately, without prior
              notice, for any reason, including breach of these Terms. Upon termination, your right to use
              the Service will immediately cease.
            </p>
          </section>

          <section>
            <h2>13. Changes to Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. We will provide notice of significant
              changes by posting the new Terms on this page and updating the "Last updated" date.
            </p>
          </section>

          <section>
            <h2>14. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with applicable laws, without
              regard to conflict of law principles.
            </p>
          </section>

          <section>
            <h2>15. Contact Us</h2>
            <p>
              If you have questions about these Terms, please contact us at:
            </p>
            <ul>
              <li>Email: <a href="mailto:reactnativeinitru@gmail.com">reactnativeinitru@gmail.com</a></li>
              <li>Telegram: <a href="https://telegram.me/vibee_super_agent" target="_blank" rel="noopener noreferrer">@vibee_super_agent</a></li>
            </ul>
          </section>

          <div className="legal-back">
            <Link to="/">← Back to Home</Link>
          </div>
        </div>
      </main>
    </div>
  );
}

export default TermsServicePage;
