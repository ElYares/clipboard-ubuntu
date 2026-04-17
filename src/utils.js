import GLib from 'gi://GLib';

export function createId() {
    return `${Date.now()}-${Math.floor(Math.random() * 1e7)}`;
}

export function summarizeText(text, maxChars = 140) {
    if (!text)
        return '';

    const compact = text.replace(/\s+/g, ' ').trim();
    if (compact.length <= maxChars)
        return compact;

    return `${compact.slice(0, maxChars - 1)}…`;
}

export function buildSearchText(item) {
    if (item.type === 'text')
        return (item.text ?? '').toLowerCase();

    return `${item.type} ${item.preview ?? ''} ${item.mimeType ?? ''}`.toLowerCase();
}

export function isProbablySensitive(text) {
    if (!text)
        return false;

    const compact = text.trim();
    const rules = [
        /password/i,
        /passcode/i,
        /otp/i,
        /one[- ]time/i,
        /authorization:\s*bearer/i,
        /BEGIN (RSA|OPENSSH|EC|PGP) PRIVATE KEY/i,
        /^[A-Za-z0-9+/_=-]{24,}$/,
        /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
    ];

    return rules.some(rule => rule.test(compact));
}

export function matchesExcludedPattern(text, patterns) {
    const lower = (text ?? '').toLowerCase();
    return (patterns ?? []).some(pattern => lower.includes(pattern.toLowerCase()));
}

export function ensureDirectory(path) {
    try {
        GLib.mkdir_with_parents(path, 0o755);
        return true;
    } catch (error) {
        logError(error, `Failed to create directory ${path}`);
        return false;
    }
}

export function bytesToBase64(bytes) {
    if (!bytes)
        return '';

    return GLib.base64_encode(bytes.toArray());
}

export function base64ToBytes(text) {
    return GLib.Bytes.new(GLib.base64_decode(text ?? ''));
}

export function formatTimestamp(timestamp) {
    const date = GLib.DateTime.new_from_unix_local(Math.floor(timestamp / 1000));
    if (!date)
        return '';

    const now = GLib.DateTime.new_now_local();
    const diff = Math.max(0, now.to_unix() - date.to_unix());

    if (diff < 60)
        return 'Just now';
    if (diff < 3600)
        return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400)
        return `${Math.floor(diff / 3600)} h ago`;

    return date.format('%b %-d, %H:%M');
}

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
