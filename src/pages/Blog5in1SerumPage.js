import { useEffect } from 'react';
import ResponsiveImage from '../components/landing/ResponsiveImage';
import './Blog5in1SerumPage.css';

const HOME_URL = 'https://5in1facialserum.com';

const navigateHome = (event) => {
  if (event && typeof event.preventDefault === 'function') {
    event.preventDefault();
  }

  window.location.href = HOME_URL;
};

function PresaleLink({ children, className = '' }) {
  return (
    <a className={className} href={HOME_URL} onClick={navigateHome}>
      {children}
    </a>
  );
}

function PresaleButton({ children }) {
  return (
    <PresaleLink className="spq-button">
      {children}
    </PresaleLink>
  );
}

function Blog5in1SerumPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Skin Care Daily | 5in1 Facial Serum Trial';

    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <div className="spq-page">
      <a className="spq-skip" href="#main-content">
        Skip to main content
      </a>

      <div className="spq-header">
        <PresaleLink className="spq-logo" aria-label="Skin Care Daily home">
          <span className="spq-logo__icon">S</span>
          <span className="spq-logo__text">Skin Care Daily</span>
        </PresaleLink>
      </div>

      <main id="main-content">
        <article className="spq-article">
          <div className="spq-content">
            <h1 className="spq-title">A $0 Charged Today Anti-Aging Serum Trial</h1>
            <PresaleLink className="spq-small-link">
              If you are 40 and over, see how to try this 5-in-1 facial serum risk free.
            </PresaleLink>

            <ResponsiveImage
              className="spq-image"
              src="/assets/img/hero2.png"
              alt="Woman applying facial serum"
              loading="eager"
              decoding="auto"
            />

            <p>
              5in1 Facial Serum is being talked about by women who want a smoother, firmer-looking complexion without adding several separate products to their counter. The current offer lets eligible shoppers request a single trial bottle with $0 charged today.
            </p>
            <p>
              The idea is simple: try the serum in your own routine first. If the product is not returned, the $60 charge is applied. Shipping details are collected securely during checkout so the bottle can be sent directly to you.
            </p>
            <p>
              The trial is intended for shoppers who want to review the serum before committing to the full purchase. Availability can vary, so readers are directed to the official site to confirm the current offer.
            </p>

            <div className="spq-button-row">
              <PresaleButton>Check Eligibility</PresaleButton>
            </div>

            <h2 className="spq-section-title">What Does This Mean For Women Over 40?</h2>
            <p>
              A daily serum can be easier to stick with than a complicated routine. 5in1 Facial Serum is made for people who want visible hydration, a smoother-looking surface, and a more refreshed appearance from one consistent step.
            </p>
            <p>
              The trial is designed to remove the usual hesitation around trying a new skincare product. You can start with one bottle, use it as directed, and decide whether it belongs in your routine.
            </p>

            <ResponsiveImage
              className="spq-image"
              src="/assets/img/before.png"
              alt="Before and after skincare comparison"
              loading="lazy"
              decoding="async"
            />

            <p>
              The offer is currently focused on a single risk-free 7-day trial bottle. Your card is not charged today; the $60 payment is charged only if the product is not returned.
            </p>

            <div className="spq-button-row">
              <PresaleButton>
                See If You Qualify
                {' '}
                <span aria-hidden="true">›</span>
              </PresaleButton>
            </div>

            <p>
              Quick recap: 5in1 Facial Serum is an all-in-one facial serum for women who want a cleaner, simpler anti-aging skincare routine. Trial availability can be limited by current inventory and shipping coverage.
            </p>

            <ResponsiveImage
              className="spq-image"
              src="/assets/img/right.png"
              alt="Smiling woman holding skincare products"
              loading="lazy"
              decoding="async"
            />

            <p>
              If you want to try the serum, use the official link below. It will take you to the current 5in1 Facial Serum offer page where you can review the trial details and continue to secure checkout.
            </p>

            <div className="spq-button-row">
              <PresaleButton>Risk-Free Trial</PresaleButton>
            </div>

            <ResponsiveImage
              className="spq-image"
              src="/assets/img/5-img.png"
              alt="5in1 Facial Serum ingredients"
              loading="lazy"
              decoding="async"
            />

            <h2 className="spq-section-title">How Do I See If I Qualify?</h2>
            <p>
              Visit
              {' '}
              <PresaleLink>5in1FacialSerum.com</PresaleLink>
              {' '}
              and review the current trial details. The process takes less than a minute, and checkout is handled securely.
            </p>

            <div className="spq-button-row">
              <PresaleButton>Check My Eligibility</PresaleButton>
            </div>

            <p className="spq-disclaimer">
              Your privacy is important to us, and we take the security of your information seriously. Information submitted is used to process and communicate with you about skincare. By submitting information, you agree to the
              {' '}
              <PresaleLink>Terms of Service</PresaleLink>
              {' '}
              and
              {' '}
              <PresaleLink>Privacy Policy</PresaleLink>
              .
            </p>
          </div>
        </article>
      </main>
    </div>
  );
}

export default Blog5in1SerumPage;
