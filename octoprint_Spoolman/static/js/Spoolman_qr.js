/* global SpoolmanQr */
$(() => {
    "use strict";
    function SpoolmanQrViewModel(params) {
        const self = this;
        const [settings, login, printerState, access] = params;
        const base = new URL(BASEURL, window.location.origin);
        let startupComplete = false, pendingConsumed = false, requestVersion = 0;
        let printingVersion = 0;
        let selectedSpools = {}, availableSpools = [];
        // Core OctoPrint uses a desktop viewport unless a responsive plugin is
        // installed. Scope the phone viewport to these dialogs, then restore it.
        let viewport, originalViewport, addedViewport = false;
        const fitPhoneViewport = () => {
            if (viewport) return;
            viewport = document.querySelector('meta[name="viewport"]');
            addedViewport = !viewport;
            if (!viewport) { viewport = document.createElement("meta"); viewport.name = "viewport"; document.head.appendChild(viewport); }
            originalViewport = viewport.getAttribute("content");
            viewport.setAttribute("content", "width=device-width, initial-scale=1");
        };
        const restoreViewport = () => {
            if (!viewport || $("#spoolman_qr_print, #spoolman_qr_select").is(":visible")) return;
            if (addedViewport) viewport.remove();
            else if (originalViewport === null) viewport.removeAttribute("content");
            else viewport.setAttribute("content", originalViewport);
            viewport = undefined;
        };
        const pluginSettings = () => settings.settings.plugins.Spoolman;
        const profile = () => settings.printerProfiles.currentProfileData();
        const printerName = () => ko.unwrap(settings.settings?.appearance?.name) || ko.unwrap(profile()?.name) || window.location.host;
        const busy = () => printerState.isPrinting() || printerState.isPaused()
            || ["isPausing", "isCancelling"].some(key => typeof printerState[key] === "function" && printerState[key]());
        const canControl = () => login.loggedIn() && login.hasPermission(access.permissions.CONTROL);

        async function request(path, options = {}) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            try {
                const response = await fetch(new URL(path, base), {
                    credentials: "same-origin", cache: "no-store", signal: controller.signal,
                    ...options,
                    headers: { "Content-Type": "application/json", "X-CSRF-Token": OctoPrint.getCookie("csrf_token"), ...(options.headers || {}) },
                });
                const body = await response.json().catch(() => ({}));
                if (!response.ok) {
                    const error = new Error(body.error?.message || ([401, 403].includes(response.status)
                        ? "Your session expired or you do not have permission. Log in again and retry."
                        : response.status === 400 && path.endsWith("/qr")
                        ? "OctoPrint rejected this request. Refresh the page or log in again, then retry."
                        : "Cannot reach Spoolman through OctoPrint. Check the connection and retry."));
                    error.status = response.status;
                    throw error;
                }
                return body;
            } catch (error) {
                if (error.name === "AbortError") throw new Error("The request timed out. Check the connection and retry.");
                throw error;
            } finally { clearTimeout(timeout); }
        }

        self.printing = {
            template: ko.observable(""), url: ko.observable(""), spool: ko.observable(""), printer: ko.observable(""), loading: ko.observable(false),
            error: ko.observable(""), urlError: ko.observable(""), warning: ko.observable(""), copyStatus: ko.observable(""),
        };
        const showPrinting = async spool => {
            const version = ++printingVersion;
            self.printing.template(""); self.printing.url(""); self.printing.error("");
            self.printing.urlError(""); self.printing.warning(""); self.printing.copyStatus("");
            self.printing.spool(`#${spool.id} · ${spool.filament?.name || "Unnamed filament"}`);
            self.printing.printer(printerName());
            self.printing.loading(true);
            try {
                self.printing.url(SpoolmanQr.printingUrl(ko.unwrap(pluginSettings().spoolmanWebUrl), ko.unwrap(pluginSettings().spoolmanUrl), spool.id));
            } catch (error) { self.printing.urlError(`${error.message} Set it in Spoolman plugin settings, then reopen this dialog.`); }
            $("#spoolman_qr_print").modal("show");
            try {
                const configured = ko.unwrap(pluginSettings().qrCodeBaseUrl);
                const url = SpoolmanQr.selectionBaseUrl(configured, BASEURL, window.location.origin);
                let address;
                if (!SpoolmanQr.ipHostname(url.hostname)) {
                    const response = await request("plugin/Spoolman/self/qr-address");
                    if (version !== printingVersion) return;
                    if (response.data.hostname !== url.hostname) throw new Error("The OctoPrint URL settings changed. Save settings, then reopen this dialog.");
                    address = response.data.ipAddress;
                }
                const template = SpoolmanQr.selectionUrlTemplate(configured, BASEURL, window.location.origin, address);
                self.printing.template(template);
                if (["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(new URL(template).hostname)) {
                    self.printing.warning("A phone cannot open this computer's localhost address. Set a phone-accessible OctoPrint URL in Spoolman plugin settings, then reopen this dialog.");
                }
            } catch (error) { if (version === printingVersion) self.printing.error(error.message); }
            finally { if (version === printingVersion) self.printing.loading(false); }
        };
        self.copyQrTemplate = async () => {
            if (!self.printing.template()) return;
            self.printing.copyStatus("");
            try {
                if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
                await navigator.clipboard.writeText(self.printing.template());
                self.printing.copyStatus("Copied.");
            } catch (_) {
                // LAN HTTP pages do not expose the modern clipboard API.
                const input = document.querySelector("#spoolman-qr-template");
                input.focus(); input.select();
                let copied = false;
                try { copied = document.execCommand("copy"); } catch (_) { /* manual copy remains available */ }
                self.printing.copyStatus(copied ? "Copied." : "Select and copy the URL above manually.");
            }
        };

        self.qr = {
            error: ko.observable(""), loading: ko.observable(false), saving: ko.observable(false),
            success: ko.observable(""), spool: ko.observable(), printer: ko.observable(""),
            loginRequired: ko.observable(false),
            tools: ko.observableArray([]), tool: ko.observable(), current: ko.observable(""),
            busy: ko.pureComputed(busy), permitted: ko.pureComputed(canControl),
        };
        const showCurrent = () => {
            const id = selectedSpools[self.qr.tool()]?.spoolId;
            const spool = availableSpools.find(s => String(s.id) === String(id));
            self.qr.current(id ? `#${id}${spool ? ` · ${spool.filament?.name || "Unnamed filament"}` : ""}` : "No spool selected");
        };
        self.qr.tool.subscribe(showCurrent);
        const pending = SpoolmanQr.pendingSpool(window.location.search);
        const consumePending = () => {
            pendingConsumed = true;
            const url = new URL(window.location.href);
            url.searchParams.delete("spoolman_spool");
            history.replaceState(null, "", url);
        };
        self.loadQr = async () => {
            if (pendingConsumed || pending === undefined) return;
            const version = ++requestVersion;
            self.qr.error(""); self.qr.success(""); self.qr.spool(undefined); self.qr.loginRequired(false);
            $("#spoolman_qr_select").modal("show");
            if (!pending) { self.qr.error("This label contains an invalid spool ID."); return; }
            if (!login.loggedIn()) { self.qr.error("Log in to OctoPrint to select this spool."); return; }
            self.qr.loading(true);
            try {
                const [spools, state] = await Promise.all([request("plugin/Spoolman/spoolman/spools"), request("api/settings")]);
                if (version !== requestVersion || pendingConsumed || !login.loggedIn()) return;
                availableSpools = spools.data.spools;
                const spool = availableSpools.find(s => String(s.id) === pending && !s.archived);
                if (!spool) throw new Error("This spool is deleted or archived. Check it in Spoolman.");
                selectedSpools = state.plugins.Spoolman.selectedSpoolIds;
                const count = ko.unwrap(profile()?.extruder?.count) || 0;
                const tools = Array.from({ length: count }, (_, idx) => ({ id: idx, name: `Extruder ${idx + 1} (tool ${idx})` }));
                const oldTool = self.qr.tool();
                self.qr.tools(tools);
                self.qr.tool(count === 1 ? 0 : tools.some(t => t.id === oldTool) ? oldTool : undefined);
                self.qr.printer(printerName());
                self.qr.spool(spool); showCurrent();
            } catch (error) {
                if (version === requestVersion) { self.qr.error(error.message); self.qr.loginRequired([401, 403].includes(error.status)); }
            }
            finally { if (version === requestVersion) self.qr.loading(false); }
        };
        self.loginForQr = () => {
            const url = new URL("login", base);
            url.searchParams.set("redirect", window.location.pathname + window.location.search);
            window.location.assign(url.href);
        };
        self.useSpool = async () => {
            if (self.qr.saving() || self.qr.loading() || !self.qr.spool() || !Number.isInteger(self.qr.tool()) || !canControl() || busy()) return;
            self.qr.saving(true); self.qr.error("");
            try {
                await request("plugin/Spoolman/self/spool/qr", {
                    method: "POST", body: JSON.stringify({ toolIdx: self.qr.tool(), spoolId: String(self.qr.spool().id) }),
                });
                self.qr.success(`Spool #${self.qr.spool().id} selected for ${self.qr.printer()}, extruder ${self.qr.tool() + 1}.`);
                consumePending();
            } catch (error) { self.qr.error(error.message); self.qr.loginRequired([400, 401, 403].includes(error.status)); }
            finally { self.qr.saving(false); }
        };
        self.cancelQr = () => {
            if (self.qr.saving()) return;
            consumePending(); ++requestVersion;
            $("#spoolman_qr_select").modal("hide");
        };
        self.onStartupComplete = () => { startupComplete = true; void self.loadQr(); };
        self.onUserLoggedIn = () => { if (startupComplete) void self.loadQr(); };
        self.onUserLoggedOut = () => {
            ++requestVersion; self.qr.loading(false); self.qr.spool(undefined);
            if (!pendingConsumed && pending !== undefined) self.qr.error("Log in again to select this spool.");
        };
        self.onAfterBinding = () => {
            $("#spoolman_qr_print, #spoolman_qr_select").on("show", fitPhoneViewport).on("hidden", restoreViewport);
            $("#spoolman_qr_print").on("hide", () => { ++printingVersion; self.printing.loading(false); });
            document.addEventListener("spoolman:print-labels", event => showPrinting(event.detail));
            document.addEventListener("spoolman:selection", () => {
                if (!self.qr.saving() && !pendingConsumed && pending !== undefined) void self.loadQr();
            });
            // Escape and backdrop dismissal also cancel the pending action.
            $("#spoolman_qr_select").on("hide", event => {
                if (self.qr.saving()) { event.preventDefault(); return; }
                consumePending(); ++requestVersion;
            });
        };
    }
    OCTOPRINT_VIEWMODELS.push({
        construct: SpoolmanQrViewModel,
        dependencies: ["settingsViewModel", "loginStateViewModel", "printerStateViewModel", "accessViewModel"],
        elements: [document.querySelector("#spoolman_qr_print"), document.querySelector("#spoolman_qr_select")],
    });
});
