import '@testing-library/jest-dom';

// Fix Node 20+ undici / jsdom AbortSignal mismatch in React Router createMemoryRouter navigations
if (typeof globalThis.Request !== 'undefined') {
  const OriginalRequest = globalThis.Request;
  globalThis.Request = class extends OriginalRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      if (init && 'signal' in init) {
        delete init.signal;
      }
      super(input, init);
    }
  };
}
