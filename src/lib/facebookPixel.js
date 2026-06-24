export function trackFacebookEvent(eventName, params) {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') {
    return false;
  }

  if (params && typeof params === 'object') {
    window.fbq('track', eventName, params);
  } else {
    window.fbq('track', eventName);
  }

  return true;
}

export function trackFacebookPageView() {
  return trackFacebookEvent('PageView');
}

export function trackFacebookPurchase(params = {}) {
  return trackFacebookEvent('Purchase', params);
}
