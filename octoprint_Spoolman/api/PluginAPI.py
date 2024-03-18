# coding=utf-8
from __future__ import absolute_import

import octoprint.plugin
import flask
import requests

from octoprint_Spoolman.common.settings import SettingsKeys

class PluginAPI(octoprint.plugin.BlueprintPlugin):
    def _createSpoolmanApiUrl(self):
        instance_url = self._settings.get([ SettingsKeys.SPOOLMAN_URL ])
        api_path = "/api/v1"

        return instance_url + api_path

    def _createSpoolmanEndpointUrl(self, endpoint):
        return self._createSpoolmanApiUrl() + endpoint;

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

        response = requests.get(self._createSpoolmanEndpointUrl("/spool"))

        if response.status_code != 200:
            self._logger.error("[Spoolman API] request failed with status %s" % response.status_code)

            return flask.jsonify({
                "error": {
                    "code": "spoolman_api__request_failed",
                    "spoolman_api": {
                        "status_code": response.status_code,
                    },
                }
            })

        self._logger.debug("[Spoolman API] request succeeded with status %s" % response.status_code)

        data = response.json()

        return flask.jsonify({
            "data": {
                "spools": data
            }
        })

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

    def handleCommitSpoolUsage(self, spoolId, spoolUsedLength):
        response = requests.put(
            url = self._createSpoolmanEndpointUrl("/spool/" + str(spoolId) + "/use"),
            json = {
                'use_length': spoolUsedLength,
            }
        )

        if response.status_code != 200:
            self._logger.error("[Spoolman API] request failed with status %s" % response.status_code)

            return {
                "error": {
                    "code": "spoolman_api__request_failed",
                    "spoolman_api": {
                        "status_code": response.status_code,
                    },
                }
            }

        self._logger.debug("[Spoolman API] request succeeded with status %s" % response.status_code)

        return {
            "data": {}
        }
