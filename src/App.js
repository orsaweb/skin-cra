import { useEffect } from 'react';
import './App.css';
import LandingPage from './pages/LandingPage';
import ProductsPage from './pages/ProductsPage';
import CheckoutPage from './pages/CheckoutPage';
import OrderCompletedPage from './pages/OrderCompletedPage';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import Dashboard from './pages/Dashboard';
import Blog5in1SerumPage from './pages/Blog5in1SerumPage';
import { trackFacebookPageView } from './lib/facebookPixel';

const getCurrentLocationSignature = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
};

function App() {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.history === 'undefined') {
      return undefined;
    }

    let lastTrackedLocation = getCurrentLocationSignature();
    const originalPushState = window.history.pushState;

    const trackLocationChange = () => {
      window.setTimeout(() => {
        const nextLocation = getCurrentLocationSignature();

        if (!nextLocation || nextLocation === lastTrackedLocation) {
          return;
        }

        lastTrackedLocation = nextLocation;
        trackFacebookPageView();
      }, 0);
    };

    window.history.pushState = function pushStateWithPageView(...args) {
      const result = originalPushState.apply(this, args);
      trackLocationChange();
      return result;
    };

    window.addEventListener('popstate', trackLocationChange);

    return () => {
      window.history.pushState = originalPushState;
      window.removeEventListener('popstate', trackLocationChange);
    };
  }, []);

  const path = window.location.pathname.replace(/\/+$/, '') || '/';

  if (path.startsWith('/dashboard')) {
    return <Dashboard />;
  }

  if (path === '/products') {
    return <ProductsPage />;
  }

  if (path.startsWith('/checkout')) {
    return <CheckoutPage />;
  }

  if (path.startsWith('/order-completed')) {
    return <OrderCompletedPage />;
  }

  if (path === '/privacy-policy') {
    return <PrivacyPolicy />;
  }

  if (path === '/terms-of-service') {
    return <TermsOfService />;
  }

  if (path === '/blog/5in1serum') {
    return <Blog5in1SerumPage />;
  }

  return <LandingPage />;
}

export default App;
