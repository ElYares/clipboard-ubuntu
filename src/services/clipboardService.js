import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk?version=4.0';

import {bytesToBase64} from '../utils.js';

const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/bmp'];

export class ClipboardService {
    constructor(historyManager) {
        this._historyManager = historyManager;
        this._clipboard = null;
        this._timeoutId = 0;
        this._isChecking = false;
        this._lastText = '';
        this._lastImageFingerprint = '';
        this._unsubscribeConfig = this._historyManager.subscribeConfig(() => this._restart());
    }

    start(clipboard) {
        this._clipboard = clipboard;
        this._restart();
    }

    stop() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
    }

    destroy() {
        this.stop();
        this._unsubscribeConfig?.();
        this._unsubscribeConfig = null;
    }

    _restart() {
        this.stop();

        const config = this._historyManager.getConfig();
        if (!config.captureEnabled || !this._clipboard)
            return;

        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.max(250, config.pollIntervalMs), () => {
            this._tick();
            return GLib.SOURCE_CONTINUE;
        });
    }

    async _tick() {
        if (this._isChecking)
            return;

        this._isChecking = true;
        try {
            const config = this._historyManager.getConfig();
            if (!config.captureEnabled)
                return;

            const text = await this._readText();
            if (text && text !== this._lastText) {
                const added = this._historyManager.addText(text);
                this._lastText = text;
                if (added)
                    return;
            }

            if (config.imageCaptureEnabled)
                await this._captureImage(config.maxImageBytes);
        } catch (error) {
            logError(error, 'Clipboard monitor tick failed');
        } finally {
            this._isChecking = false;
        }
    }

    _readText() {
        return new Promise(resolve => {
            try {
                this._clipboard.read_text_async(null, (_clipboard, result) => {
                    try {
                        resolve(this._clipboard.read_text_finish(result));
                    } catch (_error) {
                        resolve(null);
                    }
                });
            } catch (_error) {
                resolve(null);
            }
        });
    }

    async _captureImage(maxImageBytes) {
        const formats = this._clipboard.get_formats();
        const hasImage = IMAGE_MIME_TYPES.some(mime => formats.contain_mime_type(mime));
        if (!hasImage)
            return;

        const texture = await new Promise(resolve => {
            try {
                this._clipboard.read_texture_async(null, (_clipboard, result) => {
                    try {
                        resolve(this._clipboard.read_texture_finish(result));
                    } catch (_error) {
                        resolve(null);
                    }
                });
            } catch (_error) {
                resolve(null);
            }
        });

        if (!texture)
            return;

        const bytes = texture.save_to_png_bytes();
        if (!bytes || bytes.get_size() > maxImageBytes)
            return;

        const encoded = bytesToBase64(bytes);
        const fingerprint = `png:${encoded.slice(0, 64)}:${encoded.length}`;
        if (fingerprint === this._lastImageFingerprint)
            return;

        const added = this._historyManager.addImage(encoded, 'image/png', {
            width: texture.get_width(),
            height: texture.get_height(),
            preview: `${texture.get_width()} × ${texture.get_height()}`,
        });

        if (added)
            this._lastImageFingerprint = fingerprint;
    }
}
