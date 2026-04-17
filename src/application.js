import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk?version=4.0';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';

import {APP_ID} from './config.js';
import {HistoryManager} from './services/historyManager.js';
import {ClipboardService} from './services/clipboardService.js';
import {Storage} from './services/storage.js';
import {MainWindow} from './ui/mainWindow.js';

const MODULE_DIR = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
const PROJECT_DIR = GLib.path_get_dirname(MODULE_DIR);
const CSS_PATH = GLib.build_filenamev([PROJECT_DIR, 'data', 'clipboard-history.css']);

export const ClipboardHistoryApplication = GObject.registerClass(
class ClipboardHistoryApplication extends Adw.Application {
    constructor() {
        super({
            application_id: APP_ID,
            flags: Gio.ApplicationFlags.HANDLES_COMMAND_LINE,
        });

        this._storage = null;
        this._historyManager = null;
        this._clipboardService = null;
        this._window = null;
    }

    vfunc_startup() {
        super.vfunc_startup();

        this.hold();
        this._loadCss();

        this._storage = new Storage();
        this._historyManager = new HistoryManager(this._storage, this._storage.loadConfig());
        this._historyManager.load();

        const display = Gdk.Display.get_default();
        if (display) {
            this._clipboardService = new ClipboardService(this._historyManager);
            this._clipboardService.start(display.get_clipboard());
        } else {
            log('Clipboard History: no display available at startup');
        }
    }

    vfunc_activate() {
        this._ensureWindow();
        this._window.showWindow();
    }

    vfunc_command_line(commandLine) {
        const args = commandLine.get_arguments().slice(1);
        const command = args[0] ?? '--show';

        switch (command) {
        case '--background':
            this._ensureWindow();
            this._window.hide();
            break;
        case '--toggle':
            this._ensureWindow();
            this._window.toggleVisible();
            break;
        case '--hide':
            this._ensureWindow();
            this._window.hide();
            break;
        case '--quit':
            this.quit();
            break;
        case '--prefs':
            this._ensureWindow();
            this._window.showWindow();
            this._window._openPreferences();
            break;
        case '--show':
        default:
            this.activate();
            break;
        }

        return 0;
    }

    vfunc_shutdown() {
        this._clipboardService?.destroy();
        this._clipboardService = null;
        this._historyManager?.destroy();
        this._historyManager = null;
        this._storage = null;

        super.vfunc_shutdown();
    }

    _ensureWindow() {
        if (!this._window)
            this._window = new MainWindow(this, this._historyManager);
        return this._window;
    }

    _loadCss() {
        try {
            const display = Gdk.Display.get_default();
            if (!display)
                return;

            const provider = new Gtk.CssProvider();
            provider.load_from_path(CSS_PATH);
            Gtk.StyleContext.add_provider_for_display(
                display,
                provider,
                Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
            );
        } catch (error) {
            logError(error, 'Failed to load application CSS');
        }
    }
});
