// Minimal CSInterface shim. Adobe's full CSInterface.js (~1000 lines)
// covers theming, OS shell, file dialogs, locale info — none of which
// we use. CEP exposes window.__adobe_cep__ directly, so this just
// publishes a CSInterface global that wraps that surface. If you ever
// need more methods, drop in Adobe's full CSInterface.js from the
// CEP-Resources repo (BSD-licensed) at the same path.

(function (root) {
  function CSInterface() {}

  CSInterface.prototype.evalScript = function (script, callback) {
    if (typeof callback !== 'function') callback = function () {};
    if (root.__adobe_cep__ && root.__adobe_cep__.evalScript) {
      root.__adobe_cep__.evalScript(script, callback);
    } else {
      callback('EvalScript error.');
    }
  };

  CSInterface.prototype.getHostEnvironment = function () {
    if (root.__adobe_cep__ && root.__adobe_cep__.getHostEnvironment) {
      try {
        return JSON.parse(root.__adobe_cep__.getHostEnvironment());
      } catch (e) {
        return null;
      }
    }
    return null;
  };

  CSInterface.prototype.addEventListener = function (type, listener) {
    if (root.__adobe_cep__ && root.__adobe_cep__.addEventListener) {
      root.__adobe_cep__.addEventListener(type, listener);
    }
  };

  CSInterface.prototype.closeExtension = function () {
    if (root.__adobe_cep__ && root.__adobe_cep__.closeExtension) {
      root.__adobe_cep__.closeExtension();
    }
  };

  CSInterface.prototype.getSystemPath = function (pathType) {
    if (root.__adobe_cep__ && root.__adobe_cep__.getSystemPath) {
      return root.__adobe_cep__.getSystemPath(pathType);
    }
    return '';
  };

  root.CSInterface = CSInterface;
})(typeof window !== 'undefined' ? window : this);
