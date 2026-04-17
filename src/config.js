export const APP_ID = 'com.elyarestark.ClipboardHistory';
export const APP_NAME = 'Clipboard History';
export const APP_DATA_DIRNAME = 'clipboard-history-app';

export const DEFAULT_CONFIG = {
    maxHistorySize: 60,
    persistenceEnabled: true,
    imageCaptureEnabled: true,
    captureEnabled: true,
    excludeSensitive: true,
    sessionOnly: false,
    maxTextLength: 12000,
    maxImageBytes: 3145728,
    pollIntervalMs: 700,
    excludedPatterns: ['BEGIN PGP', 'PRIVATE KEY', 'otp', '2fa code'],
    panelWidth: 600,
    panelHeight: 830,
};
