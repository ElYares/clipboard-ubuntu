import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';

import {APP_NAME} from '../config.js';
import {HistoryRow} from './historyRow.js';

export const MainWindow = GObject.registerClass(
class MainWindow extends Adw.ApplicationWindow {
    constructor(app, historyManager) {
        super({
            application: app,
            title: APP_NAME,
            default_width: historyManager.getConfig().panelWidth,
            default_height: historyManager.getConfig().panelHeight,
        });

        this._app = app;
        this._historyManager = historyManager;
        this._query = '';

        this.connect('close-request', () => {
            this.hide();
            return true;
        });

        this._toastOverlay = new Adw.ToastOverlay();
        this.set_content(this._toastOverlay);

        const root = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 0,
        });
        root.add_css_class('window-shell');
        this._toastOverlay.set_child(root);

        const header = new Adw.HeaderBar({
            show_end_title_buttons: true,
        });
        root.append(header);

        const title = new Gtk.Label({label: 'Clipboard History'});
        title.add_css_class('app-title');
        header.set_title_widget(title);

        this._statusLabel = new Gtk.Label({
            xalign: 0,
            label: 'Background service starting…',
        });
        this._statusLabel.add_css_class('dim-label');

        const settingsButton = new Gtk.Button({
            icon_name: 'emblem-system-symbolic',
            tooltip_text: 'Settings',
        });
        settingsButton.connect('clicked', () => this._openPreferences());
        header.pack_start(settingsButton);

        const closeButton = new Gtk.Button({
            icon_name: 'window-close-symbolic',
            tooltip_text: 'Hide window',
        });
        closeButton.connect('clicked', () => this.hide());
        header.pack_end(closeButton);

        const body = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 14,
            margin_bottom: 14,
            margin_start: 14,
            margin_end: 14,
        });
        root.append(body);

        const hero = new Gtk.Label({
            xalign: 0,
            wrap: true,
            label: 'This app stays in the background, watches your clipboard, and opens fast with a GNOME custom shortcut that runs `clipboard-history --toggle`.',
        });
        hero.add_css_class('hero-text');
        body.append(hero);
        body.append(this._statusLabel);

        const controls = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10,
        });
        body.append(controls);

        this._searchEntry = new Gtk.SearchEntry({
            hexpand: true,
            placeholder_text: 'Search clipboard history',
        });
        this._searchEntry.connect('search-changed', entry => {
            this._query = entry.get_text();
            this._refresh();
        });
        controls.append(this._searchEntry);

        this._captureButton = new Gtk.Button({label: 'Pause'});
        this._captureButton.connect('clicked', () => {
            const config = this._historyManager.getConfig();
            this._historyManager.updateConfig({captureEnabled: !config.captureEnabled});
            this._showToast(config.captureEnabled ? 'Clipboard capture paused' : 'Clipboard capture resumed');
        });
        controls.append(this._captureButton);

        const clearButton = new Gtk.Button({label: 'Clear All'});
        clearButton.add_css_class('destructive-action');
        clearButton.connect('clicked', () => {
            this._historyManager.clearAll();
            this._showToast('History cleared');
        });
        controls.append(clearButton);

        const hint = new Gtk.Label({
            xalign: 0,
            wrap: true,
            label: 'Copy text in any app, come back here, and click an item to copy it again.',
        });
        hint.add_css_class('dim-label');
        body.append(hint);

        this._emptyBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 10,
            margin_top: 20,
            margin_bottom: 20,
        });
        this._emptyBox.add_css_class('empty-state');
        this._emptyBox.append(new Gtk.Label({
            xalign: 0,
            label: 'Clipboard monitor is running',
        }));
        this._emptyBox.append(new Gtk.Label({
            xalign: 0,
            wrap: true,
            label: 'Nothing is saved yet. Copy some text in another app and open this window again.',
        }));
        body.append(this._emptyBox);

        const scroll = new Gtk.ScrolledWindow({
            vexpand: true,
            hexpand: true,
        });
        body.append(scroll);

        this._listBox = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.SINGLE,
        });
        this._listBox.add_css_class('boxed-list');
        this._listBox.connect('row-activated', (_box, row) => {
            if (row?.item)
                this._copyItem(row.item);
        });
        scroll.set_child(this._listBox);

        this._unsubscribe = this._historyManager.subscribe(() => this._refresh());
        this._unsubscribeConfig = this._historyManager.subscribeConfig(() => this._refresh());
        this._refresh();
    }

    destroy() {
        this._unsubscribe?.();
        this._unsubscribe = null;
        this._unsubscribeConfig?.();
        this._unsubscribeConfig = null;
        super.destroy();
    }

    toggleVisible() {
        if (this.is_visible())
            this.hide();
        else
            this.showWindow();
    }

    showWindow() {
        this.present();
        this._searchEntry.grab_focus();
    }

    _refresh() {
        const config = this._historyManager.getConfig();
        const items = this._historyManager.getVisible(this._query);

        this.set_default_size(config.panelWidth, config.panelHeight);
        this._captureButton.set_label(config.captureEnabled ? 'Pause' : 'Resume');
        this._statusLabel.set_label(`${items.length} visible • ${this._historyManager.getAll().length} total • ${config.captureEnabled ? 'capturing' : 'paused'}`);

        this._emptyBox.set_visible(items.length === 0);

        let child = this._listBox.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            this._listBox.remove(child);
            child = next;
        }

        for (const item of items) {
            this._listBox.append(new HistoryRow(item, {
                onCopy: entry => this._copyItem(entry),
                onTogglePin: entry => {
                    this._historyManager.togglePin(entry.id);
                    this._showToast(entry.pinned ? 'Item unpinned' : 'Item pinned');
                },
                onDelete: entry => {
                    this._historyManager.remove(entry.id);
                    this._showToast('Item deleted');
                },
            }));
        }
    }

    _copyItem(item) {
        const display = Gdk.Display.get_default();
        const clipboard = display?.get_clipboard();
        if (!clipboard) {
            this._showToast('No clipboard available');
            return;
        }

        if (this._historyManager.activateItem(item, clipboard))
            this._showToast(item.type === 'image' ? 'Image copied again' : 'Text copied again');
        else
            this._showToast('Could not copy item');
    }

    _openPreferences() {
        const config = this._historyManager.getConfig();
        const dialog = new Adw.PreferencesDialog();

        const page = new Adw.PreferencesPage({
            title: 'Preferences',
        });
        dialog.add(page);

        const storage = new Adw.PreferencesGroup({
            title: 'Capture and Storage',
        });
        page.add(storage);

        storage.add(this._switchRow('Capture clipboard automatically', config.captureEnabled, value => {
            this._historyManager.updateConfig({captureEnabled: value});
        }));
        storage.add(this._switchRow('Persist history between restarts', config.persistenceEnabled, value => {
            this._historyManager.updateConfig({persistenceEnabled: value});
        }));
        storage.add(this._switchRow('Session-only mode', config.sessionOnly, value => {
            this._historyManager.updateConfig({sessionOnly: value});
        }));
        storage.add(this._switchRow('Capture images when possible', config.imageCaptureEnabled, value => {
            this._historyManager.updateConfig({imageCaptureEnabled: value});
        }));
        storage.add(this._switchRow('Filter likely sensitive text', config.excludeSensitive, value => {
            this._historyManager.updateConfig({excludeSensitive: value});
        }));
        storage.add(this._spinRow('Maximum history items', config.maxHistorySize, 10, 500, 1, value => {
            this._historyManager.updateConfig({maxHistorySize: value});
        }));
        storage.add(this._spinRow('Maximum text length', config.maxTextLength, 128, 50000, 128, value => {
            this._historyManager.updateConfig({maxTextLength: value});
        }));
        storage.add(this._spinRow('Polling interval (ms)', config.pollIntervalMs, 250, 3000, 50, value => {
            this._historyManager.updateConfig({pollIntervalMs: value});
        }));

        const windowGroup = new Adw.PreferencesGroup({
            title: 'Window',
        });
        page.add(windowGroup);
        windowGroup.add(this._spinRow('Window width', config.panelWidth, 520, 1280, 10, value => {
            this._historyManager.updateConfig({panelWidth: value});
        }));
        windowGroup.add(this._spinRow('Window height', config.panelHeight, 420, 1200, 10, value => {
            this._historyManager.updateConfig({panelHeight: value});
        }));

        dialog.present(this);
    }

    _switchRow(title, active, callback) {
        const row = new Adw.SwitchRow({title, active});
        row.connect('notify::active', widget => callback(widget.get_active()));
        return row;
    }

    _spinRow(title, value, lower, upper, step, callback) {
        const row = new Adw.ActionRow({title});
        const adjustment = new Gtk.Adjustment({
            lower,
            upper,
            step_increment: step,
            page_increment: step,
            value,
        });
        const spin = new Gtk.SpinButton({
            adjustment,
            valign: Gtk.Align.CENTER,
            numeric: true,
        });
        spin.connect('value-changed', widget => callback(widget.get_value_as_int()));
        row.add_suffix(spin);
        row.set_activatable(false);
        return row;
    }

    _showToast(message) {
        this._toastOverlay.add_toast(new Adw.Toast({title: message, timeout: 2}));
    }
});
