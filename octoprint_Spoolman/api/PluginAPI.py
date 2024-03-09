# coding=utf-8
from __future__ import absolute_import

import octoprint.plugin
import flask
import requests

class PluginAPI(octoprint.plugin.BlueprintPlugin):
    @octoprint.plugin.BlueprintPlugin.route("/spoolman/spools", methods=["GET"])
    def handleGetSpoolsAvailable(self):
        self._logger.debug("API: GET /spoolman/spools")

        response = requests.get('http://spoolman:8000/api/v1/spool')

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
