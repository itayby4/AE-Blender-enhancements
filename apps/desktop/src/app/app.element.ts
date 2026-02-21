import './app.element.css';

export class AppElement extends HTMLElement {
  public static observedAttributes = [];

  connectedCallback() {
    this.innerHTML = `
      <main class="container">
        <h1>PipeFX</h1>
        <p>Desktop application powered by Tauri</p>
      </main>
    `;
  }
}
customElements.define('pipefx-root', AppElement);
