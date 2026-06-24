import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import ResponsiveImage from './landing/ResponsiveImage';
import './StripeCheckout.css';

const STATUS = {
  loading: 'loading',
  success: 'success',
  error: 'error',
};

const SUCCESS_ICON = (
  <svg width="16" height="14" viewBox="0 0 16 14" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M15.4695 0.232963C15.8241 0.561287 15.8454 1.1149 15.5171 1.46949L6.14206 11.5945C5.97228 11.7778 5.73221 11.8799 5.48237 11.8748C5.23253 11.8698 4.99677 11.7582 4.83452 11.5681L0.459523 6.44311C0.145767 6.07557 0.18937 5.52327 0.556912 5.20951C0.924454 4.89575 1.47676 4.93936 1.79051 5.3069L5.52658 9.68343L14.233 0.280522C14.5613 -0.0740672 15.1149 -0.0953599 15.4695 0.232963Z"
      fill="white"
    />
  </svg>
);

const ERROR_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M1.25628 1.25628C1.59799 0.914573 2.15201 0.914573 2.49372 1.25628L8 6.76256L13.5063 1.25628C13.848 0.914573 14.402 0.914573 14.7437 1.25628C15.0854 1.59799 15.0854 2.15201 14.7437 2.49372L9.23744 8L14.7437 13.5063C15.0854 13.848 15.0854 14.402 14.7437 14.7437C14.402 15.0854 13.848 15.0854 13.5063 14.7437L8 9.23744L2.49372 14.7437C2.15201 15.0854 1.59799 15.0854 1.25628 14.7437C0.914573 14.402 0.914573 13.848 1.25628 13.5063L6.76256 8L1.25628 2.49372C0.914573 2.15201 0.914573 1.59799 1.25628 1.25628Z"
      fill="white"
    />
  </svg>
);

const DEFAULT_THANK_YOU = {
  headline: 'Thank you for your purchase!',
  subheadline: 'Your order is confirmed.',
  description: 'Check your inbox for a receipt and shipping updates within the next 24 hours.',
  supportingCopy: '',
  cta: {
    label: 'Back to home',
    href: '/',
  },
  image: {
    src: '',
    alt: '',
  },
};

const sanitizeThankYouContent = (config) => {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return { ...DEFAULT_THANK_YOU };
  }

  const safeCta = !config.cta || typeof config.cta !== 'object' || Array.isArray(config.cta)
    ? DEFAULT_THANK_YOU.cta
    : config.cta;

  const safeImage = !config.image || typeof config.image !== 'object' || Array.isArray(config.image)
    ? DEFAULT_THANK_YOU.image
    : config.image;

  return {
    headline: config.headline || DEFAULT_THANK_YOU.headline,
    subheadline: config.subheadline || DEFAULT_THANK_YOU.subheadline,
    description: config.description || DEFAULT_THANK_YOU.description,
    supportingCopy: config.supportingCopy || '',
    cta: {
      label: safeCta.label || DEFAULT_THANK_YOU.cta.label,
      href: safeCta.href || DEFAULT_THANK_YOU.cta.href,
    },
    image: {
      src: safeImage.src || '',
      alt: safeImage.alt || '',
    },
  };
};

const clearSessionIdFromUrl = () => {
  if (typeof window === 'undefined' || typeof window.history === 'undefined') {
    return;
  }

  try {
    const url = new URL(window.location.href);

    if (!url.searchParams.has('session_id')) {
      return;
    }

    url.searchParams.delete('session_id');
    const newSearch = url.searchParams.toString();
    const newUrl = `${url.pathname}${newSearch ? `?${newSearch}` : ''}${url.hash}`;
    window.history.replaceState(null, document.title, newUrl);
  } catch (_error) {
    // Ignore URL update failures (e.g., unsupported environments)
  }
};

function StripeCheckoutReturn({ sessionId, apiBase, thankYou, onRequestClose }) {
  const [status, setStatus] = useState(STATUS.loading);
  const [error, setError] = useState('');
  const [sessionDetails, setSessionDetails] = useState({
    status: '',
    paymentStatus: '',
    paymentIntentId: '',
    paymentIntentStatus: '',
  });
  const thankYouContent = useMemo(() => sanitizeThankYouContent(thankYou), [thankYou]);

  const requestUrl = useMemo(() => {
    const trimmedBase = typeof apiBase === 'string' && apiBase.trim()
      ? apiBase.trim().replace(/\/$/, '')
      : '/api';
    const baseWithSlash = `${trimmedBase}/session-status`;
    return `${baseWithSlash}?session_id=${encodeURIComponent(sessionId || '')}`;
  }, [apiBase, sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setStatus(STATUS.error);
      setError('Missing session reference.');
      return;
    }

    const controller = new AbortController();

    const fetchStatus = async () => {
      try {
        const response = await fetch(requestUrl, { signal: controller.signal });
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(data?.error || 'Unable to retrieve checkout session.');
        }

        setSessionDetails({
          status: data.status || '',
          paymentStatus: data.payment_status || '',
          paymentIntentId: data.payment_intent_id || '',
          paymentIntentStatus: data.payment_intent_status || '',
        });
        setStatus(data.status === 'complete' ? STATUS.success : STATUS.error);
      } catch (err) {
        if (err.name === 'AbortError') {
          return;
        }

        setStatus(STATUS.error);
        setError(err.message || 'Unable to retrieve checkout session.');
      }
    };

    fetchStatus();

    return () => {
      controller.abort();
    };
  }, [requestUrl, sessionId]);

  useEffect(() => {
    if (status === STATUS.success) {
      clearSessionIdFromUrl();
    }
  }, [status]);

  const { headline, subheadline, description, supportingCopy, cta, image } = thankYouContent;

  const handleCtaClick = useCallback(
    (event) => {
      const href = (cta?.href || '').trim();

      if (!href || href === '#') {
        event.preventDefault();
      }

      clearSessionIdFromUrl();

      onRequestClose?.();

      if (!href || href === '#' || href.startsWith('#')) {
        return;
      }
    },
    [cta, onRequestClose],
  );

  const handleDismissClick = useCallback(() => {
    clearSessionIdFromUrl();
    onRequestClose?.();
  }, [onRequestClose]);

  if (status === STATUS.loading) {
    return <div className="stripe-status-message" role="status">Finalizing your trial...</div>;
  }

  if (status !== STATUS.success) {
    if (!sessionDetails.paymentIntentId) {
      return <div className="stripe-status-message" role="alert">{error}</div>;
    }

    const iconColor = '#DF1B41';
    const paymentIntentLink = `https://dashboard.stripe.com/payments/${sessionDetails.paymentIntentId}`;

    return (
      <div id="payment-status" className="stripe-return-wrapper" role="alert">
        <div id="status-icon" className="stripe-status-icon" style={{ backgroundColor: iconColor }}>
          {ERROR_ICON}
        </div>
        <h2 id="status-text">{error || 'Something went wrong, please try again.'}</h2>
        <div id="details-table" className="stripe-return-table">
          <table>
            <tbody>
              <tr>
                <td className="TableLabel">Payment Intent ID</td>
                <td id="intent-id" className="TableContent">{sessionDetails.paymentIntentId || '—'}</td>
              </tr>
              <tr>
                <td className="TableLabel">Session Status</td>
                <td id="session-status" className="TableContent">{sessionDetails.status || '—'}</td>
              </tr>
              <tr>
                <td className="TableLabel">Payment Status</td>
                <td className="TableContent">{sessionDetails.paymentStatus || '—'}</td>
              </tr>
              <tr>
                <td className="TableLabel">Payment Intent Status</td>
                <td id="payment-intent-status" className="TableContent">{sessionDetails.paymentIntentStatus || '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {sessionDetails.paymentIntentId ? (
          <a
            href={paymentIntentLink}
            id="view-details"
            className="stripe-return-link"
            rel="noopener noreferrer"
            target="_blank"
          >
            View details
            <svg
              width="15"
              height="14"
              viewBox="0 0 15 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M3.125 3.49998C2.64175 3.49998 2.25 3.89173 2.25 4.37498V11.375C2.25 11.8582 2.64175 12.25 3.125 12.25H10.125C10.6082 12.25 11 11.8582 11 11.375V9.62498C11 9.14173 11.3918 8.74998 11.875 8.74998C12.3582 8.74998 12.75 9.14173 12.75 9.62498V11.375C12.75 12.8247 11.5747 14 10.125 14H3.125C1.67525 14 0.5 12.8247 0.5 11.375V4.37498C0.5 2.92524 1.67525 1.74998 3.125 1.74998H4.875C5.35825 1.74998 5.75 2.14173 5.75 2.62498C5.75 3.10823 5.35825 3.49998 4.875 3.49998H3.125Z"
                fill="#0055DE"
              />
              <path
                d="M8.66672 0C8.18347 0 7.79172 0.391751 7.79172 0.875C7.79172 1.35825 8.18347 1.75 8.66672 1.75H11.5126L4.83967 8.42295C4.49796 8.76466 4.49796 9.31868 4.83967 9.66039C5.18138 10.0021 5.7354 10.0021 6.07711 9.66039L12.7501 2.98744V5.83333C12.7501 6.31658 13.1418 6.70833 13.6251 6.70833C14.1083 6.70833 14.5001 6.31658 14.5001 5.83333V0.875C14.5001 0.391751 14.1083 0 13.6251 0H8.66672Z"
                fill="#0055DE"
              />
            </svg>
          </a>
        ) : null}
        <button
          type="button"
          id="retry-button"
          className="stripe-return-link"
          onClick={handleDismissClick}
        >
          Close
        </button>
      </div>
    );
  }

  const orderReference = sessionDetails.paymentIntentId || '';

  return (
    <div className="checkout-thankyou" role="status">
      <div className="checkout-thankyou__content">
        <div className="checkout-thankyou__status">
          <span className="checkout-thankyou__status-icon">{SUCCESS_ICON}</span>
          <span className="checkout-thankyou__status-label">Trial authorized</span>
        </div>
        <h2 className="checkout-thankyou__headline">{headline}</h2>
        {subheadline ? <p className="checkout-thankyou__subheadline">{subheadline}</p> : null}
        {description ? <p className="checkout-thankyou__description">{description}</p> : null}
        {orderReference ? (
          <p className="checkout-thankyou__reference">
            Order reference: <span>{orderReference}</span>
          </p>
        ) : null}
        {supportingCopy ? <p className="checkout-thankyou__supporting">{supportingCopy}</p> : null}
        <div className="checkout-thankyou__actions">
          {cta?.label ? (
            <a
              href={cta.href || '#'}
              className="checkout-thankyou__cta btn btn-primary btn-one-style"
              onClick={handleCtaClick}
            >
              {cta.label}
            </a>
          ) : null}
          {onRequestClose ? (
            <button
              type="button"
              className="checkout-thankyou__dismiss"
              onClick={handleDismissClick}
            >
              Close
            </button>
          ) : null}
        </div>
      </div>
      {image?.src ? (
        <div className="checkout-thankyou__media">
          <ResponsiveImage
            src={image.src}
            alt={image.alt || 'Thank you illustration'}
            className="checkout-thankyou__image"
            loading="lazy"
          />
        </div>
      ) : null}
    </div>
  );
}

StripeCheckoutReturn.propTypes = {
  sessionId: PropTypes.string,
  apiBase: PropTypes.string,
  thankYou: PropTypes.shape({
    headline: PropTypes.string,
    subheadline: PropTypes.string,
    description: PropTypes.string,
    supportingCopy: PropTypes.string,
    cta: PropTypes.shape({
      label: PropTypes.string,
      href: PropTypes.string,
    }),
    image: PropTypes.shape({
      src: PropTypes.string,
      alt: PropTypes.string,
    }),
  }),
  onRequestClose: PropTypes.func,
};

export default StripeCheckoutReturn;
