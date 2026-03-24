// ✅ Fa que TypeScript accepti el web component <mgt-file-picker>
export {};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'mgt-file-picker': {
        resource?: string;
        scopes?: string;
        [key: string]: unknown; // evita squiggles de propietats extra
      };
    }
  }
}
