import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {APP_DATA_DIRNAME, DEFAULT_CONFIG} from '../config.js';
import {ensureDirectory} from '../utils.js';

export class Storage {
    constructor() {
        this._configDir = GLib.build_filenamev([GLib.get_user_config_dir(), APP_DATA_DIRNAME]);
        this._stateDir = GLib.build_filenamev([GLib.get_user_state_dir(), APP_DATA_DIRNAME]);
        this._configPath = GLib.build_filenamev([this._configDir, 'config.json']);
        this._historyPath = GLib.build_filenamev([this._stateDir, 'history.json']);

        ensureDirectory(this._configDir);
        ensureDirectory(this._stateDir);
    }

    loadConfig() {
        return {
            ...DEFAULT_CONFIG,
            ...this._loadJson(this._configPath, {}),
        };
    }

    saveConfig(config) {
        this._saveJson(this._configPath, config);
    }

    loadHistory() {
        const payload = this._loadJson(this._historyPath, {items: []});
        return Array.isArray(payload?.items) ? payload.items : [];
    }

    saveHistory(items) {
        this._saveJson(this._historyPath, {
            version: 1,
            updatedAt: Date.now(),
            items,
        });
    }

    clearHistory() {
        try {
            const file = Gio.File.new_for_path(this._historyPath);
            if (file.query_exists(null))
                file.delete(null);
        } catch (error) {
            logError(error, 'Failed to clear history file');
        }
    }

    _loadJson(path, fallback) {
        try {
            const file = Gio.File.new_for_path(path);
            if (!file.query_exists(null))
                return fallback;

            const [bytes] = file.load_bytes(null);
            return JSON.parse(new TextDecoder().decode(bytes.toArray()));
        } catch (error) {
            logError(error, `Failed to load JSON from ${path}`);
            return fallback;
        }
    }

    _saveJson(path, payload) {
        try {
            const content = JSON.stringify(payload, null, 2);
            GLib.file_set_contents(path, content);
        } catch (error) {
            logError(error, `Failed to save JSON to ${path}`);
        }
    }
}
