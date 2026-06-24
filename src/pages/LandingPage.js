import { useCallback, useEffect, useMemo } from 'react';
import useLandingContent from '../hooks/useLandingContent';
import {
  BrandingStrip,
  HeroSection,
  BenefitsSection,
  ScienceCallout,
  IngredientsSection,
  ResultsSection,
  TestimonialsSection,
  ProductClaimsSection,
  HowToUseSection,
  GuaranteeSection,
  FaqSection,
  FinalCtaSection,
  FooterSection,
} from '../components/landing';
import './LandingPage.css';

function LandingPage() {
  const { content, isLoading, error } = useLandingContent();
  const checkoutEnabled = Boolean(content?.checkout);

  useEffect(() => {
    const routeHandler = (event) => {
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }

      const target = event?.currentTarget;
      const url = target?.getAttribute('action') || target?.getAttribute('href');
      const shouldOpenInNewTab = target?.getAttribute('target') === '_blank';

      if (url) {
        if (shouldOpenInNewTab) {
          window.open(url, '_blank', 'noopener');
        } else {
          window.location.href = url;
        }
      }
    };

    window.route = routeHandler;
    window.linkMethod = routeHandler;

    return () => {
      delete window.route;
      delete window.linkMethod;
    };
  }, []);

  const handleNavigateToProducts = useCallback(() => {
    window.location.href = '/checkout';
  }, []);

  const body = useMemo(() => {
    if (isLoading) {
      return <div data-landing-status="loading">Loading content…</div>;
    }

    if (error) {
      return (
        <div data-landing-status="error">
          Unable to load landing content. Please refresh the page.
        </div>
      );
    }

    if (!content) {
      return <div data-landing-status="empty">No landing content available.</div>;
    }

    return (
      <>
        <BrandingStrip branding={content.branding} />
        <HeroSection
          hero={content.hero}
          onPrimaryCtaClick={checkoutEnabled ? handleNavigateToProducts : undefined}
          onSecondaryCtaClick={checkoutEnabled ? handleNavigateToProducts : undefined}
        />
        <BenefitsSection benefits={content.benefits} />
        <ScienceCallout scienceCallout={content.scienceCallout} />
        <IngredientsSection
          ingredients={content.ingredients}
          onCtaClick={checkoutEnabled ? handleNavigateToProducts : undefined}
        />
        <ResultsSection results={content.results} />
        <TestimonialsSection testimonials={content.testimonials} />
        <ProductClaimsSection productClaims={content.productClaims} />
        <HowToUseSection howToUse={content.howToUse} />
        <GuaranteeSection guarantee={content.guarantee} />
        <FaqSection faq={content.faq} />
        <FinalCtaSection
          finalCta={content.finalCta}
          onCtaClick={checkoutEnabled ? handleNavigateToProducts : undefined}
        />
        <FooterSection footer={content.footer} />
      </>
    );
  }, [checkoutEnabled, content, error, handleNavigateToProducts, isLoading]);

  return (
    <main className="landing-page" data-landing-root>
      {body}
    </main>
  );
}

export default LandingPage;
