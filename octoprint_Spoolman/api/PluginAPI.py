# coding=utf-8
from __future__ import absolute_import

import octoprint.plugin
import flask

from octoprint_Spoolman.common.settings import SettingsKeys

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

        result = self._spoolmanConnector.handleGetSpoolsAvailable()

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

        return flask.jsonify({
            "data": {}
        })
