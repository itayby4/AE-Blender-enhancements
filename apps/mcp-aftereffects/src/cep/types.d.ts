// Minimal CEP type stubs. Adobe ships @types/cep_node-style typings
// elsewhere; we declare only what this codebase uses so the dep tree
// stays lean.

declare global {
  interface Window {
    __adobe_cep__?: {
      evalScript(script: string, callback?: (result: string) => void): void;
      requireBuiltInExtensions: () => void;
    };
    cep_node?: {
      require: NodeRequire;
    };
    require?: NodeRequire;
    CSInterface: typeof CSInterface;
  }

  class CSInterface {
    constructor();
    evalScript(script: string, callback?: (result: string) => void): void;
    getHostEnvironment(): {
      appName: string;
      appVersion: string;
      appLocale: string;
      appUILocale: string;
      appId: string;
      isAppOnline: boolean;
      appSkinInfo: unknown;
    };
    getSystemPath(pathType: string): string;
    addEventListener(
      type: string,
      listener: (event: { type: string; data: unknown }) => void
    ): void;
    closeExtension(): void;
  }
}

export {};
