import { useCallback, useEffect, useMemo, useState } from 'react';
import './Dashboard.css';
import { resolveAssetPath, updateFavicon } from '../components/landing/utils';

const STORAGE_KEY = 'landing-dashboard-auth';
const AUTH_HEADER_PREFIX = 'Basic ';
const CONTENT_ENDPOINT = process.env.REACT_APP_CONTENT_ENDPOINT || '/api/content';
const LOGIN_ENDPOINT = '/api/login';
const UPLOAD_ENDPOINT = process.env.REACT_APP_UPLOAD_ENDPOINT || '/api/upload-image';
const TRIAL_ORDERS_ENDPOINT = '/api/trial-orders';

const ARRAY_TEMPLATES = {
  'branding.saleBanners': {
    id: '',
    message: '',
  },
  'testimonials.cards': {
    name: '',
    badge: '',
    quote: '',
    image: {
      src: '',
      alt: '',
    },
  },
  'checkout.options': {
    id: '',
    name: '',
    description: '',
    checkoutDescription: '',
    price: 0,
    priceId: '',
    currency: '',
    quantity: 1,
    badge: '',
    displayPrice: '',
    subcopy: '',
    metadata: {},
    image: {
      src: '',
      alt: '',
    },
  },
  'privacyPolicy.blocks': {
    title: '',
    paragraph: '',
  },
  'termsOfService.blocks': {
    title: '',
    paragraph: '',
  },
};

const ARRAY_LABEL_OVERRIDES = {
  cards: 'Card',
  saleBanners: 'Banner',
  options: 'Option',
  blocks: 'Block',
};

const HIDDEN_FIELDS = new Set([
  'hero.testimonial.rating',
  'testimonials.rating',
  'hero.stripeCheckoutEnabled',
  'checkout.stripe',
]);

const encodeCredentials = (email, password) => {
  const trimmedEmail = String(email || '').trim();
  const trimmedPassword = String(password || '').trim();

  if (!trimmedEmail || !trimmedPassword) {
    return '';
  }

  return window.btoa(`${trimmedEmail}:${trimmedPassword}`);
};

const getIn = (source, path) => {
  return path.reduce((acc, key) => {
    if (acc === null || acc === undefined) {
      return undefined;
    }
    return acc[key];
  }, source);
};

const setIn = (source, path, value) => {
  if (!path.length) {
    return value;
  }

  const [head, ...tail] = path;
  const clone = Array.isArray(source) ? [...source] : { ...(source || {}) };

  clone[head] = tail.length ? setIn(clone[head], tail, value) : value;
  return clone;
};

const deleteIn = (source, path) => {
  if (!path.length) {
    return source;
  }

  const [head, ...tail] = path;
  const clone = Array.isArray(source) ? [...source] : { ...(source || {}) };

  if (!tail.length) {
    if (Array.isArray(clone)) {
      clone.splice(head, 1);
    } else {
      delete clone[head];
    }
    return clone;
  }

  clone[head] = deleteIn(clone[head], tail);
  return clone;
};

const createEmptyValue = (sample) => {
  if (Array.isArray(sample)) {
    return [];
  }

  if (sample === null || sample === undefined) {
    return '';
  }

  switch (typeof sample) {
    case 'string':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'object': {
      const result = {};
      Object.keys(sample).forEach((key) => {
        result[key] = createEmptyValue(sample[key]);
      });
      return result;
    }
    default:
      return '';
  }
};

const isImageField = (label, path) => {
  const key = String(label || '').toLowerCase();
  if (key === 'alt' || key === 'label') {
    return false;
  }
  if (key.includes('avatar')) {
    return true;
  }
  if (key.includes('image') || key === 'src' || key.endsWith('image')) {
    return true;
  }

  const prev = path[path.length - 2];
  if (typeof prev === 'string' && prev.toLowerCase().includes('image')) {
    return true;
  }

  return false;
};

const pathToKey = (path) => path.filter((segment) => segment !== undefined && segment !== null).join('.');

const formatCents = (amount, currency = 'usd') => {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount)) {
    return '';
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: String(currency || 'usd').toUpperCase(),
    }).format(numericAmount / 100);
  } catch (_error) {
    return `$${(numericAmount / 100).toFixed(2)}`;
  }
};

const formatDateTime = (value) => {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString();
};

const formatShippingAddress = (shippingDetails) => {
  const address = shippingDetails?.address;

  if (!address) {
    return 'No shipping details yet';
  }

  return [
    shippingDetails.name,
    address.line1,
    address.line2,
    [address.city, address.state, address.postal_code].filter(Boolean).join(', '),
    address.country,
  ].filter(Boolean).join(' | ');
};

const createArrayItemTemplate = (path, currentValue) => {
  if (Array.isArray(currentValue) && currentValue.length) {
    return createEmptyValue(currentValue[0]);
  }

  const template = ARRAY_TEMPLATES[pathToKey(path)];

  if (template) {
    return createEmptyValue(template);
  }

  return '';
};

const normalizeContent = (content) => {
  if (!content || typeof content !== 'object') {
    return content;
  }

  const clone = JSON.parse(JSON.stringify(content));

  if (clone.branding && Array.isArray(clone.branding.saleBanners)) {
    clone.branding.saleBanners = clone.branding.saleBanners.map((banner) => {
      if (banner && typeof banner === 'object' && !Array.isArray(banner)) {
        if (typeof banner.message !== 'string') {
          return {
            ...banner,
            message:
              banner.message === null || banner.message === undefined
                ? ''
                : String(banner.message),
          };
        }
        return banner;
      }

      if (typeof banner === 'string') {
        return { id: '', message: banner };
      }

      return { id: '', message: '' };
    });
  }

  if (clone.branding) {
    if (!clone.branding.favicon || typeof clone.branding.favicon !== 'object' || Array.isArray(clone.branding.favicon)) {
      clone.branding.favicon = { src: '', alt: '' };
    } else {
      clone.branding.favicon = {
        src: clone.branding.favicon.src || '',
        alt: clone.branding.favicon.alt || '',
      };
    }
  }

  if (clone.checkout && Array.isArray(clone.checkout.options)) {
    clone.checkout.options = clone.checkout.options.map((option) => {
      if (!option || typeof option !== 'object' || Array.isArray(option)) {
        return JSON.parse(JSON.stringify(ARRAY_TEMPLATES['checkout.options']));
      }

      const normalizedOption = { ...option };

      if (!normalizedOption.image || typeof normalizedOption.image !== 'object') {
        normalizedOption.image = { src: '', alt: '' };
      } else {
        normalizedOption.image = {
          src: normalizedOption.image.src || '',
          alt: normalizedOption.image.alt || '',
        };
      }

      if (typeof normalizedOption.price === 'string') {
        const numericPrice = Number(normalizedOption.price);
        normalizedOption.price = Number.isNaN(numericPrice) ? '' : numericPrice;
      }

      if (typeof normalizedOption.quantity === 'string') {
        const numericQuantity = Number(normalizedOption.quantity);
        normalizedOption.quantity = Number.isNaN(numericQuantity) ? 1 : Math.max(1, Math.round(numericQuantity));
      }

      return normalizedOption;
    });
  }

  if (clone.checkout) {
    clone.checkout.checkoutPageTitle = typeof clone.checkout.checkoutPageTitle === 'string'
      ? clone.checkout.checkoutPageTitle
      : '';

    if (!clone.checkout.stripe || typeof clone.checkout.stripe !== 'object' || Array.isArray(clone.checkout.stripe)) {
      clone.checkout.stripe = {
        mode: 'test',
        testPublishableKey: '',
        livePublishableKey: '',
      };
    } else {
      clone.checkout.stripe = {
        mode: clone.checkout.stripe.mode === 'live' ? 'live' : 'test',
        testPublishableKey: clone.checkout.stripe.testPublishableKey || '',
        livePublishableKey: clone.checkout.stripe.livePublishableKey || '',
      };
    }
  }

  if (clone.checkout && clone.checkout.thankYou && typeof clone.checkout.thankYou === 'object') {
    const thankYou = clone.checkout.thankYou;

    if (!thankYou.cta || typeof thankYou.cta !== 'object' || Array.isArray(thankYou.cta)) {
      thankYou.cta = { label: '', href: '' };
    } else {
      thankYou.cta = {
        label: thankYou.cta.label || '',
        href: thankYou.cta.href || '',
      };
    }

    if (!thankYou.image || typeof thankYou.image !== 'object' || Array.isArray(thankYou.image)) {
      thankYou.image = { src: '', alt: '' };
    } else {
      thankYou.image = {
        src: thankYou.image.src || '',
        alt: thankYou.image.alt || '',
      };
    }
  }

  if (!clone.privacyPolicy || typeof clone.privacyPolicy !== 'object' || Array.isArray(clone.privacyPolicy)) {
    clone.privacyPolicy = {
      title: '',
      lastUpdated: '',
      blocks: [],
    };
  } else {
    clone.privacyPolicy.title = typeof clone.privacyPolicy.title === 'string' ? clone.privacyPolicy.title : '';
    clone.privacyPolicy.lastUpdated = typeof clone.privacyPolicy.lastUpdated === 'string'
      ? clone.privacyPolicy.lastUpdated
      : '';
    if (!Array.isArray(clone.privacyPolicy.blocks)) {
      clone.privacyPolicy.blocks = [];
    } else {
      clone.privacyPolicy.blocks = clone.privacyPolicy.blocks.map((block) => {
        if (!block || typeof block !== 'object' || Array.isArray(block)) {
          return { title: '', paragraph: '' };
        }

        return {
          title: typeof block.title === 'string' ? block.title : '',
          paragraph: typeof block.paragraph === 'string' ? block.paragraph : '',
        };
      });
    }
  }

  if (!clone.termsOfService || typeof clone.termsOfService !== 'object' || Array.isArray(clone.termsOfService)) {
    clone.termsOfService = {
      title: '',
      lastUpdated: '',
      blocks: [],
    };
  } else {
    clone.termsOfService.title = typeof clone.termsOfService.title === 'string' ? clone.termsOfService.title : '';
    clone.termsOfService.lastUpdated = typeof clone.termsOfService.lastUpdated === 'string'
      ? clone.termsOfService.lastUpdated
      : '';
    if (!Array.isArray(clone.termsOfService.blocks)) {
      clone.termsOfService.blocks = [];
    } else {
      clone.termsOfService.blocks = clone.termsOfService.blocks.map((block) => {
        if (!block || typeof block !== 'object' || Array.isArray(block)) {
          return { title: '', paragraph: '' };
        }

        return {
          title: typeof block.title === 'string' ? block.title : '',
          paragraph: typeof block.paragraph === 'string' ? block.paragraph : '',
        };
      });
    }
  }

  if (typeof clone.trackingScripts !== 'string') {
    clone.trackingScripts = '';
  }

  return clone;
};

function Dashboard() {
  const [authToken, setAuthToken] = useState(() => localStorage.getItem(STORAGE_KEY) || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const [draftContent, setDraftContent] = useState(null);
  const [originalContent, setOriginalContent] = useState(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState({ state: 'idle', message: '' });
  const [stripeSecrets, setStripeSecrets] = useState({ testSecretKey: '', liveSecretKey: '' });
  const [originalStripeSecrets, setOriginalStripeSecrets] = useState(null);
  const [stripeSecretsStatus, setStripeSecretsStatus] = useState({ state: 'idle', message: '' });
  const [isLoadingStripeSecrets, setIsLoadingStripeSecrets] = useState(false);
  const [trialOrders, setTrialOrders] = useState([]);
  const [trialOrdersStatus, setTrialOrdersStatus] = useState({ state: 'idle', message: '' });
  const [isLoadingTrialOrders, setIsLoadingTrialOrders] = useState(false);
  const [returningOrderId, setReturningOrderId] = useState('');

  const isAuthenticated = Boolean(authToken);

  const authHeader = useMemo(() => {
    return authToken ? `${AUTH_HEADER_PREFIX}${authToken}` : '';
  }, [authToken]);

  const dashboardFaviconSrc = (draftContent && draftContent.branding && draftContent.branding.favicon)
    ? draftContent.branding.favicon.src || ''
    : '';

  const stripeSettings = draftContent?.checkout?.stripe || {
    mode: 'test',
    testPublishableKey: '',
    livePublishableKey: '',
  };
  const stripeMode = stripeSettings.mode === 'live' ? 'live' : 'test';
  const originalStripeSettings = originalContent?.checkout?.stripe;
  const stripeSettingsDirty = useMemo(() => {
    const originalMode = originalStripeSettings?.mode === 'live' ? 'live' : 'test';
    const originalTestKey = originalStripeSettings?.testPublishableKey || '';
    const originalLiveKey = originalStripeSettings?.livePublishableKey || '';

    const currentMode = stripeMode;
    const currentTestKey = stripeSettings.testPublishableKey || '';
    const currentLiveKey = stripeSettings.livePublishableKey || '';

    return (
      originalMode !== currentMode
      || originalTestKey !== currentTestKey
      || originalLiveKey !== currentLiveKey
    );
  }, [originalStripeSettings, stripeMode, stripeSettings.livePublishableKey, stripeSettings.testPublishableKey]);
  const stripeSecretsDirty = useMemo(() => {
    if (!originalStripeSecrets) {
      return Boolean(
        (stripeSecrets.testSecretKey && stripeSecrets.testSecretKey.length)
        || (stripeSecrets.liveSecretKey && stripeSecrets.liveSecretKey.length),
      );
    }

    return JSON.stringify(stripeSecrets) !== JSON.stringify(originalStripeSecrets);
  }, [originalStripeSecrets, stripeSecrets]);
  const isSavingStripeSecrets = stripeSecretsStatus.state === 'saving';

  const resetSaveStatus = useCallback(() => {
    setSaveStatus({ state: 'idle', message: '' });
  }, []);

  const markDirty = useCallback((nextDraft, nextOriginal) => {
    if (!nextOriginal) {
      setIsDirty(false);
      return;
    }

    const draftString = JSON.stringify(nextDraft);
    const originalString = JSON.stringify(nextOriginal);
    setIsDirty(draftString !== originalString);
  }, []);

  const updateDraft = useCallback(
    (updater) => {
      setDraftContent((prev) => {
        const next = updater(prev);
        markDirty(next, originalContent);
        return next;
      });
      resetSaveStatus();
    },
    [markDirty, originalContent, resetSaveStatus],
  );

  const handleLogout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setAuthToken('');
    setDraftContent(null);
    setOriginalContent(null);
    setIsDirty(false);
    setSaveStatus({ state: 'idle', message: '' });
    setStripeSecrets({ testSecretKey: '', liveSecretKey: '' });
    setOriginalStripeSecrets(null);
    setStripeSecretsStatus({ state: 'idle', message: '' });
    setIsLoadingStripeSecrets(false);
    setTrialOrders([]);
    setTrialOrdersStatus({ state: 'idle', message: '' });
    setIsLoadingTrialOrders(false);
    setReturningOrderId('');
  }, []);

  const applyContent = useCallback(
    (content) => {
      if (!content || typeof content !== 'object') {
        setDraftContent(null);
        setOriginalContent(null);
        setIsDirty(false);
        return;
      }

      const normalized = normalizeContent(content);
      const cloned = JSON.parse(JSON.stringify(normalized));
      setDraftContent(cloned);
      setOriginalContent(JSON.parse(JSON.stringify(normalized)));
      setIsDirty(false);
      setSaveStatus({ state: 'idle', message: '' });
    },
    [],
  );

  const loadContent = useCallback(async () => {
    setIsLoadingContent(true);
    setLoadError('');

    try {
      const response = await fetch(CONTENT_ENDPOINT, {
        headers: authHeader ? { Authorization: authHeader } : undefined,
        cache: 'no-cache',
      });

      if (!response.ok) {
        if (response.status === 401) {
          handleLogout();
          throw new Error('Session expired. Please sign in again.');
        }

        throw new Error(`Unable to load content (${response.status})`);
      }

      const payload = await response.json();
      applyContent(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load content.';
      setLoadError(message);
    } finally {
      setIsLoadingContent(false);
    }
  }, [applyContent, authHeader, handleLogout]);

  const loadStripeSecrets = useCallback(async () => {
    if (!authHeader) {
      return;
    }

    setIsLoadingStripeSecrets(true);
    setStripeSecretsStatus({ state: 'idle', message: '' });

    try {
      const response = await fetch('/api/stripe-secrets', {
        headers: { Authorization: authHeader },
        cache: 'no-cache',
      });

      if (!response.ok) {
        if (response.status === 401) {
          handleLogout();
        }

        throw new Error(`Unable to load Stripe keys (${response.status})`);
      }

      const payload = await response.json().catch(() => ({}));
      const next = {
        testSecretKey: typeof payload.testSecretKey === 'string' ? payload.testSecretKey : '',
        liveSecretKey: typeof payload.liveSecretKey === 'string' ? payload.liveSecretKey : '',
      };

      setStripeSecrets(next);
      setOriginalStripeSecrets(next);
      setStripeSecretsStatus({ state: 'idle', message: '' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load Stripe keys.';
      setStripeSecretsStatus({ state: 'error', message });
    } finally {
      setIsLoadingStripeSecrets(false);
    }
  }, [authHeader, handleLogout]);

  const loadTrialOrders = useCallback(async () => {
    if (!authHeader) {
      return;
    }

    setIsLoadingTrialOrders(true);
    setTrialOrdersStatus({ state: 'idle', message: '' });

    try {
      const response = await fetch(TRIAL_ORDERS_ENDPOINT, {
        headers: { Authorization: authHeader },
        cache: 'no-cache',
      });

      if (!response.ok) {
        if (response.status === 401) {
          handleLogout();
        }

        throw new Error(`Unable to load trial orders (${response.status})`);
      }

      const payload = await response.json().catch(() => ({}));
      setTrialOrders(Array.isArray(payload.orders) ? payload.orders : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load trial orders.';
      setTrialOrdersStatus({ state: 'error', message });
    } finally {
      setIsLoadingTrialOrders(false);
    }
  }, [authHeader, handleLogout]);

  useEffect(() => {
    if (isAuthenticated) {
      loadContent();
      loadStripeSecrets();
      loadTrialOrders();
    }
  }, [isAuthenticated, loadContent, loadStripeSecrets, loadTrialOrders]);

  useEffect(() => {
    updateFavicon(dashboardFaviconSrc);
  }, [dashboardFaviconSrc]);

  const handleLogin = useCallback(
    async (event) => {
      event.preventDefault();

      const token = encodeCredentials(email, password);

      if (!token) {
        setLoginError('Enter an email and password.');
        return;
      }

      setIsAuthenticating(true);
      setLoginError('');

      try {
        const response = await fetch(LOGIN_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `${AUTH_HEADER_PREFIX}${token}`,
          },
          body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
          throw new Error('Invalid email or password.');
        }

        localStorage.setItem(STORAGE_KEY, token);
        setAuthToken(token);
        setEmail('');
        setPassword('');
        setSaveStatus({ state: 'idle', message: '' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to authenticate.';
        setLoginError(message);
      } finally {
        setIsAuthenticating(false);
      }
    },
    [email, password],
  );

  const handleValueChange = useCallback(
    (path, value) => {
      updateDraft((prev) => setIn(prev || {}, path, value));
    },
    [updateDraft],
  );

  const handleStripeSecretChange = useCallback((field, value) => {
    setStripeSecrets((prev) => ({
      ...prev,
      [field]: value,
    }));
    setStripeSecretsStatus((prev) => (prev.state === 'idle' && !prev.message ? prev : { state: 'idle', message: '' }));
  }, []);

  const handleStripeSecretsSave = useCallback(async () => {
    if (!isAuthenticated) {
      setStripeSecretsStatus({ state: 'error', message: 'Please log in before saving Stripe keys.' });
      return;
    }

    setStripeSecretsStatus({ state: 'saving', message: 'Saving Stripe keys…' });

    const payload = {
      testSecretKey: typeof stripeSecrets.testSecretKey === 'string' ? stripeSecrets.testSecretKey.trim() : '',
      liveSecretKey: typeof stripeSecrets.liveSecretKey === 'string' ? stripeSecrets.liveSecretKey.trim() : '',
    };

    try {
      const response = await fetch('/api/stripe-secrets', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Unable to save Stripe keys (${response.status})`);
      }

      setStripeSecrets(payload);
      setOriginalStripeSecrets(payload);
      setStripeSecretsStatus({ state: 'success', message: 'Stripe secret keys saved.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save Stripe keys.';
      setStripeSecretsStatus({ state: 'error', message });
    }
  }, [authHeader, isAuthenticated, stripeSecrets]);

  const handleMarkReturned = useCallback(async (orderId) => {
    if (!orderId || returningOrderId) {
      return;
    }

    setReturningOrderId(orderId);
    setTrialOrdersStatus({ state: 'saving', message: 'Canceling authorization...' });

    try {
      const response = await fetch(`${TRIAL_ORDERS_ENDPOINT}/${encodeURIComponent(orderId)}/return`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
        },
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || `Unable to cancel authorization (${response.status})`);
      }

      setTrialOrdersStatus({ state: 'success', message: 'Order marked returned and authorization canceled.' });
      await loadTrialOrders();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to cancel authorization.';
      setTrialOrdersStatus({ state: 'error', message });
    } finally {
      setReturningOrderId('');
    }
  }, [authHeader, loadTrialOrders, returningOrderId]);

  const handleRemoveItem = useCallback(
    (path) => {
      updateDraft((prev) => deleteIn(prev || {}, path));
    },
    [updateDraft],
  );

  const handleAddItem = useCallback(
    (path, currentValue) => {
      const nextValue = createArrayItemTemplate(path, currentValue);

      updateDraft((prev) => {
        const existing = getIn(prev || {}, path) || [];
        const updated = [...existing, nextValue];
        return setIn(prev || {}, path, updated);
      });
    },
    [updateDraft],
  );

  const handleSave = useCallback(async () => {
    if (!isAuthenticated) {
      setSaveStatus({ state: 'error', message: 'Please log in before saving.' });
      return;
    }

    if (!draftContent || typeof draftContent !== 'object') {
      setSaveStatus({ state: 'error', message: 'There is no content to save.' });
      return;
    }

    setSaveStatus({ state: 'saving', message: 'Saving changes…' });

    try {
      const response = await fetch(CONTENT_ENDPOINT, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify(draftContent, null, 2),
      });

      if (!response.ok) {
        if (response.status === 401) {
          handleLogout();
          throw new Error('Session expired. Please sign in again.');
        }

        throw new Error(`Save failed (${response.status})`);
      }

      const saved = JSON.parse(JSON.stringify(draftContent));
      setOriginalContent(saved);
      markDirty(saved, saved);
      setSaveStatus({ state: 'success', message: 'Content saved successfully.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save changes.';
      setSaveStatus({ state: 'error', message });
    }
  }, [authHeader, draftContent, handleLogout, isAuthenticated, markDirty]);

  const handleFileUpload = useCallback(
    async (event, path) => {
      const file = event.target.files && event.target.files[0];
      if (!file) {
        return;
      }

      const formData = new FormData();
      formData.append('file', file);

      try {
        const headers = authHeader ? { Authorization: authHeader } : {};
        const response = await fetch(UPLOAD_ENDPOINT, {
          method: 'POST',
          headers,
          body: formData,
        });

        if (!response.ok) {
          if (response.status === 401) {
            handleLogout();
            throw new Error('Session expired. Please sign in again.');
          }

          const errorMessage = `Image upload failed (${response.status})`;
          throw new Error(errorMessage);
        }

        const result = await response.json();

        if (result && result.path) {
          handleValueChange(path, result.path);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Image upload failed.';
        console.error('Image upload failed:', error);
        setSaveStatus({ state: 'error', message });
      } finally {
        event.target.value = '';
      }
    },
    [authHeader, handleLogout, handleValueChange],
  );

  const renderField = (value, path, label) => {
    const fieldId = ['dashboard', ...path].join('__');
    const pathKey = pathToKey(path);
    const originalValue = originalContent ? getIn(originalContent, path) : undefined;
    const isNumericField = typeof value === 'number' || typeof originalValue === 'number';

    if (Array.isArray(value)) {
      const lastKey = path[path.length - 1];
      const itemLabel = ARRAY_LABEL_OVERRIDES[lastKey] || (typeof label === 'string' ? label : 'Item');
      return (
        <div className="dashboard-field dashboard-field--array">
          {value.map((item, index) => (
            <div key={`${fieldId}_${index}`} className="dashboard-array-item">
              <div className="dashboard-array-item__header">
                <span>{`${itemLabel} ${index + 1}`}</span>
                <button type="button" onClick={() => handleRemoveItem([...path, index])}>
                  Remove
                </button>
              </div>
              {renderField(item, [...path, index], label)}
            </div>
          ))}
          <button
            type="button"
            className="dashboard-array-add"
            onClick={() => handleAddItem(path, value)}
          >
            Add {label}
          </button>
        </div>
      );
    }

    if (value !== null && typeof value === 'object') {
      return (
        <div className="dashboard-field dashboard-field--object">
          {Object.entries(value).map(([childKey, childValue]) => (
            HIDDEN_FIELDS.has(pathToKey([...path, childKey])) ? null : (
              <div key={`${fieldId}_${childKey}`} className="dashboard-field__group">
                <label htmlFor={`${fieldId}_${childKey}`}>{childKey}</label>
                {renderField(childValue, [...path, childKey], childKey)}
              </div>
            )
          ))}
        </div>
      );
    }

    if (typeof value === 'boolean') {
      return (
        <div className="dashboard-field dashboard-field--boolean">
          <input
            id={fieldId}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => handleValueChange(path, event.target.checked)}
          />
          <label htmlFor={fieldId}>{label}</label>
        </div>
      );
    }

    if (isNumericField) {
      const displayValue = value === '' || value === null || value === undefined ? '' : value;
      return (
        <input
          id={fieldId}
          type="number"
          value={displayValue}
          onChange={(event) => {
            const rawValue = event.target.value;
            if (rawValue === '') {
              handleValueChange(path, '');
              return;
            }

            const numericValue = Number(rawValue);
            if (!Number.isNaN(numericValue)) {
              handleValueChange(path, numericValue);
            }
          }}
        />
      );
    }

    const stringValue = value === null || value === undefined ? '' : String(value);
    const isTrackingScriptsField = pathKey === 'trackingScripts';
    const shouldUseTextarea = isTrackingScriptsField
      || stringValue.length > 160
      || stringValue.includes('\n');

    if (isImageField(label, path)) {
      const isProductImageField = path.includes('productImage');
      const isTestimonialImageField = path.includes('testimonials') && path.includes('image') && path[path.length - 1] === 'src';
      const isHeroTestimonialAvatar = pathKey === 'hero.testimonial.avatar';
      const previewSrc = stringValue ? resolveAssetPath(stringValue) : '';
      if (isProductImageField || isTestimonialImageField || isHeroTestimonialAvatar) {
        return (
          <div className="dashboard-field dashboard-field--image">
            <input
              id={fieldId}
              type="file"
              accept="image/*"
              onChange={(event) => handleFileUpload(event, path)}
            />
            {previewSrc ? (
              <div className="dashboard-field__preview">
                <img src={previewSrc} alt={`${label} preview`} />
              </div>
            ) : null}
          </div>
        );
      }

      return (
        <div className="dashboard-field dashboard-field--image">
          <input
            id={fieldId}
            type="text"
            value={stringValue}
            onChange={(event) => handleValueChange(path, event.target.value)}
            placeholder="Image URL or data URI"
          />
          <input
            type="file"
            accept="image/*"
            onChange={(event) => handleFileUpload(event, path)}
          />
          {previewSrc ? (
            <div className="dashboard-field__preview">
              <img src={previewSrc} alt={`${label} preview`} />
              <button type="button" onClick={() => handleValueChange(path, '')}>
                Clear
              </button>
            </div>
          ) : null}
        </div>
      );
    }

    if (shouldUseTextarea) {
      return (
        <textarea
          id={fieldId}
          rows={isTrackingScriptsField ? 10 : 4}
          value={stringValue}
          onChange={(event) => handleValueChange(path, event.target.value)}
          placeholder={isTrackingScriptsField ? '<script>/* paste your tracking code */</script>' : undefined}
        />
      );
    }

    return (
      <input
        id={fieldId}
        type="text"
        value={stringValue}
        onChange={(event) => handleValueChange(path, event.target.value)}
      />
    );
  };

  const renderSection = (sectionKey, sectionValue) => {
    if (sectionKey === 'trackingScripts') {
      return (
        <details key={sectionKey} className="dashboard-section" open>
          <summary>
            <span>Tracking Scripts</span>
          </summary>
          <div className="dashboard-section__content">
            <div className="dashboard-section__field">
              <label htmlFor="dashboard__trackingScripts">Embed code</label>
              {renderField(sectionValue, [sectionKey], sectionKey)}
              <p className="dashboard-section__hint">
                Paste Google Analytics, Facebook Pixel, Taboola, or other tracking snippets. The code renders on
                every public-facing page.
              </p>
            </div>
          </div>
        </details>
      );
    }

    return (
      <details key={sectionKey} className="dashboard-section" open>
        <summary>
          <span>{sectionKey}</span>
        </summary>
        <div className="dashboard-section__content">
          {sectionValue && typeof sectionValue === 'object' && !Array.isArray(sectionValue) ? (
            Object.entries(sectionValue).map(([fieldKey, fieldValue]) =>
              HIDDEN_FIELDS.has(pathToKey([sectionKey, fieldKey])) ? null : (
                <div key={`${sectionKey}_${fieldKey}`} className="dashboard-section__field">
                  {typeof fieldValue === 'boolean' ? null : (
                    <label htmlFor={`dashboard__${sectionKey}__${fieldKey}`}>{fieldKey}</label>
                  )}
                  {renderField(fieldValue, [sectionKey, fieldKey], fieldKey)}
                </div>
              ),
            )
          ) : (
            <div className="dashboard-section__field">
              {typeof sectionValue === 'boolean' ? null : (
                <label htmlFor={`dashboard__${sectionKey}`}>{sectionKey}</label>
              )}
              {renderField(sectionValue, [sectionKey], sectionKey)}
            </div>
          )}
        </div>
      </details>
    );
  };

  const renderTrialOrders = () => (
    <section className="dashboard__trial-orders">
      <div className="dashboard__trial-header">
        <div>
          <h2>Trial Orders</h2>
          <p>Review authorized trials and cancel the $60 capture when a product is returned within 7 days.</p>
        </div>
        <button type="button" onClick={loadTrialOrders} disabled={isLoadingTrialOrders}>
          {isLoadingTrialOrders ? 'Refreshing...' : 'Refresh orders'}
        </button>
      </div>

      {trialOrdersStatus.message ? (
        <p
          className={`dashboard__trial-status dashboard__trial-status--${trialOrdersStatus.state}`}
          role={trialOrdersStatus.state === 'error' ? 'alert' : 'status'}
        >
          {trialOrdersStatus.message}
        </p>
      ) : null}

      {trialOrders.length ? (
        <div className="dashboard__trial-table-wrap">
          <table className="dashboard__trial-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Capture At</th>
                <th>Shipping</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {trialOrders.map((order) => {
                const orderId = order.id || order.paymentIntentId || order.sessionId;
                const isFinal = order.status === 'captured' || order.status === 'returned';
                const isReturning = returningOrderId === orderId;

                return (
                  <tr key={orderId}>
                    <td>
                      <span className={`dashboard__trial-pill dashboard__trial-pill--${order.status || 'unknown'}`}>
                        {order.status || 'unknown'}
                      </span>
                      {order.lastError ? <span className="dashboard__trial-error">{order.lastError}</span> : null}
                    </td>
                    <td>
                      <strong>{order.customerName || 'Customer'}</strong>
                      <span>{order.customerEmail || 'No email'}</span>
                      {order.customerPhone ? <span>{order.customerPhone}</span> : null}
                    </td>
                    <td>{formatCents(order.amount, order.currency)}</td>
                    <td>{formatDateTime(order.captureAt)}</td>
                    <td>{formatShippingAddress(order.shippingDetails)}</td>
                    <td>
                      <button
                        type="button"
                        className="dashboard__trial-return"
                        onClick={() => handleMarkReturned(orderId)}
                        disabled={isFinal || isReturning || !order.paymentIntentId}
                      >
                        {isReturning ? 'Canceling...' : 'Mark Returned'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="dashboard__trial-empty">
          {isLoadingTrialOrders ? 'Loading trial orders...' : 'No trial orders yet.'}
        </p>
      )}
    </section>
  );

  const renderLogin = () => (
    <div className="dashboard__auth-card">
      <h1>Admin Login</h1>
      <p className="dashboard__auth-subtitle">Sign in to manage landing page content.</p>
      <form onSubmit={handleLogin} className="dashboard__auth-form">
        <label htmlFor="dashboard-email">Email</label>
        <input
          id="dashboard-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="username"
          required
        />
        <label htmlFor="dashboard-password">Password</label>
        <input
          id="dashboard-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
        {loginError ? <p className="dashboard__error" role="alert">{loginError}</p> : null}
        <button type="submit" disabled={isAuthenticating}>
          {isAuthenticating ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );

  if (!isAuthenticated) {
    return <main className="dashboard__container">{renderLogin()}</main>;
  }

  if (isLoadingContent && !draftContent) {
    return (
      <main className="dashboard__container">
        <p className="dashboard__status" role="status">Loading content…</p>
      </main>
    );
  }

  return (
    <main className="dashboard__container">
      <div className="dashboard">
        <header className="dashboard__header">
          <div>
            <h1>Content Dashboard</h1>
            <p>Update landing page copy, imagery, and offers without touching the code.</p>
          </div>
          <div className="dashboard__header-actions">
            <button type="button" onClick={loadContent} disabled={isLoadingContent}>
              {isLoadingContent ? 'Refreshing…' : 'Refresh'}
            </button>
            <button type="button" onClick={handleLogout}>
              Log Out
            </button>
          </div>
        </header>

        {loadError ? <p className="dashboard__error" role="alert">{loadError}</p> : null}

        <section className="dashboard__save-bar">
          <button type="button" onClick={handleSave} disabled={saveStatus.state === 'saving'}>
            {saveStatus.state === 'saving' ? 'Saving…' : 'Save changes'}
          </button>
          <span className="dashboard__save-hint">{isDirty ? 'Unsaved changes' : 'Everything saved'}</span>
          {saveStatus.message ? (
            <span
              className={`dashboard__save-status dashboard__save-status--${saveStatus.state}`}
              role={saveStatus.state === 'error' ? 'alert' : 'status'}
            >
              {saveStatus.message}
            </span>
          ) : null}
        </section>

        <section className="dashboard__integrations">
          <div className="dashboard__integration-card">
            <div className="dashboard__integration-header">
              <h2>Stripe Checkout</h2>
              <p>Switch between test and live mode, and keep both publishable and secret keys in sync.</p>
            </div>
            <div className="dashboard__integration-grid">
              <div className="dashboard__integration-field">
                <label htmlFor="dashboard-stripe-mode">Active mode</label>
                <select
                  id="dashboard-stripe-mode"
                  value={stripeMode}
                  onChange={(event) => handleValueChange(
                    ['checkout', 'stripe', 'mode'],
                    event.target.value === 'live' ? 'live' : 'test',
                  )}
                >
                  <option value="test">Test (Stripe test environment)</option>
                  <option value="live">Live (real charges)</option>
                </select>
              </div>
              <div className="dashboard__integration-field">
                <label htmlFor="dashboard-stripe-test-publishable">Test publishable key</label>
                <input
                  id="dashboard-stripe-test-publishable"
                  type="text"
                  value={stripeSettings.testPublishableKey || ''}
                  onChange={(event) => handleValueChange(
                    ['checkout', 'stripe', 'testPublishableKey'],
                    event.target.value,
                  )}
                  placeholder="pk_test_XXXX"
                  autoComplete="off"
                />
              </div>
              <div className="dashboard__integration-field">
                <label htmlFor="dashboard-stripe-live-publishable">Live publishable key</label>
                <input
                  id="dashboard-stripe-live-publishable"
                  type="text"
                  value={stripeSettings.livePublishableKey || ''}
                  onChange={(event) => handleValueChange(
                    ['checkout', 'stripe', 'livePublishableKey'],
                    event.target.value,
                  )}
                  placeholder="pk_live_XXXX"
                  autoComplete="off"
                />
              </div>
              <div className="dashboard__integration-field">
                <label htmlFor="dashboard-stripe-test-secret">Test secret key</label>
                <input
                  id="dashboard-stripe-test-secret"
                  type="password"
                  value={stripeSecrets.testSecretKey}
                  onChange={(event) => handleStripeSecretChange('testSecretKey', event.target.value)}
                  placeholder="Enter your Stripe test secret key"
                  autoComplete="off"
                  disabled={isLoadingStripeSecrets || isSavingStripeSecrets}
                />
              </div>
              <div className="dashboard__integration-field">
                <label htmlFor="dashboard-stripe-live-secret">Live secret key</label>
                <input
                  id="dashboard-stripe-live-secret"
                  type="password"
                  value={stripeSecrets.liveSecretKey}
                  onChange={(event) => handleStripeSecretChange('liveSecretKey', event.target.value)}
                  placeholder="Enter your Stripe live secret key"
                  autoComplete="off"
                  disabled={isLoadingStripeSecrets || isSavingStripeSecrets}
                />
              </div>
            </div>
            <div className="dashboard__integration-actions">
              <button
                type="button"
                onClick={handleSave}
                disabled={!stripeSettingsDirty || saveStatus.state === 'saving'}
              >
                {saveStatus.state === 'saving' ? 'Saving publishable keys…' : 'Save publishable keys'}
              </button>
              <button
                type="button"
                onClick={handleStripeSecretsSave}
                disabled={!stripeSecretsDirty || isSavingStripeSecrets || isLoadingStripeSecrets}
              >
                {isSavingStripeSecrets ? 'Saving secret keys…' : 'Save secret keys'}
              </button>
              {stripeSecretsStatus.message ? (
                <span
                  className={`dashboard__integration-status dashboard__integration-status--${stripeSecretsStatus.state}`}
                  role={stripeSecretsStatus.state === 'error' ? 'alert' : 'status'}
                >
                  {stripeSecretsStatus.message}
                </span>
              ) : null}
            </div>
            <p className="dashboard__integration-note">
              Publishable keys save with the main “Save changes” button (or the shortcut above). Secret keys are stored
              on the server and never exposed to visitors. Use the mode selector to choose which pair the checkout
              flow should use.
            </p>
          </div>
        </section>

        {renderTrialOrders()}

        <section className="dashboard__sections">
          {draftContent && typeof draftContent === 'object'
            ? Object.entries(draftContent).map(([sectionKey, sectionValue]) =>
                renderSection(sectionKey, sectionValue),
              )
            : null}
        </section>
      </div>
    </main>
  );
}

export default Dashboard;
