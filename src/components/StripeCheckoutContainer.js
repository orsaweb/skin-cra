import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { CheckoutProvider } from '@stripe/react-stripe-js/checkout';
import { loadStripe } from '@stripe/stripe-js';
import StripeCheckoutForm from './StripeCheckoutForm';
import StripeCheckoutReturn from './StripeCheckoutReturn';
import './StripeCheckout.css';
import { resolveAssetPath } from './landing/utils';
import ResponsiveImage from './landing/ResponsiveImage';

const DEFAULT_METADATA = { source: 'skin-cra-demo' };

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

function StripeCheckoutContainer({
  checkout,
  onRequestClose,
  displayMode = 'modal',
  forceSelectedOptionId = null,
  hideInlineOptions = false,
}) {
  const productOptions = useMemo(
    () => (Array.isArray(checkout?.options) ? checkout.options.filter(Boolean).slice(0, 1) : []),
    [checkout?.options],
  );
  const hasProductOptions = productOptions.length > 0;
  const hasMultipleProductOptions = productOptions.length > 1;
  const isInline = displayMode === 'inline';

  const defaultOptionId = useMemo(() => {
    if (forceSelectedOptionId && productOptions.some((option) => option?.id === forceSelectedOptionId)) {
      return forceSelectedOptionId;
    }

    if (!hasProductOptions) {
      return null;
    }

    const preferred = productOptions.find((option) => option?.bestValue || option?.default);
    return preferred?.id || productOptions[0]?.id || null;
  }, [forceSelectedOptionId, hasProductOptions, productOptions]);

  const [clientSecret, setClientSecret] = useState('');
  const [message, setMessage] = useState(hasProductOptions ? '' : 'Preparing checkout...');
  const [isLoading, setIsLoading] = useState(!hasProductOptions);
  const [selectionError, setSelectionError] = useState('');
  const [selectedOptionId, setSelectedOptionId] = useState(defaultOptionId);
  const [activeSessionId, setActiveSessionId] = useState('');
  const [sessionId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('session_id');
  });

  const [stripePromise, setStripePromise] = useState(null);
  const lastFetchedOptionRef = useRef(null);

  const apiBase = useMemo(() => {
    const configured = process.env.REACT_APP_API_BASE_URL ? process.env.REACT_APP_API_BASE_URL.trim() : '';
    if (configured) {
      return configured.replace(/\/$/, '');
    }

    return process.env.REACT_APP_API_ROUTE_PREFIX?.replace(/\/$/, '') || '/api';
  }, []);

  const isReturnView = Boolean(sessionId);

  const selectedOption = useMemo(
    () => productOptions.find((option) => option?.id === selectedOptionId) || null,
    [productOptions, selectedOptionId],
  );

  useEffect(() => {
    const stripeConfig = checkout?.stripe && typeof checkout.stripe === 'object' ? checkout.stripe : null;
    const mode = stripeConfig && stripeConfig.mode === 'live' ? 'live' : 'test';
    const key = mode === 'live'
      ? stripeConfig && typeof stripeConfig.livePublishableKey === 'string'
        ? stripeConfig.livePublishableKey.trim()
        : ''
      : stripeConfig && typeof stripeConfig.testPublishableKey === 'string'
        ? stripeConfig.testPublishableKey.trim()
        : '';

    if (!key) {
      setStripePromise(null);
      return;
    }

    let isMounted = true;
    const stripePromiseInstance = loadStripe(key);
    setStripePromise(stripePromiseInstance);

    stripePromiseInstance.catch((error) => {
      console.error('Failed to initialize Stripe.js:', error);
      if (isMounted) {
        setStripePromise(null);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [checkout?.stripe]);

  const thankYouConfig = useMemo(() => {
    if (!checkout?.thankYou || typeof checkout.thankYou !== 'object') {
      return null;
    }

    const thankYou = checkout.thankYou;
    const imageConfig = thankYou.image && typeof thankYou.image === 'object' ? thankYou.image : {};
    const resolvedImageSrc = imageConfig.src ? resolveAssetPath(imageConfig.src) : '';

    return {
      ...thankYou,
      image: {
        src: resolvedImageSrc,
        alt: imageConfig.alt || '',
      },
    };
  }, [checkout?.thankYou]);

  useEffect(() => {
    setSelectedOptionId(defaultOptionId);
  }, [defaultOptionId]);

  const buildPayload = useCallback(
    (option, { includeDefaultPriceId } = {}) => {
      const quantity = Number.isInteger(option?.quantity) && option.quantity > 0 ? option.quantity : 1;
      const resolvedCurrency = (option?.currency || checkout?.currency || 'usd').toLowerCase();
      const fallbackPriceId = includeDefaultPriceId ? process.env.REACT_APP_STRIPE_PRICE_ID : undefined;
      const priceId = option?.priceId || fallbackPriceId;
      const normalizedPrice = Number(option?.price);
      const resolvedAmount = Number.isFinite(normalizedPrice) ? Math.round(normalizedPrice * 100) : undefined;
      const description = option?.checkoutDescription || option?.name || checkout?.title || 'Risk-free trial checkout';

      const metadata = {
        ...DEFAULT_METADATA,
        ...(checkout?.metadata && typeof checkout.metadata === 'object' ? checkout.metadata : {}),
        ...(option?.metadata && typeof option.metadata === 'object' ? option.metadata : {}),
      };

      if (option?.id) {
        metadata.optionId = option.id;
      }

      if (option?.name) {
        metadata.optionName = option.name;
      }

      if (priceId) {
        return {
          priceId,
          quantity,
          metadata,
        };
      }

      const amount = Number.isInteger(resolvedAmount) && resolvedAmount > 0 ? resolvedAmount : 4999;

      return {
        quantity,
        amount,
        currency: resolvedCurrency,
        description,
        metadata,
      };
    },
    [checkout?.currency, checkout?.metadata, checkout?.title],
  );

  const requestClientSecret = useCallback(
    async (payload, { signal, captureSelectionError } = {}) => {
      if (!stripePromise) {
        const errorMessage = 'Add a Stripe publishable key in the dashboard.';
        setMessage(errorMessage);
        if (captureSelectionError) {
          setSelectionError(errorMessage);
        }
        return null;
      }

      setIsLoading(true);
      setMessage('Preparing checkout...');
      if (captureSelectionError) {
        setSelectionError('');
      }

      try {
        const baseUrl = apiBase || '/api';
        const response = await fetch(`${baseUrl}/create-checkout-session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal,
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(data?.error || 'Unable to prepare checkout.');
        }

        if (!data?.clientSecret) {
          throw new Error('Stripe did not return a client secret.');
        }

        if (signal?.aborted) {
          return null;
        }

        setClientSecret(data.clientSecret);
        setActiveSessionId(typeof data.sessionId === 'string' ? data.sessionId : '');
        setMessage('');
        setSelectionError('');
        return data.clientSecret;
      } catch (error) {
        if (signal?.aborted) {
          return null;
        }

        console.error('Failed to initialize Stripe:', error);
        const finalMessage = error?.message || 'Unable to prepare checkout.';
        setClientSecret('');
        setActiveSessionId('');
        setMessage(finalMessage);

        if (captureSelectionError) {
          setSelectionError(finalMessage);
        }

        throw error;
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [apiBase, stripePromise],
  );

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    if (isReturnView) {
      setIsLoading(false);
      return () => {
        isMounted = false;
        controller.abort();
      };
    }

    if (hasProductOptions) {
      if (!isInline) {
        setIsLoading(false);
      }
      return () => {
        isMounted = false;
        controller.abort();
      };
    }

    const fetchClientSecret = async () => {
      try {
        await requestClientSecret(buildPayload(null, { includeDefaultPriceId: true }), {
          signal: controller.signal,
        });
      } catch (error) {
        if (isMounted && !controller.signal.aborted) {
          setMessage(error?.message || 'Unable to prepare checkout.');
        }
      }
    };

    fetchClientSecret();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [buildPayload, hasProductOptions, isInline, isReturnView, requestClientSecret]);

  useEffect(() => {
    const shouldFetchSelectedOption = (isInline || !hasMultipleProductOptions)
      && hasProductOptions
      && selectedOption
      && !isReturnView;

    if (!shouldFetchSelectedOption) {
      return undefined;
    }

    if (lastFetchedOptionRef.current === selectedOption.id && clientSecret) {
      return undefined;
    }

    const controller = new AbortController();
    lastFetchedOptionRef.current = selectedOption.id || null;
    setClientSecret('');

    // Automatically fetch a client secret when the checkout is rendered inline.
    requestClientSecret(buildPayload(selectedOption), {
      signal: controller.signal,
      captureSelectionError: true,
    }).catch((error) => {
      if (!controller.signal.aborted) {
        lastFetchedOptionRef.current = null;
        setMessage(error?.message || 'Unable to prepare checkout.');
      }
    });

    return () => {
      controller.abort();
    };
  }, [
    buildPayload,
    clientSecret,
    hasMultipleProductOptions,
    hasProductOptions,
    isInline,
    isReturnView,
    requestClientSecret,
    selectedOption,
  ]);

  const handleOptionChange = useCallback((event) => {
    if (forceSelectedOptionId) {
      return;
    }

    setSelectedOptionId(event.target.value);
    setSelectionError('');
    setMessage('');
    lastFetchedOptionRef.current = null;
  }, [forceSelectedOptionId]);

  const handleOptionSubmit = useCallback(async () => {
    if (!selectedOption) {
      setSelectionError('Select the trial to continue.');
      return;
    }

    try {
      lastFetchedOptionRef.current = selectedOption.id || null;
      await requestClientSecret(buildPayload(selectedOption), { captureSelectionError: true });
    } catch (_error) {
      lastFetchedOptionRef.current = null;
      // Error state handled inside requestClientSecret
    }
  }, [buildPayload, requestClientSecret, selectedOption]);

  const handleBackToOptions = useCallback(() => {
    setClientSecret('');
    setMessage('');
    setSelectionError('');
    setIsLoading(false);
    lastFetchedOptionRef.current = null;
  }, []);

  const selectedOptionSummary = useMemo(() => {
    if (!selectedOption) {
      return null;
    }

    return {
      ...selectedOption,
      displayPrice:
        selectedOption.displayPrice
        || formatCurrency(selectedOption.price, selectedOption.currency || checkout?.currency || 'usd'),
      imageSrc: selectedOption?.image?.src ? resolveAssetPath(selectedOption.image.src) : '',
      imageAlt:
        selectedOption?.image?.alt
        || (selectedOption?.name ? `${selectedOption.name} product image` : 'Selected product image'),
    };
  }, [checkout?.currency, selectedOption]);

  if (isReturnView) {
    return (
      <StripeCheckoutReturn
        apiBase={apiBase}
        sessionId={sessionId}
        thankYou={thankYouConfig}
        onRequestClose={onRequestClose}
      />
    );
  }

  if (!stripePromise) {
    return <div className="stripe-status-message" role="alert">Add a Stripe publishable key in the dashboard.</div>;
  }

  const renderOptionCard = (option) => {
    const isSelected = option?.id === selectedOptionId;
    const priceLabel = option?.displayPrice
      || formatCurrency(option?.price, option?.currency || checkout?.currency || 'usd');
    const optionImageSrc = option?.image?.src ? resolveAssetPath(option.image.src) : '';
    const optionImageAlt = option?.image?.alt
      || (option?.name ? `${option.name} product image` : 'Checkout option image');

    const contentMarkup = (
      <>
        {option?.badge ? <span className="checkout-option__badge">{option.badge}</span> : null}
        <span className="checkout-option__name">{option?.name}</span>
        {option?.description ? (
          <p className="checkout-option__description">{option.description}</p>
        ) : null}
        {priceLabel ? <span className="checkout-option__price">{priceLabel}</span> : null}
        {option?.subcopy ? (
          <span className="checkout-option__subcopy">{option.subcopy}</span>
        ) : null}
      </>
    );

    return (
      <label
        key={option?.id || option?.name}
        className={`checkout-option${isSelected ? ' checkout-option--selected' : ''}${
          option?.bestValue ? ' checkout-option--best' : ''
        }`}
      >
        <input
          type="radio"
          name="checkout-option"
          value={option?.id}
          checked={isSelected}
          onChange={handleOptionChange}
          disabled={isLoading && !isInline}
        />
        {optionImageSrc ? (
          <div className="checkout-option__layout">
            <div className="checkout-option__media">
              <ResponsiveImage
                src={optionImageSrc}
                alt={optionImageAlt}
                className="checkout-option__image"
                loading="lazy"
              />
            </div>
            <div className="checkout-option__content">{contentMarkup}</div>
          </div>
        ) : (
          <div className="checkout-option__content">{contentMarkup}</div>
        )}
      </label>
    );
  };

  if (isInline) {
    let formContent;

    if (isLoading) {
      formContent = (
        <div className="stripe-status-message" role="status">{message || 'Preparing checkout...'}</div>
      );
    } else if (!clientSecret) {
      const inlineFallbackMessage = hideInlineOptions
        ? selectionError || message || 'Preparing checkout...'
        : selectionError || message || 'Select the trial to load checkout.';
      formContent = (
        <div className="stripe-status-message" role={selectionError ? 'alert' : 'status'}>
          {inlineFallbackMessage}
        </div>
      );
    } else {
      const appearance = {
        theme: 'stripe',
        variables: {
          colorPrimary: '#ff5a5f',
          colorText: '#1f1f1f',
          borderRadius: '8px',
          fontFamily: 'Lato, sans-serif',
          fontLineHeight: '1.5',
        },
        rules: {
          '.Input': {
            fontFamily: 'Lato, sans-serif',
            fontSize: '16px',
          },
          '.Input::placeholder': {
            fontFamily: 'Lato, sans-serif',
            color: '#6f6f6f',
          },
          '.Input:focus::placeholder': {
            color: '#a0a0a0',
          },
        },
      };

      formContent = (
        <CheckoutProvider
          stripe={stripePromise}
          options={{
            clientSecret,
            elementsOptions: {
              appearance,
              savedPaymentMethod: {
                enableSave: 'never',
                enableRedisplay: 'never',
              },
            },
          }}
        >
          <StripeCheckoutForm
            selectedOption={selectedOptionSummary}
            sessionId={activeSessionId}
            apiBase={apiBase}
          />
        </CheckoutProvider>
      );
    }

    if (hideInlineOptions || !hasMultipleProductOptions) {
      return (
        <div className="checkout-inline__form-only">
          <div className="checkout-inline__column checkout-inline__column--form">{formContent}</div>
        </div>
      );
    }

    return (
      <div className="checkout-inline__grid">
        <div
          className="checkout-inline__column checkout-inline__column--options"
          aria-busy={isLoading ? 'true' : 'false'}
        >
          <div className="checkout-inline__options-grid">
            {productOptions.map((option) => renderOptionCard(option))}
          </div>
          {selectionError && clientSecret ? (
            <div className="stripe-status-message stripe-status-error" role="alert">{selectionError}</div>
          ) : null}
        </div>
        <div className="checkout-inline__column checkout-inline__column--form">{formContent}</div>
      </div>
    );
  }

  if (hasMultipleProductOptions && !clientSecret) {
    return (
      <div className="checkout-options" aria-busy={isLoading ? 'true' : 'false'}>
        <div className="checkout-options__header">
          <h2>{checkout?.title || 'Choose your trial'}</h2>
          {checkout?.subtitle ? <p>{checkout.subtitle}</p> : null}
        </div>
        <div className="checkout-options__grid">
          {productOptions.map((option) => renderOptionCard(option))}
        </div>
        <div className="checkout-options__actions">
          <button
            type="button"
            className="stripe-submit-button btn btn-primary btn-one-style"
            onClick={handleOptionSubmit}
            disabled={isLoading || !selectedOption}
          >
            <span>{isLoading ? 'Preparing checkout...' : checkout?.continueLabel || 'Continue to payment'}</span>
          </button>
          {selectionError ? (
            <div className="stripe-status-message stripe-status-error" role="alert">{selectionError}</div>
          ) : null}
          {!selectionError && message ? (
            <div className="stripe-status-message" role="status">{message}</div>
          ) : null}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <div className="stripe-status-message" role="status">{message}</div>;
  }

  if (!clientSecret) {
    return <div className="stripe-status-message" role="alert">{message || 'Unable to load checkout form.'}</div>;
  }

  const appearance = {
    theme: 'stripe',
    variables: {
      colorPrimary: '#ff5a5f',
      colorText: '#1f1f1f',
      borderRadius: '8px',
      fontFamily: 'Lato, sans-serif',
      fontLineHeight: '1.5',
    },
    rules: {
      '.Input': {
        fontFamily: 'Lato, sans-serif',
        fontSize: '16px',
      },
      '.Input::placeholder': {
        fontFamily: 'Lato, sans-serif',
        color: '#6f6f6f',
      },
      '.Input:focus::placeholder': {
        color: '#a0a0a0',
      },
    },
  };

  return (
    <CheckoutProvider
      stripe={stripePromise}
      options={{
        clientSecret,
        elementsOptions: {
          appearance,
          savedPaymentMethod: {
            enableSave: 'never',
            enableRedisplay: 'never',
          },
        },
      }}
    >
      <StripeCheckoutForm
        selectedOption={selectedOptionSummary}
        onBackToOptions={hasMultipleProductOptions ? handleBackToOptions : undefined}
        sessionId={activeSessionId}
        apiBase={apiBase}
      />
    </CheckoutProvider>
  );
}

StripeCheckoutContainer.propTypes = {
  checkout: PropTypes.shape({
    title: PropTypes.string,
    subtitle: PropTypes.string,
    continueLabel: PropTypes.string,
    currency: PropTypes.string,
    metadata: PropTypes.object,
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
    options: PropTypes.arrayOf(
      PropTypes.shape({
        id: PropTypes.string,
        name: PropTypes.string,
        description: PropTypes.string,
        checkoutDescription: PropTypes.string,
        price: PropTypes.number,
        priceId: PropTypes.string,
        currency: PropTypes.string,
        quantity: PropTypes.number,
        badge: PropTypes.string,
        displayPrice: PropTypes.string,
        summary: PropTypes.string,
        subcopy: PropTypes.string,
        metadata: PropTypes.object,
        bestValue: PropTypes.bool,
        default: PropTypes.bool,
        image: PropTypes.shape({
          src: PropTypes.string,
          alt: PropTypes.string,
        }),
      }),
    ),
  }),
  onRequestClose: PropTypes.func,
  displayMode: PropTypes.oneOf(['modal', 'inline']),
  forceSelectedOptionId: PropTypes.string,
  hideInlineOptions: PropTypes.bool,
};

export default StripeCheckoutContainer;

