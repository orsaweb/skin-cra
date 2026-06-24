import PropTypes from 'prop-types';
import { isExternalUrl, getImageLoadingProps } from './utils';
import ResponsiveImage from './ResponsiveImage';

function FooterSection({ footer }) {
  if (!footer) {
    return null;
  }

  const { helpLinks = [], orderLinks = [], paymentImage, copyright } = footer;

  return (
    <footer className="landing-footer" data-landing-part="footer">
      <div className="landing-footer__links">
        {!!helpLinks.length && (
          <div>
            <ul>
              {helpLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target={isExternalUrl(link.href) ? '_blank' : undefined}
                    rel={isExternalUrl(link.href) ? 'noreferrer' : undefined}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!!orderLinks.length && (
          <div>
            <ul>
              {orderLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target={isExternalUrl(link.href) ? '_blank' : undefined}
                    rel={isExternalUrl(link.href) ? 'noreferrer' : undefined}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {paymentImage?.src ? (
          <ResponsiveImage
            className="landing-footer__payment"
            src={paymentImage.src}
            alt={paymentImage.alt || 'Payment methods'}
            {...getImageLoadingProps()}
          />
        ) : null}
      </div>
      {copyright && <p className="landing-footer__copyright">{copyright}</p>}
    </footer>
  );
}

FooterSection.propTypes = {
  footer: PropTypes.shape({
    blurb: PropTypes.string,
    logo: PropTypes.shape({
      src: PropTypes.string,
      alt: PropTypes.string,
    }),
    helpLinks: PropTypes.arrayOf(
      PropTypes.shape({
        label: PropTypes.string,
        href: PropTypes.string,
      }),
    ),
    orderLinks: PropTypes.arrayOf(
      PropTypes.shape({
        label: PropTypes.string,
        href: PropTypes.string,
      }),
    ),
    paymentImage: PropTypes.shape({
      src: PropTypes.string,
      alt: PropTypes.string,
    }),
    copyright: PropTypes.string,
  }),
};

export default FooterSection;
