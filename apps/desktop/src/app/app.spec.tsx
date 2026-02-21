import { render, screen } from '@testing-library/react';
import { App } from './app';

describe('App', () => {
  it('should render the app title', () => {
    render(<App />);
    expect(screen.getByText('PipeFX')).toBeTruthy();
  });
});
