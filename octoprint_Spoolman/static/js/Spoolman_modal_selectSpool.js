$(() => {
    // from setup.py plugin_identifier
    const PLUGIN_ID = "Spoolman";

    const SpoolmanModalSelectSpoolComponent = {
        registerComponent: () => {
            ko.components.register('spoolman-modal-select-spool', {
                viewModel: SpoolmanModalSelectSpoolViewModel,
                template: {
                    element: 'spoolman-modal-selectSpool-template',
                },
            });
        },
        modalSelector: "#spoolman_modal_selectspool",
    }

    window.SpoolmanModalSelectSpoolComponent = SpoolmanModalSelectSpoolComponent;

    // TODO: Add support for multi-targetting
    function SpoolmanModalSelectSpoolViewModel(params) {
        const self = this;

        self.settingsViewModel = params.settingsViewModel;
        self.eventsSink = params.eventsSink;

        self._isVisible = false;

        self.modals = {
            selectSpool: $(SpoolmanModalSelectSpoolComponent.modalSelector),
        };

        const getPluginSettings = () => {
            return self.settingsViewModel().settings.plugins[PLUGIN_ID];
        };

        const refreshView = async () => {
            if (!self._isVisible) {
                return;
            }

            // TODO: Add error handling for modal

            const toolIdx = self.templateData.toolIdx();

            self.templateData.loadingError(undefined);
            self.templateData.isLoadingData(true);

            const spoolmanSpoolsResult = await pluginSpoolmanApi.getSpoolmanSpools();

            self.templateData.isLoadingData(false);

            if (!spoolmanSpoolsResult.isSuccess) {
                self.templateData.loadingError(spoolmanSpoolsResult.error.response.error)

                return;
            }

            const spoolmanSpools = spoolmanSpoolsResult.payload.response.data.spools;

            const selectedSpoolIds = getPluginSettings().selectedSpoolIds;
            const toolSpoolId = selectedSpoolIds[toolIdx]?.spoolId();
            const toolSpool = spoolmanSpools.find((spool) => {
                return String(spool.id) === toolSpoolId;
            });

            self.templateData.toolCurrentSpool(toolSpool);
            self.templateData.tableItemsOnCurrentPage(spoolmanSpools);

            self.templateData.spoolmanUrl(getPluginSettings().spoolmanUrl());
        };

        /**
         * @param {number} toolIdx
         */
        const handleDisplayModal = async (toolIdx) => {
            self.templateData.toolIdx(toolIdx);

            await refreshView();
        };

        /**
         * @param {number} toolIdx
         * @param {number} spoolId
         */
        const handleSelectSpoolForTool = async (toolIdx, spoolId) => {
            const request = await pluginSpoolmanApi.updateActiveSpool({ toolIdx, spoolId });

            // TODO: Add error handling for modal
            if (!request.isSuccess) {
                return;
            }

            await reloadSettingsViewModel(self.settingsViewModel());

            self.modals.selectSpool.modal("hide");

            self.eventsSink({
                type: 'onSelectSpoolForTool',
            });
        };

        const handleForceRefresh = async () => {
            pluginSpoolmanApi.getSpoolmanSpools.invalidate();
        };
        const handleTryAgainOnError = async () => {
            await handleForceRefresh();
        };

        /** Bindings for the template */
        self.constants = {
            weight_unit: 'g',
        };
        self.templateApi = {
            handleSelectSpoolForTool,
            handleTryAgainOnError,
            handleForceRefresh,
        };
        self.templateData = {
            isLoadingData: ko.observable(true),
            loadingError: ko.observable(undefined),

            toolIdx: ko.observable(undefined),
            toolCurrentSpool: ko.observable(undefined),

            tableAttributeVisibility: {
                id: true,
                spoolName: true,
                material: true,
                weight: true,
            },
            tableItemsOnCurrentPage: ko.observable([]),

            spoolmanUrl: ko.observable(undefined),
        };
        /** -- end of bindings -- */

        $(document).on("shown", SpoolmanModalSelectSpoolComponent.modalSelector, async () => {
            this._isVisible = true;

            await handleDisplayModal(params.toolIdx());

            self.modals.selectSpool.modal("layout");
        });
        $(document).on("hidden", SpoolmanModalSelectSpoolComponent.modalSelector, async () => {
            this._isVisible = false;
        });

        const init = () => {
            pluginSpoolmanApi.cache.onResourcesInvalidated([ "getSpoolmanSpools" ], () => {
                void refreshView();
            });
        };

        init();
    };
});
