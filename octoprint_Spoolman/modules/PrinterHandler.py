# coding=utf-8
from __future__ import absolute_import

import copy
from octoprint.events import Events

from ..thirdparty.gcodeInterpreter import gcode
from ..common.settings import SettingsKeys

class PrinterHandler():
    def initialize(self):
        self.lastPrintCancelled = False
        self.lastPrintOdometer = None
        self.lastPrintOdometerLoad = None

    def handlePrintingStatusChange(self, eventType):
        if eventType == Events.PRINT_STARTED:
            self.lastPrintCancelled = False
            self.lastPrintOdometer = gcode()
            self.lastPrintOdometerLoad = self.lastPrintOdometer._load(None)

            next(self.lastPrintOdometerLoad)

        if eventType == Events.PRINT_CANCELLED:
            self.lastPrintCancelled = True

        if eventType == Events.PRINT_FAILED and self.lastPrintCancelled:
            # Ignore event, already handled while handling PRINT_CANCELLED
            return

        if (
            eventType == Events.PRINT_PAUSED or
            eventType == Events.PRINT_DONE or
            eventType == Events.PRINT_FAILED or
            eventType == Events.PRINT_CANCELLED
        ):
            self.commitSpoolUsage()

        if (
            eventType == Events.PRINT_DONE or
            eventType == Events.PRINT_FAILED or
            eventType == Events.PRINT_CANCELLED
        ):
            self.lastPrintOdometer = None
            self.lastPrintOdometerLoad = None

    def handlePrintingGCode(self, command):
        if (
            not hasattr(self, "lastPrintOdometerLoad") or
            self.lastPrintOdometerLoad == None
        ):
            return

        peek_stats_helpers = self.lastPrintOdometerLoad.send(command)

    def commitSpoolUsage(self):
        peek_stats_helpers = self.lastPrintOdometerLoad.send(False)

        current_extrusion_stats = copy.deepcopy(peek_stats_helpers['get_current_extrusion_stats']())

        peek_stats_helpers['reset_extrusion_stats']()

        selectedSpoolIds = self._settings.get([SettingsKeys.SELECTED_SPOOL_IDS])

        for toolIdx, toolExtrusionLength in enumerate(current_extrusion_stats['extrusionAmount']):
            selectedSpool = None

            try:
                selectedSpool = selectedSpoolIds[str(toolIdx)]
            except:
                self._logger.info("Extruder '%s', spool id: none", toolIdx)

            if (
                not selectedSpool or
                selectedSpool.get('spoolId', None) == None
            ):
                continue

            selectedSpoolId = selectedSpool['spoolId']

            self._logger.info(
                "Extruder '%s', spool id: %s, usage: %s",
                toolIdx,
                selectedSpoolId,
                toolExtrusionLength
            )

            result = self.getSpoolmanConnector().handleCommitSpoolUsage(selectedSpoolId, toolExtrusionLength)

            if result.get('error', None):
                self.triggerPluginEvent(
                    Events.PLUGIN_SPOOLMAN_SPOOL_USAGE_ERROR,
                    result['error']
                )

                return

            self.triggerPluginEvent(
                Events.PLUGIN_SPOOLMAN_SPOOL_USAGE_COMMITTED,
                {
                    'toolIdx': toolIdx,
                    'spoolId': selectedSpoolId,
                    'extrusionLength': toolExtrusionLength,
                }
            )
