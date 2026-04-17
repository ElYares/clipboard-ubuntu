import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {ensureDirectory} from './utils.js';

export class HistoryStorage {
    constructor(uuid, settings) {
        this._uuid = uuid;
        this._settings = settings;
        this._dir = GLib.build_filenamev([GLib.get_user_state_dir(), uuid]);
        this._filePath = GLib.build_filenamev([this._dir, 'history.json']);
        ensureDirectory(this._dir);
    }

    load() {
        if (!this._settings.get_boolean('enable-persistence') || this._settings.get_boolean('session-only'))
            return [];

        try {
            const file = Gio.File.new_for_path(this._filePath);
            if (!file.query_exists(null))
                return [];

            const [bytes] = file.load_bytes(null);
            const text = new TextDecoder().decode(bytes.toArray());
            const data = JSON.parse(text);
            return Array.isArray(data?.items) ? data.items : [];
        } catch (error) {
            logError(error, 'Failed to load clipboard history');
            return [];
        }
    }

    save(items) {
        if (!this._settings.get_boolean('enable-persistence') || this._settings.get_boolean('session-only')) {
            this.clear();
            return;
        }

        try {
            ensureDirectory(this._dir);
            const payload = JSON.stringify({
                version: 1,
                updatedAt: Date.now(),
                items,
            }, null, 2);
            GLib.file_set_contents(this._filePath, payload);
        } catch (error) {
            logError(error, 'Failed to save clipboard history');
        }
    }

    clear() {
        try {
            const file = Gio.File.new_for_path(this._filePath);
            if (file.query_exists(null))
                file.delete(null);
        } catch (error) {
            logError(error, 'Failed to clear clipboard history storage');
        }
    }
}
