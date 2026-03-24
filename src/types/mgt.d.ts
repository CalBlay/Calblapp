// Tipus globals per Microsoft Graph Toolkit
export {};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'mgt-file-picker': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        ref?: React.Ref<HTMLElement>;
        resource?: string;
        scopes?: string;
        [key: string]: unknown;
      };
    }
  }
}
