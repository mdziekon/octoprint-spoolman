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
