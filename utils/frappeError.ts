/**
 * frappeError.ts — turn a Frappe/ERPNext error response into readable text.
 *
 * Frappe reports failures in three different shapes (`_server_messages`,
 * `message`, `exc`) and wraps the text in HTML. The maintenance create and
 * edit screens each carried their own copy of this parsing, so a message that
 * rendered badly had to be fixed twice.
 */

/** Strip HTML tags and decode the entities Frappe commonly emits. */
function stripHtml(value: string): string {
    return value
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Rewrite the mandatory-field error into something a field user can act on.
 * Frappe phrases it as "Value missing for <Doctype>: <Field>", which reads as
 * a server fault rather than "you left a field blank".
 */
function humanize(message: string): string {
    const missing = message.match(/^Value missing for [^:]+:\s*(.+)$/i);
    if (missing) {
        return `Please fill in "${missing[1].trim()}" before saving.`;
    }
    return message;
}

export function parseFrappeError(data: any, fallback = 'Request failed'): string {
    if (!data) return fallback;

    let raw = '';

    if (data._server_messages) {
        try {
            const messages = JSON.parse(data._server_messages);
            raw = (Array.isArray(messages) ? messages : [messages])
                .map((m: any) => {
                    try {
                        return JSON.parse(m).message ?? m;
                    } catch {
                        return m?.message ?? m;
                    }
                })
                .filter(Boolean)
                .join('\n');
        } catch {
            raw = String(data._server_messages);
        }
    } else if (data.message) {
        raw = typeof data.message === 'object' ? JSON.stringify(data.message) : String(data.message);
    } else if (data.exc) {
        try {
            const exc = JSON.parse(data.exc);
            raw = String(Array.isArray(exc) ? exc[0] : exc);
        } catch {
            raw = String(data.exc);
        }
    }

    const cleaned = stripHtml(raw);
    if (!cleaned) return fallback;

    return cleaned
        .split('\n')
        .map(line => humanize(line.trim()))
        .filter(Boolean)
        .join('\n');
}
