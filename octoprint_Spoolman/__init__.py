# coding=utf-8
from __future__ import absolute_import

from .SpoolmanPlugin import SpoolmanPlugin

__plugin_name__ = "Spoolman"
__plugin_version__ = "1.2.0"
__plugin_description__ = "Plugin integrating OctoPrint with Spoolman, a universal filament spools inventory manager."
__plugin_pythoncompat__ = ">=3.7,<4"

def __plugin_load__():
    global __plugin_implementation__
    __plugin_implementation__ = SpoolmanPlugin()

    global __plugin_hooks__
    __plugin_hooks__ = {
        "octoprint.plugin.softwareupdate.check_config": __plugin_implementation__.get_update_information,
        "octoprint.comm.protocol.gcode.sent": __plugin_implementation__.on_sentGCodeHook,
        "octoprint.events.register_custom_events": __plugin_implementation__.register_custom_events,
    }
