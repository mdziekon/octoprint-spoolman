# coding=utf-8
from __future__ import absolute_import

import octoprint.plugin
from octoprint.events import Events
from octoprint.access.permissions import Permissions
from flask_login import current_user
import flask
import http
import math
import re
import ipaddress
import socket
from urllib.parse import urlsplit

from octoprint.util.net import address_for_client

from ..common.settings import SettingsKeys
from .PrinterUtils import PrinterUtils

class PluginAPI(octoprint.plugin.BlueprintPlugin):
    def is_blueprint_csrf_protected(self):
        return True

    def _getValueFromJSONOrNone(self, key, json):
        if key in json:
            return json[key]
        return None

    def _getStringFromJSONOrNone(self, key, json):
        value = self._getValueFromJSONOrNone(key, json)

        if value:
            return str(value)
        return None

    def _getIntFromJSONOrNone(self, key, json):
        value = self._getValueFromJSONOrNone(key, json)

        if value == None:
            return value

        try:
            value = int(value)
        except Exception as e:
            value = None

            errorMessage = str(e)
            self._logger.error("could not transform value '" + str(value) + "' for key '" + key + "' to int:" + errorMessage)

        return value

    @octoprint.plugin.BlueprintPlugin.route("/spoolman/spools", methods=["GET"])
    def handleGetSpoolsAvailable(self):
        self._logger.debug("API: GET /spoolman/spools")

        result = self.getSpoolmanConnector().handleGetSpoolsAvailable()

        if result.get('error', False):
            response = flask.jsonify(result)
            response.status = http.HTTPStatus.BAD_REQUEST

            return response

        return flask.jsonify(result)

    @octoprint.plugin.BlueprintPlugin.route("/self/spool", methods=["POST"])
    def handleUpdateActiveSpool(self):
        self._logger.debug("API: POST /self/spool")

        jsonData = flask.request.json

        toolId = self._getIntFromJSONOrNone("toolIdx", jsonData)
        spoolId = self._getStringFromJSONOrNone("spoolId", jsonData)

        return self._saveActiveSpool(toolId, spoolId)

    def _saveActiveSpool(self, toolId, spoolId):
        """Keep the legacy API and the QR workflow on the same persistence path."""

        spools = self._settings.get([SettingsKeys.SELECTED_SPOOL_IDS])

        # Settings and the usage tracker address tools with string keys.
        spools.pop(toolId, None)
        spools[str(toolId)] = {
            'spoolId': spoolId,
        }

        self._settings.set([SettingsKeys.SELECTED_SPOOL_IDS], spools)
        self._settings.save()

        self.triggerPluginEvent(
            Events.PLUGIN_SPOOLMAN_SPOOL_SELECTED,
            {
                'toolIdx': toolId,
                'spoolId': spoolId,
            }
        )

        return flask.jsonify({
            "data": {}
        })

    def _qrError(self, code, message, status):
        return flask.jsonify({"error": {"code": code, "message": message}}), status

    def _qrPrinterBusy(self):
        return (
            self._printer.is_printing() or self._printer.is_paused()
            or self._printer.get_state_id() in (
                "STARTING", "PAUSING", "RESUMING", "CANCELLING", "FINISHING"
            )
        )

    @octoprint.plugin.BlueprintPlugin.route("/self/qr-address", methods=["GET"])
    def handleGetQrAddress(self):
        """Resolve the printer's name on the server, not on the scanning phone."""
        if not current_user.is_authenticated or not current_user.is_active:
            return self._qrError("qr_login_required", "Log in to OctoPrint, then try again.", 403)
        if not Permissions.STATUS.can():
            return self._qrError("qr_permission_denied", "Your account needs permission to view printer status.", 403)

        configured = (self._settings.get([SettingsKeys.QR_CODE_BASE_URL]) or "").strip()
        try:
            url = urlsplit(configured or flask.request.url_root)
            if (url.scheme not in ("http", "https") or not url.hostname
                    or url.username or url.password or url.query or url.fragment):
                raise ValueError("Invalid base URL")
            # Accessing .port also validates malformed port numbers.
            url.port
        except ValueError:
            return self._qrError("qr_invalid_url", "Check 'OctoPrint URL for QR labels' in Spoolman settings: use a full HTTP or HTTPS base URL without credentials or a query.", 400)

        addresses = []
        try:
            for result in socket.getaddrinfo(url.hostname, None, type=socket.SOCK_STREAM):
                address = ipaddress.ip_address(result[4][0])
                if not (address.is_loopback or address.is_unspecified or address.is_link_local or address.is_multicast):
                    addresses.append(address)
        except (OSError, ValueError):
            pass

        # A Pi can know its LAN interface even when its own .local lookup fails.
        # Explicit overrides may point to a separate proxy: never replace those
        # with a guessed interface address on the OctoPrint host.
        if not addresses and (not configured or url.hostname == urlsplit(flask.request.url_root).hostname):
            try:
                address = ipaddress.ip_address(address_for_client(flask.request.remote_addr, 80))
                if not (address.is_loopback or address.is_unspecified or address.is_link_local or address.is_multicast):
                    addresses.append(address)
            except (OSError, ValueError, TypeError):
                pass
        if not addresses:
            return self._qrError("qr_address_unavailable", "Could not find OctoPrint's IP address. Check its network connection and reopen this dialog, or set 'OctoPrint URL for QR labels' to the full IP-based URL in Spoolman settings.", 503)

        # Prefer IPv4 for phone/QR compatibility, retaining IPv6-only support.
        address = min(addresses, key=lambda item: item.version)
        return flask.jsonify({"data": {"hostname": url.hostname, "ipAddress": str(address)}})

    @octoprint.plugin.BlueprintPlugin.route("/self/spool/qr", methods=["POST"])
    def handleSelectSpoolFromQr(self):
        # The blueprint's normal login and CSRF protection still apply. Check
        # explicitly here as well: QR selection is a printer-control operation.
        if not current_user.is_authenticated or not current_user.is_active:
            return self._qrError("qr_login_required", "Log in to OctoPrint, then try again.", 403)
        if not Permissions.CONTROL.can():
            return self._qrError("qr_permission_denied", "Your account needs printer-control permission.", 403)

        data = flask.request.get_json(silent=True)
        if not isinstance(data, dict):
            return self._qrError("qr_invalid_request", "Choose a valid spool and extruder.", 400)
        toolId, spoolId = data.get("toolIdx"), data.get("spoolId")
        if (type(toolId) is not int or toolId < 0 or type(spoolId) not in (int, str)
                or not re.fullmatch(r"[1-9][0-9]{0,14}", str(spoolId))):
            return self._qrError("qr_invalid_request", "Choose a valid spool and extruder.", 400)

        profile = self._printer_profile_manager.get_current_or_default()
        count = (profile or {}).get("extruder", {}).get("count", 0)
        if toolId >= count:
            return self._qrError("qr_invalid_tool", "This extruder is no longer available. Reopen the label.", 400)
        if self._qrPrinterBusy():
            return self._qrError("qr_printer_busy", "Finish or cancel the current print before changing spools, including paused prints.", 409)

        result = self.getSpoolmanConnector().handleGetSpool(str(spoolId))
        error = result.get("error")
        if error:
            if error.get("code") == "spoolman_api__spool_not_found":
                return self._qrError("qr_spool_not_found", "This spool no longer exists in Spoolman.", 404)
            return self._qrError("qr_spoolman_unavailable", "Cannot read the spool from Spoolman. Check its connection and try again.", 503)
        spool = result["data"]["spool"]
        if spool.get("archived"):
            return self._qrError("qr_spool_archived", "This spool is archived. Restore it in Spoolman before selecting it.", 409)
        filament = spool.get("filament") or {}
        if not isinstance(filament, dict):
            return self._qrError("qr_spool_incomplete", "Repair this spool's filament data in Spoolman first.", 409)
        values = [spool.get("remaining_weight"), filament.get("density"), filament.get("diameter")]
        if (str(spool.get("id")) != str(spoolId)
                or not all(type(v) in (int, float) and math.isfinite(v) for v in values)
                or values[1] <= 0 or values[2] <= 0):
            return self._qrError("qr_spool_incomplete", "Complete this spool's weight, filament density and diameter in Spoolman first.", 409)

        # A network request can take time; do not apply a stale idle/profile check.
        profile = self._printer_profile_manager.get_current_or_default()
        if toolId >= (profile or {}).get("extruder", {}).get("count", 0):
            return self._qrError("qr_invalid_tool", "The printer profile changed. Reopen the label.", 409)
        if self._qrPrinterBusy():
            return self._qrError("qr_printer_busy", "A print has started. Finish or cancel it before changing spools.", 409)
        return self._saveActiveSpool(toolId, str(spoolId))

    @octoprint.plugin.BlueprintPlugin.route("/self/current-job-requirements", methods=["GET"])
    def handleGetCurrentJobRequirements(self):
        self._logger.debug("API: GET /self/current-job-requirements")

        # TODO: Ideally, this should be pulled from cache
        getSpoolsAvailableResult = self.getSpoolmanConnector().handleGetSpoolsAvailable()

        if getSpoolsAvailableResult.get('error', False):
            response = flask.jsonify(getSpoolsAvailableResult)
            response.status = http.HTTPStatus.BAD_REQUEST

            return response

        spoolsAvailable = getSpoolsAvailableResult["data"]["spools"]

        jobFilamentUsage = self.getCurrentJobFilamentUsage()

        if not jobFilamentUsage["jobHasFilamentLengthData"]:
            return flask.jsonify({
                "data": {
                    "isFilamentUsageAvailable": False,
                    "tools": {},
                },
            })

        selectedSpools = self._settings.get([SettingsKeys.SELECTED_SPOOL_IDS])

        filamentUsageDataPerTool = PrinterUtils.getFilamentUsageDataPerTool(
            filamentLengthPerTool = jobFilamentUsage['jobFilamentLengthsPerTool'],
            selectedSpoolsPerTool = selectedSpools,
            spoolsAvailable = spoolsAvailable,
        )

        return flask.jsonify({
            "data": {
                "isFilamentUsageAvailable": True,
                "tools": filamentUsageDataPerTool,
            },
        })
