from octoprint_Spoolman.SpoolmanPlugin import SpoolmanPlugin

__plugin_name__ = "Spoolman"
__plugin_version__ = "1.0.0"
__plugin_description__ = "Plugin integrating OctoPrint with Spoolman, a universal filament spools inventory manager."
__plugin_pythoncompat__ = ">=3.7,<4"
__plugin_implementation__ = SpoolmanPlugin()

def __plugin_load__():
	global __plugin_implementation__
	__plugin_implementation__ = SpoolmanPlugin()

	global __plugin_hooks__
	__plugin_hooks__ = {
		"octoprint.comm.protocol.gcode.sent": __plugin_implementation__.on_sentGCodeHook,
	}
