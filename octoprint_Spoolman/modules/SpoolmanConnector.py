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

    def _precheckSpoolman(self):
        if not self.instanceUrl:
            return {
                "error": {
                    "code": "spoolman_api__instance_url_empty",
                },
            }

        return None

    def _handleSpoolmanConnectionError(self, caughtException):
        self._logger.error("[Spoolman API] connection failed with %s" % caughtException)

        return {
            "error": {
                "code": "spoolman_api__connection_failed",
            },
            "exception": caughtException,
        }
    def _handleSpoolmanError(self, response, customError = None):
        self._logSpoolmanError(response)

        if customError != None:
            return {
                "error": customError
            }

        return {
            "error": {
                "code": "spoolman_api__request_failed",
                "spoolman_api": {
                    "status_code": response.status_code,
                },
            }
        }

    def handleGetSpoolsAvailable(self):
        precheckResult = self._precheckSpoolman()

        if precheckResult and precheckResult.get('error', False):
            return precheckResult

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
        precheckResult = self._precheckSpoolman()

        if precheckResult and precheckResult.get('error', False):
            return precheckResult

        spoolIdStr = str(spoolId)
        endpointUrl = self._createSpoolmanEndpointUrl("/spool/" + spoolIdStr + "/use")

        self._logSpoolmanCall(endpointUrl)

        try:
            response = requests.put(
                url = endpointUrl,
                json = {
                    'use_length': spoolUsedLength,
                }
            )
        except Exception as caughtException:
            return self._handleSpoolmanConnectionError(caughtException)

        if response.status_code == 404:
            return self._handleSpoolmanError(
                response,
                {
                    "code": "spoolman_api__spool_not_found",
                    "spoolman_api": {
                        "status_code": response.status_code,
                    },
                    "data": {
                        "spoolId": spoolIdStr,
                        "usedLength": spoolUsedLength,
                    },
                }
            )

        if response.status_code != 200:
            return self._handleSpoolmanError(response)

        self._logSpoolmanSuccess(response)

        return {
            "data": {}
        }
