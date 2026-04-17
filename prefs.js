import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ClipboardHistoryPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        window.set_title('Clipboard History Preferences');
        window.set_default_size(760, 720);

        const general = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'edit-paste-symbolic',
        });

        const storageGroup = new Adw.PreferencesGroup({
            title: 'Storage and Privacy',
            description: 'Control capture rules, persistence and size limits.',
        });
        general.add(storageGroup);

        storageGroup.add(this._switchRow(settings, 'capture-enabled', 'Capture clipboard automatically'));
        storageGroup.add(this._switchRow(settings, 'enable-persistence', 'Persist history between restarts'));
        storageGroup.add(this._switchRow(settings, 'session-only', 'Session-only mode'));
        storageGroup.add(this._switchRow(settings, 'exclude-sensitive', 'Filter likely sensitive text'));
        storageGroup.add(this._switchRow(settings, 'enable-images', 'Capture images when possible'));
        storageGroup.add(this._spinRow(settings, 'max-history-size', 'Maximum history items', 10, 500, 1));
        storageGroup.add(this._spinRow(settings, 'max-text-length', 'Maximum text length', 128, 50000, 128));
        storageGroup.add(this._spinRow(settings, 'max-image-bytes', 'Maximum image size (bytes)', 65536, 10485760, 65536));
        storageGroup.add(this._spinRow(settings, 'poll-interval-ms', 'Polling interval (ms)', 250, 3000, 50));

        const uiPage = new Adw.PreferencesPage({
            title: 'Appearance',
            icon_name: 'applications-graphics-symbolic',
        });
        const appearanceGroup = new Adw.PreferencesGroup({
            title: 'Panel',
            description: 'Adjust the floating panel size and visual effects.',
        });
        uiPage.add(appearanceGroup);
        appearanceGroup.add(this._switchRow(settings, 'dark-theme', 'Use dark appearance'));
        appearanceGroup.add(this._switchRow(settings, 'enable-blur', 'Enable blur effect'));
        appearanceGroup.add(this._spinRow(settings, 'panel-width', 'Panel width', 420, 1200, 10));
        appearanceGroup.add(this._spinRow(settings, 'panel-height', 'Panel height', 360, 1200, 10));
        appearanceGroup.add(this._comboRow(settings, 'panel-position', 'Panel position', [
            ['center', 'Center'],
            ['top', 'Top'],
            ['bottom', 'Bottom'],
        ]));
        appearanceGroup.add(this._comboRow(settings, 'shortcut-behavior', 'Shortcut behavior', [
            ['toggle', 'Toggle panel'],
            ['open-only', 'Open only'],
        ]));

        const filtersPage = new Adw.PreferencesPage({
            title: 'Filters',
            icon_name: 'view-filter-symbolic',
        });
        const filtersGroup = new Adw.PreferencesGroup({
            title: 'Basic Exclusions',
            description: 'Simple case-insensitive substrings that will be ignored when clipboard text matches.',
        });
        filtersPage.add(filtersGroup);

        const row = new Adw.ActionRow({
            title: 'Excluded patterns',
            subtitle: 'One entry per line',
        });
        const textView = new Gtk.TextView({
            monospace: true,
            top_margin: 8,
            bottom_margin: 8,
            left_margin: 8,
            right_margin: 8,
            wrap_mode: Gtk.WrapMode.WORD_CHAR,
            height_request: 180,
        });
        const buffer = textView.get_buffer();
        buffer.set_text(settings.get_strv('excluded-patterns').join('\n'), -1);
        buffer.connect('changed', () => {
            const start = buffer.get_start_iter();
            const end = buffer.get_end_iter();
            const text = buffer.get_text(start, end, false);
            const items = text.split('\n').map(line => line.trim()).filter(Boolean);
            settings.set_strv('excluded-patterns', items);
        });
        row.add_suffix(textView);
        row.activatable = false;
        filtersGroup.add(row);

        window.add(general);
        window.add(uiPage);
        window.add(filtersPage);
    }

    _switchRow(settings, key, title) {
        const row = new Adw.SwitchRow({title});
        settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _spinRow(settings, key, title, lower, upper, step) {
        const row = new Adw.ActionRow({title});
        const adjustment = new Gtk.Adjustment({lower, upper, step_increment: step, page_increment: step});
        const spin = new Gtk.SpinButton({
            adjustment,
            valign: Gtk.Align.CENTER,
            numeric: true,
        });
        spin.set_value(settings.get_int(key));
        spin.connect('value-changed', widget => settings.set_int(key, widget.get_value_as_int()));
        row.add_suffix(spin);
        row.activatable = false;
        return row;
    }

    _comboRow(settings, key, title, options) {
        const row = new Adw.ComboRow({title});
        const model = new Gtk.StringList();

        let selected = 0;
        const current = settings.get_string(key);

        options.forEach(([value, label], index) => {
            model.append(label);
            if (value === current)
                selected = index;
        });

        row.model = model;
        row.selected = selected;
        row.connect('notify::selected', combo => {
            const [value] = options[combo.selected] ?? options[0];
            settings.set_string(key, value);
        });
        return row;
    }
}
