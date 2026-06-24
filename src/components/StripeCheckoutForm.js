import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import PropTypes from 'prop-types';
import {
  PaymentElement,
  ShippingAddressElement,
  useCheckout,
} from '@stripe/react-stripe-js/checkout';
import ResponsiveImage from './landing/ResponsiveImage';
import './StripeCheckout.css';

const STATUS = {
  idle: 'idle',
  loading: 'loading',
  success: 'success',
  error: 'error',
};

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

function StripeCheckoutForm({ selectedOption, onBackToOptions, sessionId, apiBase }) {
  const checkoutState = useCheckout();
  const checkout = checkoutState && Object.prototype.hasOwnProperty.call(checkoutState, 'checkout')
    ? checkoutState.checkout
    : null;
  const checkoutStatus = checkoutState?.type || (checkout ? 'ready' : 'loading');
  const [status, setStatus] = useState(STATUS.idle);
  const [message, setMessage] = useState('');
  const [shippingError, setShippingError] = useState('');
  const [isShippingComplete, setIsShippingComplete] = useState(false);
  const [isEmailComplete, setIsEmailComplete] = useState(false);
  const [emailValue, setEmailValue] = useState('');
  const [emailError, setEmailError] = useState('');
  const [phoneValue, setPhoneValue] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const lastKnownEmailRef = useRef('');
  const lastSavedPhoneRef = useRef(null);
  const syncPhoneWithCheckoutRef = useRef(() => Promise.resolve(true));

  const apiUrlBase = useMemo(() => {
    const trimmedBase = typeof apiBase === 'string' ? apiBase.trim() : '';
    if (!trimmedBase) {
      return '';
    }
    return trimmedBase.replace(/\/$/, '');
  }, [apiBase]);

  const buildApiUrl = useCallback(
    (endpoint) => {
      const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      if (!apiUrlBase) {
        return `/api${normalizedEndpoint}`;
      }
      return `${apiUrlBase}${normalizedEndpoint}`;
    },
    [apiUrlBase],
  );

  const checkoutEmail = checkout?.email || '';

  useEffect(() => {
    if (!checkoutEmail) {
      setEmailValue('');
      setIsEmailComplete(false);
      setEmailError('');
      return;
    }

    lastKnownEmailRef.current = checkoutEmail;
    setEmailValue(checkoutEmail);
    setIsEmailComplete(true);
    setEmailError('');
  }, [checkoutEmail]);

  const isProcessing = status === STATUS.loading;

  const summaryPrice = useMemo(() => {
    if (!selectedOption) {
      return '';
    }

    if (selectedOption.displayPrice) {
      return selectedOption.displayPrice;
    }

    if (Number.isFinite(selectedOption.price)) {
      return formatCurrency(selectedOption.price, selectedOption.currency);
    }

    return '';
  }, [selectedOption]);

  const paymentElementOptions = useMemo(
    () => ({
      layout: 'tabs',
      paymentMethodOrder: ['card'],
      fields: {
        billingDetails: {
          email: 'never',
          phone: 'never',
          address: 'never',
        },
      },
    }),
    [],
  );

  const canSubmit = isShippingComplete && isEmailComplete;

  const updateCheckoutEmail = useCallback(
    async (rawEmail) => {
      if (!checkout) {
        return false;
      }

      const normalizedEmail = typeof rawEmail === 'string' ? rawEmail.trim() : '';

      if (!normalizedEmail) {
        return false;
      }

      try {
        await checkout.updateEmail({ email: normalizedEmail });
        return true;
      } catch (firstError) {
        try {
          await checkout.updateEmail(normalizedEmail);
          return true;
        } catch (secondError) {
          console.warn('Unable to sync email with checkout.', secondError);
        }
      }

      return false;
    },
    [checkout],
  );

  const validateEmailValue = useCallback((value) => {
    if (!value) {
      return 'Enter your email address.';
    }

    const normalized = value.trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(normalized)) {
      return 'Enter a valid email address.';
    }

    return '';
  }, []);

  const handleShippingChange = useCallback(
    (event) => {
      if (!event) {
        return;
      }

      if (event.error) {
        setShippingError(event.error.message || 'Enter a valid shipping address.');
        setIsShippingComplete(false);
        return;
      }

      if (!event.complete) {
        if (shippingError) {
          setShippingError('');
        }
        setIsShippingComplete(false);
        return;
      }

      if (shippingError) {
        setShippingError('');
      }

      if (status === STATUS.error && message) {
        setStatus(STATUS.idle);
        setMessage('');
      }

      setIsShippingComplete(true);
    },
    [message, shippingError, status],
  );

  const handleEmailChange = useCallback((event) => {
    const nextRawValue = event?.target?.value ?? '';
    setEmailValue(nextRawValue);

    if (status === STATUS.error && message) {
      setStatus(STATUS.idle);
      setMessage('');
    }

    const validationMessage = validateEmailValue(nextRawValue.trim());

    if (validationMessage) {
      setIsEmailComplete(false);
      setEmailError(validationMessage);
    } else {
      setIsEmailComplete(true);
      setEmailError('');
    }
  }, [message, status, validateEmailValue]);

  const handleEmailBlur = useCallback(async () => {
    const trimmed = emailValue.trim();
    const validationMessage = validateEmailValue(trimmed);

    if (validationMessage) {
      setEmailError(validationMessage);
      setIsEmailComplete(false);
      return;
    }

    if (!trimmed || trimmed === lastKnownEmailRef.current) {
      return;
    }

    const didUpdate = await updateCheckoutEmail(trimmed);

    if (didUpdate) {
      lastKnownEmailRef.current = trimmed;
    }
  }, [emailValue, updateCheckoutEmail, validateEmailValue]);

  const handlePaymentChange = useCallback(
    async (event) => {
      if (!event) {
        return;
      }

      const nextEmail = event.value?.billingDetails?.email
        || event.value?.payment_method?.billing_details?.email
        || '';

      if (!nextEmail || nextEmail === lastKnownEmailRef.current) {
        return;
      }

      const didUpdate = await updateCheckoutEmail(nextEmail);

      if (didUpdate) {
        lastKnownEmailRef.current = nextEmail;
      }

      setEmailValue(nextEmail);
      setIsEmailComplete(true);
      setEmailError('');
    },
    [updateCheckoutEmail],
  );

  const persistPhoneMetadata = useCallback(
    async (rawPhone) => {
      const normalizedPhone = typeof rawPhone === 'string' ? rawPhone.trim() : '';
      const targetPhone = normalizedPhone || null;

      if (!sessionId) {
        lastSavedPhoneRef.current = targetPhone;
        return true;
      }

      setIsSavingPhone(true);

      try {
        const response = await fetch(buildApiUrl(`/checkout-session/${encodeURIComponent(sessionId)}/phone`), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ phoneNumber: normalizedPhone }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const error = new Error(payload?.error || 'Unable to save phone number.');
          error.status = response.status;
          throw error;
        }

        lastSavedPhoneRef.current = targetPhone;
        return { ok: true };
      } catch (error) {
        console.warn('Failed to persist checkout phone metadata.', error);
        return {
          ok: false,
          status: typeof error?.status === 'number' ? error.status : undefined,
          message: error?.message || 'Unable to save phone number.',
        };
      } finally {
        setIsSavingPhone(false);
      }
    },
    [buildApiUrl, sessionId],
  );

  const syncPhoneWithCheckout = useCallback(
    async (rawPhone) => {
      if (!checkout || typeof checkout.updatePhoneNumber !== 'function') {
        return true;
      }

      const normalizedPhone = typeof rawPhone === 'string' ? rawPhone.trim() : '';
      if (!normalizedPhone) {
        return true;
      }
      const candidateValue = normalizedPhone || null;

      const isCollectionDisabledError = (error) => {
        if (!error) {
          return false;
        }

        const message = String(error.message || error);
        return /phone_number_collection\.enabled/i.test(message);
      };

      try {
        await checkout.updatePhoneNumber({ phoneNumber: candidateValue });
        return true;
      } catch (firstError) {
        if (isCollectionDisabledError(firstError)) {
          return true;
        }

        try {
          await checkout.updatePhoneNumber(candidateValue);
          return true;
        } catch (secondError) {
          if (isCollectionDisabledError(secondError)) {
            return true;
          }

          const combinedMessage = String(secondError?.message || firstError?.message || '');

          if (!normalizedPhone && combinedMessage && /phone number/i.test(combinedMessage)) {
            return true;
          }

          console.warn('Unable to sync phone number with checkout.', secondError || firstError);
          return false;
        }
      }
    },
    [checkout],
  );

  useEffect(() => {
    syncPhoneWithCheckoutRef.current = syncPhoneWithCheckout;
  }, [syncPhoneWithCheckout]);

  const handlePhoneChange = useCallback((event) => {
    const nextRawValue = event?.target?.value ?? '';
    setPhoneValue(nextRawValue);

    if (phoneError) {
      setPhoneError('');
    }

    if (status === STATUS.error && message) {
      setStatus(STATUS.idle);
      setMessage('');
    }
  }, [message, phoneError, status]);

  const handlePhoneBlur = useCallback(async () => {
    const trimmed = phoneValue.trim();

    if (!trimmed) {
      setPhoneError('');
      return;
    }

    const didSync = await syncPhoneWithCheckout(trimmed);

    if (!didSync) {
      setPhoneError('Unable to sync phone number.');
    } else {
      setPhoneError('');
    }
  }, [phoneValue, syncPhoneWithCheckout]);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();

      if (!checkout) {
        return;
      }

      setStatus(STATUS.loading);
      setMessage('');

      const trimmedEmail = emailValue.trim();
      const emailValidationMessage = validateEmailValue(trimmedEmail);

      if (emailValidationMessage) {
        setStatus(STATUS.error);
        setMessage(emailValidationMessage);
        setEmailError(emailValidationMessage);
        setIsEmailComplete(false);
        return;
      }

      if (trimmedEmail && trimmedEmail !== lastKnownEmailRef.current) {
        const didPersistEmail = await updateCheckoutEmail(trimmedEmail);

        if (didPersistEmail) {
          lastKnownEmailRef.current = trimmedEmail;
        }
      }

      if (!isShippingComplete) {
        const shippingMessage = 'Enter your shipping address.';
        setShippingError(shippingMessage);
        setStatus(STATUS.error);
        setMessage(shippingMessage);
        return;
      }

      const nextPhone = phoneValue.trim();
      const phonePersistResult = await persistPhoneMetadata(nextPhone);

      if (!phonePersistResult.ok) {
        if (nextPhone) {
          setPhoneError('Unable to save phone number.');
          setStatus(STATUS.error);
          setMessage(phonePersistResult.message || 'Unable to save phone number.');
          return;
        }

        setPhoneError('');
        }

      if (nextPhone) {
        const didSyncPhone = await syncPhoneWithCheckout(nextPhone);

        if (!didSyncPhone) {
          setPhoneError('Unable to sync phone number.');
          setStatus(STATUS.error);
          setMessage('Unable to sync phone number.');
          return;
        }
      }

      setPhoneError('');

      const confirmResult = await checkout.confirm();

      if (confirmResult.type === 'error') {
        setStatus(STATUS.error);
        setMessage(confirmResult.error?.message || 'Something went wrong. Please try again.');
        return;
      }

      setStatus(STATUS.loading);
        setMessage('Confirming your risk-free trial...');
    },
    [
      checkout,
      emailValue,
      isShippingComplete,
      persistPhoneMetadata,
      phoneValue,
      syncPhoneWithCheckout,
      updateCheckoutEmail,
      validateEmailValue,
    ],
  );

  if (checkoutStatus === 'loading') {
    return <div className="stripe-status-message" role="status">Loading checkout…</div>;
  }

  if (checkoutStatus === 'error') {
    const checkoutError = checkoutState && Object.prototype.hasOwnProperty.call(checkoutState, 'error')
      ? checkoutState.error
      : null;
    return (
      <div className="stripe-status-message" role="alert">
        Unable to load checkout: {checkoutError?.message || 'Unknown error.'}
      </div>
    );
  }

  return (
    <form className="stripe-payment-form" onSubmit={handleSubmit} noValidate>
      {selectedOption ? (
        <div className="checkout-summary" aria-live="polite">
          <div className="checkout-summary__details">
            <p className="checkout-summary__label">Risk-Free Trial</p>
            <p className="checkout-summary__name">{selectedOption.name}</p>
            {selectedOption.summary ? (
              <p className="checkout-summary__description">{selectedOption.summary}</p>
            ) : selectedOption.subcopy ? (
              <p className="checkout-summary__description">{selectedOption.subcopy}</p>
            ) : selectedOption.description ? (
              <p className="checkout-summary__description">{selectedOption.description}</p>
            ) : null}
            {summaryPrice ? <span className="checkout-summary__price">{summaryPrice}</span> : null}
            {onBackToOptions ? (
              <button
                type="button"
                className="checkout-summary__change"
                onClick={onBackToOptions}
                disabled={isProcessing}
              >
                Change
              </button>
            ) : null}
          </div>
          <div className="checkout-summary__aside">
            {selectedOption.imageSrc ? (
              <ResponsiveImage
                className="checkout-summary__image"
                src={selectedOption.imageSrc}
                alt={selectedOption.imageAlt || `${selectedOption.name || 'Selected'} product image`}
                loading="lazy"
              />
            ) : null}
          </div>
        </div>
      ) : null}
      <label
        className="stripe-input-label"
        htmlFor="checkout-email"
        style={{ fontFamily: 'Lato, sans-serif' }}
      >
        Contact Email (Required)
      </label>
      <input
        id="checkout-email"
        className={`stripe-input${emailError ? ' stripe-input-error' : ''}`}
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        value={emailValue}
        onChange={handleEmailChange}
        onBlur={handleEmailBlur}
        required
        aria-invalid={emailError ? 'true' : 'false'}
        aria-describedby={emailError ? 'checkout-email-error' : undefined}
        placeholder="you@example.com"
        disabled={isProcessing}
      />
      {emailError ? (
        <div id="checkout-email-error" className="stripe-status-message stripe-status-error" role="alert">
          {emailError}
        </div>
      ) : null}
      <label
        className="stripe-input-label"
        htmlFor="checkout-phone"
        style={{ fontFamily: 'Lato, sans-serif' }}
      >
        Contact Phone (Optional)
      </label>
      <input
        id="checkout-phone"
        className={`stripe-input${phoneError ? ' stripe-input-error' : ''}`}
        type="tel"
        name="phone"
        autoComplete="tel"
        inputMode="tel"
        value={phoneValue}
        onChange={handlePhoneChange}
        onBlur={handlePhoneBlur}
        aria-invalid={phoneError ? 'true' : 'false'}
        aria-describedby={phoneError ? 'checkout-phone-error' : undefined}
        placeholder="(555) 555-1234"
        disabled={isProcessing || isSavingPhone}
      />
      {phoneError ? (
        <div id="checkout-phone-error" className="stripe-status-message stripe-status-error" role="alert">
          {phoneError}
        </div>
      ) : null}
      <label
        className="stripe-input-label"
        htmlFor="shipping-address-element"
        style={{ fontFamily: 'Lato, sans-serif' }}
      >
        Shipping Information (Required)
      </label>
      <div
        className={`stripe-address-element${shippingError ? ' stripe-input-error' : ''}`}
        aria-live="polite"
      >
        <ShippingAddressElement
          id="shipping-address-element"
          onChange={handleShippingChange}
        />
      </div>
      {shippingError ? (
        <div id="shipping-errors" className="stripe-status-message stripe-status-error" role="alert">
          {shippingError}
        </div>
      ) : null}
      <div className="trial-disclosure" role="note">
        <strong>Card not charged today.</strong>
        {' '}
        A $60 authorization hold is placed now. The $60 charge is captured only if the product is not returned within 7 days.
      </div>
      <label
        className="stripe-input-label"
        htmlFor="payment-element"
        style={{ fontFamily: 'Lato, sans-serif' }}
      >
        Payment Method
      </label>
      <PaymentElement
        id="payment-element"
        options={paymentElementOptions}
        onChange={handlePaymentChange}
      />
      <button
        type="submit"
        className="stripe-submit-button btn btn-primary btn-one-style"
        disabled={isProcessing || !checkout || !canSubmit}
      >
        <span>{isProcessing ? 'Processing...' : 'Authorize Card - $0 Charged Today'}</span>
      </button>
      {message ? (
        <div
          className={`stripe-status-message${
            status === STATUS.error ? ' stripe-status-error' : ''
          }${status === STATUS.success ? ' stripe-status-success' : ''}`}
          role={status === STATUS.error ? 'alert' : 'status'}
        >
          {message}
        </div>
      ) : null}
    </form>
  );
}

StripeCheckoutForm.propTypes = {
  selectedOption: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    description: PropTypes.string,
    summary: PropTypes.string,
    subcopy: PropTypes.string,
    displayPrice: PropTypes.string,
    price: PropTypes.number,
    currency: PropTypes.string,
    imageSrc: PropTypes.string,
    imageAlt: PropTypes.string,
  }),
  onBackToOptions: PropTypes.func,
  sessionId: PropTypes.string,
  apiBase: PropTypes.string,
};

export default StripeCheckoutForm;
