# coding=utf-8
from __future__ import absolute_import

import octoprint.plugin
from octoprint.events import Events
import flask
import http

from ..common.settings import SettingsKeys
from .PrinterUtils import PrinterUtils

class PluginAPI(object):
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

        spools = self._settings.get([SettingsKeys.SELECTED_SPOOL_IDS])

        spools[toolId] = {
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
