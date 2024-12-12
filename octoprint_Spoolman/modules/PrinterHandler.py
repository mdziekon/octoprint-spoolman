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
        self.currentZ = None
        self.resetExtruder = False
        self.dataSpool = {}
        
    def handlePrintingStatusChange(self, eventType):
        if eventType == Events.PRINT_STARTED:
            self.lastPrintCancelled = False
            self.lastPrintOdometer = gcode()
            self.lastPrintOdometerLoad = self.lastPrintOdometer._load(None)
            self.resetExtruder = False

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
        
        self.resetExtruder = True

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

            weight = self.getWeight(str(toolIdx),toolExtrusionLength)
            cost = self.getCost(str(toolIdx),weight)
            
            filament = self.dataSpool.get(str(toolIdx), {}).get('filament', {})
            
            name = filament.get('name', None)
            material = filament.get('material', None)
            colorHex = filament.get('color_hex', None)
            
            self._logger.info(
                "Extruder '%s', spool id: %s, usage length: %s, weight: %s, cost: %s name: %s material: %s colorHex: %s",
                toolIdx,
                selectedSpoolId,
                toolExtrusionLength,
                weight,
                cost,
                name,
                material,
                colorHex
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
                    'weight': weight,
                    'cost': cost,
                    'name': name,
                    'material': material,
                    'colorHex': colorHex
                }
            )

    def saveFilamentStatusChange(self):
        if not self._printer.is_printing() or not self._settings.get_boolean([SettingsKeys.STATUS_BACKUP]):
            return
        
        backup_save = self._settings.get([SettingsKeys.BACKUP_DATA])

        if backup_save is None:
            backup_save = {}
            
        peek_stats_helpers = self.lastPrintOdometerLoad.send(False)
        current_extrusion_stats = copy.deepcopy(peek_stats_helpers['get_current_extrusion_stats']())

        selectedSpoolIds = self._settings.get([SettingsKeys.SELECTED_SPOOL_IDS])
                
        for toolIdx, toolExtrusionLength in enumerate(current_extrusion_stats['extrusionAmount']):
            try:
                toolIdxStr = str(toolIdx)          
                selectedSpool = selectedSpoolIds.get(toolIdxStr, None)
                
            except Exception as e:
                self._logger.info("Extruder Saved '%s', spool id: none. Error: %s", toolIdxStr, e)
                continue

            if not selectedSpool or selectedSpool.get('spoolId', None) is None:
                continue
            
            selectedSpoolId = selectedSpool['spoolId']
            
            weight = self.getWeight(toolIdxStr, toolExtrusionLength)
            cost = self.getCost(toolIdxStr, weight)
                    
            filament = self.dataSpool.get(toolIdxStr, {}).get('filament', {})
            
            name = filament.get('name', None)
            material = filament.get('material', None)
            colorHex = filament.get('color_hex', None)
            
            if toolIdxStr not in backup_save:
                backup_save[toolIdxStr] = {}            
            
            if self.resetExtruder == True:
                backup_save[toolIdxStr]['spoolId'] = selectedSpoolId
                backup_save[toolIdxStr]['name'] = name
                backup_save[toolIdxStr]['material'] = material
                backup_save[toolIdxStr]['color_hex'] = colorHex

                backup_save[toolIdxStr]['totalExtrusionLength'] = toolExtrusionLength + backup_save[toolIdxStr].get('sessionExtrusionLength', 0) + backup_save[toolIdxStr].get('totalExtrusionLength', 0)
                backup_save[toolIdxStr]['sessionExtrusionLength'] = 0

                backup_save[toolIdxStr]['totalWeight'] = weight + backup_save[toolIdxStr].get('sessionWeight', 0) + backup_save[toolIdxStr].get('totalWeight', 0)
                backup_save[toolIdxStr]['sessionWeight'] = 0

                backup_save[toolIdxStr]['totalCost'] = cost + backup_save[toolIdxStr].get('sessionCost', 0) + backup_save[toolIdxStr].get('totalCost', 0)
                backup_save[toolIdxStr]['sessionCost'] = 0
            
            if self.resetExtruder == False:
                backup_save[toolIdxStr]['spoolId'] = selectedSpoolId
                backup_save[toolIdxStr]['name'] = name
                backup_save[toolIdxStr]['material'] = material
                backup_save[toolIdxStr]['color_hex'] = colorHex                
                backup_save[toolIdxStr]['sessionExtrusionLength'] = toolExtrusionLength
                backup_save[toolIdxStr]['sessionWeight'] = weight
                backup_save[toolIdxStr]['sessionCost'] = cost
                
        self.resetExtruder = False

        self._settings.set([SettingsKeys.BACKUP_DATA], backup_save)
        self._settings.save()
                
    def loadSaveSpoolUsage(self):
        backup_data = self._settings.get([SettingsKeys.BACKUP_DATA])
        
        if not isinstance(backup_data, dict):
            return

        for toolIdx, spool_data in backup_data.items():
            toolIdxStr = str(toolIdx)          
            selectedSpoolId = spool_data.get('spoolId')
            name = spool_data.get('name')
            material = spool_data.get('material')
            colorHex = spool_data.get('color_hex')
            
            toolExtrusionLength = spool_data.get('totalExtrusionLength', 0) + spool_data.get('sessionExtrusionLength', 0)
            weight = spool_data.get('totalWeight', 0) + spool_data.get('sessionWeight', 0)
            cost = spool_data.get('totalCost', 0) + spool_data.get('sessionCost', 0)
            
            if not selectedSpoolId or toolExtrusionLength is None:
                self._logger.info("Loading saved spool usage: Extruder '%s', spool id: none or invalid data", toolIdxStr)
                continue
            
            result = self.getSpoolmanConnector().handleCommitSpoolUsage(selectedSpoolId, toolExtrusionLength)

            if result.get('error', None):
                self.triggerPluginEvent(
                    Events.PLUGIN_SPOOLMAN_SPOOL_USAGE_ERROR,
                    result['error']
                )
                return
            
            self.triggerPluginEvent(
                Events.PLUGIN_SPOOLMAN_SPOOL_USAGE_COMMITTED_RECOVERY,
                {
                    'toolIdx': toolIdxStr,
                    'spoolId': selectedSpoolId,
                    'extrusionLength': toolExtrusionLength,
                    'weight': weight,
                    'cost': cost,
                    'name': name,
                    'material': material,
                    'colorHex': colorHex
                }
            )

                
            self._settings.set([SettingsKeys.BACKUP_DATA], None)
            self._settings.save()
            
    def resetSaveStatus(self,eventType):
        if (
            eventType == Events.PRINT_DONE or
            eventType == Events.PRINT_CANCELLED and
            self._settings.get_boolean([SettingsKeys.STATUS_BACKUP])
        ):
            self._settings.set([SettingsKeys.BACKUP_DATA], None)
            self._settings.save()
    
    def infoSpool(self,SpoolId,toolId):
        if not hasattr(self, 'dataSpool') or self.dataSpool is None:
            self.dataSpool = {}

        if  SpoolId is None:
            return
        
        result = self.getSpoolmanConnector().handleCommitSpoolInfo(SpoolId)

        if result.get('error', None):
            self.triggerPluginEvent(
                Events.PLUGIN_SPOOLMAN_SPOOL_INFO_ERROR,
                result['error']
            )
            return

        self.dataSpool[toolId] = result
        
    def handleFileSelected(self, payload):
        self._logger.info("File selected" + str(payload))
        selectedSpoolIds = self._settings.get([SettingsKeys.SELECTED_SPOOL_IDS])
        jobFilamentUsage = self.getCurrentJobFilamentUsage()

        for toolIdx, spoolData in selectedSpoolIds.items():
            selectedSpoolId = spoolData.get('spoolId', None)
            
            if selectedSpoolId:
                self.infoSpool(selectedSpoolId, toolIdx)
                
            else:
                self._logger.warning("No spoolId found for extruder %s", toolIdx)
        
        if jobFilamentUsage['jobHasFilamentLengthData']:
            for toolIndex, filamentLength in enumerate(jobFilamentUsage["jobFilamentLengthsPerTool"]):
                
                weight = self.getWeight(str(toolIndex), filamentLength)
                cost = self.getCost(str(toolIndex), weight)
                        
                filament = self.dataSpool.get(str(toolIndex), {}).get('filament', {})
                
                name = filament.get('name', None)
                material = filament.get('material', None)
                colorHex = filament.get('color_hex', None)
            
                self.triggerPluginEvent(
                    Events.PLUGIN_SPOOLMAN_SPOOL_FILE_SELECTED,
                    {
                        'toolIdx': str(toolIndex),
                        'spoolId': self.dataSpool.get(str(toolIndex), {}).get('id', None),
                        'estimatedExtrusionLength': filamentLength,
                        'estimatedWeight': weight,
                        'estimatedCost': cost,
                        'name': name,
                        'material': material,
                        'colorHex': colorHex
                    }
                )

    def getWeight(self,toolIdx,toolExtrusionLength):
            if toolIdx not in self.dataSpool:
                return 0
            
            spool_data = self.dataSpool[toolIdx]['filament']
            
            density = spool_data.get('density', None)
            diameter = spool_data.get('diameter', None)

            if density is None or diameter is None:
                return 0
            
            weight = self.getFilamentWeight(toolExtrusionLength, density, diameter)
            
            return weight
        
    def getCost(self,toolIdx,weight):
        if toolIdx not in self.dataSpool:
            return 0
        
        spool_data = self.dataSpool[toolIdx]
        
        initial_weight = spool_data.get('initial_weight', 0)
        price = spool_data.get('price', 0)
        
        if initial_weight <= 0 or price <= 0:
            return 0

        cost_use = (weight / initial_weight) * price
        
        return cost_use