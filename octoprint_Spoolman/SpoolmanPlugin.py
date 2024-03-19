import octoprint.plugin
from octoprint.events import Events

from octoprint_Spoolman.api.PluginAPI import PluginAPI
from octoprint_Spoolman.modules.PrinterHandler import PrinterHandler
from octoprint_Spoolman.modules.SpoolmanConnector import SpoolmanConnector
from octoprint_Spoolman.common.settings import SettingsKeys

class SpoolmanPlugin(
    PluginAPI,
    PrinterHandler,
    octoprint.plugin.StartupPlugin,
    octoprint.plugin.AssetPlugin,
    octoprint.plugin.TemplatePlugin,
    octoprint.plugin.SettingsPlugin,
    octoprint.plugin.EventHandlerPlugin,
):
    def initialize(self):
        spoolmanInstanceUrl = self._settings.get([ SettingsKeys.SPOOLMAN_URL ])

        self._spoolmanConnector = SpoolmanConnector(
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
                "js/Spoolman_tab.js",
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
                "type": "tab",
                "template": "Spoolman_tab.jinja2",
            },
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
