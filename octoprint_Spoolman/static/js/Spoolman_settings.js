$(() => {
    // from setup.py plugin_identifier
    const PLUGIN_ID = "Spoolman";

    function SpoolmanSettingsViewModel(params) {
        const self = this;

        self.settingsViewModel = params[0];
        self.pluginSettings = null;

        self.onBeforeBinding = () => {
            self.pluginSettings = self.settingsViewModel.settings.plugins[PLUGIN_ID];
        };
    };

    OCTOPRINT_VIEWMODELS.push({
        construct: SpoolmanSettingsViewModel,
        dependencies: [
            "settingsViewModel"
        ],
        elements: [
            document.querySelector("#settings_spoolman"),
        ]
    });
});
