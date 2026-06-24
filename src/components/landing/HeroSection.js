import PropTypes from 'prop-types';
import { isExternalUrl, getImageLoadingProps } from './utils';
import ResponsiveImage from './ResponsiveImage';

function HeroSection({ hero, onPrimaryCtaClick, onSecondaryCtaClick }) {
  if (!hero) {
    return null;
  }

  const {
    headline,
    subheadline,
    description,
    bullets = [],
    cta,
    secondaryCta,
    guarantee,
    productImage,
  badgeImages = [],
  paymentImage,
    testimonial,
    reviewHighlightImage,
  } = hero;

  const handlePrimaryClick = (event) => {
    if (onPrimaryCtaClick) {
      event.preventDefault();
      onPrimaryCtaClick(event);
    }
  };

  const handleSecondaryClick = (event) => {
    if (onSecondaryCtaClick) {
      event.preventDefault();
      onSecondaryCtaClick(event);
    }
  };

  return (
    <section className="hero" data-landing-part="hero">
      <div className="hero__content">
        <div className="hero__copy">
          {headline && <h1>{headline}</h1>}
          {subheadline && <h2>{subheadline}</h2>}
          {description && <p className="hero__description">{description}</p>}

          {!!bullets.length && (
            <ul className="hero__bullets">
              {bullets.map((bullet) => (
                <li key={bullet}>
                  <span className="hero__bullet-icon" aria-hidden="true">
                    <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
                      <path d="M6.00039 11.1999L3.20039 8.3999L2.26672 9.33324L6.00039 13.0666L14.0004 5.06657L13.0671 4.13324L6.00039 11.1999Z" />
                    </svg>
                  </span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="hero__actions">
            {cta?.href && (
              <a
                className="hero__cta hero__cta--primary"
                href={cta.href}
                target={isExternalUrl(cta.href) ? '_blank' : undefined}
                rel={isExternalUrl(cta.href) ? 'noreferrer' : undefined}
                onClick={handlePrimaryClick}
              >
                {cta.label || 'Learn more'}
              </a>
            )}
            {secondaryCta?.href && (
              <a
                className="hero__cta hero__cta--secondary"
                href={secondaryCta.href}
                target={isExternalUrl(secondaryCta.href) ? '_blank' : undefined}
                rel={isExternalUrl(secondaryCta.href) ? 'noreferrer' : undefined}
                onClick={handleSecondaryClick}
              >
                {secondaryCta.label || 'Discover now'}
              </a>
            )}
          </div>

          {guarantee && (
            <div className="hero__guarantee">
              {guarantee.tagline && <strong>{guarantee.tagline}</strong>}
              {guarantee.supportingCopy && <span>{guarantee.supportingCopy}</span>}
            </div>
          )}

          {(badgeImages.length || paymentImage?.src || reviewHighlightImage?.src) && (
            <div className="hero__support">
              {!!badgeImages.length && (
                <ul className="hero__badges">
                  {badgeImages.map((badge) => (
                    <li key={badge.src}>
                      {badge.src ? (
                        <ResponsiveImage
                          src={badge.src}
                          alt={badge.alt || badge.label}
                          {...getImageLoadingProps({ aboveFold: true })}
                        />
                      ) : null}
                      {badge.label && <span>{badge.label}</span>}
                    </li>
                  ))}
                </ul>
              )}
              {(paymentImage?.src || reviewHighlightImage?.src) && (
                <div className="hero__support-row">
                  {paymentImage?.src ? (
                    <ResponsiveImage
                      className="hero__payment"
                      src={paymentImage.src}
                      alt={paymentImage.alt || 'Payment methods'}
                      {...getImageLoadingProps({ aboveFold: true })}
                    />
                  ) : null}

                  {reviewHighlightImage?.src ? (
                    <div className="hero__reviews">
                      <ResponsiveImage
                        src={reviewHighlightImage.src}
                        alt={reviewHighlightImage.alt || 'Customer reviews'}
                        {...getImageLoadingProps({ aboveFold: true })}
                      />
                      {reviewHighlightImage.label ? <span>{reviewHighlightImage.label}</span> : null}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>

        {(productImage?.src || testimonial) && (
          <div className="hero__media">
            {productImage?.src ? (
              <ResponsiveImage
                className="hero__product"
                src={productImage.src}
                alt={productImage.alt || 'Featured product'}
                {...getImageLoadingProps({ aboveFold: true })}
              />
            ) : null}

            {testimonial && (
              <figure className="hero__testimonial">
                {testimonial.avatar ? (
                  <ResponsiveImage
                    src={testimonial.avatar}
                    alt={testimonial.name ? `${testimonial.name} testimonial` : 'Customer testimonial'}
                    {...getImageLoadingProps({ aboveFold: true })}
                  />
                ) : null}
                <blockquote>
                  {testimonial.quote}
                </blockquote>
                {testimonial.name && <figcaption>{testimonial.name}</figcaption>}
              </figure>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

HeroSection.propTypes = {
  hero: PropTypes.shape({
    headline: PropTypes.string,
    subheadline: PropTypes.string,
    description: PropTypes.string,
    bullets: PropTypes.arrayOf(PropTypes.string),
    cta: PropTypes.shape({
      label: PropTypes.string,
      href: PropTypes.string,
    }),
    secondaryCta: PropTypes.shape({
      label: PropTypes.string,
      href: PropTypes.string,
    }),
    guarantee: PropTypes.shape({
      tagline: PropTypes.string,
      supportingCopy: PropTypes.string,
    }),
    productImage: PropTypes.shape({
      src: PropTypes.string,
      alt: PropTypes.string,
    }),
    badgeImages: PropTypes.arrayOf(
      PropTypes.shape({
        src: PropTypes.string,
        alt: PropTypes.string,
        label: PropTypes.string,
      }),
    ),
    paymentImage: PropTypes.shape({
      src: PropTypes.string,
      alt: PropTypes.string,
    }),
    testimonial: PropTypes.shape({
      name: PropTypes.string,
      quote: PropTypes.string,
      avatar: PropTypes.string,
    }),
    reviewHighlightImage: PropTypes.shape({
      src: PropTypes.string,
      alt: PropTypes.string,
      label: PropTypes.string,
    }),
  }),
  onPrimaryCtaClick: PropTypes.func,
  onSecondaryCtaClick: PropTypes.func,
};

export default HeroSection;
