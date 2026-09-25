/* Shared URL rules for Spoolman labels and OctoPrint's confirmation flow. */
(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.SpoolmanQr = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    function spoolId(raw) {
        return /^[1-9][0-9]{0,14}$/.test(String(raw)) ? String(raw) : null;
    }
    function pendingSpool(search) {
        const values = new URLSearchParams(search).getAll("spoolman_spool");
        if (!values.length) return undefined;
        return values.length === 1 ? spoolId(values[0]) : null;
    }
    function baseUrl(value, service, origin) {
        let url;
        try { url = origin ? new URL(value, origin) : new URL(value); }
        catch (_) { throw new Error(`Enter a complete HTTP or HTTPS ${service} URL, including its hostname.`); }
        if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) {
            throw new Error(`Use an HTTP or HTTPS ${service} base URL without credentials, query parameters or a fragment.`);
        }
        if (!url.pathname.endsWith("/")) url.pathname += "/";
        return url;
    }
    function selectionBaseUrl(override, base, origin) {
        const configured = (override || "").trim();
        return baseUrl(configured || base, "OctoPrint", configured ? undefined : origin);
    }
    function ipHostname(value) {
        if (typeof value !== "string" || !value || /[\s\/@?#]/.test(value)) return null;
        try {
            const host = value.includes(":") && !value.startsWith("[") ? `[${value}]` : value;
            const url = new URL(`http://${host}/`);
            return /^(\d{1,3}\.){3}\d{1,3}$/.test(url.hostname) || url.hostname.startsWith("[") ? url.hostname : null;
        } catch (_) { return null; }
    }
    function selectionUrlTemplate(override, base, origin, resolvedAddress) {
        const url = selectionBaseUrl(override, base, origin);
        if (!ipHostname(url.hostname)) {
            const address = ipHostname(resolvedAddress);
            if (!address) throw new Error("Could not find OctoPrint's IP address. Reopen this dialog to retry, or set 'OctoPrint URL for QR labels' to the full IP-based URL in Spoolman settings.");
            url.hostname = address;
        }
        // Keep the placeholder literal: Spoolman replaces {id}, not %7Bid%7D.
        return `${url.href}?spoolman_spool={id}`;
    }
    function selectionUrl(override, base, origin, id, resolvedAddress) {
        if (!spoolId(id)) throw new Error("The spool ID is invalid.");
        return selectionUrlTemplate(override, base, origin, resolvedAddress).replace("{id}", String(id));
    }
    function printingUrl(webUrl, instanceUrl, id) {
        if (!spoolId(id)) throw new Error("The spool ID is invalid.");
        const root = baseUrl((webUrl || "").trim() || (instanceUrl || "").trim(), "Spoolman Web interface");
        const url = new URL("labels", root);
        url.searchParams.set("spools", String(id));
        return url.href;
    }
    return { spoolId, pendingSpool, selectionBaseUrl, ipHostname, selectionUrlTemplate, selectionUrl, printingUrl };
});
