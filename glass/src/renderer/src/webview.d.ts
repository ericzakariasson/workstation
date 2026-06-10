import type * as React from "react";

/** Subset of Electron's WebviewTag API used by the built-in browser. */
export interface WebviewElement extends HTMLElement {
  src: string;
  loadURL(url: string): Promise<void>;
  getURL(): string;
  getTitle(): string;
  reload(): void;
  stop(): void;
  goBack(): void;
  goForward(): void;
  canGoBack(): boolean;
  canGoForward(): boolean;
  isDevToolsOpened(): boolean;
  openDevTools(): void;
  closeDevTools(): void;
  getWebContentsId(): number;
}

declare module "react/jsx-runtime" {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        partition?: string;
        allowpopups?: string;
      };
    }
  }
}
