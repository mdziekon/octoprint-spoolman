# coding=utf-8
from __future__ import absolute_import

import math

class PrinterUtils:
    def getCurrentJobFilamentUsage(self):
        printer = self._printer
        fileManager = self._file_manager

        result = {
            "jobFilamentLengthsPerTool": [],
            "jobHasFilamentLengthData": False,
        }

        if ("job" not in printer.get_current_data()):
            return result

        jobData = printer.get_current_data()["job"]

        if ("file" not in jobData):
            return result

        fileData = jobData["file"]
        origin = fileData["origin"]
        path = fileData["path"]

        if (origin == None or path == None):
            return result

        metadata = fileManager.get_metadata(origin, path)

        if ("analysis" not in metadata or "filament" not in metadata["analysis"]):
            return result

        # Unused tools (eg. with 3 tools, only 1 & 3 are used) are still present on the list
        for toolName, toolData in metadata["analysis"]["filament"].items():
            toolIndex = int(toolName[4:])

            result["jobFilamentLengthsPerTool"] += [0.0] * (toolIndex + 1 - len(result["jobFilamentLengthsPerTool"]))
            result["jobFilamentLengthsPerTool"][toolIndex] = toolData["length"]

            result["jobHasFilamentLengthData"] = True

        return result

    @staticmethod
    def getFilamentWeight(length, density, diameter):
        radius = diameter / 2.0;
        volume = length * math.pi * (radius * radius) / 1000
        weight = volume * density

        return weight
