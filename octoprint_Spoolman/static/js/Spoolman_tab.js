$(() => {
    // from setup.py plugin_identifier
    const PLUGIN_ID = "octoprint_Spoolman";

    function SpoolmanViewModel(params) {
        const self = this;

        self.settingsViewModel = params[0];

        const getSettings = () => {
            return self.settingsViewModel.settings.plugins[PLUGIN_ID];
        };

        const apiClient = new APIClient(PLUGIN_ID, BASEURL);

        const getParentEl = () => {
            const $parentEl = document.querySelector("#tab_spoolman");

            if (!$parentEl) {
                throw new Error('[Spoolman] parentEl not found');
            }

            return $parentEl;
        };

        self.templateApi = {
            onBtnConnectClick: async () => {
                const $resultEl = getParentEl().querySelector(".placeholder_connect_result");

                const request = await getSpoolmanSpools(apiClient);

                if (!request.isSuccess) {
                    console.error("Request error", request.error);

                    $resultEl.innerHTML = "Request failed";

                    return;
                }

                console.log("Request success", request.payload.response);

                $resultEl.innerHTML = "Request succeeded";
            }
        };

        self.onBeforeBinding = () => {};
        self.onAfterBinding = () => {};
    };

    OCTOPRINT_VIEWMODELS.push({
        construct: SpoolmanViewModel,
        dependencies: [
            "settingsViewModel"
        ],
        elements: [
            document.querySelector("#tab_spoolman"),
        ]
    });
});
