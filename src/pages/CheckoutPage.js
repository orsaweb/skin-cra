import { useCallback, useMemo } from 'react';
import useLandingContent from '../hooks/useLandingContent';
import { BrandingStrip, FooterSection } from '../components/landing';
import ResponsiveImage from '../components/landing/ResponsiveImage';
import StripeCheckoutContainer from '../components/StripeCheckoutContainer';
import { resolveAssetPath } from '../components/landing/utils';
import './CheckoutPage.css';

const formatCurrency = (amount, currency = 'usd') => {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount)) {
    return '';
  }

  const normalizedCurrency = typeof currency === 'string' && currency ? currency.toUpperCase() : 'USD';

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
    }).format(numericAmount);
  } catch (_error) {
    return `$${numericAmount.toFixed(2)}`;
  }
};

function CheckoutPage() {
  const { content, isLoading, error } = useLandingContent();

  const checkout = content?.checkout;
  const products = useMemo(() => {
    if (!checkout || !Array.isArray(checkout.options)) {
      return [];
    }

    return checkout.options.filter(Boolean).slice(0, 1);
  }, [checkout]);

  const queryParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const requestedProductId = queryParams.get('product');

  const selectedOption = useMemo(() => {
    if (!products.length) {
      return null;
    }

    const fallback = products[0];

    if (!requestedProductId) {
      return fallback;
    }

    const match = products.find((option) => option?.id === requestedProductId);
    return match || fallback;
  }, [products, requestedProductId]);

  const checkoutConfig = useMemo(() => {
    if (!checkout || !selectedOption) {
      return null;
    }

    return {
      ...checkout,
      options: [selectedOption],
    };
  }, [checkout, selectedOption]);

  const pageHeading = useMemo(() => {
    if (!checkout) {
      return 'Complete Your Purchase';
    }

    if (typeof checkout.checkoutPageTitle === 'string') {
      const trimmed = checkout.checkoutPageTitle.trim();
      if (!trimmed) {
        return null;
      }
      return checkout.checkoutPageTitle;
    }

    const fallback = typeof checkout.heading === 'string' && checkout.heading.trim()
      ? checkout.heading
      : typeof checkout.title === 'string' && checkout.title.trim()
        ? checkout.title
        : '';

    return fallback || 'Complete Your Purchase';
  }, [checkout]);

  const productDetails = useMemo(() => {
    if (!selectedOption) {
      return null;
    }

    return {
      name: selectedOption?.name || 'Selected Product',
      description: selectedOption?.checkoutDescription || selectedOption?.description || '',
      price:
        selectedOption?.displayPrice
        || formatCurrency(
          selectedOption?.price,
          selectedOption?.currency || checkout?.currency || 'usd',
        ),
      subcopy: selectedOption?.subcopy || '',
      imageSrc: selectedOption?.image?.src ? resolveAssetPath(selectedOption.image.src) : '',
      imageAlt:
        selectedOption?.image?.alt
        || (selectedOption?.name ? `${selectedOption.name} product image` : 'Selected product image'),
      badge: selectedOption?.badge || '',
    };
  }, [checkout?.currency, selectedOption]);

  const handleBackToProducts = useCallback(() => {
    window.location.href = '/';
  }, []);

  let body = null;

  if (isLoading) {
    body = <div className="checkout-page__status">Preparing checkout…</div>;
  } else if (error) {
    body = (
      <div className="checkout-page__status checkout-page__status--error">
        Unable to load checkout details.
      </div>
    );
  } else if (!checkout || !checkoutConfig || !productDetails) {
    body = (
      <div className="checkout-page__status checkout-page__status--error">
        Checkout is unavailable right now.
      </div>
    );
  } else {
    body = (
      <div className="checkout-page__layout">
        <section className="checkout-page__details">
          <button type="button" className="checkout-page__back" onClick={handleBackToProducts}>
            Back to home
          </button>
          {pageHeading ? <h1>{pageHeading}</h1> : null}
          <article className="checkout-page__card">
            {productDetails.imageSrc ? (
              <div className="checkout-page__card-media">
                <ResponsiveImage src={productDetails.imageSrc} alt={productDetails.imageAlt} loading="lazy" />
              </div>
            ) : null}
            <div className="checkout-page__card-body">
              <h2>{productDetails.name}</h2>
              {productDetails.description ? (
                <p className="checkout-page__card-description">{productDetails.description}</p>
              ) : null}
              {productDetails.price ? (
                <span className="checkout-page__card-price">{productDetails.price}</span>
              ) : null}
              {productDetails.subcopy ? (
                <span className="checkout-page__card-subcopy">{productDetails.subcopy}</span>
              ) : null}
            </div>
          </article>
        </section>
        <section className="checkout-page__form" aria-live="polite">
          <StripeCheckoutContainer
            checkout={checkoutConfig}
            displayMode="inline"
            forceSelectedOptionId={selectedOption?.id || null}
            hideInlineOptions
          />
        </section>
      </div>
    );
  }

  return (
    <main className="checkout-page" data-landing-root>
      <BrandingStrip branding={content?.branding} />
      {body}
      <FooterSection footer={content?.footer} />
    </main>
  );
}

export default CheckoutPage;
