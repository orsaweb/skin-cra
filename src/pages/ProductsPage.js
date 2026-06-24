import { useEffect } from 'react';
import './ProductsPage.css';

function ProductsPage() {
  useEffect(() => {
    window.location.replace('/checkout');
  }, []);

  return (
    <main className="products-page" data-landing-root>
      <div className="products-page__status">Redirecting to checkout...</div>
    </main>
  );
}

export default ProductsPage;
