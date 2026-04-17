import Gdk from 'gi://Gdk?version=4.0';
import GLib from 'gi://GLib';

import {buildSearchText, createId, isProbablySensitive, matchesExcludedPattern, summarizeText} from '../utils.js';

export class HistoryManager {
    constructor(storage, config) {
        this._storage = storage;
        this._config = config;
        this._items = [];
        this._listeners = new Set();
        this._configListeners = new Set();
    }

    load() {
        this._items = this._sanitizeItems(this._storage.loadHistory());
        this._emit();
    }

    destroy() {
        this.sync();
        this._listeners.clear();
        this._configListeners.clear();
    }

    subscribe(callback) {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    }

    subscribeConfig(callback) {
        this._configListeners.add(callback);
        return () => this._configListeners.delete(callback);
    }

    getConfig() {
        return {...this._config};
    }

    updateConfig(patch) {
        this._config = {
            ...this._config,
            ...patch,
        };
        this._storage.saveConfig(this._config);

        if (!this._config.persistenceEnabled || this._config.sessionOnly)
            this._storage.clearHistory();
        else
            this._storage.saveHistory(this._items);

        for (const callback of this._configListeners)
            callback(this.getConfig());

        this._emit();
    }

    getAll() {
        return [...this._items];
    }

    getVisible(query = '') {
        const normalized = query.trim().toLowerCase();
        const filtered = normalized
            ? this._items.filter(item => item.searchText.includes(normalized))
            : this._items;

        return [...filtered].sort((a, b) => {
            if (a.pinned !== b.pinned)
                return Number(b.pinned) - Number(a.pinned);
            return b.createdAt - a.createdAt;
        });
    }

    addText(text) {
        const normalized = (text ?? '').trim();
        if (!normalized)
            return false;

        if (normalized.length > this._config.maxTextLength)
            return false;

        if (this._config.excludeSensitive && isProbablySensitive(normalized))
            return false;

        if (matchesExcludedPattern(normalized, this._config.excludedPatterns))
            return false;

        const latest = this._getLatestItem();
        if (latest?.type === 'text' && latest.text === normalized)
            return false;

        const item = this._decorateItem({
            id: createId(),
            type: 'text',
            text: normalized,
            preview: summarizeText(normalized, 180),
            createdAt: Date.now(),
            pinned: false,
        });

        this._addItem(item);
        return true;
    }

    addImage(base64, mimeType, metadata = {}) {
        if (!base64 || !this._config.imageCaptureEnabled)
            return false;

        if (base64.length > this._config.maxImageBytes * 1.37)
            return false;

        const latest = this._getLatestItem();
        if (latest?.type === 'image' && latest.imageData === base64)
            return false;

        const item = this._decorateItem({
            id: createId(),
            type: 'image',
            imageData: base64,
            mimeType,
            width: metadata.width ?? 0,
            height: metadata.height ?? 0,
            preview: metadata.preview ?? 'Image',
            createdAt: Date.now(),
            pinned: false,
        });

        this._addItem(item);
        return true;
    }

    activateItem(item, clipboard) {
        if (!item)
            return false;

        try {
            if (item.type === 'text') {
                clipboard.set_content(Gdk.ContentProvider.new_for_value(item.text ?? ''));
            } else if (item.type === 'image') {
                const provider = Gdk.ContentProvider.new_for_bytes(item.mimeType ?? 'image/png', GLib.Bytes.new(GLib.base64_decode(item.imageData)));
                clipboard.set_content(provider);
            } else {
                return false;
            }
        } catch (error) {
            logError(error, 'Failed to copy item back to clipboard');
            return false;
        }

        item.lastUsedAt = Date.now();
        this._emit();
        return true;
    }

    togglePin(id) {
        const item = this._items.find(entry => entry.id === id);
        if (!item)
            return;

        item.pinned = !item.pinned;
        item.updatedAt = Date.now();
        this.sync();
        this._emit();
    }

    remove(id) {
        const index = this._items.findIndex(item => item.id === id);
        if (index < 0)
            return;

        this._items.splice(index, 1);
        this.sync();
        this._emit();
    }

    clearAll() {
        this._items = [];
        this.sync();
        this._emit();
    }

    sync() {
        this._items = this._sanitizeItems(this._items);
        if (this._config.persistenceEnabled && !this._config.sessionOnly)
            this._storage.saveHistory(this._items);
        else
            this._storage.clearHistory();
    }

    _addItem(item) {
        this._items = this._trimToLimit([item, ...this._items], this._config.maxHistorySize);
        this.sync();
        this._emit();
    }

    _sanitizeItems(items) {
        const sanitized = [];

        for (const item of items ?? []) {
            if (!item?.id || !item?.type)
                continue;
            if (item.type === 'text' && !item.text)
                continue;
            if (item.type === 'image' && !item.imageData)
                continue;
            sanitized.push(this._decorateItem(item));
        }

        sanitized.sort((a, b) => b.createdAt - a.createdAt);
        return this._trimToLimit(sanitized, this._config.maxHistorySize);
    }

    _decorateItem(item) {
        return {
            ...item,
            createdAt: item.createdAt ?? Date.now(),
            updatedAt: item.updatedAt ?? item.createdAt ?? Date.now(),
            preview: item.preview ?? summarizeText(item.text ?? item.mimeType ?? item.type, 180),
            searchText: buildSearchText(item),
        };
    }

    _getLatestItem() {
        return this._items.reduce((latest, item) => {
            if (!latest || item.createdAt > latest.createdAt)
                return item;
            return latest;
        }, null);
    }

    _trimToLimit(items, max) {
        const pinned = items.filter(item => item.pinned);
        const normal = items.filter(item => !item.pinned).slice(0, Math.max(0, max - pinned.length));
        return [...pinned, ...normal].sort((a, b) => b.createdAt - a.createdAt);
    }

    _emit() {
        for (const callback of this._listeners)
            callback();
    }
}
