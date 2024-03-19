# coding=utf-8
from __future__ import absolute_import

import requests

class SpoolmanConnector():
    def __init__(self, instanceUrl, logger):
        self.instanceUrl = instanceUrl
        self._logger = logger

    def _createSpoolmanApiUrl(self):
        apiPath = "/api/v1"

        return self.instanceUrl + apiPath

    def _createSpoolmanEndpointUrl(self, endpoint):
        return self._createSpoolmanApiUrl() + endpoint;

    def _logSpoolmanCall(self, endpointUrl):
        self._logger.debug("[Spoolman API] calling endpoint %s" % endpointUrl)

    def _logSpoolmanError(self, response):
        self._logger.error("[Spoolman API] request failed with status %s" % response.status_code)

    def _logSpoolmanSuccess(self, response):
        self._logger.debug("[Spoolman API] request succeeded with status %s" % response.status_code)

    def _handleSpoolmanError(self, response):
        self._logSpoolmanError(response)

        return {
            "error": {
                "code": "spoolman_api__request_failed",
                "spoolman_api": {
                    "status_code": response.status_code,
                },
            }
        }

    def handleGetSpoolsAvailable(self):
        endpointUrl = self._createSpoolmanEndpointUrl("/spool")

        self._logSpoolmanCall(endpointUrl)

        response = requests.get(endpointUrl)

        if response.status_code != 200:
            return self._handleSpoolmanError(response)

        self._logSpoolmanSuccess(response)

        data = response.json()

        return {
            "data": {
                "spools": data
            }
        }

    def handleCommitSpoolUsage(self, spoolId, spoolUsedLength):
        endpointUrl = self._createSpoolmanEndpointUrl("/spool/" + str(spoolId) + "/use")

        self._logSpoolmanCall(endpointUrl)

        response = requests.put(
            url = endpointUrl,
            json = {
                'use_length': spoolUsedLength,
            }
        )

        if response.status_code != 200:
            return self._handleSpoolmanError(response)

        self._logSpoolmanSuccess(response)

        return {
            "data": {}
        }
