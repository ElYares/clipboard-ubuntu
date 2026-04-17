import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {base64ToBytes, clamp, ensureDirectory, formatTimestamp, summarizeText} from '../lib/utils.js';

const PANEL_MARGIN = 36;

export class ClipboardPanel {
    constructor(extension, settings, history) {
        this._extension = extension;
        this._settings = settings;
        this._history = history;
        this._visibleItems = [];
        this._selectedIndex = -1;
        this._toastTimeoutId = 0;
        this._open = false;
        this._grab = null;
        this._previewDir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'clipboard-history-previews']);
        ensureDirectory(this._previewDir);

        this._buildUi();
        this._unsubscribe = this._history.subscribe(() => this.refresh());
    }

    attach() {
        Main.layoutManager.addChrome(this._stage, {
            affectsInputRegion: true,
            trackFullscreen: true,
        });
        this.refresh();
    }

    destroy() {
        this.close(true);
        this._unsubscribe?.();
        this._unsubscribe = null;

        if (this._toastTimeoutId) {
            GLib.source_remove(this._toastTimeoutId);
            this._toastTimeoutId = 0;
        }

        this._stage?.destroy();
        this._stage = null;
    }

    isOpen() {
        return this._open;
    }

    toggle() {
        if (this._open)
            this.close();
        else
            this.open();
    }

    open() {
        if (this._open)
            return;

        this.refresh();
        this._layoutPanel();
        this._stage.show();
        this._stage.opacity = 0;
        this._panel.scale_x = 0.96;
        this._panel.scale_y = 0.96;

        this._open = true;
        this._grab = Main.pushModal(this._stage);
        if (!this._grab || (this._grab.get_seat_state() & Clutter.GrabState.KEYBOARD) === 0) {
            if (this._grab)
                Main.popModal(this._grab);
            this._grab = null;
            this._open = false;
            this._stage.hide();
            return;
        }
        global.stage.set_key_focus(this._searchEntry.clutter_text);

        this._stage.ease({
            opacity: 255,
            duration: 140,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        this._panel.ease({
            scale_x: 1,
            scale_y: 1,
            duration: 180,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    close(immediate = false) {
        if (!this._open && !immediate)
            return;

        if (this._grab) {
            Main.popModal(this._grab);
            this._grab = null;
        }

        this._open = false;

        const complete = () => {
            this._stage.hide();
            this._searchEntry.set_text('');
            this._selectedIndex = -1;
        };

        if (immediate) {
            complete();
            return;
        }

        this._stage.ease({
            opacity: 0,
            duration: 110,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: complete,
        });
        this._panel.ease({
            scale_x: 0.97,
            scale_y: 0.97,
            duration: 110,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    refresh() {
        if (!this._panel)
            return;

        const query = this._searchEntry?.get_text() ?? '';
        this._visibleItems = this._history.getVisible(query);
        this._renderItems();
        this._layoutPanel();
        this._updateStatus();
    }

    _buildUi() {
        this._stage = new St.Widget({
            reactive: true,
            can_focus: true,
            visible: false,
            x_expand: true,
            y_expand: true,
            style_class: 'clipboard-history-stage',
            layout_manager: new Clutter.BinLayout(),
        });
        this._stage.connect('button-press-event', (_actor, event) => {
            if (event.get_source() === this._stage)
                this.close();
        });
        this._stage.connect('key-press-event', (_actor, event) => this._handleKeyPress(event));

        this._panel = new St.BoxLayout({
            vertical: true,
            reactive: true,
            can_focus: true,
            style_class: 'clipboard-history-panel',
        });
        this._stage.add_child(this._panel);

        this._header = new St.BoxLayout({
            style_class: 'clipboard-history-header',
            vertical: false,
        });
        this._panel.add_child(this._header);

        const titleBox = new St.BoxLayout({vertical: true, x_expand: true});
        this._header.add_child(titleBox);

        titleBox.add_child(new St.Label({
            text: 'Clipboard History',
            style_class: 'clipboard-history-item-title',
        }));

        this._headlineLabel = new St.Label({
            text: 'Press Super+V or use the top-bar clipboard button.',
            style_class: 'clipboard-history-hero',
        });
        titleBox.add_child(this._headlineLabel);

        this._statusLabel = new St.Label({
            style_class: 'clipboard-history-status',
        });
        titleBox.add_child(this._statusLabel);

        const actions = new St.BoxLayout({style_class: 'clipboard-history-footer'});
        this._header.add_child(actions);

        this._captureButton = this._createActionButton('Pause', () => {
            const next = !this._settings.get_boolean('capture-enabled');
            this._settings.set_boolean('capture-enabled', next);
            this._showToast(next ? 'Capture resumed' : 'Capture paused');
            this.refresh();
        });
        actions.add_child(this._captureButton);

        actions.add_child(this._createActionButton('Clear All', () => {
            this._history.clearAll();
            this._showToast('History cleared');
        }));

        this._searchEntry = new St.Entry({
            hint_text: 'Search clipboard history',
            style_class: 'clipboard-history-search',
            can_focus: true,
            track_hover: true,
        });
        this._searchEntry.clutter_text.connect('text-changed', () => {
            this._selectedIndex = 0;
            this.refresh();
        });
        this._searchEntry.clutter_text.connect('key-press-event', (_actor, event) => this._handleKeyPress(event));
        this._panel.add_child(this._searchEntry);

        this._scrollView = new St.ScrollView({
            style_class: 'clipboard-history-scroll',
            overlay_scrollbars: true,
            x_expand: true,
            y_expand: true,
        });
        this._list = new St.BoxLayout({
            vertical: true,
            style_class: 'clipboard-history-list',
        });
        this._scrollView.set_child(this._list);
        this._panel.add_child(this._scrollView);

        this._footer = new St.BoxLayout({
            vertical: false,
            style_class: 'clipboard-history-footer',
        });
        this._panel.add_child(this._footer);

        this._toastLabel = new St.Label({
            style_class: 'clipboard-history-toast',
            opacity: 0,
        });
        this._footer.add_child(this._toastLabel);

        const hint = new St.Label({
            text: 'Arrows to navigate, Enter to copy, Delete to remove, Escape to close',
            style_class: 'clipboard-history-status',
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
        });
        this._footer.add_child(hint);
    }

    _layoutPanel() {
        if (!this._panel)
            return;

        const width = clamp(this._settings.get_int('panel-width'), 420, Math.max(420, global.stage.width - PANEL_MARGIN * 2));
        const height = clamp(this._settings.get_int('panel-height'), 320, Math.max(320, global.stage.height - PANEL_MARGIN * 2));
        const position = this._settings.get_string('panel-position');

        this._panel.set_width(width);
        this._panel.set_height(height);
        const classes = ['clipboard-history-panel'];
        if (this._settings.get_boolean('enable-blur'))
            classes.push('blur-enabled');
        if (!this._settings.get_boolean('dark-theme'))
            classes.push('light-panel');
        this._panel.set_style_class_name(classes.join(' '));

        this._panel.x = Math.round((global.stage.width - width) / 2);
        this._panel.y = Math.round((global.stage.height - height) / 2);

        if (position === 'top')
            this._panel.y = PANEL_MARGIN;
        else if (position === 'bottom')
            this._panel.y = global.stage.height - height - PANEL_MARGIN;
    }

    _renderItems() {
        this._list.destroy_all_children();

        if (this._visibleItems.length === 0) {
            this._selectedIndex = -1;
            const emptyBox = new St.BoxLayout({
                vertical: true,
                style_class: 'clipboard-history-empty-box',
            });
            emptyBox.add_child(new St.Label({
                text: 'Clipboard history is active',
                style_class: 'clipboard-history-empty-title',
            }));
            emptyBox.add_child(new St.Label({
                text: 'Copy some text, then open this panel again with Super+V or the clipboard icon in the top bar.',
                style_class: 'clipboard-history-empty',
            }));
            this._list.add_child(emptyBox);
            return;
        }

        this._selectedIndex = clamp(this._selectedIndex < 0 ? 0 : this._selectedIndex, 0, this._visibleItems.length - 1);

        this._visibleItems.forEach((item, index) => {
            const actor = this._buildItem(item, index);
            this._list.add_child(actor);
        });
    }

    _buildItem(item, index) {
        const row = new St.Button({
            style_class: `clipboard-history-item${index === this._selectedIndex ? ' selected' : ''}`,
            x_expand: true,
            can_focus: true,
            reactive: true,
        });
        row.connect('clicked', () => this._activateItem(index));
        row.connect('notify::hover', () => {
            if (row.hover) {
                this._selectedIndex = index;
                this._renderItems();
            }
        });

        const content = new St.BoxLayout({vertical: false, x_expand: true});
        row.set_child(content);

        if (item.type === 'image')
            content.add_child(this._createImagePreview(item));

        const textBox = new St.BoxLayout({vertical: true, x_expand: true});
        content.add_child(textBox);

        const header = new St.BoxLayout({vertical: false});
        textBox.add_child(header);
        header.add_child(new St.Label({
            text: item.type === 'image' ? 'Image' : summarizeText(item.text, 72),
            style_class: 'clipboard-history-item-title',
            x_expand: true,
        }));

        if (item.pinned)
            header.add_child(this._chip('Pinned'));

        header.add_child(this._chip(formatTimestamp(item.createdAt)));

        const subtitle = item.type === 'image'
            ? `${item.preview}${item.mimeType ? ` • ${item.mimeType}` : ''}`
            : summarizeText(item.text, 220);
        const subtitleLabel = new St.Label({
            text: subtitle,
            style_class: 'clipboard-history-item-subtitle',
            x_expand: true,
            y_expand: true,
        });
        subtitleLabel.clutter_text.line_wrap = true;
        subtitleLabel.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        subtitleLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        textBox.add_child(subtitleLabel);

        const controls = new St.BoxLayout({vertical: false, style_class: 'clipboard-history-footer'});
        textBox.add_child(controls);
        controls.add_child(this._createInlineButton(item.pinned ? 'Unpin' : 'Pin', () => {
            this._history.togglePin(item.id);
            this._showToast(item.pinned ? 'Item pinned' : 'Item unpinned');
        }));
        controls.add_child(this._createInlineButton('Delete', () => {
            this._history.remove(item.id);
            this._showToast('Item deleted');
        }));

        return row;
    }

    _createImagePreview(item) {
        try {
            const path = this._ensurePreviewFile(item);
            if (path)
                return St.TextureCache.get_default().load_file_async(Gio.File.new_for_path(path), 84, 84, 1, 1.0);
        } catch (error) {
            log(`Failed to render image preview: ${error}`);
        }

        return new St.Label({
            text: 'IMG',
            style_class: 'clipboard-history-image',
            y_align: Clutter.ActorAlign.CENTER,
        });
    }

    _chip(text) {
        return new St.Label({
            text,
            style_class: 'clipboard-history-chip',
        });
    }

    _createActionButton(label, callback) {
        const button = new St.Button({
            label,
            style_class: 'clipboard-history-action',
            can_focus: true,
        });
        button.connect('clicked', callback);
        return button;
    }

    _createInlineButton(label, callback) {
        const button = new St.Button({
            label,
            style_class: 'clipboard-history-action',
            can_focus: true,
        });
        button.connect('clicked', callback);
        return button;
    }

    _activateItem(index) {
        const item = this._visibleItems[index];
        if (!item)
            return;

        this._history.activate(item);
        this._showToast(item.type === 'image' ? 'Image copied again' : 'Text copied again');
        this.close();
    }

    _handleKeyPress(event) {
        const symbol = event.get_key_symbol();

        if (symbol === Clutter.KEY_Escape) {
            this.close();
            return Clutter.EVENT_STOP;
        }

        if (symbol === Clutter.KEY_Down) {
            this._moveSelection(1);
            return Clutter.EVENT_STOP;
        }

        if (symbol === Clutter.KEY_Up) {
            this._moveSelection(-1);
            return Clutter.EVENT_STOP;
        }

        if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter) {
            this._activateItem(this._selectedIndex);
            return Clutter.EVENT_STOP;
        }

        if (symbol === Clutter.KEY_Delete) {
            const item = this._visibleItems[this._selectedIndex];
            if (item) {
                this._history.remove(item.id);
                this._showToast('Item deleted');
            }
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _moveSelection(delta) {
        if (this._visibleItems.length === 0)
            return;

        this._selectedIndex = clamp(this._selectedIndex + delta, 0, this._visibleItems.length - 1);
        this.refresh();

        const child = this._list.get_child_at_index(this._selectedIndex);
        child?.grab_key_focus();
    }

    _updateStatus() {
        const count = this._history.getAll().length;
        const captureOn = this._settings.get_boolean('capture-enabled');
        this._headlineLabel.text = captureOn
            ? 'Copy text anywhere, then click an item here to copy it again.'
            : 'Capture is paused. Resume it to keep saving new clipboard items.';
        this._statusLabel.text = `${count} item${count === 1 ? '' : 's'} in history${captureOn ? '' : ' • paused'}`;
        this._captureButton.label = captureOn ? 'Pause' : 'Resume';
    }

    _showToast(message) {
        this._toastLabel.text = message;
        this._toastLabel.ease({
            opacity: 255,
            duration: 120,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        if (this._toastTimeoutId)
            GLib.source_remove(this._toastTimeoutId);

        this._toastTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1400, () => {
            this._toastLabel.ease({
                opacity: 0,
                duration: 180,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            this._toastTimeoutId = 0;
            return GLib.SOURCE_REMOVE;
        });
    }

    _ensurePreviewFile(item) {
        const extension = item.mimeType?.includes('jpeg') ? 'jpg'
            : item.mimeType?.includes('webp') ? 'webp'
                : item.mimeType?.includes('bmp') ? 'bmp'
                    : 'png';
        const path = GLib.build_filenamev([this._previewDir, `${item.id}.${extension}`]);
        const file = Gio.File.new_for_path(path);
        if (!file.query_exists(null))
            GLib.file_set_contents(path, base64ToBytes(item.imageData).get_data());
        return path;
    }
}
