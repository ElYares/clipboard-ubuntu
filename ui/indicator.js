import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

export class ClipboardIndicator {
    constructor(settings, history, onActivate) {
        this._settings = settings;
        this._history = history;
        this._onActivate = onActivate;
        this._button = null;
        this._countLabel = null;
        this._statusDot = null;
        this._unsubscribe = null;

        this._build();
    }

    attach() {
        Main.panel.addToStatusArea('clipboard-history-indicator', this._button, 1, 'right');
        this._refresh();
        this._unsubscribe = this._history.subscribe(() => this._refresh());
    }

    destroy() {
        this._unsubscribe?.();
        this._unsubscribe = null;
        this._button?.destroy();
        this._button = null;
    }

    _build() {
        this._button = new PanelMenu.Button(0.0, 'Clipboard History', false);
        this._button.connect('button-press-event', () => {
            this._onActivate?.();
        });

        const box = new St.BoxLayout({
            style_class: 'clipboard-history-indicator',
            y_align: St.Align.MIDDLE,
        });
        this._button.add_child(box);

        box.add_child(new St.Icon({
            icon_name: 'edit-paste-symbolic',
            style_class: 'system-status-icon',
        }));

        this._countLabel = new St.Label({
            text: '0',
            style_class: 'clipboard-history-indicator-count',
            y_align: St.Align.MIDDLE,
        });
        box.add_child(this._countLabel);

        this._statusDot = new St.Label({
            text: '●',
            style_class: 'clipboard-history-indicator-dot',
            y_align: St.Align.MIDDLE,
        });
        box.add_child(this._statusDot);
    }

    _refresh() {
        if (!this._button)
            return;

        const count = this._history.getAll().length;
        const captureEnabled = this._settings.get_boolean('capture-enabled');

        this._countLabel.text = String(count);
        this._statusDot.text = captureEnabled ? '●' : '○';
        this._statusDot.style_class = captureEnabled
            ? 'clipboard-history-indicator-dot active'
            : 'clipboard-history-indicator-dot paused';
        this._button.accessible_name = captureEnabled
            ? `Clipboard History, ${count} items`
            : `Clipboard History paused, ${count} items`;
    }
}
