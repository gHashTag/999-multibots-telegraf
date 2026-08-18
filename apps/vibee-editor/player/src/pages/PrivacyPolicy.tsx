import { Link } from 'react-router-dom';
import { Header } from '@/components/Header';
import './Legal.css';

function PrivacyPolicyPage() {
  return (
    <div className="legal-page">
      <Header />
      <main className="legal-content">
        <div className="legal-container">
          <h1>Privacy Policy</h1>
          <p className="legal-updated">Last updated: December 30, 2025</p>

          <section>
            <h2>1. Introduction</h2>
            <p>
              Welcome to VIBEE ("we", "our", or "us"). We are committed to protecting your personal information
              and your right to privacy. This Privacy Policy explains how we collect, use, disclose, and
              safeguard your information when you use our video editing application and related services.
            </p>
          </section>

          <section>
            <h2>2. Information We Collect</h2>

            <h3>2.1 Information You Provide</h3>
            <ul>
              <li><strong>Account Information:</strong> When you create an account, we collect your name, email address, and profile information from connected social accounts (Telegram, Instagram, Facebook).</li>
              <li><strong>Content:</strong> Videos, images, and other media you upload or create using our services.</li>
              <li><strong>Communications:</strong> Messages you send through our platform or to our support team.</li>
            </ul>

            <h3>2.2 Automatically Collected Information</h3>
            <ul>
              <li><strong>Device Information:</strong> Device type, operating system, browser type, and unique device identifiers.</li>
              <li><strong>Usage Data:</strong> How you interact with our services, including features used and time spent.</li>
              <li><strong>Log Data:</strong> IP address, access times, and pages viewed.</li>
            </ul>

            <h3>2.3 Third-Party Information</h3>
            <p>
              When you connect social media accounts (Instagram, Facebook, Telegram), we may receive information
              from these platforms in accordance with their privacy policies and your privacy settings.
            </p>
          </section>

          <section>
            <h2>3. How We Use Your Information</h2>
            <p>We use your information to:</p>
            <ul>
              <li>Provide, maintain, and improve our services</li>
              <li>Process and complete transactions</li>
              <li>Send you technical notices and support messages</li>
              <li>Respond to your comments and questions</li>
              <li>Analyze usage patterns to improve user experience</li>
              <li>Detect, prevent, and address technical issues</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2>4. Information Sharing</h2>
            <p>We may share your information with:</p>
            <ul>
              <li><strong>Service Providers:</strong> Third-party vendors who perform services on our behalf (hosting, analytics, payment processing).</li>
              <li><strong>Social Media Platforms:</strong> When you choose to share content or connect your accounts.</li>
              <li><strong>Legal Requirements:</strong> When required by law or to protect our rights.</li>
              <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets.</li>
            </ul>
          </section>

          <section>
            <h2>5. Data Security</h2>
            <p>
              We implement appropriate technical and organizational measures to protect your personal information.
              However, no method of transmission over the Internet is 100% secure. We cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2>6. Data Retention</h2>
            <p>
              We retain your personal information for as long as necessary to provide our services and fulfill
              the purposes described in this policy, unless a longer retention period is required by law.
            </p>
          </section>

          <section>
            <h2>7. Your Rights</h2>
            <p>Depending on your location, you may have the right to:</p>
            <ul>
              <li>Access your personal information</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Object to processing of your data</li>
              <li>Data portability</li>
              <li>Withdraw consent</li>
            </ul>
            <p>To exercise these rights, please contact us at <a href="mailto:reactnativeinitru@gmail.com">reactnativeinitru@gmail.com</a>.</p>
          </section>

          <section>
            <h2>8. Children's Privacy</h2>
            <p>
              Our services are not intended for children under 13 years of age. We do not knowingly collect
              personal information from children under 13.
            </p>
          </section>

          <section>
            <h2>9. International Data Transfers</h2>
            <p>
              Your information may be transferred to and processed in countries other than your country of residence.
              We ensure appropriate safeguards are in place for such transfers.
            </p>
          </section>

          <section>
            <h2>10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting
              the new policy on this page and updating the "Last updated" date.
            </p>
          </section>

          <section>
            <h2>11. Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy, please contact us at:
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

export default PrivacyPolicyPage;
