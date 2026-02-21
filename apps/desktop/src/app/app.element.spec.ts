import { AppElement } from './app.element';

describe('AppElement', () => {
  let app: AppElement;

  beforeEach(() => {
    app = new AppElement();
  });

  it('should create successfully', () => {
    expect(app).toBeTruthy();
  });

  it('should render the app title', () => {
    app.connectedCallback();
    expect(app.querySelector('h1')?.textContent).toContain('PipeFX');
  });
});
