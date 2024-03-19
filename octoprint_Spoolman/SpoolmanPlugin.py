import octoprint.plugin
from octoprint.events import Events

from .modules.PluginAPI import PluginAPI
from .modules.PrinterHandler import PrinterHandler
from .modules.SpoolmanConnector import SpoolmanConnector
from .common.settings import SettingsKeys

class SpoolmanPlugin(
    octoprint.plugin.StartupPlugin,
    octoprint.plugin.AssetPlugin,
    octoprint.plugin.TemplatePlugin,
    octoprint.plugin.SettingsPlugin,
    octoprint.plugin.EventHandlerPlugin,
    PluginAPI,
    PrinterHandler,
):
    _isInitialized = False

    def initialize(self):
        self._isInitialized = True

    # TODO: Investigate caching again in the future.
    # Currently re-instatiating is fine, as there's nothing "heavy" in the ctor,
    # nor there's any useful persistence in the class itself.
    def getSpoolmanConnector(self):
        spoolmanInstanceUrl = self._settings.get([ SettingsKeys.SPOOLMAN_URL ])

        return SpoolmanConnector(
            instanceUrl = spoolmanInstanceUrl,
            logger = self._logger
        )

    def on_after_startup(self):
        self._logger.info("[Spoolman][init] Plugin activated")

    # Printing events handlers
    def on_event(self, event, payload):
        if (
            event == Events.PRINT_STARTED or
            event == Events.PRINT_PAUSED or
            event == Events.PRINT_DONE or
            event == Events.PRINT_FAILED or
            event == Events.PRINT_CANCELLED
        ):
            self.handlePrintingStatusChange(event)

        pass

    def on_sentGCodeHook(self, comm_instance, phase, cmd, cmd_type, gcode, *args, **kwargs):
        if not self.isInitialized:
            return

        self.handlePrintingGCode(cmd)

        pass

    # --- Mixins ---

    # AssetPlugin
    def get_assets(self):
        return {
            "js": [
                "js/common/api.js",
                "js/api/getSpoolmanSpools.js",
                "js/api/updateActiveSpool.js",
                "js/Spoolman_sidebar.js",
                "js/Spoolman_settings.js",
            ],
            "css": [
                "css/Spoolman.css",
            ],
            "less": [],
        }

    # TemplatePlugin
    def get_template_configs(self):
        return [
            {
                "type": "sidebar",
                "template": "Spoolman_sidebar.jinja2",
            },
            {
                "type": "settings",
                "template": "Spoolman_settings.jinja2",
            }
        ]

    # SettingsPlugin
    def get_settings_defaults(self):
        settings = {
            SettingsKeys.INSTALLED_VERSION: self._plugin_version,
            SettingsKeys.SPOOLMAN_URL: "",
            SettingsKeys.LOGGING_IS_ENABLED: False,
            SettingsKeys.SELECTED_SPOOL_IDS: {},
        }

        return settings

    def on_settings_save(self, data):
        self._logger.info("[Spoolman][Settings] Saved data")

        octoprint.plugin.SettingsPlugin.on_settings_save(self, data)
