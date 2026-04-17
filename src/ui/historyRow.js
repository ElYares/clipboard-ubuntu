import Gdk from 'gi://Gdk?version=4.0';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import Pango from 'gi://Pango';

import {base64ToBytes, formatTimestamp, summarizeText} from '../utils.js';

export const HistoryRow = GObject.registerClass(
class HistoryRow extends Gtk.ListBoxRow {
    constructor(item, actions) {
        super({
            selectable: true,
            activatable: true,
            margin_top: 6,
            margin_bottom: 6,
        });

        this.item = item;
        this._actions = actions;

        this.add_css_class('history-row');
        this.set_child(this._buildContent());
    }

    _buildContent() {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 14,
            margin_top: 14,
            margin_bottom: 14,
            margin_start: 14,
            margin_end: 14,
        });

        if (this.item.type === 'image')
            box.append(this._createImagePreview());

        const contentBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            hexpand: true,
        });
        box.append(contentBox);

        const title = new Gtk.Label({
            xalign: 0,
            wrap: false,
            ellipsize: Pango.EllipsizeMode.END,
            label: this.item.type === 'image' ? 'Image Clipboard Item' : summarizeText(this.item.text, 90),
        });
        title.add_css_class('history-item-title');
        contentBox.append(title);

        const subtitle = new Gtk.Label({
            xalign: 0,
            wrap: true,
            label: this.item.type === 'image'
                ? `${this.item.preview}${this.item.mimeType ? ` • ${this.item.mimeType}` : ''}`
                : this.item.text,
        });
        subtitle.add_css_class('history-item-subtitle');
        contentBox.append(subtitle);

        const meta = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
        });
        meta.append(this._pill(this.item.pinned ? 'Pinned' : 'Recent'));
        meta.append(this._pill(formatTimestamp(this.item.createdAt)));
        contentBox.append(meta);

        const actions = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            valign: Gtk.Align.CENTER,
        });
        box.append(actions);

        const copyButton = new Gtk.Button({label: 'Copy'});
        copyButton.add_css_class('suggested-action');
        copyButton.connect('clicked', () => this._actions.onCopy?.(this.item));
        actions.append(copyButton);

        const pinButton = new Gtk.Button({label: this.item.pinned ? 'Unpin' : 'Pin'});
        pinButton.connect('clicked', () => this._actions.onTogglePin?.(this.item));
        actions.append(pinButton);

        const deleteButton = new Gtk.Button({label: 'Delete'});
        deleteButton.add_css_class('destructive-action');
        deleteButton.connect('clicked', () => this._actions.onDelete?.(this.item));
        actions.append(deleteButton);

        return box;
    }

    _createImagePreview() {
        try {
            const texture = Gdk.Texture.new_from_bytes(base64ToBytes(this.item.imageData));
            return new Gtk.Picture({
                paintable: texture,
                width_request: 112,
                height_request: 112,
                content_fit: Gtk.ContentFit.COVER,
            });
        } catch (error) {
            logError(error, 'Failed to create image preview');
            return new Gtk.Label({label: 'Image'});
        }
    }

    _pill(text) {
        const label = new Gtk.Label({
            label: text,
        });
        label.add_css_class('history-pill');
        return label;
    }
});
