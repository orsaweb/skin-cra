import { render, screen } from '@testing-library/react';
import App from './App';

test('renders landing content loading state', () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn(() => new Promise(() => {}));
  window.history.pushState({}, '', '/');

  render(<App />);

  expect(screen.getByText(/loading content/i)).toBeInTheDocument();

  global.fetch = originalFetch;
});
