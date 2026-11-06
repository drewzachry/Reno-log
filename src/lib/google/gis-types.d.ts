/**
 * Minimal shape of the globals Google's client-side scripts attach to
 * `window`. There's no official `@types` package for Google Identity
 * Services or the Picker; this covers only what this app calls.
 */

type GoogleCredentialResponse = { credential: string };

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  error?: string;
  error_description?: string;
};

type GoogleTokenClient = {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
};

interface Window {
  google?: {
    accounts: {
      id: {
        initialize: (config: {
          client_id: string;
          callback: (response: GoogleCredentialResponse) => void;
        }) => void;
        renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        disableAutoSelect: () => void;
      };
      oauth2: {
        initTokenClient: (config: {
          client_id: string;
          scope: string;
          callback: (response: GoogleTokenResponse) => void;
          error_callback?: (error: { type: string }) => void;
        }) => GoogleTokenClient;
      };
    };
    picker?: {
      PickerBuilder: new () => GooglePickerBuilder;
      DocsView: new (viewId?: string) => GoogleDocsView;
      ViewId: { FOLDERS: string };
      Action: { PICKED: string; CANCEL: string };
      Response: { ACTION: string; DOCUMENTS: string };
      Document: { ID: string; NAME: string };
    };
  };
  gapi?: {
    load: (api: string, callback: () => void) => void;
  };
}

interface GooglePickerBuilder {
  addView: (view: string | GoogleDocsView) => GooglePickerBuilder;
  setOAuthToken: (token: string) => GooglePickerBuilder;
  setDeveloperKey: (key: string) => GooglePickerBuilder;
  setCallback: (callback: (data: Record<string, unknown>) => void) => GooglePickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
}

interface GoogleDocsView {
  setIncludeFolders: (include: boolean) => GoogleDocsView;
  setSelectFolderEnabled: (enabled: boolean) => GoogleDocsView;
  setMimeTypes: (mimeTypes: string) => GoogleDocsView;
}
