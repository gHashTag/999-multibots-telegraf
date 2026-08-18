import { useLanguage } from '@/hooks/useLanguage';
import './Testimonials.css';

const testimonials = [
  {
    id: 1,
    avatar: null,
    name: 'Maria S.',
    role: 'testimonials.role1',
    quote: 'testimonials.quote1',
    rating: 5,
  },
  {
    id: 2,
    avatar: null,
    name: 'Alex P.',
    role: 'testimonials.role2',
    quote: 'testimonials.quote2',
    rating: 5,
  },
  {
    id: 3,
    avatar: null,
    name: 'Elena K.',
    role: 'testimonials.role3',
    quote: 'testimonials.quote3',
    rating: 5,
  },
  {
    id: 4,
    avatar: null,
    name: 'Dmitry V.',
    role: 'testimonials.role4',
    quote: 'testimonials.quote4',
    rating: 5,
  },
];

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="testimonial-stars">
      {[...Array(5)].map((_, i) => (
        <svg
          key={i}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill={i < rating ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

export function Testimonials() {
  const { t } = useLanguage();

  return (
    <section className="testimonials">
      <div className="testimonials-container">
        <div className="testimonials-header">
          <span className="testimonials-badge">{t('testimonials.badge')}</span>
          <h2 className="testimonials-title">{t('testimonials.title')}</h2>
          <p className="testimonials-subtitle">{t('testimonials.subtitle')}</p>
        </div>

        <div className="testimonials-grid">
          {testimonials.map((testimonial, index) => (
            <div
              className="testimonial-card"
              key={testimonial.id}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <StarRating rating={testimonial.rating} />

              <blockquote className="testimonial-quote">
                "{t(testimonial.quote)}"
              </blockquote>

              <div className="testimonial-author">
                <div className="testimonial-avatar">
                  <div className="testimonial-avatar-placeholder">
                    {testimonial.name.charAt(0)}
                  </div>
                </div>
                <div className="testimonial-author-info">
                  <span className="testimonial-name">{testimonial.name}</span>
                  <span className="testimonial-role">{t(testimonial.role)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
