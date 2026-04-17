import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {ClipboardMonitor} from './lib/clipboardMonitor.js';
import {HistoryManager} from './lib/historyManager.js';
import {HistoryStorage} from './lib/storage.js';
import {ClipboardIndicator} from './ui/indicator.js';
import {ClipboardPanel} from './ui/panel.js';

export default class ClipboardHistoryExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._storage = new HistoryStorage(this.metadata.uuid, this._settings);
        this._history = new HistoryManager(this._settings, this._storage);
        this._panel = new ClipboardPanel(this, this._settings, this._history);
        this._indicator = new ClipboardIndicator(this._settings, this._history, () => this._togglePanel());
        this._monitor = new ClipboardMonitor(this._settings, this._history);

        this._history.load();
        this._panel.attach();
        this._indicator.attach();
        this._monitor.start();

        this._settingsSignals = [
            this._settings.connect('changed::capture-enabled', () => {
                if (this._settings.get_boolean('capture-enabled'))
                    this._monitor.resume();
                else
                    this._monitor.pause();

                this._panel.refresh();
            }),
            this._settings.connect('changed::enable-persistence', () => this._history.sync()),
            this._settings.connect('changed::session-only', () => this._history.sync()),
        ];

        Main.wm.addKeybinding(
            'toggle-panel',
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.ALL,
            () => this._togglePanel()
        );
    }

    disable() {
        if (this._settingsSignals) {
            for (const signalId of this._settingsSignals)
                this._settings.disconnect(signalId);
            this._settingsSignals = null;
        }

        Main.wm.removeKeybinding('toggle-panel');

        this._monitor?.destroy();
        this._monitor = null;

        this._panel?.destroy();
        this._panel = null;

        this._indicator?.destroy();
        this._indicator = null;

        this._history?.destroy();
        this._history = null;

        this._storage = null;
        this._settings = null;
    }

    _togglePanel() {
        const behavior = this._settings.get_string('shortcut-behavior');

        if (behavior === 'open-only' && this._panel?.isOpen())
            return;

        this._panel?.toggle();
    }
}
