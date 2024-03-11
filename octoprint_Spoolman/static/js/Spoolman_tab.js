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

        /**
         * @param {Spool[]} items
         */
        const updateTableItemsOnCurrentPage = (items) => {
            self.tableItemsOnCurrentPage(items);
        };

        /** Bindings for the template */
        self.constants = {
            weight_unit: 'g',
        };
        self.tableAttributeVisibility = {
            id: true,
            spoolName: true,
            material: true,
            weight: true,
            used: true,
        };
        self.tableItemsOnCurrentPage = ko.observable([]);
        self.showSpoolDialogAction = (spoolId) => {};

        self.templateApi = {
            onBtnConnectClick: async () => {
                const request = await getSpoolmanSpools(apiClient);

                if (!request.isSuccess) {
                    console.error("Request error", request.error);

                    const $resultEl = getParentEl().querySelector(".placeholder_connect_result");

                    $resultEl.innerHTML = "Request failed";

                    return;
                }

                updateTableItemsOnCurrentPage(request.payload.response.data.spools);
            }
        };
        /** -- end of bindings -- */

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
