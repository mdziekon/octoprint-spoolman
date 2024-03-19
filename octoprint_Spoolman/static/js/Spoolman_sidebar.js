$(() => {
    // from setup.py plugin_identifier
    const PLUGIN_ID = "Spoolman";

    function SpoolmanSidebarViewModel(params) {
        const self = this;

        const previousSettings = {
            spoolmanUrl: undefined,
        };

        const fetchSpoolmanSpools = (() => {
            const cache = {
                /** @type Promise<Spool[]> */
                spools: undefined,
            };

            const fetcher = async () => {
                if (cache.spools) {
                    return cache.spools;
                }

                const fetchPromise = (async () => {
                    const request = await getSpoolmanSpools(apiClient);

                    if (!request.isSuccess) {
                        console.error("Request error", request.error);
                    }

                    return request;
                })();

                cache.spools = fetchPromise;

                return cache.spools;
            };

            fetcher.clearCache = () => {
                cache.spools = undefined;
            };

            return fetcher;
        })();

        self.settingsViewModel = params[0];

        self.modals = {
            selectSpool: $("#spoolman_modal_selectspool"),
        };

        const getPluginSettings = () => {
            return self.settingsViewModel.settings.plugins[PLUGIN_ID];
        };

        // TODO: Share with other ViewModels?
        const apiClient = new APIClient(PLUGIN_ID, BASEURL);

        const initView = async () => {
            updateSelectedSpools();
        };

        const updateSelectedSpools = async () => {
            self.templateData.loadingError(undefined);
            self.templateData.isLoadingData(true);

            const spoolmanSpoolsResult = await fetchSpoolmanSpools();

            self.templateData.isLoadingData(false);

            if (!spoolmanSpoolsResult.isSuccess) {
                self.templateData.loadingError(spoolmanSpoolsResult.error.response.error)

                return;
            }

            const spoolmanSpools = spoolmanSpoolsResult.payload.response.data.spools;

            const currentProfileData = self.settingsViewModel.printerProfiles.currentProfileData();
            const currentExtrudersCount = (
                currentProfileData
                    ? currentProfileData.extruder.count()
                    : 0
            );

            const extruders = Array.from({
                length: currentExtrudersCount
            }, () => undefined)

            const selectedSpoolIds = getPluginSettings().selectedSpoolIds;
            const selectedSpools = extruders.map((_, extruderIdx) => {
                const spoolId = selectedSpoolIds[extruderIdx]?.spoolId();

                return spoolmanSpools.find((spool) => String(spool.id) === spoolId);
            });

            self.templateData.selectedSpoolsByToolIdx(selectedSpools);
            self.templateData.selectedSpoolsByToolIdx.valueHasMutated();
        };

        /**
         * @param {number} toolIdx
         */
        const handleSelectSpool = async (toolIdx) => {
            // TODO: Improve DX, maybe move to separate component
            // TODO: Add error handling for modal

            self.templateData.modals.selectSpool.toolIdx(toolIdx);

            self.modals.selectSpool.modal("show");

            self.templateData.modals.selectSpool.isLoadingData(true);

            const spoolmanSpoolsResult = await fetchSpoolmanSpools();

            self.templateData.modals.selectSpool.isLoadingData(false);

            const spoolmanSpools = spoolmanSpoolsResult.payload.response.data.spools;

            const selectedSpoolIds = getPluginSettings().selectedSpoolIds;
            const toolSpoolId = selectedSpoolIds[toolIdx]?.spoolId();
            const toolSpool = spoolmanSpools.find((spool) => {
                return String(spool.id) === toolSpoolId;
            });

            self.templateData.modals.selectSpool.toolCurrentSpool(toolSpool);
            self.templateData.modals.selectSpool.tableItemsOnCurrentPage(spoolmanSpools);
        };

        /**
         * @param {number} toolIdx
         */
        const handleDeselectSpool = async (toolIdx) => {
            const request = await updateActiveSpool(apiClient, { toolIdx, spoolId: undefined });

            if (!request.isSuccess) {
                console.error("Request error", request.error);

                throw new Error("Request error");
            }

            const settingsSavePromise = new Promise((resolve) => {
                // TODO: Investigate if `saveData` can replace custom API endpoint
                // Force save empty data to trigger `settingsViewModel` reload
                self.settingsViewModel.saveData({}, resolve);
            });

            await settingsSavePromise;

            self.modals.selectSpool.modal("hide");

            updateSelectedSpools();
        };

        /**
         * @param {number} toolIdx
         * @param {number} spoolId
         */
        const handleSelectSpoolForTool = async (toolIdx, spoolId) => {
            const request = await updateActiveSpool(apiClient, { toolIdx, spoolId });

            if (!request.isSuccess) {
                console.error("Request error", request.error);

                throw new Error("Request error");
            }

            const settingsSavePromise = new Promise((resolve) => {
                // TODO: Investigate if `saveData` can replace custom API endpoint
                // Force save empty data to trigger `settingsViewModel` reload
                self.settingsViewModel.saveData({}, resolve);
            });

            await settingsSavePromise;

            self.modals.selectSpool.modal("hide");

            updateSelectedSpools();
        };

        /** Bindings for the template */
        self.constants = {
            weight_unit: 'g',
        };
        self.templateApi = {
            handleSelectSpool,
            handleDeselectSpool,

            modals: {
                selectSpool: {
                    handleSelectSpoolForTool,
                },
            },
        };
        self.templateData = {
            isLoadingData: ko.observable(true),
            loadingError: ko.observable(undefined),
            selectedSpoolsByToolIdx: ko.observable([]),

            modals: {
                selectSpool: {
                    isLoadingData: ko.observable(true),

                    toolIdx: ko.observable(undefined),
                    toolCurrentSpool: ko.observable(undefined),

                    tableAttributeVisibility: {
                        id: true,
                        spoolName: true,
                        material: true,
                        weight: true,
                    },
                    tableItemsOnCurrentPage: ko.observable([]),
                },
            },
        };
        /** -- end of bindings -- */

        self.onBeforeBinding = () => {};
        self.onAfterBinding = () => {
            initView();

            previousSettings.spoolmanUrl = getPluginSettings().spoolmanUrl();

            /**
             * Update spools on printer's profile update,
             * to handle any potential tool-count changes.
             */
            self.settingsViewModel.printerProfiles.currentProfileData.subscribe(() => {
                void updateSelectedSpools();
            });
        };

        /**
         * Update spools on Spoolman instance change.
         * Subscribing to settings entry is unreliable, as its observable updates
         * on every input change, rather than on save.
         */
        self.onSettingsHidden = () => {
            const newSettings = {
                spoolmanUrl: getPluginSettings().spoolmanUrl(),
            };

            if (previousSettings.spoolmanUrl === newSettings.spoolmanUrl) {
                return;
            }

            previousSettings.spoolmanUrl = newSettings.spoolmanUrl;

            fetchSpoolmanSpools.clearCache();

            void updateSelectedSpools();
        };
    };

    OCTOPRINT_VIEWMODELS.push({
        construct: SpoolmanSidebarViewModel,
        dependencies: [
            "settingsViewModel"
        ],
        elements: [
            document.querySelector("#sidebar_spoolman"),
            document.querySelector("#spoolman_modal_selectspool"),
        ]
    });
});
