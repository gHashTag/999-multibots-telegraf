import {
  Header,
  Hero,
  FeedPreview,
  AgentConnect,
  Features,
  Technology,
  CreatorShowcase,
  Testimonials,
  HowItWorks,
  Pricing,
  Footer,
} from '@/components/landing'
import './Home.css'

function HomePage() {
  return (
    <div className="landing-page">
      <Header />
      <main>
        <Hero />
        <AgentConnect />
        <FeedPreview />
        <Features />
        <Technology />
        <CreatorShowcase />
        <Testimonials />
        <HowItWorks />
        <Pricing />
      </main>
      <Footer />
    </div>
  )
}

export default HomePage
