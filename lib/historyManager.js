import St from 'gi://St';
import GLib from 'gi://GLib';

import {buildSearchText, createId, isProbablySensitive, matchesExcludedPattern, summarizeText} from './utils.js';

const CLIPBOARD_TYPE = St.ClipboardType.CLIPBOARD;

export class HistoryManager {
    constructor(settings, storage) {
        this._settings = settings;
        this._storage = storage;
        this._clipboard = St.Clipboard.get_default();
        this._items = [];
        this._listeners = new Set();
    }

    load() {
        this._items = this._sanitizeItems(this._storage.load());
        this._emit();
    }

    destroy() {
        this.sync();
        this._listeners.clear();
        this._items = [];
    }

    subscribe(callback) {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
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

        if (normalized.length > this._settings.get_int('max-text-length'))
            return false;

        if (this._settings.get_boolean('exclude-sensitive') && isProbablySensitive(normalized))
            return false;

        if (matchesExcludedPattern(normalized, this._settings.get_strv('excluded-patterns')))
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
        if (!base64 || !this._settings.get_boolean('enable-images'))
            return false;

        if (base64.length > this._settings.get_int('max-image-bytes') * 1.37)
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

    clearUnpinned() {
        this._items = this._items.filter(item => item.pinned);
        this.sync();
        this._emit();
    }

    clearAll() {
        this._items = [];
        this._storage.clear();
        this._emit();
    }

    activate(item) {
        if (!item)
            return;

        if (item.type === 'text')
            this._clipboard.set_text(CLIPBOARD_TYPE, item.text ?? '');
        else if (item.type === 'image' && item.imageData)
            this._clipboard.set_content(CLIPBOARD_TYPE, item.mimeType ?? 'image/png', GLib.Bytes.new(GLib.base64_decode(item.imageData)));

        item.lastUsedAt = Date.now();
        this._emit();
    }

    sync() {
        const items = this._sanitizeItems(this._items);
        this._items = items;
        this._storage.save(items);
    }

    _addItem(item) {
        const max = this._settings.get_int('max-history-size');
        this._items = this._trimToLimit([item, ...this._items], max);
        this.sync();
        this._emit();
    }

    _sanitizeItems(items) {
        const max = this._settings.get_int('max-history-size');
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
        return this._trimToLimit(sanitized, max);
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

    _emit() {
        for (const callback of this._listeners)
            callback();
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
}
