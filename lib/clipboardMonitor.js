import GdkPixbuf from 'gi://GdkPixbuf';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {bytesToBase64} from './utils.js';

const CLIPBOARD_TYPE = St.ClipboardType.CLIPBOARD;

export class ClipboardMonitor {
    constructor(settings, history) {
        this._settings = settings;
        this._history = history;
        this._clipboard = St.Clipboard.get_default();
        this._timeoutId = 0;
        this._paused = false;
        this._isChecking = false;
        this._lastText = '';
        this._lastImageFingerprint = '';
    }

    start() {
        this.stop();
        this._paused = !this._settings.get_boolean('capture-enabled');
        this._schedule();
    }

    pause() {
        this._paused = true;
    }

    resume() {
        this._paused = false;
    }

    stop() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
    }

    destroy() {
        this.stop();
    }

    _schedule() {
        const interval = Math.max(250, this._settings.get_int('poll-interval-ms'));
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, () => {
            this._tick();
            return GLib.SOURCE_CONTINUE;
        });
    }

    async _tick() {
        if (this._paused || this._isChecking)
            return;

        this._isChecking = true;
        try {
            const text = await this._readText();
            if (text && text !== this._lastText) {
                const added = this._history.addText(text);
                this._lastText = text;
                if (added)
                    return;
            }

            if (this._settings.get_boolean('enable-images'))
                await this._captureImage();
        } catch (error) {
            logError(error, 'Clipboard polling failed');
        } finally {
            this._isChecking = false;
        }
    }

    _readText() {
        return new Promise(resolve => {
            this._clipboard.get_text(CLIPBOARD_TYPE, (_clipboard, text) => resolve(text ?? null));
        });
    }

    async _captureImage() {
        const mimeTypes = this._clipboard.get_mimetypes(CLIPBOARD_TYPE) ?? [];
        const mimeType = mimeTypes.find(type => ['image/png', 'image/jpeg', 'image/webp', 'image/bmp'].includes(type));

        if (!mimeType)
            return;

        const bytes = await new Promise(resolve => {
            this._clipboard.get_content(CLIPBOARD_TYPE, mimeType, (_clipboard, content) => resolve(content ?? null));
        });

        if (!bytes)
            return;

        const encoded = bytesToBase64(bytes);
        const fingerprint = `${mimeType}:${encoded.slice(0, 64)}:${encoded.length}`;
        if (fingerprint === this._lastImageFingerprint)
            return;

        let metadata = {
            preview: 'Image',
        };

        try {
            const loader = new GdkPixbuf.PixbufLoader();
            loader.write_bytes(bytes);
            loader.close();
            const pixbuf = loader.get_pixbuf();
            if (pixbuf) {
                metadata = {
                    width: pixbuf.get_width(),
                    height: pixbuf.get_height(),
                    preview: `${pixbuf.get_width()} × ${pixbuf.get_height()}`,
                };
            }
        } catch (error) {
            log(`Clipboard image metadata decode failed: ${error}`);
        }

        if (this._history.addImage(encoded, mimeType, metadata))
            this._lastImageFingerprint = fingerprint;
    }
}
